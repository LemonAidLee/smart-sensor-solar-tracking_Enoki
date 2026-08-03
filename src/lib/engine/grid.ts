/**
 * Utility Grid Integration — Stage 7.6.
 *
 *   PV Plant → PV Inverter → Building Energy Bus ─┬─► Building Load
 *                                                 ├─► Battery Storage
 *                                                 └─► Utility Grid
 *
 * The grid is the **balancing component**: it supplies whatever the site cannot
 * source, and absorbs whatever the site cannot use. That makes it the terminal
 * node of the energy architecture — every other subsystem gets first refusal,
 * and the grid takes the residual.
 *
 * ── Why this engine performs no routing ──────────────────────────────────────
 * Because the grid is unlimited and unconditional, its import and export are
 * *already* what the bus computed as `requiredGridImportKW` and `surplusKW`
 * after PV and the battery had their turn. Re-deriving them here would create a
 * second authority for the same two numbers and risk the two drifting apart.
 * This engine therefore **projects** the settled bus into grid terms — state,
 * signed net exchange, connection specification — and adds no arithmetic of its
 * own beyond classification. Energy accumulation lives in `energyLedger.ts`, the
 * single authority for everything day-scoped.
 *
 * ── Subsystem boundaries (guide §6, §11) ─────────────────────────────────────
 * Pure, framework-free, renders nothing. It reads the bus and nothing else — no
 * irradiance, no PV metrics, no battery internals, no building geometry.
 */

import type { EnergyBusState } from './buildingEnergy'

// ---------------------------------------------------------------------------
// Connection specification
// ---------------------------------------------------------------------------
/**
 * Point-of-common-coupling specification. Static engineering data: a Malaysian
 * commercial low-voltage supply is a three-phase 415 V / 50 Hz connection
 * (TNB distribution practice, MS IEC 60038 standard voltages).
 */
export const GRID_CONNECTION = {
  type: 'Three-Phase AC',
  nominalVoltageV: 415,
  frequencyHz: 50,
} as const

/** Power below which the connection is reported idle rather than active, kW. */
const IDLE_THRESHOLD_KW = 0.01

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
/**
 * `Offline` is declared but never entered in Stage 7.6 — it is the seam a future
 * outage / islanding mode will use, at which point the battery's reserve becomes
 * the backup source.
 */
export type GridOperatingState = 'Importing' | 'Exporting' | 'Idle' | 'Offline'

export interface GridState {
  /** Power drawn from the utility, kW. Zero when not importing. */
  importKW: number
  /** Power delivered to the utility, kW. Zero when not exporting. */
  exportKW: number
  /** Signed exchange, kW: **+ importing / − exporting**. */
  netKW: number
  state: GridOperatingState
  /** Plain-language explanation of the current exchange — always populated. */
  reason: string

  // ── Connection specification (static) ─────────────────────────────────────
  connectionType: string
  nominalVoltageV: number
  frequencyHz: number

  // ── FUTURE HOOKS — declared, deliberately not simulated in Stage 7.6 ──────
  /** Net-metering scheme. Pinned false until Stage 7.7. */
  netMeteringEnabled: boolean
  /** Time-of-use tariff period. Pinned null until Stage 7.7. */
  tariffPeriod: string | null
  /** Grid carbon intensity, kgCO₂/kWh. Pinned null until Stage 7.7. */
  carbonIntensity: number | null
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------
/**
 * GridEnergyEngine — the utility connection's instantaneous behaviour.
 *
 * Allocation-free: the state object is created once and mutated in place, so the
 * 20 Hz environmental tier produces no garbage.
 */
export class GridEnergyEngine {
  private readonly state: GridState = {
    importKW: 0,
    exportKW: 0,
    netKW: 0,
    state: 'Idle',
    reason: 'Initialising.',
    connectionType: GRID_CONNECTION.type,
    nominalVoltageV: GRID_CONNECTION.nominalVoltageV,
    frequencyHz: GRID_CONNECTION.frequencyHz,
    netMeteringEnabled: false,
    tariffPeriod: null,
    carbonIntensity: null,
  }

  /**
   * Project the settled bus into grid terms.
   *
   * Import and export are read straight from the bus — they are the residual
   * after PV served the load and the battery took its turn. Nothing is
   * recomputed, and export is never fabricated: with no surplus it is exactly
   * zero, which is the expected weekday result for this building.
   */
  update(bus: EnergyBusState): void {
    const importKW = Math.max(0, bus.requiredGridImportKW)
    const exportKW = Math.max(0, bus.surplusKW)

    this.state.importKW = importKW
    this.state.exportKW = exportKW
    this.state.netKW = importKW - exportKW

    if (importKW > IDLE_THRESHOLD_KW) {
      this.state.state = 'Importing'
      this.state.reason = `Importing ${importKW.toFixed(1)} kW — on-site generation and storage cannot meet demand.`
    } else if (exportKW > IDLE_THRESHOLD_KW) {
      this.state.state = 'Exporting'
      this.state.reason = `Exporting ${exportKW.toFixed(1)} kW — surplus generation the building and battery cannot absorb.`
    } else {
      this.state.state = 'Idle'
      this.state.reason = 'Balanced — the site is neither drawing from nor feeding the grid.'
    }
  }

  /** Live grid state (mutated in place — treat as read-only). */
  getState(): GridState {
    return this.state
  }
}
