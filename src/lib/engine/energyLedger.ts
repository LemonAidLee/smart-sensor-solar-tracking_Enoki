/**
 * Daily Energy Ledger — Stage 7.6.
 *
 * Integrates every flow on the Building Energy Bus over simulated time and
 * resets at simulated midnight. It is the **single authority for anything
 * day-scoped**: the six daily energy totals and the daily peak grid exchange.
 *
 * ── Why this is its own module ───────────────────────────────────────────────
 * The day boundary is a system-level concept shared by PV, the building, the
 * battery and the grid — it belongs to none of them individually. Putting the
 * counters here keeps each engine focused on its own instantaneous behaviour and
 * guarantees exactly one place where a kW becomes a kWh. In particular the grid
 * engine holds no energy counters of its own, so daily import/export can never
 * drift from the ledger's.
 *
 * ── Simulated time, never wall-clock ─────────────────────────────────────────
 * Energy is the integral of power over **simulated** seconds, and the day rolls
 * over on the **simulated** clock — matching the load model, the HVAC lag and
 * the battery's state of charge. The twin compresses a day into ~2 real minutes,
 * so a wall-clock ledger would be meaningless.
 *
 * Pure, framework-free, renders nothing.
 */

import type { EnergyBusState } from './buildingEnergy'

/**
 * A jump larger than this between updates is a timeline scrub or a date change,
 * not elapsed time. The day is restarted rather than carrying totals across an
 * interval that was never simulated.
 */
const DISCONTINUITY_HOURS = 0.5

/** Daily totals, all kWh except the peaks (kW). */
export interface DailyEnergyTotals {
  pvGenerationKWh: number
  buildingConsumptionKWh: number
  batteryChargeKWh: number
  batteryDischargeKWh: number
  gridImportKWh: number
  gridExportKWh: number
  /** Highest instantaneous grid import seen today, kW. */
  peakImportKW: number
  /** Highest instantaneous grid export seen today, kW. */
  peakExportKW: number
  /** Simulated hours accumulated into the current day, 0–24. */
  elapsedHours: number
  /** How many day rollovers have occurred — lets the UI show "day N". */
  dayCount: number
}

/**
 * DailyEnergyLedger — accumulates bus flows into daily energy.
 *
 * Allocation-free: the totals object is created once and mutated in place.
 */
export class DailyEnergyLedger {
  private lastTimeHours = 0
  private seeded = false
  private readonly totals: DailyEnergyTotals = {
    pvGenerationKWh: 0,
    buildingConsumptionKWh: 0,
    batteryChargeKWh: 0,
    batteryDischargeKWh: 0,
    gridImportKWh: 0,
    gridExportKWh: 0,
    peakImportKW: 0,
    peakExportKW: 0,
    elapsedHours: 0,
    dayCount: 1,
  }

  /**
   * Accumulate one environmental tick.
   *
   * @param timeHours     Simulated local time of day, 0–24.
   * @param dtSimSeconds  Elapsed **simulated** seconds since the last call. 0
   *                      means no elapse (pause, initialisation or a scrub) and
   *                      accumulates nothing.
   * @param bus           The settled Building Energy Bus.
   */
  update(timeHours: number, dtSimSeconds: number, bus: EnergyBusState): void {
    if (!this.seeded) {
      this.lastTimeHours = timeHours
      this.seeded = true
      return
    }

    const delta = timeHours - this.lastTimeHours

    if (dtSimSeconds > 0 && delta < 0) {
      // Genuine forward elapse that wrapped past 24:00 — a new day.
      this.reset(true)
    } else if (dtSimSeconds <= 0 && Math.abs(delta) > DISCONTINUITY_HOURS) {
      // The clock moved without simulated time passing: a scrub or a date
      // change. Totals for "today" no longer describe a simulated interval, so
      // start the day again rather than reporting a partial, misleading figure.
      this.reset(false)
    }
    this.lastTimeHours = timeHours

    if (dtSimSeconds <= 0) return

    const dtHours = dtSimSeconds / 3600
    const t = this.totals
    t.pvGenerationKWh += bus.pvGenerationKW * dtHours
    t.buildingConsumptionKWh += bus.buildingLoadKW * dtHours
    t.batteryChargeKWh += bus.batteryChargeKW * dtHours
    t.batteryDischargeKWh += bus.batteryDischargeKW * dtHours
    t.gridImportKWh += bus.requiredGridImportKW * dtHours
    t.gridExportKWh += bus.surplusKW * dtHours
    t.elapsedHours += dtHours

    if (bus.requiredGridImportKW > t.peakImportKW) t.peakImportKW = bus.requiredGridImportKW
    if (bus.surplusKW > t.peakExportKW) t.peakExportKW = bus.surplusKW
  }

  /** Live daily totals (mutated in place — treat as read-only). */
  getTotals(): DailyEnergyTotals {
    return this.totals
  }

  /** Clear the day. `advanceDay` distinguishes a midnight roll from a scrub. */
  private reset(advanceDay: boolean): void {
    const t = this.totals
    t.pvGenerationKWh = 0
    t.buildingConsumptionKWh = 0
    t.batteryChargeKWh = 0
    t.batteryDischargeKWh = 0
    t.gridImportKWh = 0
    t.gridExportKWh = 0
    t.peakImportKW = 0
    t.peakExportKW = 0
    t.elapsedHours = 0
    if (advanceDay) t.dayCount++
  }
}
