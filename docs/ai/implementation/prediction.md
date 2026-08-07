# AI Prediction Layer & AI What-If Analysis

**Subsystem ID:** AIPrediction / AIWhatIf (prediction.md covers both)
**Version:** 1.0.0
**Last updated:** 2026-08-06

This document covers two sibling subsystems that share the same forward-projection machinery:

- **Stage 8.1 — AI Prediction Layer** (`src/lib/prediction/predictionEngine.ts`, `projection.ts`, `confidence.ts`, `insights.ts`): projects the twin 12 hours forward and explains why.
- **Stage 8.2 — AI What-If Analysis** (`src/lib/prediction/whatif/*`): evaluates one hypothetical parameter change in a throwaway sandbox and compares it against the live prediction's baseline walk.

Both are read-only **advisors**. PBIF remains the sole controller of the adaptive façade; neither subsystem writes to solar physics, virtual sensors, PBIF, the servo, the façade, the PV chain, the battery or the grid.

---

## Purpose

**Prediction (8.1):** Answer "what would the existing engines produce N hours from now, and why?" by walking the twin forward hour-by-hour through the same pure physics functions the live simulation calls, then narrating the result in evidence-backed sentences.

**What-If (8.2):** Answer "what would happen instead if exactly one thing were different?" by cloning the read-only prediction context, overriding a single parameter, projecting the clone through the identical `projectWalk`, and comparing the two walks.

Neither subsystem is a controller. What-If runs only from an operator button — never from `Simulation.tick()` or a poll. Prediction is pulled on demand from an ~8 Hz cached poll, AND is separately reachable from `Simulation.tick()`'s `resolve` block via `engineeringContext.update()` → `buildAIPrediction()` → `getPrediction()` (Stage 7.10.2 correction — previously documented here, in `simulation.ts`, `predictionEngine.ts` and CLAUDE.md §11.1 as unreachable from `tick()`, which the actual call chain contradicts). Two layers of caching keep the marginal cost a key comparison except on an actual rollover — see `predictionEngine.ts`'s header for the full note.

## Responsibilities

**PredictionEngine** (`predictionEngine.ts`):
- Cache and invalidate a `PredictionReport` keyed on everything a projection depends on (`invalidationKey`).
- Build horizon cards for 1/3/6/12 h, each with its own confidence breakdown.
- Detect the "no timeline" case (Forecast Mode, empty cache) and report `Holding` rather than fabricating a projection.

**projection.ts**:
- Walk the twin forward one simulated hour at a time (`projectWalk`), and evaluate it at the current instant for comparison (`projectBaseline`).
- Compose environment → solar → façade thermal/optical → PV → building thermal/demand → storage → bus → grid, calling each owning engine's own pure function, in the same order `Simulation.tick()` does.

**confidence.ts**:
- Grade every horizon/window as a deterministic product of three named factors — never randomness.

**insights.ts**:
- Turn `TwinProjection[]` into `Prediction[]` (per-horizon, fixed set of eleven rows), cross-horizon `Insight[]` (conditional, at most `MAX_INSIGHTS`), a `CurrentSituation` snapshot, and a four-stage `ReasoningStage[]` audit trail. Performs no physics — reads only.

**WhatIfEngine** (`whatif/whatIfEngine.ts`):
- Orchestrate one study on command: clone → apply one override → project both walks → compare → recommend → discard the clone.
- Track staleness against the live context without ever auto-re-running.

**scenarios.ts**: catalogue of 8 one-parameter hypotheses (`WHATIF_SCENARIOS`).

**compare.ts**: reduce two 12 h walks to a fixed table of `MetricComparison` rows, each aggregated the way an engineer would judge it (total / peak / final / daytime-mean).

**recommend.ts**: turn a comparison table into an `Observation → Evidence → Reason → Impact [→ Limitation]` conclusion, one hand-written generator per scenario.

## Inputs

Both subsystems consume exactly one object: `PredictionContext` (`src/lib/prediction/types.ts`), assembled once per call by `Simulation.predictionContext()` (`src/lib/engine/simulation.ts:538`). It is `Readonly`-typed pure data — no engine reference, no method, no mutable array reaches it. Fields include:

- `clock`, `building` — site/massing/time.
- `weather`, `sun` — current drivers and current sun state.
- `timeline`, `weatherMode`, `timelineId`, `timelineActiveIndex`, `timelineSegmentProgress`, `forecastStatus`, `forecastAgeMinutes` — weather provenance (timeline already gated on `isActive()` per CLAUDE.md §5.3).
- `facadeSurfaces`, `facadeAreaM2`, `pvModules`, `inverterRatedKW`, `inverterBaseEfficiency`, `floorAreaM2` — geometry/plant sizing.
- `bus`, `battery`, `batteryLimits` — the live "now" the projection is compared against.
- `parameters: ProjectionParameters` — `pvDerate`, `temperatureOffsetC`, `cloudOverride`, `weatherShiftHours`, `gridAvailable`, `facadeOpenness`. Live context holds every field at its true value (`LIVE_PARAMETERS`, `facadeOpenness` seeded from the façade's current measured mean); a What-If sandbox overrides exactly one.

What-If additionally takes a `WhatIfScenarioId` selected by the operator via the Run Analysis action.

## Outputs

**`PredictionReport`** (`types.ts`) — see Live Outputs below for the full field list. Rendered by `AiPredictionPanel.tsx`.

**`WhatIfResult`** (`whatif/types.ts`) — see Live Outputs below. Rendered by `AiWhatIfPanel.tsx`.

## Internal Calculation Pipeline

### Prediction (8.1)

```
PredictionEngine.getReport(ctx)
  → invalidationKey(ctx)            — cache check, see Constants
  → build(ctx):
      timelineMissing = (mode === 'forecast' && ctx.timeline === null)
      walk = timelineMissing ? [] : projectWalk(ctx, 12)      — projection.ts
      baseline = projectBaseline(ctx)                          — projectAt(ctx, 0, …)
      for hours in [1, 3, 6, 12]:
        projection = walk.find(hoursAhead === hours)
        window = walk.filter(hoursAhead <= hours)
        breakdown = assessConfidence(mode, hours, ageMinutes, window)   — confidence.ts
        predictions = buildPredictions(ctx, projection, baseline, grade, source)  — insights.ts
        summary = summariseHorizon(ctx, projection)
      insights = buildInsights(ctx, walk, baseline, windowConfidence, source)
      reasoning = buildReasoning(ctx, walk, source)
```

`projectWalk` (`projection.ts`) steps `PROJECTION_STEP_HOURS` (1 h) at a time, carrying the battery's state of charge forward through a shared `EnergyBusState` buffer:

```
projectAt(ctx, hoursAhead, storedKWh, timeline, bus, stepHours):
  clock  = futureClock(ctx.clock, hoursAhead)          — advances date across midnight
  drivers = projectDrivers(timeline, ctx.weather, atHours, params)   — sampleTimeline() or persistence
  sun    = computeSun(clock, ctx.building, drivers.cloudCoverage)     [engine/solar]
  ghi    = attenuatedGHI(sun)                                        [engine/solarPhysics]
  exposure = facadeExposure(ctx, sun.worldDir)          — area-weighted mean cosine, fixed surfaces
  facadeIrradiance = planeIrradiance(ghi, exposure, ASSUMED_VISIBILITY=1, sun.isDaytime)  [solarPhysics]
  normalisedFacadeExposure = normalisedExposure(facadeIrradiance)     [engine/metrics]
  solarGainKW = facadeSolarGainKW(normalisedFacadeExposure, params.facadeOpenness, ctx.facadeAreaM2)  [metrics]
  daylight    = facadeDaylightPercent(params.facadeOpenness, sun.isDaytime, ghi)  [metrics]

  cosPv = dot(rotateY(sun.worldDir, orientation), pvNormal(ctx))
  pvPlaneIrradiance = planeIrradiance(ghi, cosPv, 1, sun.isDaytime)   [solarPhysics]
  pvDcKW   = moduleDcPowerW(pvPlaneIrradiance, PV_MODULE_RATED_POWER_W, 1, params.pvDerate) * moduleCount / 1000  [pvElectrical]
  inverter = convertDcToAc(pvDcKW, ctx.inverterRatedKW, ctx.inverterBaseEfficiency)  [pvInverter]

  thermal = equilibriumThermalState(params.facadeOpenness, solarGainKW, drivers.temperature, facadeIrradiance)  [buildingThermal]
  demand  = buildingDemandKW(ctx.floorAreaM2, atHours, hvacDemandFactor(drivers.temperature), thermal.coolingLoadKW)  [buildingEnergy]

  plan = planStorage(ctx.batteryLimits, storedKWh, surplus, deficit, stepHours)  [battery]
  settleBus(bus, inverter.acKW, demand.totalKW, plan)                            [buildingEnergy]

  gridImportKW = params.gridAvailable ? bus.requiredGridImportKW : 0
  unservedLoadKW = params.gridAvailable ? 0 : bus.requiredGridImportKW
  → { projection: TwinProjection, storedKWh: plan.storedKWh }
```

### What-If (8.2)

```
WhatIfEngine.run(ctx, scenarioId):
  scenario = getWhatIfScenario(scenarioId)                — scenarios.ts
  refuse if mode === 'forecast' && ctx.timeline === null  — same "no data" gate as Prediction
  sandboxCtx   = scenario.apply(ctx)                       — exactly one field overridden, object spread
  baselineWalk = projectWalk(ctx, 12)                      — IDENTICAL call the live Prediction makes
  sandboxWalk  = projectWalk(sandboxCtx, 12)
  comparisons  = compareWalks(baselineWalk, sandboxWalk)   — compare.ts
  breakdown    = assessConfidence(ctx.weatherMode, 12, ctx.forecastAgeMinutes, baselineWalk)
  recommendation = recommend(scenario, comparisons, baselineWalk, sandboxWalk)  — recommend.ts
  → WhatIfResult
  // sandboxCtx goes out of scope here — nothing torn down
```

`compareWalks` (`compare.ts`) reduces each `MetricSpec` over both walks via `aggregate()`: `total` = Σ(pick(p)) × `PROJECTION_STEP_HOURS`, `peak` = max, `final` = last sample, `daytimeMean` = mean over `isDaytime` samples only. A `cost` row is always appended with `unavailable` set (see Limitations).

## Engineering Equations

All transcribed verbatim from source.

**Confidence** (`confidence.ts:206`):
```
score = horizon * freshness * stability
```
where:
- `horizonScore(hoursAhead)` (`confidence.ts:102`) — piecewise-linear interpolation of the `HORIZON_SCORE` table.
- `freshnessScore(mode, ageMinutes)` (`confidence.ts:122`) — mode-gated lookup (Manual → constant, Scenario → constant, Forecast → age-bucketed).
- `stabilityScore(window)` (`confidence.ts:136`):
  ```
  swing = clamp(CLOUD_WEIGHT * (cloudMax - cloudMin) + RAIN_WEIGHT * (rainMax - rainMin))
  stability = MAX_SCORE - swing * (MAX_SCORE - MIN_SCORE)
  ```
- `gradeOf(score)` (`confidence.ts:156`): `score >= GRADE_HIGH → 'High'`; `score >= GRADE_MEDIUM → 'Medium'`; else `'Low'`.

Note the Knowledge Base's `keyEquations` entry for AIPrediction (`src/lib/knowledge/subsystems.ts:407`) states `Confidence = min(1.0, Horizon_Factor * Freshness_Factor * Stability_Factor)`. The code has no explicit `min(1.0, …)` clamp — each factor is already bounded to ≤1 by construction (`HORIZON_SCORE` max 1, `FRESHNESS`/`SCENARIO_FRESHNESS_SCORE`/`MANUAL_FRESHNESS_SCORE` all ≤1, `STABILITY.MAX_SCORE` = 1), so the product is mathematically always ≤1 and the KB's clamp is redundant rather than contradictory.

**Cache invalidation bucketing** (`predictionEngine.ts:72`):
```
bucket(v, size) = Math.round(v / size)
```

**Comparison delta** (`compare.ts:219`):
```
delta = sandbox - baseline
deltaPercent = |baseline| > NEGLIGIBLE ? (delta / baseline) * 100 : null
direction = negligible ? 'unchanged' : (delta > 0 ? 'higher' : 'lower')
```

**Grid balance check reused nowhere here** — What-If does not re-derive the bus; it reads `settleBus`'s own output (see Dependencies).

**What-If Knowledge Base equation** (`subsystems.ts:437`, descriptive, matches code intent): `Δ_Metric = Sandbox_Integral(t_0, t_12) - Baseline_Integral(t_0, t_12)` — corresponds to `compareWalks`' `total` aggregation, i.e. `delta = s - b` where `s`/`b` are the hour-summed integrals.

## Constants

| Constant | Value | File |
|---|---|---|
| `PREDICTION_MODEL` | `'Engineering Prediction Engine v1'` | `predictionEngine.ts:48` |
| `PREDICTION_HORIZON_HOURS` | `12` | `predictionEngine.ts:51` |
| `PREDICTION_HORIZONS` | `[1, 3, 6, 12]` | `predictionEngine.ts:54` |
| `TIME_BUCKET_HOURS` | `0.5` | `predictionEngine.ts:67` |
| `DRIVER_BUCKET` | `100` | `predictionEngine.ts:70` |
| `PROJECTION_STEP_HOURS` | `1` | `projection.ts:54` |
| `ASSUMED_VISIBILITY` | `1` | `projection.ts:57` |
| `GRADE_HIGH` | `0.72` | `confidence.ts:33` |
| `GRADE_MEDIUM` | `0.45` | `confidence.ts:34` |
| `HORIZON_SCORE` table | `{1h:1, 3h:0.88, 6h:0.74, 12h:0.58}` | `confidence.ts:40` |
| `FRESHNESS.EXCELLENT_MINUTES` / `SCORE` | `60` / `1` | `confidence.ts:54-55` |
| `FRESHNESS.GOOD_MINUTES` / `SCORE` | `360` / `0.88` | `confidence.ts:57-58` |
| `FRESHNESS.FAIR_MINUTES` / `SCORE` | `1440` / `0.66` | `confidence.ts:60-61` |
| `FRESHNESS.STALE_SCORE` | `0.4` | `confidence.ts:63` |
| `FRESHNESS.MISSING_SCORE` | `0.25` | `confidence.ts:65` |
| `SCENARIO_FRESHNESS_SCORE` | `1` | `confidence.ts:72` |
| `MANUAL_FRESHNESS_SCORE` | `0.5` | `confidence.ts:79` |
| `STABILITY.CLOUD_WEIGHT` | `0.55` | `confidence.ts:88` |
| `STABILITY.RAIN_WEIGHT` | `0.45` | `confidence.ts:90` |
| `STABILITY.MAX_SCORE` / `MIN_SCORE` | `1` / `0.45` | `confidence.ts:92,94` |
| `MAX_INSIGHTS` | `6` | `insights.ts:91` |
| Trend thresholds (`TREND.*`) | temp `0.8`°C, cloud `0.08`, wind `3` km/h, irradiance `25` W/m², power `1` kW, SoC `0.02` | `insights.ts:57-70` |
| Notability thresholds (`NOTABLE.*`) | cloud swing `0.2`, rain `0.05`, rain-heavy `0.35`, wind `30` km/h, PV idle `0.5` kW, grid swing `5` kW, cooling swing `5` kW | `insights.ts:73-88` |
| `NEGLIGIBLE` (What-If) | `0.05` | `whatif/compare.ts:37` |
| `NEGLIGIBLE_PERCENT` | `0.5` | `whatif/compare.ts:40` |
| `OVERCAST_COVERAGE` | `0.9` | `whatif/scenarios.ts:27` |
| `WEATHER_SHIFT_HOURS` | `2` | `whatif/scenarios.ts:29` |
| `WARMING_C` | `3` | `whatif/scenarios.ts:31` |
| `PV_DERATE` | `0.9` | `whatif/scenarios.ts:33` |
| `BATTERY_SCALE` | `2` | `whatif/scenarios.ts:35` |
| `FACADE_FULLY_OPEN` / `CLOSED` | `1` / `0` | `whatif/scenarios.ts:38-39` |
| `WHATIF_MODEL` | `'Engineering What-If Engine v1'` | `whatif/whatIfEngine.ts:44` |
| `DEFAULT_WHATIF_SCENARIO` | `'overcast'` | `whatif/scenarios.ts:170` |

## Engineering References

- **Model Predictive Control (observation-only analogue)** — the Knowledge Base explicitly tags AIPrediction with `'Model Predictive Control (Observation Layer)'` (`subsystems.ts:418`). This is real: the engine walks the physical plant model forward over a receding horizon exactly as MPC does, but stops short of feeding an optimized action back — it never closes the loop.
- **Digital Twin Counterfactual Simulation** — Knowledge Base tag for AIWhatIf (`subsystems.ts:447`). Standard digital-twin practice of running a parallel "what-if" instance against the same model rather than the live one.
- **ASHRAE clear-sky model** — inferred from code comments (`insights.ts:46`, `projection.ts` header) referencing `attenuatedGHI`/`planeIrradiance`; not re-derived here, owned by `solarPhysics.ts` (not code-cited in this batch, named in prose only).
- No other external control-theory or forecasting literature is cited in code comments; anything beyond the two Knowledge Base tags above is not code-grounded and is omitted.

## Assumptions

Per `projection.ts` header comment and CLAUDE.md §11.2/§11.5, four deliberate simplifications, all surfaced to the operator rather than hidden:

1. **No forward occlusion ray-cast.** Assumes unobstructed sky (`ASSUMED_VISIBILITY = 1`). Safe today because the case-study site declares no neighbours; would read optimistic at low sun angles once neighbours exist.
2. **Blade rotation is not projected.** `facadeExposure()` uses the building's fixed surface normals, not rotated blade normals — projecting blade angles would mean predicting PBIF's own decisions. `params.facadeOpenness` holds the façade's current measured mean constant across the whole walk in the live context.
3. **HVAC thermal lag at equilibrium.** `equilibriumThermalState` is read directly rather than integrated hour-by-hour; the fabric's real time constant (~15 min) is negligible against a 1–12 h horizon.
4. **Façade thermal-mass lag (Stage 7.9) likewise at equilibrium**, via the same `equilibriumThermalState` call — its ~20 min time constant is negligible over the horizon.

What-If additionally documents, per scenario, in the `assumption` field (`scenarios.ts`): e.g. `battery-double` preserves state-of-charge percentage (not absolute stored energy) and scales the power limit with capacity to hold the C-rate constant; `weather-earlier` shifts the whole driver sample, not just rain, because shifting rain alone would schedule it under an unmoved clear sky.

## Limitations

- **Predicted Energy Cost is not modelled.** `compareWalks` always appends a `cost` row with `unavailable` set: *"No tariff is modelled yet — the grid connection pins its time-of-use period to null until the Financial Analytics stage, so imported energy cannot be priced without inventing a rate."* (`whatif/compare.ts:250-263`). Matches CLAUDE.md §10 roadmap.
- **No prediction-accuracy tracking.** Nothing in this code compares past predictions against what actually happened; `subsystems.ts` lists this as a `futureExtensions` item for AIPrediction (`subsystems.ts:422`) — matches CLAUDE.md §10.
- **PV model carries no temperature coefficient** — the `warmer` What-If study's `recommendWarmer` explicitly states the true impact of a hotter day would be slightly worse than shown (`recommend.ts:148-149`) because array efficiency is linear in irradiance only.
- **Islanding reclassifies, never re-dispatches** — `island` scenario changes no PV/battery decision; the utility is purely the balancing component (`recommend.ts` `recommendIsland`, CLAUDE.md §11.5).
- **Façade↔HVAC coupling reads at equilibrium through a fixed COP** — see Assumptions #3/#4; `recommendFacade`'s `limitation` field states this explicitly (`recommend.ts:261`).
- **`battery-double`'s benefit is null when the array never produces a surplus** — `recommendBatteryDouble` sets `limitation` conditionally when `chargesAtAll` is false (`recommend.ts:211-213`).
- The Knowledge Base's AIWhatIf FAQ (`subsystems.ts:449`) still states *"the Façade's thermal gain and the BEMS's HVAC electrical demand are currently uncoupled"* — this is stale relative to Stage 7.9 / CLAUDE.md §11.5, where `BuildingThermalEngine` now couples them through `equilibriumThermalState` and a cooling-plant COP. `recommend.ts`'s own `recommendFacade` correctly reflects the coupled behaviour; the Knowledge Base entry has not been updated to match. Flagged here as a documentation inconsistency, not a code defect.

## Dependencies

Pure functions imported and called directly from the owning engine — verified by import statements in `projection.ts` (lines 40-49) and `predictionEngine.ts`/`confidence.ts`:

| Function | Owning module | Used for |
|---|---|---|
| `computeSun` | `../engine/solar` | Sun position at the projected clock |
| `attenuatedGHI`, `planeIrradiance` | `../engine/solarPhysics` | Cloud-attenuated GHI; façade and PV plane irradiance |
| `moduleDcPowerW`, `PV_MODULE_RATED_POWER_W` | `../engine/pvElectrical` | Per-module DC output, with the derate hook |
| `convertDcToAc` | `../engine/pvInverter` | Inverter AC output and clipping state |
| `buildingDemandKW`, `hvacDemandFactor`, `settleBus`, `EnergyBusState` | `../engine/buildingEnergy` | Building electrical demand; bus settlement |
| `equilibriumThermalState` | `../engine/buildingThermal` | Façade thermal response at equilibrium → cooling load |
| `planStorage` | `../engine/battery` | Battery dispatch plan for the step |
| `facadeDaylightPercent`, `facadeSolarGainKW`, `normalisedExposure` | `../engine/metrics` | Façade thermal gain and daylight, from normalised irradiance |
| `sampleTimeline`, `WeatherDrivers`, `WeatherKeyframe` | `../engine/weatherScenario` | Weather at a future hour, same interpolation as live playback |
| `clamp`, `deg2rad`, `dot`, `rotateY` | `../engine/math` | Geometry helpers |
| `replayInstantMs` | `../engine/liveForecast` | Forecast provenance timestamp for the report header (`predictionEngine.ts:45`) |

This confirms every pure function CLAUDE.md §11.1 names (`computeSun`, `sampleTimeline`, `planeIrradiance`, `moduleDcPowerW`, `convertDcToAc`, `equilibriumThermalState`, `buildingDemandKW`, `settleBus`, `planStorage`, `facadeSolarGainKW`/`facadeDaylightPercent`/`normalisedExposure`) is actually imported and called, not re-implemented.

No other AI-layer doc in this batch is a dependency of prediction.md; What-If depends on Prediction's `projectWalk`, `assessConfidence`, `sourceLabel` and `clockLabel` (same package, `whatif/whatIfEngine.ts:32-36`), and on `PREDICTION_HORIZON_HOURS` from `predictionEngine.ts`.

## Consumers

Confirmed via `Grep` across `src/`:

- **`src/lib/engine/simulation.ts`** — the sole owner. `Simulation` constructs `PredictionEngine`, `WhatIfEngine` (lines 257-258) and exposes `predictionContext()` (line 538, private), `getPrediction()` (line 599), `runWhatIf(scenarioId)` (line 610), `getWhatIf()` (line 615), `isWhatIfStale()` (line 620).
- **`src/lib/engine/store.ts`** — the Zustand store pulls `sim.getPrediction()` and `sim.getWhatIf()`/`runWhatIf` into snapshot state (`prediction: PredictionReport` field at line 68, `runWhatIf` action at lines 374-381) and exposes `whatIf`, `whatIfStale`, `whatIfScenarioId` to components.
- **`src/components/twin3d/ui/AiPredictionPanel.tsx`** — reads `useTwinStore((s) => s.prediction)` (line 85); renders horizons, predictions, insights, reasoning.
- **`src/components/twin3d/ui/AiWhatIfPanel.tsx`** — reads `useTwinStore((s) => s.whatIf)`, `.whatIfStale`, `.whatIfScenarioId`, and the `runWhatIf` action (lines 62-66).
- **`src/lib/assistant/*`** (Engineering Context Builder / Reasoning Engine) — reads `AIPrediction`'s published status/summary via the Knowledge Base subsystem id, feeding the Engineering Assistant and, indirectly, `evaluateAIPrediction` in the Fault Detection layer (see `fault_detection.md`).

## Public API

**`PredictionEngine`** (`predictionEngine.ts`, exported via `index.ts`):
```ts
class PredictionEngine {
  getReport(ctx: PredictionContext): PredictionReport
  invalidate(): void
}
```

**`projection.ts`** (module-level functions, all exported):
```ts
function emptyBus(): EnergyBusState
function clockLabel(hours: number): string
function projectDrivers(timeline, current, atHours, params): WeatherDrivers
function projectedInstantMs(timeline, atHours): number | null
function projectAt(ctx, hoursAhead, storedKWh, timeline, bus, stepHours = 1): { projection: TwinProjection; storedKWh: number }
function projectBaseline(ctx: PredictionContext): TwinProjection
function projectWalk(ctx: PredictionContext, hours: number): TwinProjection[]
```

**`confidence.ts`** (all exported):
```ts
function horizonScore(hoursAhead: number): number
function freshnessScore(mode: WeatherSourceMode, ageMinutes: number): number
function stabilityScore(window: readonly TwinProjection[]): number
function gradeOf(score: number): Confidence
function assessConfidence(mode, hoursAhead, ageMinutes, window): ConfidenceBreakdown
```

**`insights.ts`** (all exported):
```ts
function sourceLabel(mode: WeatherSourceMode, providerName: string): string
function describeCurrent(ctx: PredictionContext, source: string): CurrentSituation
function buildPredictions(ctx, p, baseline, confidence, source): Prediction[]
function summariseHorizon(ctx: PredictionContext, p: TwinProjection): string
function buildInsights(ctx, walk, baseline, confidence, source): Insight[]
function buildReasoning(ctx, walk, source): ReasoningStage[]
```

**`WhatIfEngine`** (`whatif/whatIfEngine.ts`):
```ts
class WhatIfEngine {
  run(ctx: PredictionContext, scenarioId: WhatIfScenarioId): WhatIfResult | null
  getResult(): WhatIfResult | null
  isStale(ctx: PredictionContext): boolean
  reset(): void
}
```

**`whatif/scenarios.ts`**:
```ts
const WHATIF_SCENARIOS: readonly WhatIfScenario[]
function getWhatIfScenario(id: WhatIfScenarioId): WhatIfScenario | undefined
const DEFAULT_WHATIF_SCENARIO: WhatIfScenarioId
const CATEGORY_LABEL: Record<WhatIfCategory, string>
```

**`whatif/compare.ts`**:
```ts
function compareWalks(baseline, sandbox): MetricComparison[]
function findMetric(comparisons, id): MetricComparison | undefined
function isUnchanged(comparisons): boolean
```

**`whatif/recommend.ts`**:
```ts
function recommend(scenario, comparisons, baseline, sandbox): WhatIfRecommendation
```

**`Simulation`** (`src/lib/engine/simulation.ts`) — the entry points UI code actually calls:
```ts
getPrediction(): PredictionReport
runWhatIf(scenarioId: WhatIfScenarioId): WhatIfResult | null
getWhatIf(): WhatIfResult | null
isWhatIfStale(): boolean
```

## Live Outputs

**`PredictionReport`** (`types.ts:347`):
`revision`, `model`, `status` (`'Ready' | 'Holding'`), `statusReason`, `generatedAtHours`, `weatherSource`, `sourceLabel`, `horizonHours`, `forecastTimestampMs`, `utcOffsetSeconds`, `timezoneAbbreviation`, `forecastAgeMinutes`, `current: CurrentSituation`, `horizons: HorizonForecast[]`, `insights: Insight[]`, `reasoning: ReasoningStage[]`, `walk: TwinProjection[]`.

`HorizonForecast`: `hoursAhead`, `label`, `projection: TwinProjection`, `predictions: Prediction[]`, `confidence: Confidence`, `confidenceBreakdown: ConfidenceBreakdown`, `summary`.

`Prediction`: `id`, `domain`, `metric`, `statement`, `trend`, `value`, `currentValue`, `unit`, `evidence`, `source`, `confidence`.

`Insight`: `id`, `domain`, `severity` (`'info'|'notice'|'alert'`), `text`, `evidence`, `source`, `confidence`.

`TwinProjection` (`types.ts:177`): full field list includes `hoursAhead`, `atHours`, `clockLabel`, `atEpochMs`, environmental drivers (`temperature`, `humidity`, `cloudCoverage`, `rainIntensity`, `windSpeed`), solar (`sunAltitude`, `sunAzimuth`, `isDaytime`, `ghi`, `facadeExposure`, `facadeIrradiance`, `facadeOpenness`, `facadeSolarGainKW`, `facadeDaylight`), PV (`pvPlaneIrradiance`, `pvDcKW`, `pvAcKW`, `inverterState`), building (`occupancy`, `buildingLoadKW`, `coolingLoadKW`), and bus/storage/grid (`batterySoc`, `batteryChargeKW`, `batteryDischargeKW`, `batteryState`, `gridImportKW`, `gridExportKW`, `unservedLoadKW`, `buildingCoverage`).

**`WhatIfResult`** (`whatif/types.ts:128`):
`scenarioId`, `label`, `question`, `category`, `modification`, `assumption`, `generatedAtHours`, `generatedAtLabel`, `timelineId`, `horizonHours`, `sourceLabel`, `revision`, `comparisons: MetricComparison[]`, `recommendation: WhatIfRecommendation`, `confidence`, `confidenceReason`, `baselineWalk: TwinProjection[]`, `sandboxWalk: TwinProjection[]`.

`MetricComparison`: `id`, `label`, `unit`, `aggregation`, `basis`, `baseline`, `sandbox`, `delta`, `deltaPercent`, `direction`, `judgement`, `unavailable`.

`WhatIfRecommendation`: `headline`, `observation`, `evidence`, `reason`, `impact`, `limitation`.

## Source Files

- `src/lib/prediction/predictionEngine.ts`
- `src/lib/prediction/projection.ts`
- `src/lib/prediction/confidence.ts`
- `src/lib/prediction/insights.ts`
- `src/lib/prediction/types.ts`
- `src/lib/prediction/index.ts`
- `src/lib/prediction/whatif/whatIfEngine.ts`
- `src/lib/prediction/whatif/scenarios.ts`
- `src/lib/prediction/whatif/compare.ts`
- `src/lib/prediction/whatif/recommend.ts`
- `src/lib/prediction/whatif/types.ts`
- `src/lib/engine/simulation.ts` (construction, context assembly, public entry points)
- `src/lib/engine/store.ts` (state plumbing)
- `src/components/twin3d/ui/AiPredictionPanel.tsx`, `AiWhatIfPanel.tsx` (consumers)
- `src/lib/knowledge/subsystems.ts` (Knowledge Base entries `AIPrediction`, `AIWhatIf`)

## Design Rationale

- **Pure-data context is the read-only guarantee, not a convention.** `PredictionContext` carries no engine, method or mutable array (`types.ts:80-86`), which is what makes both "the AI cannot control the twin" and "a What-If sandbox is trivially safe to discard" structural facts rather than promises — CLAUDE.md §11.1, §11.3.
- **Reuse, never re-derive.** Every physical step in `projectAt` calls the exact function the live engine calls (header comment, `projection.ts:1-38`) — this is what lets the projection be trusted as a statement about *this* twin rather than a parallel model. CLAUDE.md §11.1 states this as a hard rule; it is enforced here by import, not just by comment.
- **Confidence must never contradict Live Forecast Engine's own freshness readout** — `FRESHNESS` thresholds in `confidence.ts` are deliberately "keyed to the cache-age grades the Live Forecast Engine already reports (Excellent / Good / Fair / Stale)" (`confidence.ts:48-51`), so the two panels can never disagree about how stale the data is.
- **Explainability is structural.** Every `Prediction` and `Insight` carries `statement → evidence → source`; `insights.ts`'s header states "If the walk does not support a statement, the statement is not emitted" — no filler, no "typically" language.
- **One-change-per-study is what makes causality checkable.** `scenarios.ts` header: a scenario that changed two parameters "would produce a difference nobody could assign a cause to." The one exception (`battery-double`, scaling both capacity and stored energy) is justified as still one physical change — a larger battery — stated explicitly in its `assumption`.
- **Never fabricate a benefit.** `recommend.ts` header: where a study produces no change, the recommendation "says so plainly and explains *why the twin's physics produced no change*" — explicitly framed as a real engineering finding rather than something to paper over.
- **The byte-identical baseline is the regression contract, not a nice-to-have.** CLAUDE.md §11.3: "the study's baseline walk is byte-identical to the live prediction's walk; if that ever fails, the sandbox and the twin have diverged." Enforced by construction: `WhatIfEngine.run()` calls `projectWalk(ctx, …)` for the baseline using the exact same function and context the live `PredictionEngine` uses.

## Future Extension Points

- **Financial Analytics** (CLAUDE.md §10) — once a tariff/carbon-intensity model exists, the `cost` row in `compareWalks` (currently always `unavailable`) becomes computable, unblocking a Predicted Energy Cost metric for both Prediction and What-If.
- **Prediction accuracy tracking** (CLAUDE.md §10, `subsystems.ts:422` `futureExtensions`) — comparing past `PredictionReport`s against what the twin actually did; nothing in the current code retains historical reports for this purpose.
- **Longer horizons** (CLAUDE.md §10) — `PREDICTION_HORIZON_HOURS = 12` and the `HORIZON_SCORE` table both assume a 12 h ceiling; extending either requires re-deriving the horizon decay curve, not just changing the constant.
- **Forward occlusion ray-cast** — `ASSUMED_VISIBILITY = 1` is a placeholder for a real neighbour-occlusion model; safe today only because the case-study site has none.
- (Stage 7.10.2 — resolved) Knowledge Base staleness: `subsystems.ts`'s AIWhatIf FAQ previously described façade/HVAC as "currently uncoupled"; it now reflects the Stage 7.9 coupling that `recommend.ts` already implements correctly.
