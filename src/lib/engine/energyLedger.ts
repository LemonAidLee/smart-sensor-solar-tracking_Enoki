/**
 * Daily Energy Ledger — Stage 7.6, rewritten timeline-aware in Stage 7.9.4.
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
 * ── Daily energy is a function of simulated time, not a running counter ─────
 * A Digital Twin's clock is scrubbable and can be replayed, rewound or jumped —
 * a plain accumulator double-counts every interval revisited. Instead this
 * ledger holds a fixed grid of fine-grained time buckets covering the day; each
 * bucket is *overwritten*, not added to, whenever the clock re-enters it after
 * having left (a rewind followed by a replay), so revisiting an interval never
 * counts it twice. The displayed totals are always the sum of the buckets from
 * 00:00 up to the clock's current position — i.e. literally the integral of bus
 * power from day-start to "now" — so a rewind shrinks the total exactly as far
 * as it should, and a replay reproduces the same total it produced before,
 * without either extra bookkeeping or a full physics replay.
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
 * Width of one history bucket, in simulated hours — one simulated second.
 * Landing exactly on a bucket that a previous pass already completed (e.g. a
 * rewind stopping mid-bucket) sums that whole bucket, so the bucket width is
 * also the ledger's worst-case quantisation error; one simulated second keeps
 * that bounded to a fraction of a Wh even at full building load, which is
 * below anything the UI rounds to. `recompute()` rescanning the full grid
 * every environmental tick is still trivially cheap at this resolution (tens
 * of thousands of plain-number additions is microseconds of work) — see
 * comment there.
 */
const BUCKET_HOURS = 1 / 3600
const BUCKETS_PER_DAY = Math.round(24 / BUCKET_HOURS)

interface EnergyBucket {
  pvGenerationKWh: number
  buildingConsumptionKWh: number
  batteryChargeKWh: number
  batteryDischargeKWh: number
  gridImportKWh: number
  gridExportKWh: number
  peakImportKW: number
  peakExportKW: number
}

function zeroBucket(b: EnergyBucket): void {
  b.pvGenerationKWh = 0
  b.buildingConsumptionKWh = 0
  b.batteryChargeKWh = 0
  b.batteryDischargeKWh = 0
  b.gridImportKWh = 0
  b.gridExportKWh = 0
  b.peakImportKW = 0
  b.peakExportKW = 0
}

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
  /** Current simulated time of day, 0–24 — where "today's integral" stops. */
  elapsedHours: number
  /** How many day rollovers have occurred — lets the UI show "day N". */
  dayCount: number
}

/**
 * DailyEnergyLedger — accumulates bus flows into daily energy.
 *
 * Allocation-free after construction: the bucket grid and the totals object
 * are both created once and mutated in place.
 */
export class DailyEnergyLedger {
  private lastTimeHours = 0
  private seeded = false
  /**
   * Index of the bucket most recently written to, or -1 before anything has
   * been written this day. Writing a bucket whose index differs from this
   * means the clock arrived here afresh — either the very first visit, or a
   * replay after a rewind — so that bucket's previous contents are stale and
   * must be overwritten rather than added to. Writing the *same* index again
   * means playback is still moving forward through it, so it keeps summing.
   */
  private lastWrittenBucket = -1
  private readonly buckets: EnergyBucket[] = Array.from({ length: BUCKETS_PER_DAY }, () => ({
    pvGenerationKWh: 0,
    buildingConsumptionKWh: 0,
    batteryChargeKWh: 0,
    batteryDischargeKWh: 0,
    gridImportKWh: 0,
    gridExportKWh: 0,
    peakImportKW: 0,
    peakExportKW: 0,
  }))
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
   *                      means no physical elapse (pause, initialisation, or a
   *                      timeline scrub/rewind) — nothing is integrated, and the
   *                      bucket grid is left exactly as it was.
   * @param bus           The settled Building Energy Bus.
   */
  update(timeHours: number, dtSimSeconds: number, bus: EnergyBusState): void {
    if (!this.seeded) {
      this.lastTimeHours = timeHours
      this.seeded = true
      this.recompute()
      return
    }

    if (dtSimSeconds > 0) {
      const delta = timeHours - this.lastTimeHours
      if (delta < 0) {
        // Genuine forward elapse that wrapped past 24:00 — a new day. The
        // wrapped sliver is credited to the new day, matching how the rest of
        // the environmental tier treats the same wrap as one continuous step.
        this.startNewDay()
        this.applyInterval(0, timeHours, bus)
      } else {
        this.applyInterval(this.lastTimeHours, timeHours, bus)
      }
    }
    // dtSimSeconds <= 0: a scrub or rewind. The clock moved without a physical
    // elapse, so nothing is integrated here — `recompute()` below re-derives
    // the totals from whatever the bucket grid already holds for the new
    // position, which is exactly the "immediate restore" a scrub needs.

    this.lastTimeHours = timeHours
    this.recompute()
  }

  /** Live daily totals (mutated in place — treat as read-only). */
  getTotals(): DailyEnergyTotals {
    return this.totals
  }

  /**
   * Clear the bucket grid for a from-scratch historical reconstruction (the
   * Stage 7.9.5 daily-energy bootstrap) — leaves the ledger exactly as a
   * freshly constructed one would be, so `writeHistorical` starts from a
   * known, empty day regardless of whatever this ledger held before.
   */
  beginBootstrap(): void {
    for (const b of this.buckets) zeroBucket(b)
    this.lastWrittenBucket = -1
  }

  /**
   * Bulk-write bus flows for `[startHour, endHour)` without recomputing the
   * displayed totals. A historical reconstruction calls this many times in a
   * row before anything reads `getTotals()`; recomputing after every one of
   * those intermediate steps — as the normal per-tick `update()` does — would
   * rescan the whole bucket grid for a total nothing observes yet. Call
   * `update(atHours, 0, ...)` once after the last `writeHistorical` call to
   * place the read head and recompute a single time.
   */
  writeHistorical(startHour: number, endHour: number, bus: EnergyBusState): void {
    this.applyInterval(startHour, endHour, bus)
  }

  /**
   * Distribute one step's bus flows across every bucket it spans.
   *
   * `bucketEnd` is re-derived from `index` by multiplication while `h` walks
   * forward by addition — the two can disagree by a float epsilon right at a
   * boundary, which would let `segmentEnd` land at or behind `h`. Clamping
   * `segmentEnd` to strictly exceed `h` guarantees the loop always advances,
   * however the rounding falls; the iteration cap is a second, independent
   * backstop against a boundary case that isn't the one analysed here.
   */
  private applyInterval(startHour: number, endHour: number, bus: EnergyBusState): void {
    let h = startHour
    let iterations = 0
    while (h < endHour - 1e-9 && iterations++ < BUCKETS_PER_DAY + 4) {
      const index = Math.min(BUCKETS_PER_DAY - 1, Math.floor(h / BUCKET_HOURS))
      const bucketEnd = (index + 1) * BUCKET_HOURS
      const segmentEnd = Math.min(endHour, Math.max(bucketEnd, h + 1e-9))
      this.writeBucket(index, segmentEnd - h, bus)
      h = segmentEnd
    }
  }

  private writeBucket(index: number, segmentHours: number, bus: EnergyBusState): void {
    const b = this.buckets[index]
    if (index !== this.lastWrittenBucket) zeroBucket(b)

    b.pvGenerationKWh += bus.pvGenerationKW * segmentHours
    b.buildingConsumptionKWh += bus.buildingLoadKW * segmentHours
    b.batteryChargeKWh += bus.batteryChargeKW * segmentHours
    b.batteryDischargeKWh += bus.batteryDischargeKW * segmentHours
    b.gridImportKWh += bus.requiredGridImportKW * segmentHours
    b.gridExportKWh += bus.surplusKW * segmentHours
    if (bus.requiredGridImportKW > b.peakImportKW) b.peakImportKW = bus.requiredGridImportKW
    if (bus.surplusKW > b.peakExportKW) b.peakExportKW = bus.surplusKW

    this.lastWrittenBucket = index
  }

  /** Re-derive the displayed totals as the integral from 00:00 to "now". */
  private recompute(): void {
    const t = this.totals
    t.pvGenerationKWh = 0
    t.buildingConsumptionKWh = 0
    t.batteryChargeKWh = 0
    t.batteryDischargeKWh = 0
    t.gridImportKWh = 0
    t.gridExportKWh = 0
    t.peakImportKW = 0
    t.peakExportKW = 0

    const upTo = Math.min(BUCKETS_PER_DAY - 1, Math.floor(this.lastTimeHours / BUCKET_HOURS))
    for (let i = 0; i <= upTo; i++) {
      const b = this.buckets[i]
      t.pvGenerationKWh += b.pvGenerationKWh
      t.buildingConsumptionKWh += b.buildingConsumptionKWh
      t.batteryChargeKWh += b.batteryChargeKWh
      t.batteryDischargeKWh += b.batteryDischargeKWh
      t.gridImportKWh += b.gridImportKWh
      t.gridExportKWh += b.gridExportKWh
      if (b.peakImportKW > t.peakImportKW) t.peakImportKW = b.peakImportKW
      if (b.peakExportKW > t.peakExportKW) t.peakExportKW = b.peakExportKW
    }
    t.elapsedHours = this.lastTimeHours
  }

  private startNewDay(): void {
    for (const b of this.buckets) zeroBucket(b)
    this.lastWrittenBucket = -1
    this.totals.dayCount++
  }
}
