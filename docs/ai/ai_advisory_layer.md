# The AI Advisory Layer

I built three AI subsystems on top of the Digital Twin — Prediction, What-If Analysis, and Fault Detection & Diagnosis. All three read the twin. None of them drive it.

Source: [`src/lib/prediction/`](../../src/lib/prediction/) (`predictionEngine.ts`, `projection.ts`, `confidence.ts`, `insights.ts`, `whatif/`) and [`src/lib/ai/faultDetection/`](../../src/lib/ai/faultDetection/) (`faultDetectionEngine.ts`, `rules.ts`, `diagnostics.ts`, `recommendations.ts`).

## Why an advisor, not a controller

PBIF is the sole authority over the adaptive façade — that decision was made in the façade's own design (see [PBIF & Adaptive Façade Kinematics](../facade/pbif_and_kinematics.md)) and I never reopened it for the AI layer. So I gave this layer no path back into the simulation at all, rather than trusting myself to just not call one. `Simulation.predictionContext()` builds a flat, `Readonly`-typed snapshot of values the engines have already published — clock, weather, sun, façade surfaces, PV modules, battery limits, bus state — and that snapshot is the *only* thing any of these three engines ever sees. There is no engine reference inside it, no setter, no mutable array. A prediction, a what-if sandbox, or a fault-detection pass literally has nothing to write to, so the "read-only" guarantee holds by construction, not by convention.

Concretely, across all three:

- **Prediction** projects the twin forward through the engines' own physics and explains what it finds. It never decides where a blade goes — it holds the façade at its current measured openness and projects around that.
- **What-If** clones the same read-only context, changes exactly one parameter, projects the clone, and compares it against the live twin. The sandbox is discarded when the run finishes; nothing it computed is written back.
- **Fault Detection** re-derives each subsystem's expected behaviour from the same physics the engines already implement and checks it against what was actually observed. It never injects a fault, schedules one, or randomises anything — a subsystem only grades Warning or Critical when a named, real comparison in `rules.ts` fails.

## 1. Prediction (Stage 8.1)

**Entry point.** `Simulation.getPrediction()` calls `PredictionEngine.getReport(ctx)`, and that's reachable two ways: the store's ~8 Hz snapshot poll calls it directly, and `Simulation.tick()`'s `resolve` block reaches it indirectly through `engineeringContext.update()` → `buildAIPrediction()`. Both paths hit the same cache, so the tick-reachability costs almost nothing in the common case — see below.

**What it does.** `projectWalk()` in `projection.ts` walks the twin forward one simulated hour at a time, out to `PREDICTION_HORIZON_HOURS = 12`, calling the exact chain the live twin calls every tick:

```
Weather Timeline → computeSun → planeIrradiance → moduleDcPowerW
  → convertDcToAc → equilibriumThermalState → buildingDemandKW
  → settleBus → planStorage → grid
```

Every function in that chain is imported from the engine that owns it — there is no second solar model, no second PV curve, no second dispatch rule. The 1/3/6/12-hour cards shown in the panel (`PREDICTION_HORIZONS`) are samples of one walk, not four separate extrapolations, so the state of charge at +12 h is the result of twelve real dispatch decisions rather than a single guess.

**Four deliberate simplifications**, all surfaced to the operator rather than hidden:

1. **No forward occlusion ray-cast.** Visibility is assumed 1 (unobstructed sky) for the whole projection. Ray-casting 1,620 panels twelve times per recompute isn't a cost the advisory layer gets to impose on the simulation loop.
2. **Blade rotation is not projected.** Façade exposure is computed against the building's fixed *surface* normals, not the rotated blades — because predicting future blade angles would mean predicting PBIF's future decisions, and PBIF is the controller. The projection states the solar resource arriving at each elevation and stops there; it holds `facadeOpenness` at the twin's current measured mean.
3. **HVAC thermal lag is read at equilibrium.** The fabric's response time (15 simulated minutes) is negligible against a 1–12 hour horizon.
4. **Façade thermal-mass lag is likewise read at equilibrium**, via `equilibriumThermalState` — the same reasoning as #3, since its 20-minute time constant is negligible against the horizon.

**Nothing is fabricated.** Every sentence `insights.ts` produces quotes a number the walk actually produced — a scheduled driver, an irradiance `computeSun` returned, a dispatch `planStorage` decided — and carries its own `evidence` and `source` so the operator can trace a claim back to the data. Forecast Mode with an empty cache is the one case with nothing to project from: the report status becomes `Holding` with zero horizons rather than an extrapolation dressed up as a forecast, and `WhatIfEngine.run()` returns `null` under the identical condition.

**Confidence.** `confidence.ts` computes it as a strict product of three named factors, nothing else — no randomness, no tuning, same twin in the same condition always yields the same grade:

```
score = horizon × freshness × stability
```

| Factor | What it measures | Range in code |
|---|---|---|
| `horizon` | How far ahead the statement reaches | 1 at 1 h → 0.58 at 12 h (`HORIZON_SCORE`, piecewise-linear) |
| `freshness` | How recently the driving data was obtained | Scenario/definition = 1 always; Manual = 0.5 (a persistence assumption, not data); Forecast = 1 → 0.4 as cache age grows past 1 h / 6 h / 24 h, keyed to the same age bands the Live Forecast Engine already reports |
| `stability` | How settled cloud and rain are across the interval being projected | 1 (steady) down to 0.45 (full-range swing), weighted 0.55 cloud / 0.45 rain |

The score maps to a grade — `≥ 0.72` High, `≥ 0.45` Medium, else Low (`GRADE_HIGH`, `GRADE_MEDIUM`) — and the report always names the binding factor (`bindingReason`), so a Low grade reads as "refresh the forecast" rather than as an unexplained number.

**Caching.** `PredictionEngine`'s `invalidationKey()` bundles the clock (bucketed to `TIME_BUCKET_HOURS = 0.5` simulated hours), the calendar date, the weather source and its timeline identity, the manual driver values (bucketed), the building's site and massing, and — separately from the clock bucket — the façade's measured mean openness, because the blades keep moving under PBIF while the clock barely advances. An unchanged key returns the previously built report *by reference*, so React's reference equality sees no change and the panel doesn't re-render. That 0.5 h bucket is deliberately the coarsest one that still keeps the "Next 1 Hour" card visibly live: at 1× playback (a simulated day in ~2 real minutes) that's a recompute roughly every 2.5 s.

Sitting above that, `EngineeringContextBuilder` (`src/lib/assistant/contextBuilder.ts`) has its own, coarser cache key for the whole `AIPrediction` subsystem context. `Simulation.tick()`'s `resolve` block calls `engineeringContext.update()` on every tick, which rebuilds `AIPrediction` only when *that* key has changed, and even then it just calls back into `PredictionEngine.getReport()`, which does its own comparison. The upshot: `tick()` genuinely reaches this file, but the marginal cost on a normal tick is a key comparison, not a rebuild — a full `build()` only happens on an actual bucket rollover.

## 2. What-If Analysis (Stage 8.2)

**Entry point.** `Simulation.runWhatIf(scenarioId)` → `WhatIfEngine.run()`. There is no polling entry point on this class at all — it runs only from the panel's Run Analysis button. The simulation loop and the 8 Hz snapshot poll carry zero What-If cost.

**What it does**, per `whatIfEngine.ts`:

```
Clone PredictionContext
  ↓  scenario.apply() — exactly one parameter overridden
Project the clone through the SAME engines as the live twin (projectWalk)
  ↓
Compare against the baseline walk (compareWalks)
  ↓
Conclude (recommend)
  ↓
Discard the sandbox
```

Because `PredictionContext` is pure data and `projectWalk` only reads it, the sandbox is an object spread that goes out of scope when `run()` returns — nothing to reset, nothing the live twin could ever observe.

**One change per study.** Every entry in `WHATIF_SCENARIOS` (`scenarios.ts`) overrides exactly one physical thing, which is what makes the resulting delta attributable to that one thing:

| Scenario id | Category | What `apply()` changes |
|---|---|---|
| `overcast` | Weather | `cloudOverride` forced to 90% |
| `weather-earlier` | Weather | Timeline read 2 h later (`weatherShiftHours`), so the whole pattern arrives sooner |
| `warmer` | Building | +3 °C added to every projected air temperature |
| `pv-derate` | PV | Module DC output ×0.9, through the PV model's own derate hook |
| `battery-double` | Battery | Capacity and power limit ×2, stored energy scaled to preserve state of charge |
| `island` | Grid | `gridAvailable` set false |
| `facade-open` | Façade | `facadeOpenness` held at 1.0 (100%) for the whole window |
| `facade-closed` | Façade | `facadeOpenness` held at 0.0 (0%) for the whole window |

`battery-double` is the one entry that touches two fields (capacity *and* stored energy), and the module's own comment is explicit about why that's still one change: both moves express a single physical fact — a larger battery — rather than two independent assumptions.

The two façade scenarios are explicitly a hypothesis that *overrides* PBIF for the study, not a prediction of what PBIF would choose — the live baseline it's compared against still holds the façade at its current measured mean openness, exactly as Prediction does.

**Comparison.** `compare.ts` reduces both 12-hour walks to a fixed table of engineering metrics — PV generation, battery SoC, battery discharge, grid import, unserved load, building load, cooling demand, façade solar gain, daylight availability, solar irradiance — each aggregated the way an engineer would actually judge it (energy quantities as a 12 h total in kWh, capacity-limited quantities as a peak in kW, state of charge as the final value, daylight as a mean over daylight hours only, so twelve overnight zeros can't be averaged into a falsely-dark result). A metric whose two walks agree is still listed as "unchanged" rather than hidden — that's frequently the most important finding a study can return. `Predicted Energy Cost` is listed with `unavailable` set to a stated reason (no tariff is modelled — the grid engine pins `tariffPeriod` to null until the Financial Analytics stage), never as a zero or an invented number.

**Recommendation.** `recommend.ts` produces a four-part conclusion per study — observation, evidence, reason, expected impact — written per-scenario because a generic "metric X moved by Y%" template would satisfy the format while explaining nothing. Two of the eight studies land on a stated modelling boundary and report it in `limitation` rather than smoothing over it: the façade studies note that the thermal chain is read at equilibrium through a fixed plant COP (Stage 7.9), and the islanding study notes it changes no dispatch decision because the utility is a pure balancing component.

**Regression discipline.** Both the live prediction and every What-If study walk through the identical `projectWalk`. The project's own regression assertion is that the study's *baseline* walk is byte-identical to the live prediction's walk — if that ever fails, the sandbox and the twin have diverged and something is wrong.

**Staleness, not auto-rerun.** `WhatIfEngine.isStale(ctx)` compares the twin's current identity against the one the cached result was computed against (clock floored to the hour, weather mode/timeline, façade openness, PV module count, battery capacity — deliberately coarser than Prediction's own key, so a slow clock drift doesn't nag the operator). It only ever *reports* staleness; it never triggers a re-run on its own.

## 3. Fault Detection & Diagnosis (Stage 8.5)

**Entry point.** `FaultDetectionEngine.getReport(snapshot)`, intended to be polled from the same ~8 Hz snapshot loop as Prediction. `Simulation.tick()` never calls into this file at all. It consumes exactly four things: the `EngineeringKnowledgeBase` and `EngineeringReasoningEngine` singletons, the live `EngineeringContextBuilder` singleton, and the caller-supplied `SimSnapshot` — no reference to `Simulation` itself ever reaches it.

**What it does.** `rules.ts` runs twelve independent, named checks, one per monitored subsystem, in this fixed order:

```
Weather · SolarPhysics · VirtualSensors · PBIF · ServoKinematics ·
AdaptiveFacade · RooftopPV · PVInverter · BuildingEnergy · Battery ·
UtilityGrid · AIPrediction
```

Each rule re-derives an expected value or invariant from the snapshot and compares it against what was actually observed — never a second physics model, always a check against the same numbers the engines already published. A few representative examples:

- **SolarPhysics** — sun altitude's sign must agree with the `isDaytime` flag, and observed irradiance must not exceed the ASHRAE clear-sky ceiling by more than `SOLAR_IRRADIANCE_TOLERANCE_WM2 = 5` W/m².
- **RooftopPV** — DC output is compared against an irradiance-scaled expected yield; the ratio must land within `PV_RATIO_MIN = 0.5` to `PV_RATIO_MAX = 1.05` once expected output clears a `PV_EXPECTED_FLOOR_KW = 1` kW floor (below that the array is simply idle, and the check confirms near-zero rather than dividing by a tiny number).
- **PVInverter** — AC output can never exceed DC input (within `EPSILON_KW = 0.05` kW), and reported efficiency must stay within `0` to `INVERTER_EFFICIENCY_MAX = 1.02`.
- **Battery** — state of charge must sit in [0, 1], charge and discharge can never both be nonzero, and the battery's own reported dispatch must agree with what the energy bus already planned.
- **UtilityGrid** — the bus balance (`generation + import + discharge` vs. `load + charge + export`) must close within `GRID_BALANCE_TOLERANCE_KW = 0.5` kW, and import/export can never both be nonzero.
- **AIPrediction** — the one subsystem whose own status *is* the signal: `Holding` (an empty forecast cache) costs a small, fixed `PREDICTION_HOLDING_DEVIATION = 0.15` and is graded Warning, not Critical, because it's an honestly-reported reduction in visibility, not a malfunction.

Every deviation converts to a health score via `scoreFromDeviation()`: `100 − deviation×100`, clamped to [0, 100]. A subsystem grades **Healthy** at `≥ 90`, **Warning** below that, **Critical** below `70` (`SCORE_HEALTHY_AT`, `SCORE_CRITICAL_BELOW`).

**Health vs. confidence are separate axes.** Health score measures how closely the observed state matches the expected physics. Confidence measures how much a subsystem's own documented modelling limitations let that judgement be trusted — it's derived from the count of `knownLimitations` the Knowledge Base already records for that subsystem, at `CONFIDENCE_PENALTY_PER_LIMITATION = 2` points each, floored at `85` and capped at `99` (`confidenceFor()` in `rules.ts`). Confidence is therefore never a flat, meaningless 100% and never random — a subsystem with more documented unknowns reports lower confidence even when its health check currently passes.

**Overall health is the weakest-link minimum**, never an average, across the twelve subsystems (`aggregateOverall()` in `diagnostics.ts`): `Math.min` over all twelve health scores, and the overall status escalates to Critical or Warning the moment *any single* subsystem does. An average would let one real finding hide behind eleven healthy ones — exactly the failure mode a monitor exists to catch.

**Diagnosis and anomalies.** `buildDiagnosis()` always names the weakest subsystem, even on a fully healthy twin (so a Healthy verdict is explainable, not just asserted). `buildAnomalies()` emits one record per subsystem that isn't Healthy, and its `reasoning` field comes from `EngineeringReasoningEngine.generateExplanation('Cause', subsystem)` — the same upstream-cause graph traversal the Engineering Assistant uses — so a finding is explained through the dependency graph that actually produced it, not a generic restatement of the score. The anomaly list is empty on a healthy twin, never padded to look busier than it is.

**`DETECTABLE_CONDITIONS` is a static catalogue, not a live signal.** `recommendations.ts` hand-authors eleven entries describing conditions this engine is *architected* to catch — sensor failure, LDR quadrant disagreement, PV underperformance, inverter clipping, battery not charging, battery abnormality, servo tracking failure, communication loss, grid outage, HVAC energy anomaly, over-temperature — each tied to a subsystem id. None of these are generated from a live value, so none can ever be silently promoted into `anomalies`. Extending live detection means adding a rule to `RULES` in `rules.ts`; this catalogue only ever documents future capability.

## Shared engineering rules

These four apply identically across all three subsystems, and they're what let me trust the "advisor, not controller" claim as an architectural fact rather than a promise:

- **`PredictionContext` is pure data.** No engine, method, setter, or mutable array reaches it — `Simulation.predictionContext()` resolves every value up front, `Readonly`-typed. This is what makes the read-only guarantee structural: there is no reference inside the context an engine method could call back through, and it's exactly what turns a What-If sandbox into an ordinary object spread rather than something requiring teardown logic.
- **Bounded, cached cost — reachable from `tick()`, never a per-tick projection.** Both Prediction and Fault Detection are pollable from the ~8 Hz snapshot loop, and both are also reachable from `Simulation.tick()`'s `resolve` block through `engineeringContext.update()`. Two layers of caching (the coarse `EngineeringContextBuilder` key, then each engine's own finer-grained key) mean this costs a key comparison on almost every call and a full rebuild only on an actual rollover. What-If has no `tick()` or poll entry point at all — it runs only on the operator's command.
- **It re-uses the engines' physics; it never re-implements it.** Every physical quantity the AI layer states — sun position, plane-of-array irradiance, DC/AC conversion, equilibrium thermal state, building demand, storage dispatch — is computed by calling the same pure function the owning engine calls, imported directly from that engine's module. If new physics is needed that only exists inside an engine method, the fix is to extract a pure function that engine then also calls — never to copy the arithmetic a second time.
- **Nothing is fabricated.** Every statement carries its evidence and its source. A claim the projection or the rule set cannot support is not emitted. A metric the twin genuinely cannot evaluate — Predicted Energy Cost, an empty forecast timeline — is listed as unavailable with its reason stated plainly, never silently dropped and never presented as a zero.

## Known modelling boundaries

I chose to report these to the operator rather than hide them, because a stated assumption is more trustworthy than an unstated one, and each is a deliberate scope decision rather than something left unfinished:

- **Façade thermal and HVAC electrical demand are coupled (Stage 7.9), through `BuildingThermalEngine`** — a locked-façade What-If moves solar gain, daylight, *and* projected HVAC electrical demand together, carried through envelope transmission, thermal-mass lag, and a cooling-plant COP, not a hardcoded percentage. What I chose to keep at equilibrium rather than integrate hour-by-hour is the thermal-mass lag itself (its time constant is minutes against a 1–12 hour horizon), and I convert thermal to electrical through a fixed assumed COP rather than a dynamic one. Both are stated in the relevant recommendation's `limitation` field rather than presented as more precise than they are.
- **`FacadePanel.solarExposure` is normalised irradiance (`irradiance / 1000`), not the geometric cosine.** Anything feeding façade metrics into the AI layer goes through `normalisedExposure()` for exactly this reason — using the raw cosine would make façade gain blind to cloud cover, which defeats the point of a weather-driven study.
- **Removing the grid reclassifies the residual; it never re-settles the bus.** The utility is purely the balancing component in this twin — it performs no routing of its own — so the `island` What-If changes no PV or battery dispatch decision. It relabels the shortfall the bus already computed as unserved load rather than running a second dispatch pass, which is the physically correct behaviour for a component that never made a decision in the first place.
- **Prediction accuracy has not yet been validated against real outcomes.** The confidence score is a measured product of horizon, freshness, and stability — a statement about how much the projection's own inputs can be trusted — not a statement about historical hit rate, because there isn't one yet. Tracking predicted-vs-actual accuracy over time is on the roadmap (CLAUDE.md §10, Stage 8.3+) and is future work, not a current capability.

## Data flow

```
Simulation.predictionContext()  (Readonly snapshot — no engine references)
        │
        ├──► PredictionEngine.getReport()          — polled (~8 Hz) + tick()-reachable, cached
        │        └─ projectWalk() → confidence.ts → insights.ts
        │
        ├──► WhatIfEngine.run(scenarioId)           — operator-triggered only
        │        └─ scenarios.ts → projectWalk() (×2) → compare.ts → recommend.ts
        │
        └──► (independently) SimSnapshot
                 └──► FaultDetectionEngine.getReport()  — polled (~8 Hz), cached
                          └─ rules.ts (×12) → diagnostics.ts → recommendations.ts
```

Prediction and What-If share the same `PredictionContext` and the same `projectWalk`; Fault Detection reads the plain `SimSnapshot` and the `EngineeringContextBuilder`/`EngineeringReasoningEngine` singletons instead, since it's comparing against reality rather than projecting forward. None of the three write back into any of these inputs — the arrows above run one way.
