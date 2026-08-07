# AI Fault Detection & Diagnosis (FDD)

**Subsystem ID:** FaultDetection (not yet in `src/lib/knowledge/types.ts` `SubsystemId` union — a Stage 8.5 subsystem not yet registered in the knowledge base)
**Version:** 1.0.0
**Last updated:** 2026-08-06

Covers Stage 8.5, `src/lib/ai/faultDetection/*`.

## Purpose

A deterministic, read-only **monitor** that continuously evaluates the Digital Twin's health by re-deriving each of twelve subsystems' expected behaviour from the values the engines have already published, and comparing it against what was actually observed. It is explicitly *not* a fault simulator: it never injects, schedules or randomises a fault. A subsystem grades Warning or Critical only when a named, real cross-check in `rules.ts` fails.

## Responsibilities

- Run one deterministic rule per monitored subsystem (`RULES` in `rules.ts`), each re-deriving an expected value or invariant from the `SimSnapshot` and comparing it to what was observed.
- Aggregate the twelve `SubsystemHealth` results into one overall score/status using a **weakest-link minimum**, never an average.
- Produce a one/two-sentence `diagnosis` that names whichever subsystem is the limiting factor, even on a fully healthy twin.
- Build `Anomaly` records — with reasoning drawn from the Engineering Reasoning Engine's own cause-traversal graph — for anything that failed a check; empty array when everything is Healthy.
- Publish a short, curated `evidence` list drawn from a fixed subset of healthy subsystems.
- Expose a static, hand-authored `detectableConditions` catalogue describing what future rules *could* catch, clearly separated from anything actually observed.
- Cache the report and recompute only when the invalidation key changes, exactly like `PredictionEngine`.

## Inputs

Exactly four things, per the module header (`faultDetectionEngine.ts:5-11`) and CLAUDE.md §11.4:

1. **`EngineeringKnowledgeBase`** (`src/lib/knowledge`) — static subsystem metadata (`name`, `knownLimitations`), imported directly in `rules.ts` (`import { EngineeringKnowledgeBase } from '../../knowledge'`).
2. **`EngineeringContextBuilder`** — the live `engineeringContext` singleton (`src/lib/assistant`), imported in `faultDetectionEngine.ts` (`import { engineeringContext, engineeringReasoning } from '../../assistant'`) and passed into `evaluateSubsystems` as `ContextBuilderAPI`. Used by `evaluateVirtualSensors`, `evaluatePBIF` and `evaluateAIPrediction` to read another subsystem's already-published context (`contexts.getSubsystemContext(id)`).
3. **`EngineeringReasoningEngine`** — the `engineeringReasoning` singleton, passed into `buildAnomalies` to generate each anomaly's `reasoning` field via `generateExplanation('Cause', subsystem)`.
4. **The caller-supplied `SimSnapshot`** (`src/lib/engine/types.ts`) — the same snapshot object the rest of the UI already reads. No reference to `Simulation` itself ever reaches this subsystem.

No other input exists. `Simulation` is never imported into `src/lib/ai/faultDetection/*`.

## Outputs

One `FaultDetectionReport` per `getReport(snapshot)` call (cached — see Internal Calculation Pipeline). Rendered by `AiFddPanel.tsx`.

## Internal Calculation Pipeline

```
FaultDetectionEngine.getReport(snapshot)
  → invalidationKey(snapshot)                    — cache check, see Constants
  → build(snapshot):
      subsystems = evaluateSubsystems(engineeringContext, snapshot)   — rules.ts, 12 rules in fixed order
      { score, status } = aggregateOverall(subsystems)                — diagnostics.ts, weakest-link min
      diagnosis  = buildDiagnosis(status, subsystems)
      evidence   = buildEvidence(subsystems)
      anomalies  = buildAnomalies(subsystems, engineeringReasoning)
      detectableConditions = [...DETECTABLE_CONDITIONS]                — static catalogue, spread not filtered
      → FaultDetectionReport
```

Each rule in `rules.ts` follows the same shape:

```
evaluateX(contexts, snap, atHours):
  read the relevant SimSnapshot fields (or another subsystem's published context)
  compute one or more `deviation` values in [0, 1] via:
    - deviationOutsideBand(value, min, max, scale)   — 0 inside [min,max], saturates to 1 at `scale` past the edge
    - deviationFromInvariant(holds: boolean)          — 0 if true, 1 if false
    - a failedChecks / CHECK_COUNT ratio for multi-check rules
  deviation = the worst (max) of the individual deviations, where more than one check applies
  → buildHealth(subsystemId, deviation, reason, evidence, atHours):
      healthScore = scoreFromDeviation(deviation) = round(clamp(100 - clamp(deviation,0,1)*100, 0, 100))
      status      = statusFromScore(healthScore)   — thresholds below
      confidence  = confidenceFor(subsystemId)     — penalised per known KB limitation
      → SubsystemHealth
```

`aggregateOverall` (`diagnostics.ts:24`):
```
score  = min over all subsystems of healthScore   (starting from PERFECT_SCORE = 100 if empty)
status = 'Critical' if any subsystem is Critical
       else 'Warning' if any subsystem is Warning
       else 'Healthy'
```

## Engineering Equations

Transcribed from `rules.ts` and `diagnostics.ts`:

**Health score from deviation** (`rules.ts:46-48`):
```
scoreFromDeviation(deviation) = round(clamp(100 - clamp(deviation, 0, 1) * 100, 0, 100))
```

**Status from score** (`rules.ts:50-54`):
```
status = score < SCORE_CRITICAL_BELOW ? 'Critical'
       : score < SCORE_HEALTHY_AT     ? 'Warning'
       : 'Healthy'
```

**Confidence from known limitations** (`rules.ts:58-61`):
```
confidenceFor(subsystem) = clamp(
  CONFIDENCE_CEILING - limitations * CONFIDENCE_PENALTY_PER_LIMITATION,
  CONFIDENCE_FLOOR,
  CONFIDENCE_CEILING
)
```
where `limitations = EngineeringKnowledgeBase.getSubsystemById(subsystem)?.knownLimitations.length ?? 0`.

**Band deviation** (`rules.ts:65-69`):
```
deviationOutsideBand(value, min, max, scale):
  if min <= value <= max: return 0
  distance = value < min ? (min - value) : (value - max)
  return clamp(distance / scale, 0, 1)
```

**Invariant deviation** (`rules.ts:72-74`):
```
deviationFromInvariant(holds) = holds ? 0 : 1
```

**Overall aggregate — weakest-link minimum, never an average** (`diagnostics.ts:24-34`):
```
score  = reduce(subsystems, (min, s) => Math.min(min, s.healthScore), 100)
status = any(Critical) ? 'Critical' : any(Warning) ? 'Warning' : 'Healthy'
```
This matches CLAUDE.md §11.4 exactly: *"Overall health is the weakest-link minimum across all twelve subsystems, never an average — one real finding must not be diluted by eleven healthy ones."*

**Subsystem-specific derived checks worth noting:**
- `evaluateSolarPhysics`: `withinClearSkyCeiling = irradiance <= dniClearSky + SOLAR_IRRADIANCE_TOLERANCE_WM2` — the actual DNI must never exceed the clear-sky ceiling for the same instant.
- `evaluateRooftopPV`: `expectedDcKW = (pvAverageIrradiance / PV_REFERENCE_IRRADIANCE_WM2) * pvInstalledCapacity`; when `expectedDcKW >= PV_EXPECTED_FLOOR_KW`, `ratio = pvCurrentDCOutput / expectedDcKW` is checked against `[PV_RATIO_MIN, PV_RATIO_MAX]`.
- `evaluatePVInverter`: `acExceedsDc = invCurrentACOutput > invCurrentDCOutput + EPSILON_KW` — a physical impossibility check.
- `evaluateUtilityGrid`: `residualKW = (pvGenerationKW + importKW + batteryDischargeKW) - (buildingLoadKW + batteryChargeKW + exportKW)`, checked against `GRID_BALANCE_TOLERANCE_KW`.
- `evaluateServoKinematics` / `evaluateAdaptiveFacade`: `panelFaultDeviation(faultPanels, totalPanels)` never rounds a nonzero fault count to zero — `Math.max(MIN_DETECTABLE_DEVIATION=0.35, faultPanels/totalPanels)` whenever `faultPanels > 0`.

## Constants

| Constant | Value | File |
|---|---|---|
| `FDD_MODEL` | `'Engineering Fault Detection & Diagnosis Engine v1'` | `faultDetectionEngine.ts:29` |
| `KEY_BUCKET` (invalidation key rounding) | `100` | `faultDetectionEngine.ts:37` |
| `SCORE_HEALTHY_AT` | `90` | `rules.ts:27` |
| `SCORE_CRITICAL_BELOW` | `70` | `rules.ts:29` |
| `CONFIDENCE_PENALTY_PER_LIMITATION` | `2` | `rules.ts:34` |
| `CONFIDENCE_FLOOR` | `85` | `rules.ts:35` |
| `CONFIDENCE_CEILING` | `99` | `rules.ts:36` |
| `EPSILON_KW` (float tolerance) | `0.05` | `rules.ts:39` |
| `WEATHER_TEMP_MIN_C` / `MAX_C` | `-10` / `55` | `rules.ts:101-102` |
| `SOLAR_IRRADIANCE_TOLERANCE_WM2` | `5` | `rules.ts:136` |
| `ADC_MAX_12BIT` | `4095` | `rules.ts:168` |
| `MIN_DETECTABLE_DEVIATION` (panel faults) | `0.35` | `rules.ts:225` |
| `PANEL_ANGLE_MIN_DEG` / `MAX_DEG` | `0` / `180` | `rules.ts:229-230` |
| `PV_REFERENCE_IRRADIANCE_WM2` | `1000` | `rules.ts:281` |
| `PV_EXPECTED_FLOOR_KW` | `1` | `rules.ts:285` |
| `PV_RATIO_MIN` / `MAX` | `0.5` / `1.05` | `rules.ts:286-287` |
| `PV_RATIO_SCALE` | `0.6` | `rules.ts:288` |
| `INVERTER_EFFICIENCY_MAX` | `1.02` | `rules.ts:320` |
| `LOAD_INTENSITY_MAX_WM2` | `500` | `rules.ts:351` |
| `LOAD_INTENSITY_SCALE_WM2` | `150` | `rules.ts:352` |
| `GRID_BALANCE_TOLERANCE_KW` | `0.5` | `rules.ts:417` |
| `GRID_BALANCE_SCALE_KW` | `2` | `rules.ts:418` |
| `PREDICTION_HOLDING_DEVIATION` | `0.15` | `rules.ts:458` |
| `HEALTHY_DIAGNOSIS` string | `'All monitored subsystems are operating within expected engineering limits.'` | `diagnostics.ts:17` |
| `PERFECT_SCORE` | `100` | `diagnostics.ts:18` |
| `EVIDENCE_SUBSYSTEMS` (fixed order) | `['RooftopPV','Battery','UtilityGrid','VirtualSensors','PVInverter','AdaptiveFacade']` | `diagnostics.ts:63-70` |

## Engineering References

- **Rule-based fault diagnosis / consistency-check monitoring** — the entire subsystem is a textbook rule-based (expert-system-style) diagnosis pattern: one hand-authored expected-vs-observed check per subsystem, no learned model, no statistics. This is architecturally evident from `rules.ts` but is **not** an explicit external citation in code comments or the Knowledge Base (no `AIFaultDetection`/`FaultDetection` entry exists yet — see Design Rationale) — marked here as **inferred**, not code-cited.
- **Energy balance / power-flow consistency checking** — `evaluateUtilityGrid`'s supply/demand residual check is a standard power-systems balance check (Kirchhoff's current law analogue for a lumped bus model); again architecturally evident, not explicitly cited in comments — **inferred**.
- No `engineeringReferences` field exists for this subsystem in `src/lib/knowledge/subsystems.ts` because the subsystem is not registered there at all (see Design Rationale / gap noted below).

## Assumptions

- **The twin obeys its own physics by construction**, so the expected steady state is every subsystem reporting Healthy (`types.ts:14-20`). Warning/Critical is reserved for a genuine, named divergence.
- **`DETECTABLE_CONDITIONS` describes capability, not current state** — it is static and hand-authored, "never generated from a live value, so it can never be promoted into `anomalies` by mistake" (CLAUDE.md §11.4; enforced structurally: `recommendations.ts` exports it as a `readonly` const array with no code path connecting it to `rules.ts`'s live evaluation).
- **Confidence and health are independent axes.** Health measures observed-vs-expected physics match; confidence measures how much a subsystem's own documented modelling gaps (from the Knowledge Base's `knownLimitations`) should temper trust in that judgement. A rule can report a perfect health score with reduced confidence if the Knowledge Base lists limitations for that subsystem.
- **A Prediction Engine "Holding" status is a real, honestly-reported reduction in visibility, not a malfunction** — `evaluateAIPrediction` grades it a small fixed `PREDICTION_HOLDING_DEVIATION = 0.15` deviation (Warning-adjacent, not Critical), per the comment at `rules.ts:454-457`.

## Limitations

- **No `FaultDetection` (or `AIFaultDetection`) entry exists in `src/lib/knowledge/types.ts`'s `SubsystemId` union or in `src/lib/knowledge/subsystems.ts`.** Confirmed by reading `types.ts` (union lists `Weather`, `SolarPhysics`, `VirtualSensors`, `EmbeddedController`, `PBIF`, `ServoKinematics`, `AdaptiveFacade`, `RooftopPV`, `PVElectrical`, `PVInverter`, `BuildingEnergy`, `Battery`, `UtilityGrid`, `AIPrediction`, `AIWhatIf`, `CyberPhysicalPipeline` — no fault-detection id) and grepping `subsystems.ts` for an `id: 'FaultDetection'`/`'AIFaultDetection'` entry (none found). This means the Engineering Knowledge Base, Context Builder and Reasoning Engine have no first-class notion of "the FDD subsystem itself" — the FDD engine *reads* `EngineeringKnowledgeBase` for the twelve subsystems it monitors, but nothing in the Knowledge Base currently describes the FDD engine to the Engineering Assistant. This is a genuine gap, not an oversight this document should paper over.
- **`DETECTABLE_CONDITIONS` are aspirational, not implemented.** All 11 entries (sensor failure, LDR disagreement, PV underperformance, inverter clipping, battery not charging, battery abnormality, servo tracking failure, communication loss, grid outage, HVAC energy anomaly, over-temperature) describe conditions the architecture *could* detect with additional rules; none is currently live-checked. Live checks exist only for the invariants in `RULES` (12 entries, `rules.ts:490-503`).
- **Twelve subsystems is a fixed, hand-authored list.** Adding a new rule (e.g. sensor disagreement, inverter clipping severity) means adding one entry to `RULES` — nothing else changes, but nothing happens automatically either (`rules.ts:487-489` comment).
- **Reasoning quality depends on `EngineeringReasoningEngine`'s own graph**, which this document does not re-verify; `buildAnomalies` simply calls `reasoning.generateExplanation('Cause', s.subsystem)` and trusts its output.

## Dependencies

Not a projection/physics engine — it re-derives *expected* values from already-published `SimSnapshot` fields rather than calling engine pure functions like `computeSun` or `planeIrradiance` directly. Its dependencies are on other **subsystems' published state**, not on their internal math:

| Dependency | Type | Used for |
|---|---|---|
| `EngineeringKnowledgeBase` (`src/lib/knowledge`) | Static singleton | `getSubsystemById(id)` for `name` (health label) and `knownLimitations.length` (confidence penalty) |
| `engineeringContext` (`ContextBuilderAPI`, `src/lib/assistant`) | Live singleton | `getSubsystemContext('VirtualSensors' \| 'PBIF' \| 'AIPrediction')` — reads another subsystem's already-computed summary/status rather than re-deriving it |
| `engineeringReasoning` (`EngineeringReasoningEngine`, `src/lib/assistant`) | Live singleton | `generateExplanation('Cause', subsystem)` for each anomaly's `reasoning` field |
| `SimSnapshot` (`src/lib/engine/types`) | Caller-supplied data | Every rule's raw inputs — weather, sun, PV, inverter, energy bus, battery, grid, façade metrics |
| `clamp` (`src/lib/engine/math`) | Pure helper | Bounding deviations and confidence to their ranges |

No reference to `Simulation` reaches this subsystem (confirmed: `Simulation` is not imported anywhere under `src/lib/ai/faultDetection/`). This is a materially different dependency shape from the Prediction Layer: [Prediction (Stage 8.1) & What-If (Stage 8.2)](./prediction.md) call engine *physics functions* directly (`computeSun`, `planeIrradiance`, etc.); FDD instead reads already-published *snapshot values and other subsystems' derived context*, consistent with CLAUDE.md §11.4's "re-derives each subsystem's expected behaviour from published values."

## Consumers

Confirmed via `Grep` across `src/`:

- **`src/lib/engine/simulation.ts`** — constructs `FaultDetectionEngine` (constructor, alongside `PredictionEngine`/`WhatIfEngine`) and exposes `getFaultDetection(snapshot: SimSnapshot): FaultDetectionReport` (line 631-633), which calls `this.faultDetection.getReport(snapshot)`.
- **`src/lib/engine/store.ts`** — pulls `sim.getFaultDetection(sim.snapshot())` into the Zustand snapshot state as a `faultDetection: FaultDetectionReport` field (type declared at line 84; populated at lines 209, 267, 407).
- **`src/components/twin3d/ui/AiFddPanel.tsx`** — reads `useTwinStore((s) => s.faultDetection)` (line 87) and renders `overallHealthScore`, `overallStatus`, `diagnosis`, `subsystems`, `evidence`, `anomalies`, `detectableConditions`.

No other component or engine consumes this subsystem's output.

## Public API

**`FaultDetectionEngine`** (`faultDetectionEngine.ts`):
```ts
class FaultDetectionEngine {
  getReport(snapshot: SimSnapshot): FaultDetectionReport
}
```

**`rules.ts`**:
```ts
function evaluateSubsystems(contexts: ContextBuilderAPI, snap: SimSnapshot): SubsystemHealth[]
```
(The 12 individual `evaluateX` functions are module-private, invoked only through the `RULES` registry.)

**`diagnostics.ts`**:
```ts
function aggregateOverall(subsystems: readonly SubsystemHealth[]): { score: number; status: HealthStatus }
function buildDiagnosis(status: HealthStatus, subsystems: readonly SubsystemHealth[]): string
function buildEvidence(subsystems: readonly SubsystemHealth[]): string[]
function buildAnomalies(subsystems: readonly SubsystemHealth[], reasoning: EngineeringReasoningEngine): Anomaly[]
```

**`recommendations.ts`**:
```ts
function recommendationFor(subsystem: SubsystemHealth): string
const DETECTABLE_CONDITIONS: readonly DetectableCondition[]
```

**`Simulation`** (`src/lib/engine/simulation.ts`) — the entry point UI code actually calls:
```ts
getFaultDetection(snapshot: SimSnapshot): FaultDetectionReport
```

## Live Outputs

**`FaultDetectionReport`** (`types.ts:78`):
`revision`, `model`, `generatedAtHours`, `overallHealthScore` (0-100), `overallStatus: HealthStatus`, `diagnosis`, `subsystems: SubsystemHealth[]`, `evidence: string[]`, `anomalies: Anomaly[]`, `detectableConditions: DetectableCondition[]`.

**`SubsystemHealth`** (`types.ts:31`): `subsystem: SubsystemId`, `label`, `status: HealthStatus`, `healthScore` (0-100), `reason`, `evidence: Record<string,string>`, `confidence` (0-100), `timestamp`.

**`Anomaly`** (`types.ts:49`, Warning/Critical only): `id`, `subsystem`, `label`, `severity`, `observation`, `evidence`, `reasoning`, `conclusion`, `confidence`, `recommendation`.

**`DetectableCondition`** (`types.ts:70`): `id`, `subsystem`, `label`, `description`.

`HealthStatus = 'Healthy' | 'Warning' | 'Critical'` — deliberately no fourth "Unknown" state; a rule that cannot evaluate says so honestly in its `reason` string instead (`types.ts:25-28`).

The twelve monitored subsystems, in evaluation order (`rules.ts:490-503`): `Weather`, `SolarPhysics`, `VirtualSensors`, `PBIF`, `ServoKinematics`, `AdaptiveFacade`, `RooftopPV`, `PVInverter`, `BuildingEnergy`, `Battery`, `UtilityGrid`, `AIPrediction`.

## Source Files

- `src/lib/ai/faultDetection/faultDetectionEngine.ts`
- `src/lib/ai/faultDetection/rules.ts`
- `src/lib/ai/faultDetection/diagnostics.ts`
- `src/lib/ai/faultDetection/recommendations.ts`
- `src/lib/ai/faultDetection/types.ts`
- `src/lib/ai/faultDetection/index.ts`
- `src/lib/engine/simulation.ts` (construction, `getFaultDetection`)
- `src/lib/engine/store.ts` (state plumbing)
- `src/components/twin3d/ui/AiFddPanel.tsx` (consumer)
- `src/lib/knowledge/types.ts`, `src/lib/knowledge/subsystems.ts` (referenced but do not register this subsystem — see Limitations)

## Design Rationale

- **A monitor, never a simulator — enforced by what it is allowed to import.** The module header states it "consumes exactly four things" and "produces nothing that reaches back into the simulation" (`faultDetectionEngine.ts:5-19`); this is structurally true because `Simulation` itself is never imported anywhere under `src/lib/ai/faultDetection/`, matching the same "read-only by construction" pattern the Prediction Layer uses with `PredictionContext`.
- **Weakest-link, not average, because monitoring exists to surface the worst finding, not smooth it away.** `diagnostics.ts:20-23` comment: *"an average could hide one real finding behind eleven healthy ones, which is exactly the failure mode a monitoring system exists to avoid."* Matches CLAUDE.md §11.4 verbatim in spirit and in the code's actual `Math.min` reduction.
- **`DETECTABLE_CONDITIONS` is kept structurally separate from live anomalies** specifically so it "can never be mistaken for — or accidentally promoted into — a real anomaly" (`recommendations.ts:9-15`); there is no shared code path between the static catalogue and `buildAnomalies`.
- **Confidence is deliberately never a flat 100%** — `rules.ts:32-34`: *"an unmodelled edge case is a real reason a check could be wrong."* Each subsystem's confidence ceiling is reduced by its own documented Knowledge Base limitations, so a check against a subsystem with known blind spots is never presented as equally trustworthy as one with none.
- **A single nonzero fault-panel count is never rounded away.** `panelFaultDeviation`'s `MIN_DETECTABLE_DEVIATION = 0.35` floor (`rules.ts:219-227` comment) exists explicitly so "a single fault panel out of the full 1,620-panel façade is still a genuine finding, not noise."
- **The diagnosis always names a subsystem, even when healthy.** `buildDiagnosis` (`diagnostics.ts:45-58`) always calls `weakestOf()` and, on a perfect twin, still frames the message around the weakest (even if that weakest is itself 100/100) — "a Healthy verdict is explainable, not just asserted" (comment at `diagnostics.ts:44`).

## Future Extension Points

- **Every entry in `DETECTABLE_CONDITIONS` is an unimplemented rule waiting to be written** (`recommendations.ts:27-94`): sensor failure, LDR quadrant disagreement, PV underperformance/degradation, inverter clipping, battery not charging, battery state-of-charge abnormality, servo tracking failure, embedded-controller communication loss, grid outage, HVAC energy anomaly, over-temperature. Per the module comment, "New detection rules extend `rules.ts`; entries here only ever describe future capability" — implementing one means adding a new `evaluateX` function to the `RULES` array plus removing/updating its corresponding `DetectableCondition` entry.
- **Register `FaultDetection` as a first-class `SubsystemId`** in `src/lib/knowledge/types.ts` and add a matching entry to `src/lib/knowledge/subsystems.ts`, so the Engineering Assistant, Context Builder and Reasoning Engine can describe the FDD engine itself the way they already describe `AIPrediction` and `AIWhatIf`. This is the explicit gap this document was asked to flag.
- **`EmbeddedController`, `PVElectrical` and `CyberPhysicalPipeline`** exist as `SubsystemId`s in the Knowledge Base but have no corresponding rule in `RULES` — only 12 of the ~16 known subsystem ids are monitored today (the CLAUDE.md-specified twelve). Extending coverage to these would follow the same one-rule-per-subsystem pattern.
