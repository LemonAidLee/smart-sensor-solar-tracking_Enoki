# What-If Subsystem

**Subsystem ID:** WhatIf
**Version:** 1.0.0
**Last updated:** 2026-08-06

## Purpose

The What-If subsystem (Stage 8.2) is a throwaway sandbox engineering study tool. It evaluates hypothetical alternatives (scenarios) against the live digital twin to answer "what if" questions without ever mutating the live simulation. It orchestrates the projection of a modified `PredictionContext` alongside a baseline context and compares the resulting walks to generate actionable engineering recommendations.

## Responsibilities

- Orchestrate the evaluation of hypothetical scenarios by overriding exactly one parameter in a cloned `PredictionContext`.
- Project both the baseline and the modified ("sandbox") context forward in time through the exact same engine logic used by the live simulation.
- Compare the two projection walks mathematically to quantify differences in solar gain, building energy demand, and structural movement.
- Generate structured, evidence-backed recommendations based on the comparison without fabricating data or inferring unmodelled physics.
- Manage the lifecycle of a study: cache the result until invalidated by major twin drift, and never run implicitly from the simulation loop.

## Inputs

- `ctx`: A `PredictionContext` snapshot representing the pure data state of the live simulation.
- `scenarioId`: The `WhatIfScenarioId` identifying which parameter to override (e.g., facade openness, weather source).
- `Operator Command`: Execution is strictly driven by an explicit UI run action, never by polling.

## Outputs

- `WhatIfResult`: The complete cached study result containing:
  - Scenario metadata (label, modification, assumption).
  - Traceability metadata (generated timestamp, timeline ID, horizon hours).
  - `comparisons`: The mathematical deltas between the baseline and the sandbox walks.
  - `recommendation`: A structured narrative and verdict.
  - `confidence` and `confidenceReason`: How much the data can be trusted based on forecast age and stability.
  - `baselineWalk` and `sandboxWalk`: The full 12-hour projection data series for both paths.

## Internal Calculation Pipeline

1. **Context Cloning & Override:**
   `WhatIfScenario.apply(ctx)` creates a shallow clone of the live `PredictionContext` and modifies exactly one parameter.
   
2. **Dual Projection:**
   Both the original context and the sandbox context are passed to `projectWalk(ctx, PREDICTION_HORIZON_HOURS)`. This function steps through the future using pure functional extracts from the owning engines (`computeSun`, `equilibriumThermalState`, `buildingDemandKW`, etc.).

3. **Walk Comparison:**
   `compareWalks(baselineWalk, sandboxWalk)` iterates over the resulting timelines to accumulate and compare key metrics:
   - Solar Gain (kWh)
   - Daylight (kWh)
   - HVAC Demand (kWh)
   - Façade Movement (total angular distance)
   
4. **Confidence Assessment:**
   `assessConfidence()` evaluates the baseline walk to assign a grade (A-F) based on the forecast's freshness, horizon, and weather stability.

5. **Recommendation Generation:**
   `recommend(scenario, comparisons, baselineWalk, sandboxWalk)` synthesizes the deltas into a final judgement, explicitly highlighting assumptions and limitations (e.g., that HVAC electrical demand is calculated at equilibrium rather than via dynamic integration).

## Engineering Theory

The engine relies on **Deterministic Functional Projection**. By ensuring that the twin's physical engines expose pure functions for their mathematical models, the What-If engine can simulate future states by simply feeding different parameters into the same equations used by the real-time simulation. The difference (delta) between the baseline integration and the sandbox integration isolates the exact physical consequence of the parameter change.

## Equations

- **Context Identity Formulation:**
  `ID = floor(timeHours) | date | weatherMode | timelineId | openness*100 | pvCount | batteryCapacity`
  Used to determine if the cached study is stale relative to the live simulation.
  
*(Note: Core physics equations used during the projection are owned by the respective physical engines, e.g., Solar Physics and Building Thermal.)*

## Constants

| Constant | Value | File |
|---|---|---|
| `WHATIF_MODEL` | `'Engineering What-If Engine v1'` | `whatIfEngine.ts` |
| `PREDICTION_HORIZON_HOURS` | `12` | `predictionEngine.ts` |

## Engineering References

- **Cyber-Physical Isolation:** The design strictly adheres to the principle of a throwaway sandbox. The simulation state is immutable during a What-If study.

## Assumptions

- **One Change Per Study:** Overriding exactly one parameter makes the resulting difference directly attributable to that change.
- **Equilibrium State:** The projection assumes that thermal-mass lag reaches equilibrium within the projection window, an explicitly stated limitation.
- **Baseline Equivalence:** The study's baseline walk must be byte-identical to the Live Prediction Engine's walk; if they diverge, the sandbox is compromised.

## Limitations

- The projection holds the façade at its current measured mean openness because projecting blade rotation would require predicting PBIF behavior.
- The What-If engine cannot run if the weather mode is Forecast and the forecast cache is empty (i.e., no timeline to project).
- "Predicted Energy Cost" is currently "not modelled" pending the implementation of the Financial Analytics layer.

## Dependencies

- **Prediction Layer:** Relies heavily on `projectWalk` and `assessConfidence` from the `src/lib/prediction/` module.
- **Physical Engines:** Reuses pure physics functions from Solar Physics, Building Thermal, PV, and Battery engines.

## Consumers

- **UI Panel:** The What-If Analysis panel in the right-hand dashboard triggers the runs and displays the `WhatIfResult`.
- **Engineering Reasoning Engine:** Future AI assistants and the Context Builder can read the cached `WhatIfResult` to explain counterfactual scenarios to the user.

## Public API

**`WhatIfEngine`** (`src/lib/prediction/whatif/whatIfEngine.ts`):
```ts
run(ctx: PredictionContext, scenarioId: WhatIfScenarioId): WhatIfResult | null
getResult(): WhatIfResult | null
isStale(ctx: PredictionContext): boolean
reset(): void
```

## Source Files

- `src/lib/prediction/whatif/whatIfEngine.ts`
- `src/lib/prediction/whatif/types.ts`
- `src/lib/prediction/whatif/scenarios.ts`
- `src/lib/prediction/whatif/compare.ts`
- `src/lib/prediction/whatif/recommend.ts`

## Design Decisions

- **Discard, Don't Reset:** The sandbox is a local object spread that goes out of scope when the run completes. This prevents accidental mutations to the live twin.
- **Explicit Invalidation:** The `isStale` check is deliberately coarser than the prediction engine's. A slow drift of the clock does not invalidate the study immediately, reducing unnecessary computational cost.

## Future Extension Points

- **Financial Analytics:** Once the financial analytics subsystem is implemented, the What-If engine can directly quantify the cost savings of scenarios.
- **Longer Horizons:** The projection horizon (`PREDICTION_HORIZON_HOURS`) can be extended for multi-day energy storage and thermal mass studies once stability allows.
