/**
 * Battery Energy Storage System (BESS) — Stage 7.5.
 *
 *   PV Plant → PV Inverter → Building Energy Bus → Building Load
 *                                    │
 *                                    ▼
 *                         Battery Energy Storage
 *                                    │
 *                                    ▼
 *                            (future) Grid Import
 *
 * The battery sits between building demand and the future grid connection: PV
 * serves the load first, any surplus charges the battery, any remaining deficit
 * is met from the battery, and only what the battery cannot cover would have to
 * come from the grid. That is the standard self-consumption-priority dispatch.
 *
 * ── Subsystem boundaries (guide §6, §11) ─────────────────────────────────────
 * This engine is pure, framework-free and renders nothing. It implements
 * `StoragePort` from `buildingEnergy.ts` and is handed ONLY the PV-only
 * imbalance the bus already computed — it never sees irradiance, PV metrics,
 * building geometry or the load model, and it never recomputes any of them. The
 * Building Energy Engine's demand model is untouched by this stage; the bus
 * gained its storage terms at the extension seam Stage 7.4 documented for
 * exactly this purpose.
 *
 * ── On a battery that rarely charges ─────────────────────────────────────────
 * For the case-study building the PV plant never exceeds demand during
 * generation hours (see `walkthrough.md`, Stage 7.4), so there is normally no
 * surplus to charge from. That is a sizing result, not a defect, and this engine
 * is written to handle it **gracefully rather than to work around it**:
 *
 *   • charging is driven strictly by real surplus — never fabricated;
 *   • with no surplus the battery discharges to its reserve floor and then
 *     parks, reporting *why* through `reason` instead of silently idling;
 *   • the dispatch rule is stated in terms of surplus and deficit only, so the
 *     moment any future operating mode produces surplus — a weekend or holiday
 *     schedule, reduced occupancy, a larger array — this same code charges with
 *     no architectural change whatsoever.
 */

import { clamp } from './math'
import type { StorageDispatch, StoragePort } from './buildingEnergy'

// ---------------------------------------------------------------------------
// Specification
// ---------------------------------------------------------------------------
/**
 * Usable battery capacity, kWh. **From the project report.** The report does not
 * state a chemistry or manufacturer, so none is claimed here — the UI shows the
 * capacity and status only, and every parameter below that the report does not
 * specify is labelled an engineering assumption rather than a datasheet value.
 */
export const BATTERY_CAPACITY_KWH = 39.56

/**
 * Reserve floor as a fraction of capacity. The battery will not discharge below
 * this, preserving depth-of-discharge headroom and leaving energy available for
 * a future backup/islanding mode. Configurable per the brief; 10% is a common
 * commercial BESS setting.
 */
export const DEFAULT_RESERVE_FRACTION = 0.1

/**
 * Continuous power limit as a C-rate (fraction of capacity delivered per hour).
 * **Engineering assumption** — the report does not specify the power conversion
 * system. 0.5C is the usual pairing for a commercial LiFePO₄ BESS of this size
 * and gives 39.56 × 0.5 ≈ 19.8 kW of charge/discharge power.
 */
export const DEFAULT_C_RATE = 0.5

/**
 * One-way conversion efficiencies. **Engineering assumption** — a constant
 * value, as the brief requires. 96% each way gives a ≈92% round-trip
 * efficiency, typical of a modern LiFePO₄ system with its inverter.
 */
export const DEFAULT_CHARGE_EFFICIENCY = 0.96
export const DEFAULT_DISCHARGE_EFFICIENCY = 0.96

/**
 * State of charge the battery is commissioned at, as a fraction of capacity.
 * Chosen so the discharge path is exercised from the first simulated hour rather
 * than the system starting empty and appearing inert.
 */
export const DEFAULT_INITIAL_SOC = 0.5

/** Power below which the battery is reported as idle rather than active, kW. */
const IDLE_THRESHOLD_KW = 0.01

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
export type BatteryOperatingState = 'Charging' | 'Discharging' | 'Idle'

export interface BatteryState {
  /** Usable capacity, kWh. */
  capacityKWh: number
  /** Energy currently stored, kWh. */
  storedKWh: number
  /** State of charge, 0–1. */
  soc: number
  /** Reserve floor, 0–1. */
  reserveFraction: number
  /** Energy above the reserve floor that may still be discharged, kWh. */
  availableKWh: number
  /** Headroom before the battery is full, kWh. */
  headroomKWh: number
  /** AC power currently being absorbed, kW. Zero when not charging. */
  chargeKW: number
  /** AC power currently being delivered, kW. Zero when not discharging. */
  dischargeKW: number
  /** Continuous power limit in each direction, kW. */
  maxPowerKW: number
  state: BatteryOperatingState
  /** Plain-language explanation of the current behaviour — always populated. */
  reason: string
  /** Round-trip efficiency, 0–1 (charge × discharge). */
  roundTripEfficiency: number
  /** Cumulative AC energy through the battery, kWh — the input an ageing model needs. */
  throughputKWh: number

  // ── FUTURE HOOKS — declared, deliberately not simulated in Stage 7.5 ──────
  /** Temperature derate multiplier. Pinned to 1 until a thermal model exists. */
  temperatureFactor: number
  /** Calendar/cycle ageing multiplier. Pinned to 1 until degradation is modelled. */
  ageingFactor: number
}

export interface BatteryOptions {
  capacityKWh?: number
  reserveFraction?: number
  cRate?: number
  chargeEfficiency?: number
  dischargeEfficiency?: number
  initialSoc?: number
}

// ---------------------------------------------------------------------------
// Dispatch planning (pure)
// ---------------------------------------------------------------------------
/** The fixed electrical envelope a battery dispatches inside. */
export interface StorageLimits {
  capacityKWh: number
  reserveFraction: number
  maxPowerKW: number
  chargeEfficiency: number
  dischargeEfficiency: number
}

/** A planned step: the powers, and where the stored energy ends up. */
export interface StoragePlan {
  chargeKW: number
  dischargeKW: number
  /** Stored energy AFTER the step, kWh. */
  storedKWh: number
  state: BatteryOperatingState
  /** Plain-language explanation, or null when nothing was decided (dt ≤ 0). */
  reason: string | null
}

/**
 * Decide one charge/discharge step and where it leaves the state of charge —
 * the single authority for storage dispatch.
 *
 * Pure: it is handed the limits and the current stored energy and returns the
 * result rather than mutating anything, so `BatteryEnergyEngine.dispatch()` and
 * the Prediction Engine's hour-by-hour state-of-charge walk run identical logic.
 * Charging is bounded by power and remaining headroom; discharging by power and
 * the reserve floor. Exactly one direction can be non-zero.
 */
export function planStorage(
  limits: StorageLimits,
  storedKWh: number,
  surplusKW: number,
  deficitKW: number,
  dtHours: number,
): StoragePlan {
  if (dtHours <= 0) {
    // No simulated time passed — hold everything exactly where it is.
    return { chargeKW: 0, dischargeKW: 0, storedKWh, state: 'Idle', reason: null }
  }

  if (surplusKW > 0) {
    // ── CHARGE ── absorb surplus, bounded by power and remaining headroom.
    const headroomKWh = Math.max(0, limits.capacityKWh - storedKWh)
    // AC power that would exactly fill the headroom this step. Stored energy is
    // the AC power times the charge efficiency, so the AC limit divides by it.
    const headroomLimitKW = headroomKWh / (limits.chargeEfficiency * dtHours)
    const chargeKW = Math.min(surplusKW, limits.maxPowerKW, headroomLimitKW)

    if (chargeKW > IDLE_THRESHOLD_KW) {
      const absorbed = chargeKW * limits.chargeEfficiency * dtHours
      return {
        chargeKW,
        dischargeKW: 0,
        storedKWh: Math.min(limits.capacityKWh, storedKWh + absorbed),
        state: 'Charging',
        reason: `Charging from ${surplusKW.toFixed(1)} kW PV surplus.`,
      }
    }
    return {
      chargeKW: 0,
      dischargeKW: 0,
      storedKWh,
      state: 'Idle',
      reason: 'Full — surplus cannot be absorbed.',
    }
  }

  if (deficitKW > 0) {
    // ── DISCHARGE ── cover the deficit, bounded by power and the reserve floor.
    const reserveKWh = limits.capacityKWh * limits.reserveFraction
    const availableKWh = Math.max(0, storedKWh - reserveKWh)
    // Energy drawn is the AC power divided by the discharge efficiency, so the
    // AC power the available energy can sustain multiplies by it.
    const availableLimitKW = (availableKWh * limits.dischargeEfficiency) / dtHours
    const dischargeKW = Math.min(deficitKW, limits.maxPowerKW, availableLimitKW)

    if (dischargeKW > IDLE_THRESHOLD_KW) {
      const drawn = dischargeKW / limits.dischargeEfficiency
      return {
        chargeKW: 0,
        dischargeKW,
        storedKWh: Math.max(reserveKWh, storedKWh - drawn * dtHours),
        state: 'Discharging',
        reason: `Discharging ${dischargeKW.toFixed(1)} kW — reducing grid import.`,
      }
    }
    return {
      chargeKW: 0,
      dischargeKW: 0,
      storedKWh,
      state: 'Idle',
      // The defining condition for this building: nothing left to give, and no
      // surplus has been available to put anything back.
      reason: `Holding at ${Math.round(limits.reserveFraction * 100)}% reserve — no PV surplus available to recharge.`,
    }
  }

  return {
    chargeKW: 0,
    dischargeKW: 0,
    storedKWh,
    state: 'Idle',
    reason: 'Idle — generation and demand are balanced.',
  }
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------
/**
 * BatteryEnergyEngine — state of charge, charge/discharge dispatch and limits.
 *
 * Allocation-free in the hot path: the state object and the dispatch object are
 * created once in the constructor and mutated in place, so the 20 Hz
 * environmental tier produces no garbage.
 */
export class BatteryEnergyEngine implements StoragePort {
  private readonly capacityKWh: number
  private readonly reserveFraction: number
  private readonly maxPowerKW: number
  private readonly chargeEfficiency: number
  private readonly dischargeEfficiency: number

  private storedKWh: number
  private throughputKWh = 0

  /** Reused across ticks — never reallocated. */
  private readonly dispatchResult: StorageDispatch = { chargeKW: 0, dischargeKW: 0 }
  private readonly state: BatteryState

  constructor(options: BatteryOptions = {}) {
    this.capacityKWh = options.capacityKWh ?? BATTERY_CAPACITY_KWH
    this.reserveFraction = clamp(options.reserveFraction ?? DEFAULT_RESERVE_FRACTION, 0, 0.9)
    this.maxPowerKW = this.capacityKWh * (options.cRate ?? DEFAULT_C_RATE)
    this.chargeEfficiency = options.chargeEfficiency ?? DEFAULT_CHARGE_EFFICIENCY
    this.dischargeEfficiency = options.dischargeEfficiency ?? DEFAULT_DISCHARGE_EFFICIENCY
    this.storedKWh = this.capacityKWh * clamp(options.initialSoc ?? DEFAULT_INITIAL_SOC)

    this.state = {
      capacityKWh: this.capacityKWh,
      storedKWh: this.storedKWh,
      soc: 0,
      reserveFraction: this.reserveFraction,
      availableKWh: 0,
      headroomKWh: 0,
      chargeKW: 0,
      dischargeKW: 0,
      maxPowerKW: this.maxPowerKW,
      state: 'Idle',
      reason: 'Initialising.',
      roundTripEfficiency: this.chargeEfficiency * this.dischargeEfficiency,
      throughputKWh: 0,
      temperatureFactor: 1,
      ageingFactor: 1,
    }
    this.refreshDerived()
  }

  /**
   * Decide this step's charge/discharge and integrate the state of charge.
   *
   * Called by the Building Energy Bus with the **PV-only** imbalance — the
   * surplus and deficit that exist before storage is considered. Exactly one of
   * the two can be non-zero, so the battery can never charge and discharge in
   * the same step.
   *
   * @param surplusKW      PV generation the building could not absorb, kW.
   * @param deficitKW      Demand the PV could not meet, kW.
   * @param dtSimSeconds   Elapsed **simulated** seconds — energy is the integral
   *                       of power over simulated time, matching the load model
   *                       and the HVAC lag. 0 means "no elapse" (initialisation,
   *                       pause or a timeline scrub) and transfers no energy.
   */
  dispatch(surplusKW: number, deficitKW: number, dtSimSeconds: number): StorageDispatch {
    const dtHours = Math.max(0, dtSimSeconds) / 3600
    const plan = planStorage(this.getLimits(), this.storedKWh, surplusKW, deficitKW, dtHours)

    // Energy accounting stays here: `planStorage` decides the step, the engine
    // owns the state it advances.
    this.throughputKWh += (plan.chargeKW + plan.dischargeKW) * dtHours
    this.storedKWh = plan.storedKWh

    this.dispatchResult.chargeKW = plan.chargeKW
    this.dispatchResult.dischargeKW = plan.dischargeKW

    this.state.chargeKW = plan.chargeKW
    this.state.dischargeKW = plan.dischargeKW
    this.state.state = plan.state
    // A step with no elapsed simulated time decides nothing, so the last real
    // explanation is retained rather than replaced with a placeholder.
    if (plan.reason !== null) this.state.reason = plan.reason
    this.refreshDerived()

    return this.dispatchResult
  }

  /**
   * The battery's fixed electrical envelope. Read by the Prediction Engine so a
   * projected state-of-charge walk uses the real limits, never assumed ones.
   */
  getLimits(): StorageLimits {
    return {
      capacityKWh: this.capacityKWh,
      reserveFraction: this.reserveFraction,
      maxPowerKW: this.maxPowerKW,
      chargeEfficiency: this.chargeEfficiency,
      dischargeEfficiency: this.dischargeEfficiency,
    }
  }

  /** Live battery state (mutated in place — treat as read-only). */
  getState(): BatteryState {
    return this.state
  }

  /** Recompute the derived readouts from `storedKWh`. */
  private refreshDerived(): void {
    const reserveKWh = this.capacityKWh * this.reserveFraction
    this.state.storedKWh = this.storedKWh
    this.state.soc = this.capacityKWh > 0 ? this.storedKWh / this.capacityKWh : 0
    this.state.availableKWh = Math.max(0, this.storedKWh - reserveKWh)
    this.state.headroomKWh = Math.max(0, this.capacityKWh - this.storedKWh)
    this.state.throughputKWh = this.throughputKWh
  }
}
