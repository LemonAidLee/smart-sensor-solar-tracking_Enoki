# DailyEnergyLedger

**Subsystem ID:** EnergyLedger (not yet in `src/lib/knowledge/types.ts` `SubsystemId` union — treat as a documented-but-not-yet-registered subsystem)
**Version:** 1.0.0
**Last updated:** 2026-08-06

## Purpose

`DailyEnergyLedger` (`src/lib/engine/energyLedger.ts`, Stage 7.6, rewritten timeline-aware in Stage 7.9.4) integrates every flow on the Building Energy Bus over simulated time and resets at simulated midnight. It is the **single authority for anything day-scoped**: the six daily energy totals (PV generation, building consumption, battery charge, battery discharge, grid import, grid export) and the daily peak grid exchange (import and export).

The day boundary is a system-level concept shared by PV, the building, the battery and the grid — it belongs to none of them individually. Centralising the counters here keeps each engine focused on its own instantaneous behaviour and guarantees exactly one place where a kW becomes a kWh; in particular the grid engine holds no energy counters of its own, so daily import/export can never drift from the ledger's.

`dailyEnergyBootstrap.ts` (Stage 7.9.5) is documented alongside this engine as its companion: it solves the "session opened mid-day" problem by reconstructing a day's worth of ledger history using the twin's own forward-projection physics before live ticking begins.

## Responsibilities

- Integrate `EnergyBusState` power flows (kW) into energy (kWh) over **simulated** seconds, never wall-clock.
- Track six running daily totals and two daily peaks, always as "the integral from 00:00 to now."
- Handle a scrubbable/rewindable simulated clock correctly: revisiting a time interval must never double-count it, and a rewind must shrink the displayed totals exactly as far as it should.
- Roll over at simulated midnight, incrementing a day counter.
- Support bulk historical backfill (`writeHistorical`) for `dailyEnergyBootstrap.ts`'s reconstruction walk, without paying the cost of recomputing displayed totals after every intermediate step.
- Pure, framework-free, renders nothing.

## Inputs

Passed to `DailyEnergyLedger.update()`, called once per environmental tick from `Simulation.tick()`, immediately after the grid:

| Parameter | Type | Source |
|---|---|---|
| `timeHours` | number, 0–24 | Simulated local time of day (`this.clock.timeHours`) |
| `dtSimSeconds` | number, simulated seconds | Shared `simSeconds` step, the same value fed to every other lagged/integrated subsystem that tick |
| `bus` | `EnergyBusState` | `BuildingEnergyEngine.getBusState()` — the settled Building Energy Bus, **never re-derived here** |

`dailyEnergyBootstrap.bootstrapDailyEnergy()` additionally takes:

| Parameter | Type | Meaning |
|---|---|---|
| `ledger` | `DailyEnergyLedger` | The freshly constructed, empty ledger to reconstruct into |
| `ctx` | `PredictionContext` | Read-only context for "today" — weather timeline, geometry, plant limits, current measured façade openness (`clock.timeHours` is ignored; the walk supplies its own) |
| `landingHours` | number, 0–24 | The simulated time of day to reconstruct up to |
| `batteryStartKWh` | number | Assumed state of charge at 00:00 — the battery engine's own just-constructed default |

## Outputs

`DailyEnergyTotals` (from `getTotals()`):

| Field | Unit | Meaning |
|---|---|---|
| `pvGenerationKWh` | kWh | Cumulative PV generation today |
| `buildingConsumptionKWh` | kWh | Cumulative building load today |
| `batteryChargeKWh` | kWh | Cumulative battery charge today |
| `batteryDischargeKWh` | kWh | Cumulative battery discharge today |
| `gridImportKWh` | kWh | Cumulative grid import today |
| `gridExportKWh` | kWh | Cumulative grid export today |
| `peakImportKW` | kW | Highest instantaneous grid import seen today |
| `peakExportKW` | kW | Highest instantaneous grid export seen today |
| `elapsedHours` | 0–24 | Current simulated time of day — where "today's integral" stops |
| `dayCount` | integer | How many day rollovers have occurred, for "day N" display |

## Internal Calculation Pipeline

The ledger holds a fixed grid of `BUCKETS_PER_DAY` time buckets covering the day. Each bucket is *overwritten*, not added to, whenever the clock re-enters it after having left (a rewind followed by a replay), so revisiting an interval never counts it twice.

`update(timeHours, dtSimSeconds, bus)` (`energyLedger.ts` lines 144–171):

1. If not yet seeded: record `lastTimeHours`, mark seeded, `recompute()`, return.
2. If `dtSimSeconds > 0`: compute `delta = timeHours - lastTimeHours`.
   - `delta < 0` → the clock wrapped past 24:00 into a new day: `startNewDay()` (zero all buckets, reset `lastWrittenBucket = -1`, increment `dayCount`), then `applyInterval(0, timeHours, bus)` (the wrapped sliver is credited to the new day).
   - Otherwise → `applyInterval(lastTimeHours, timeHours, bus)`.
3. If `dtSimSeconds <= 0` (a scrub/rewind): nothing is integrated; `recompute()` alone re-derives totals from whatever the bucket grid already holds at the new clock position.
4. `lastTimeHours = timeHours`; `recompute()`.

`applyInterval(startHour, endHour, bus)` (lines 212–222): walks bucket-by-bucket from `startHour` to `endHour`, computing each bucket's `index = floor(h / BUCKET_HOURS)` and writing the elapsed fraction of that bucket via `writeBucket`.

`writeBucket(index, segmentHours, bus)` (lines 224–238): if `index !== lastWrittenBucket`, the bucket is zeroed first (a fresh visit, not a continued sweep through the same bucket); then each of the six energy accumulators is incremented by `bus.<flow>KW * segmentHours`, and the two peak fields are updated via `max`.

`recompute()` (lines 241–265): re-sums every bucket from index `0` up to `floor(lastTimeHours / BUCKET_HOURS)` into the public `totals` object — literally the integral of bus power from day-start to "now." A rewind therefore shrinks the total exactly as far as it should, and a replay reproduces the same total it produced before.

`bootstrapDailyEnergy()` (`dailyEnergyBootstrap.ts` lines 88–112): calls `ledger.beginBootstrap()` (zero all buckets), then walks a midnight-based `PredictionContext` copy forward in `BOOTSTRAP_STEP_HOURS` increments, calling `projectAt(...)` (the twin's own forward-projection physics — the same one the AI Prediction layer uses) at each step to get a settled `bus`, feeding that bus into `ledger.writeHistorical(h, next, bus)`, and carrying the projected `storedKWh` forward as the next step's battery state. After the walk, `ledger.update(landingHours, 0, bus)` places the read head and recomputes totals exactly once.

## Engineering Equations

All transcribed verbatim from `src/lib/engine/energyLedger.ts` and `src/lib/engine/dailyEnergyBootstrap.ts`:

```
BUCKET_HOURS = 1 / 3600                          // one simulated second, in hours
BUCKETS_PER_DAY = round(24 / BUCKET_HOURS)

applyInterval(startHour, endHour, bus):
  h = startHour
  while h < endHour - 1e-9:
    index = min(BUCKETS_PER_DAY - 1, floor(h / BUCKET_HOURS))
    bucketEnd = (index + 1) * BUCKET_HOURS
    segmentEnd = min(endHour, max(bucketEnd, h + 1e-9))
    writeBucket(index, segmentEnd - h, bus)
    h = segmentEnd

writeBucket(index, segmentHours, bus):
  if index != lastWrittenBucket: zeroBucket(bucket)
  bucket.pvGenerationKWh        += bus.pvGenerationKW * segmentHours
  bucket.buildingConsumptionKWh += bus.buildingLoadKW * segmentHours
  bucket.batteryChargeKWh       += bus.batteryChargeKW * segmentHours
  bucket.batteryDischargeKWh    += bus.batteryDischargeKW * segmentHours
  bucket.gridImportKWh          += bus.requiredGridImportKW * segmentHours
  bucket.gridExportKWh          += bus.surplusKW * segmentHours
  bucket.peakImportKW = max(bucket.peakImportKW, bus.requiredGridImportKW)
  bucket.peakExportKW = max(bucket.peakExportKW, bus.surplusKW)
  lastWrittenBucket = index

recompute():
  upTo = min(BUCKETS_PER_DAY - 1, floor(lastTimeHours / BUCKET_HOURS))
  totals.<eachKWhField> = Σ bucket.<field> for i in [0, upTo]
  totals.peakImportKW = max over buckets[0..upTo] of bucket.peakImportKW
  totals.peakExportKW = max over buckets[0..upTo] of bucket.peakExportKW
  totals.elapsedHours = lastTimeHours
```

`dailyEnergyBootstrap.ts`'s reconstruction walk:
```
BOOTSTRAP_STEP_HOURS = 1 / 12   // 5 simulated minutes

h = 0
while h < landingHours - 1e-9:
  next = min(landingHours, h + BOOTSTRAP_STEP_HOURS)
  step = projectAt(midnightCtx, next, storedKWh, ctx.timeline, bus, next - h)
  storedKWh = step.storedKWh
  ledger.writeHistorical(h, next, bus)
  h = next
ledger.update(landingHours, 0, bus)
```

## Constants

| Constant | Value | File | Meaning |
|---|---|---|---|
| `BUCKET_HOURS` | `1 / 3600` | `energyLedger.ts` | Width of one history bucket, simulated hours — one simulated second. Also the ledger's worst-case quantisation error, "bounded to a fraction of a Wh even at full building load, which is below anything the UI rounds to" (module comment). |
| `BUCKETS_PER_DAY` | `round(24 / BUCKET_HOURS)` = `86400` | `energyLedger.ts` | Number of buckets covering one simulated day |
| `BOOTSTRAP_STEP_HOURS` | `1 / 12` (5 simulated minutes) | `dailyEnergyBootstrap.ts` | Reconstruction-walk step size; "trades reconstruction resolution against that one-time cost... tracks the solar ramp closely enough for a kWh figure while keeping even a 23:30 landing time to a few hundred steps" (module comment) |

No externally-cited engineering standard applies to these — they are internal numerical/performance tuning constants, not physical parameters.

## Engineering References

None. `energyLedger.ts` and `dailyEnergyBootstrap.ts` implement pure time-integration bookkeeping and a physics-reuse strategy, not a modelled physical phenomenon — no ASHRAE/IES/CIBSE-style standard applies, and none is cited in code. Any external framing of "energy accounting" best practice here would be **inferred, not code-cited**.

## Assumptions

- Energy is the integral of power over **simulated** seconds, and the day rolls over on the **simulated** clock — matching the load model, the HVAC lag and the battery's state of charge. "The twin compresses a day into ~2 real minutes, so a wall-clock ledger would be meaningless" (module comment).
- Daily energy is a **function of simulated time, not a running counter** — because the clock is scrubbable and can be replayed, rewound or jumped, a plain accumulator would double-count every interval revisited. The bucket-grid design exists specifically to make a rewind-then-replay produce exactly the same total as before, with neither extra bookkeeping nor a full physics replay.
- `dailyEnergyBootstrap.ts` reuses, unmodified, the exact simplifications `projectAt` already documents for projecting *forward* (CLAUDE.md §11.2, §11.5) when walking *backward*: façade openness pinned at its current measured mean (never reconstructing PBIF's history — PBIF is the sole controller); thermal lags read at equilibrium via `equilibriumThermalState`, not integrated minute-by-minute; weather sampled from whichever timeline is active, pure function of hour-of-day (exact for Scenario/Forecast Mode; Manual Mode holds the operator's current sliders for the whole reconstructed day); the battery starts the day at `batteryStartKWh`, the just-constructed engine's own default state of charge.
- The bootstrap "runs once, synchronously, at construction... never from the render loop" (module comment) — not a per-tick cost.
- `bootstrapDailyEnergy()` never touches a live engine: `ctx` is read-only `PredictionContext` data (CLAUDE.md §11.1 — no engine reference reaches it) and the battery figure is a local number, not the live `BatteryEnergyEngine`. The only object mutated is the `ledger` passed in.

## Limitations

- The bucket-grid resolution (one simulated second) is a deliberate trade-off, not infinite precision — stated as bounded to "a fraction of a Wh even at full building load," acceptable because it is below anything the UI rounds to, but a genuine quantisation limit nonetheless.
- The historical reconstruction (`dailyEnergyBootstrap.ts`) inherits every simplification the forward AI projection already carries (equilibrium thermal lag, fixed assumed COP, façade openness pinned at current mean, no forward occlusion ray-cast) — a reconstructed "today" before the session's actual first tick is therefore an approximation under those same stated assumptions, not a record of what physically happened.
- In Manual weather mode, the bootstrap has no history to sample and holds the operator's current slider values for the entire reconstructed day — a genuine information gap for Manual Mode sessions that open mid-day, explicitly acknowledged in the module's own comments rather than hidden.
- Not registered in the knowledge base or the `SubsystemId` union (see Design Rationale).

## Dependencies

- [BuildingEnergy](./building_energy.md) — consumes `EnergyBusState` from `BuildingEnergyEngine.getBusState()`; the ledger never derives bus flows itself.
- `dailyEnergyBootstrap.ts`'s reconstruction walk depends on `projectAt()` and `emptyBus()` from `src/lib/prediction/projection.ts`, and on `PredictionContext` from `src/lib/prediction/types.ts` — i.e. indirectly on every physics function the AI Prediction layer's `projectAt` composes (solar physics, PV electrical/inverter, [BuildingThermal](./building_thermal.md)'s `equilibriumThermalState`, [BuildingEnergy](./building_energy.md)'s `buildingDemandKW`/`settleBus`, battery's `planStorage`). It does **not** depend on [BuildingLighting](./building_lighting.md), since `buildingDemandKW` inside `projectAt` never receives an `artificialLightingKW` argument (see [BuildingLighting](./building_lighting.md)'s Limitations).

## Consumers

Verified via `Grep` across `src/`:

- **`Simulation.tick()`** (`src/lib/engine/simulation.ts`) — instantiates the ledger (`this.energyLedger = new DailyEnergyLedger()`, line 254), calls `bootstrapDailyEnergy(...)` once at construction (line 300) to backfill the day up to the landing clock time, and calls `energyLedger.update(...)` once per environmental tick (line 392, plus a zero-`dt` seed call at line 291) immediately after the grid settles.
- **`SimSnapshot.daily`** — `simulation.ts` line 681 publishes `this.energyLedger.getTotals()`.
- **`RooftopPvPanel.tsx`** (`src/components/twin3d/ui/RooftopPvPanel.tsx`) — reads `snapshot.daily` directly (confirmed via Grep: `daily.gridImportKWh`, `daily.gridExportKWh`, `daily.peakImportKW`, `daily.peakExportKW`, `daily.pvGenerationKWh`, `daily.buildingConsumptionKWh`, `daily.batteryChargeKWh`, `daily.batteryDischargeKWh`, `daily.dayCount`, `daily.elapsedHours`) to render a "Daily Energy" summary section including per-flow totals and a day counter.

Not found as a consumer: the AI Prediction/What-If layer does not read `DailyEnergyTotals` directly — it is a one-way relationship where `dailyEnergyBootstrap.ts` reuses the *projection's* physics to feed the *ledger*, not the reverse.

## Public API

From `src/lib/engine/energyLedger.ts`:

```ts
export class DailyEnergyLedger {
  update(timeHours: number, dtSimSeconds: number, bus: EnergyBusState): void
  getTotals(): DailyEnergyTotals
  beginBootstrap(): void
  writeHistorical(startHour: number, endHour: number, bus: EnergyBusState): void
}

export interface DailyEnergyTotals { /* see Outputs */ }
```

From `src/lib/engine/dailyEnergyBootstrap.ts`:

```ts
export function bootstrapDailyEnergy(
  ledger: DailyEnergyLedger,
  ctx: PredictionContext,
  landingHours: number,
  batteryStartKWh: number,
): void
```

`applyInterval`, `writeBucket`, `recompute`, `startNewDay`, and `zeroBucket` are private/internal (not exported).

## Live Outputs

`DailyEnergyTotals` fields, exactly as named in `energyLedger.ts`: `pvGenerationKWh`, `buildingConsumptionKWh`, `batteryChargeKWh`, `batteryDischargeKWh`, `gridImportKWh`, `gridExportKWh`, `peakImportKW`, `peakExportKW`, `elapsedHours`, `dayCount`. Published at `SimSnapshot.daily`.

## Source Files

- `src/lib/engine/energyLedger.ts` — the ledger, bucket grid, integration and rollover logic.
- `src/lib/engine/dailyEnergyBootstrap.ts` — historical reconstruction using the twin's own projection physics.
- `src/lib/engine/simulation.ts` — instantiation, bootstrap invocation, per-tick invocation, snapshot publication (lines 254, 291, 300, 392, 681).
- `src/lib/engine/buildingEnergy.ts` — source of the `EnergyBusState` the ledger integrates.
- `src/lib/prediction/projection.ts` — source of `projectAt()`/`emptyBus()`, reused by the bootstrap.
- `src/components/twin3d/ui/RooftopPvPanel.tsx` — UI consumer of `SimSnapshot.daily`.

## Design Rationale

- **Why this is its own module, not folded into `BuildingEnergyEngine`** (module comment, verbatim in substance): "The day boundary is a system-level concept shared by PV, the building, the battery and the grid — it belongs to none of them individually. Putting the counters here keeps each engine focused on its own instantaneous behaviour and guarantees exactly one place where a kW becomes a kWh. In particular the grid engine holds no energy counters of its own, so daily import/export can never drift from the ledger's."
- **Why a bucket grid instead of a plain accumulator** (module comment, verbatim in substance): "A Digital Twin's clock is scrubbable and can be replayed, rewound or jumped — a plain accumulator double-counts every interval revisited. Instead this ledger holds a fixed grid of fine-grained time buckets covering the day; each bucket is *overwritten*, not added to, whenever the clock re-enters it after having left... so revisiting an interval never counts it twice."
- **Why the bootstrap exists at all** (`dailyEnergyBootstrap.ts` module header, verbatim in substance): "A session that opens, or a page that reloads, with the clock already at 19:11 has never ticked through 00:00–19:11, so the ledger's honest answer for that stretch is 'I don't know' — displayed as 0.0 kWh. That reads as a bug." The fix runs the twin's own forward-projection physics from midnight to the landing time, so "every historical instant is the twin's existing model evaluated at that hour, so the reconstruction is 'what the twin would have shown,' not an estimate of it."
- **Why the bootstrap reuses `projectAt` rather than a second model** (guide §11.1, applied by this module): "No second solar model, no second PV curve, no second load or dispatch rule."
- **Why `writeHistorical` skips recompute per-step**: "recomputing the displayed totals after every intermediate step would rescan the whole bucket grid for a total nothing reads until the walk finishes."
- **Gap in the knowledge base**: neither `EnergyLedger` nor a bootstrap-equivalent subsystem exists in `src/lib/knowledge/types.ts`'s `SubsystemId` union or `src/lib/knowledge/subsystems.ts`. This document exists in part to close that gap for the Engineering Assistant.

## Future Extension Points

- Multi-day history (currently only "today" is tracked; a rollover discards the previous day's buckets entirely, retaining only `dayCount`).
- Extending the bootstrap's reconstruction to account for [BuildingLighting](./building_lighting.md)'s daylight-responsive demand once `projectAt`/`buildingDemandKW` itself is extended to project it (see [BuildingLighting](./building_lighting.md)'s Future Extension Points) — today's bootstrap inherits that same omission.
- Registering `EnergyLedger` in `src/lib/knowledge/types.ts`'s `SubsystemId` union and adding a corresponding entry to `src/lib/knowledge/subsystems.ts`.
- Exposing daily totals to the AI Prediction/What-If layer for "energy so far today vs. projected rest of day" style analysis, which no current consumer performs.
