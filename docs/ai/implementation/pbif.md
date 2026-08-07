# PBIF — Predictive Building Intelligence Framework

**Subsystem ID:** PBIF
**Version:** 1.0.0
**Last updated:** 2026-08-06

## Purpose

PBIF v1 is the deterministic, rule-based decision layer that decides *what the building is trying to do* — one high-level operational objective for the whole building, chosen from a strict priority hierarchy (Structural Safety › Weather Protection › Solar Optimization/Thermal Demand). It is explicitly **not** a rotation solver: `src/lib/pbif/decisionEngine.ts`'s own header states "PBIF is not a rotation solver. It never outputs a panel angle." The Tracking Policy layer routes PBIF's decision through the pre-existing kinematics solver (`solveForNormal`) or a configured safe orientation to actually produce a target angle; PBIF itself never computes solar geometry.

Despite the name ("Predictive"), the current implementation contains **no prediction, no optimization search, and no machine learning** — it is a top-down, first-match rule table over instantaneous sensor state. This is stated explicitly in the module's own comments ("Deterministic and fully explainable. No AI, ML, prediction, optimization or MPC") and is a real, load-bearing distinction from the knowledge-base's higher-level description (see Limitations).

## Responsibilities

- Classify raw weather/sensor inputs into discrete engineering states (`assessSituation`, `assessThermalDemand`, `assessSolarResource`).
- Determine one building-level `OperationalObjective` from those states (`determineObjective`).
- Run an ordered, first-match decision table to produce a `PbifDecision` — an operational state, a priority tier, a plain-language reason, and a `ruleTriggered` id (`decide`).
- Translate that decision into a `TrackingPolicy` describing how the façade should behave, and (when tracking) resolve the continuous target rotation via the existing kinematics solver or a configured safe angle (`policyFor`, `resolveTarget`).
- Own every threshold constant used anywhere in this chain, centrally, in `thresholds.ts` — no magic numbers embedded in the logic itself.

## Inputs

`SensorInputs` (`src/lib/pbif/situationAssessment.ts`), assembled once per tick by `AdaptiveSkinEngine.updateValidation()`:

- `windSpeed` — km/h, from `WeatherState.windSpeed`.
- `rainIntensity` — 0–1 normalised, from `WeatherState.rainIntensity`.
- `solarADC` — the simulated embedded LDR ADC reading, from `VirtualSensorEngine.getGlobalFilteredADC()` (0–4095).
- `outdoorTemperature` — °C, from `WeatherState.temperature`.

`PbifTargetInput` (consumed by `resolveTarget` in `trackingPolicy.ts`): `surfaceNormal`, `solar` (`SolarVector`), `currentAngle`, `intent` (`Intent`), `solarResource` (`SolarResourceState`).

## Outputs

`PbifEvaluation` (`src/lib/pbif/index.ts`), the full chain result for one instant:

```ts
interface PbifEvaluation {
  situation: SituationAssessment       // { wind, rain }
  thermalDemand: { state, value, display }
  solarResource: { state, value, display }
  objective: OperationalObjective
  decision: PbifDecision               // { state, priority, objective, facadeState, reason, confidence, ruleTriggered }
  policy: TrackingPolicy               // { kind, facadeState, label, behaviour, tracksSun }
}
```

The Target Blade Angle itself (a `number`) is a separate output of `resolveTarget`/`resolveTargetRotation`, not part of `PbifEvaluation`.

## Internal Calculation Pipeline

Run once per tick (on the environmental-tier "resolve" frame) by `evaluatePbif()` in `src/lib/pbif/index.ts`:

```
situation      = assessSituation({ windSpeed, rainIntensity, solarADC, outdoorTemperature })
thermalDemand  = assessThermalDemand(outdoorTemperature)
solarResource  = assessSolarResource(solarADC)
objective      = determineObjective(situation, thermalDemand.state)
decision       = decide(situation, thermalDemand.state, objective, solarResource.state)
policy         = policyFor(decision)
```

**1. Situation Assessment** (`situationAssessment.ts`) — classifies `windSpeed` and `rainIntensity` into named bands via a shared `classify()` helper: a value takes the state of the *highest* threshold edge it meets or exceeds (bands sorted ascending), else the base state.

**2. Thermal Demand** (`thermalDemandAssessment.ts`) and **Solar Resource** (`solarResourceAssessment.ts`) — simple two-threshold classifications of `outdoorTemperature` and `solarADC` respectively (not the shared `classify()` helper — each is a small standalone `if`/`else if`).

**3. Operational Objective** (`operationalObjective.ts`) — a 4-branch priority cascade, evaluated top to bottom, first match wins:
```
if wind ∈ {EXTREME, HIGH}         → 'Protect Structure'
else if rain ∈ {HEAVY, MODERATE}  → 'Protect Building Envelope'
else if thermalDemand === 'HIGH'  → 'Reduce Cooling Load'
else                               → 'Maintain Balanced Solar Performance'
```

**4. Decision Engine** (`decisionEngine.ts`) — a declarative, ordered `RULES` table (11 rules + a catch-all default), evaluated top to bottom, first match wins. The ordering itself *is* the priority hierarchy: every Structural Safety rule precedes every Weather Protection rule, which precedes every Solar Availability rule, which precedes the Thermal Demand rules, which precede the default. See Engineering Equations for the full table.

**5. Tracking Policy** (`trackingPolicy.ts`) — maps the resulting `PbifState` to a `TrackingPolicy` (`policyFor`), and separately resolves a continuous target angle (`resolveTarget`) for whichever surface asks:
- `SAFE_MODE` / `WEATHER_PROTECTION` → `facadeState = 'CLOSED'` → `nearestCongruent(currentAngle, 0, 180)` (closed = 0°, folded through the blade's 180° symmetry, same helper the kinematics solver uses).
- `ECONOMY_TRACKING` → compute the theoretical target via `solveForNormal(...)`, but only commit to it if `abs(theoreticalTarget - currentAngle) > DYNAMIC_DEADBAND_DEG[solarResource]`; otherwise hold the current angle.
- `NORMAL_TRACKING` (default) → `solveForNormal(surfaceNormal, solar, currentAngle, intent).targetAngle` directly, no deadband.

**6. Caller integration** (`AdaptiveSkinEngine.updateValidation`, `src/lib/engine/adaptiveSkin.ts`): `evaluatePbif()` is called once per resolve tick and cached as `this.pbifEvaluation`; each surface's target is then obtained via `resolveTargetRotation('pbif', { …, pbifState: pbifEvaluation.decision.state, solarResource: pbifEvaluation.solarResource.state })` in `facadeControl.ts`, which internally calls `resolvePbifTarget` (aliased from `resolveTarget`). This decision is **building-global** — computed once and shared by every surface, not per-surface.

## Engineering Equations

Classification (`classify`, `situationAssessment.ts`):
```
state(value) = highest S in bands such that value ≥ edge(S); else base
```

Decision table (`RULES`, in evaluation order — first match wins):

| # | Rule id | Condition | Result state | Façade state |
|---|---|---|---|---|
| 1 | `EXTREME wind → SAFE_MODE` | `wind.state === 'EXTREME'` | `SAFE_MODE` | `CLOSED` |
| 2 | `HIGH wind → ECONOMY_TRACKING` | `wind.state === 'HIGH'` | `ECONOMY_TRACKING` | `TRACKING` |
| 3 | `HEAVY rain → WEATHER_PROTECTION` | `rain.state === 'HEAVY'` | `WEATHER_PROTECTION` | `CLOSED` |
| 4 | `MODERATE rain → WEATHER_PROTECTION` | `rain.state === 'MODERATE'` | `WEATHER_PROTECTION` | `CLOSED` |
| 5 | `LIGHT rain → ECONOMY_TRACKING` | `rain.state === 'LIGHT'` | `ECONOMY_TRACKING` | `TRACKING` |
| 6 | `LOW Solar Resource → ECONOMY_TRACKING` | `solarResource === 'LOW' && thermalDemand !== 'HIGH'` | `ECONOMY_TRACKING` | `TRACKING` |
| 7 | `MEDIUM Solar Resource → ECONOMY_TRACKING` | `solarResource === 'MEDIUM' && thermalDemand !== 'HIGH'` | `ECONOMY_TRACKING` | `TRACKING` |
| 8 | `HIGH temperature + LOW/MEDIUM Solar Resource → ECONOMY_TRACKING` | `(solarResource ∈ {LOW,MEDIUM}) && thermalDemand === 'HIGH'` | `ECONOMY_TRACKING` | `TRACKING` |
| 9 | `HIGH temperature + HIGH Solar Resource → NORMAL_TRACKING` | `solarResource === 'HIGH' && thermalDemand === 'HIGH'` | `NORMAL_TRACKING` | `TRACKING` |
| 10 | `Default → NORMAL_TRACKING` | always | `NORMAL_TRACKING` | `TRACKING` |

(Table numbering above is presentation order; the source array has no separate rule for a `HIGH` solar-resource, non-`HIGH`-thermal case — it falls through every conditional rule and lands on the default, which is functionally identical to "normal tracking, tight deadband".)

Deadband gating (`resolveTarget`, `ECONOMY_TRACKING` branch):
```
theoreticalTarget = solveForNormal(surfaceNormal, solar, currentAngle, intent).targetAngle
angularDifference = |theoreticalTarget - currentAngle|
target = angularDifference > DYNAMIC_DEADBAND_DEG[solarResource] ? theoreticalTarget : currentAngle
```

Closed-state fold:
```
target = nearestCongruent(currentAngle, 0, 180)   // BLADE_PERIOD_DEG = 180
```

Confidence: `RULE_BASED_CONFIDENCE = 100` for every decision — constant by construction, not computed from any signal margin (contrast with the VEC firmware twin's confidence heuristic in [Cyber-Physical Pipeline](./cyber_physical_pipeline.md), which *does* scale with distance past threshold — that confidence model belongs to `SimulatedController`, not PBIF).

## Constants

All in `src/lib/pbif/thresholds.ts`:

| Constant | Value | Meaning |
|---|---|---|
| `WIND_KMH.MODERATE` | 20 km/h | LOW→MODERATE edge |
| `WIND_KMH.HIGH` | 35 km/h | MODERATE→HIGH edge |
| `WIND_KMH.EXTREME` | 50 km/h | HIGH→EXTREME edge |
| `RAIN_LEVEL.LIGHT` | 0.05 | NONE→LIGHT edge |
| `RAIN_LEVEL.MODERATE` | 0.35 | LIGHT→MODERATE edge |
| `RAIN_LEVEL.HEAVY` | 0.65 | MODERATE→HEAVY edge |
| `ADC_TO_SOLAR_RESOURCE.MEDIUM_THRESHOLD` | 2000 ADC | LOW→MEDIUM edge |
| `ADC_TO_SOLAR_RESOURCE.HIGH_THRESHOLD` | 4000 ADC | MEDIUM→HIGH edge |
| `TEMPERATURE_C.NORMAL` | 24 °C | LOW→NORMAL edge |
| `TEMPERATURE_C.HIGH` | 30 °C | NORMAL→HIGH edge |
| `WIND_SAFE_ANGLE` | 90° | Predefined SAFE_MODE orientation — **declared but not yet read by `trackingPolicy.ts`'s `resolveTarget`**, which still hardcodes `SAFE_MODE → 0°` (see Limitations) |
| `RAIN_SAFE_ANGLE` | 135° | Predefined WEATHER_PROTECTION orientation — the single authority, read by BOTH `trackingPolicy.ts`'s `resolveTarget` and `panelStates.ts`'s `STATE_ANGLE[RAIN_PROTECTION]` (Stage 7.10.2) |
| `DYNAMIC_DEADBAND_DEG.HIGH` | 2° | Tight deadband at high solar resource |
| `DYNAMIC_DEADBAND_DEG.MEDIUM` | 5° | |
| `DYNAMIC_DEADBAND_DEG.LOW` | 8° | Wide deadband at low solar resource |

Also: `RULE_BASED_CONFIDENCE = 100` (`decisionEngine.ts`), `BLADE_PERIOD_DEG = 180` (`trackingPolicy.ts`).

## Engineering References

- No external standard is cited for the wind/rain/temperature/ADC band edges themselves; `thresholds.ts`'s header states they are "loosely aligned with the Beaufort scale for a kinetic louvre façade" for wind, and otherwise presented as tunable, documented configuration rather than derived from a cited source.
- The tracking/deadband/rotation mechanics reuse `src/lib/kinematics` (`solveForNormal`, `nearestCongruent`) unchanged — see that module's own documentation for its solar-geometry references.

## Assumptions

- PBIF reads exactly three raw weather/sensor variables (wind, rain, solar ADC) plus outdoor temperature — never cloud cover directly, never humidity. "Solar Resource" is inferred from the simulated LDR ADC reading, not from `WeatherState.cloudCoverage`.
- The decision is evaluated once per tick and shared by every surface in the building — there is one PBIF decision for the whole building, not one per façade orientation.
- `PbifDecision.confidence` is always 100; the field exists purely so a future predictive/AI PBIF can supply a real confidence value without changing the interface (stated explicitly in `decisionEngine.ts`).
- Economy tracking's dynamic deadband is keyed only on `SolarResourceState`, not on wind or rain — a windy-but-sunny tick and a calm-but-sunny tick get the same deadband.

## Limitations

- **No prediction, optimization, or MPC exists in PBIF v1**, despite the name. This is self-disclosed in the module comments of `decisionEngine.ts`, `trackingPolicy.ts`, and `pbif/index.ts` ("This 'V1' is fully deterministic and explainable. AI, machine learning, prediction, optimization and MPC are future phases..."). (Stage 7.10.2 — resolved) This previously directly contradicted the `PBIF` entry in `src/lib/knowledge/subsystems.ts`, which described a `Penalty(θ) = w_g·Glare(θ) + w_t·Thermal(θ) − w_d·Daylight(θ)` argmin search over discrete angles 0°–90° that never existed anywhere in `src/lib/pbif/`; that entry has been rewritten to describe the actual first-match-wins rule table, matching this document.
- (Stage 7.10.2 — resolved for rain, still open for wind) **`RAIN_SAFE_ANGLE` (135°) is now read by `trackingPolicy.ts`'s `resolveTarget`** for `WEATHER_PROTECTION`, and by `panelStates.ts`'s `STATE_ANGLE[RAIN_PROTECTION]` for the other (non-validation) control path — the SAME constant, so the twin has exactly one rain-safe angle. Previously both `SAFE_MODE` and `WEATHER_PROTECTION` resolved to a hardcoded `0°`, silently ignoring the constant; `policyFor()`'s `WEATHER_PROTECTION` behaviour text now says "tilt to the rain-safe orientation (135°)" to match. **`WIND_SAFE_ANGLE` (90°) remains declared but not wired into `SAFE_MODE`'s arithmetic** — `SAFE_MODE` still closes flat to 0° — a documented, not-yet-implemented follow-up (see `thresholds.ts`'s own doc comment on `WIND_SAFE_ANGLE`).
- PBIF never sees cloud cover directly — "Solar Resource" is a proxy via ADC, so its classification is coupled to whatever irradiance-to-lux-to-ADC chain [Cyber-Physical Pipeline](./cyber_physical_pipeline.md) produces, including that chain's own documented simplifications.
- The decision table's rules 6–9 (Solar Availability / Thermal Demand) are order-sensitive in a way not obvious from priority labels alone: rules 6 and 7 fire before rules 8 and 9 ever get a chance if `thermalDemand !== 'HIGH'`, so "Thermal Demand" as a priority tier only ever matters when Solar Resource is also LOW/MEDIUM/HIGH *and* the earlier Solar Availability guard (`t !== 'HIGH'`) has excluded it.

## Dependencies

- `SituationAssessment` inputs come from `WeatherState` (wind, rain) — see the Weather documentation (not in this batch).
- `solarADC` comes from `VirtualSensorEngine.getGlobalFilteredADC()` — see [Cyber-Physical Pipeline](./cyber_physical_pipeline.md).
- `resolveTarget`'s tracking branches call `solveForNormal` / `nearestCongruent` from `@/lib/kinematics` (the Solar Kinematics solver — not in this batch, referenced generically per its own docs).
- `AdaptiveSkinEngine` supplies `surfaceNormal`, `solar` (via `transformSolarVector`), `currentAngle`, and `intent` each tick — see [Adaptive Façade](./adaptive_facade.md).

## Consumers

- `src/lib/engine/adaptiveSkin.ts` — calls `evaluatePbif()` once per resolve tick in `updateValidation()`; exposes the result via `getPbifEvaluation()`.
- `src/lib/engine/facadeControl.ts` — calls `resolveTarget` (aliased `resolvePbifTarget`) inside its `'pbif'` mode branch of `resolveTargetRotation`.
- `src/lib/embedded/panel.ts` — `ledState()` reads `sim.skin.getPbifEvaluation()?.policy.tracksSun` to decide the red/green LED state; `lcdModeLabel()` reads `.decision.state` for the LCD mode line.
- `src/components/twin3d/ui/PbifPanel.tsx` — the PBIF decision UI panel.
- `src/components/twin3d/ui/CyberPhysicalPipeline.tsx` — surfaces the PBIF decision inside the unified pipeline visualization.
- `src/lib/assistant/contextBuilder.ts` — reads PBIF evaluation state to build the AI assistant's engineering context.
- `src/lib/engine/environmentalInfluence.ts` and `src/components/twin3d/ui/MetricsHUD.tsx` — import from `@/lib/pbif` (types/labels).

## Public API

**`src/lib/pbif/index.ts`**
- `evaluatePbif(inputs: SensorInputs): PbifEvaluation`

**`situationAssessment.ts`**
- `assessWind(windSpeed: number): AssessedVariable<WindState>`
- `assessRain(rainIntensity: number): AssessedVariable<RainState>`
- `assessSituation(w: SensorInputs): SituationAssessment`
- `STATE_LABELS: Record<WindState | RainState, string>`

**`thermalDemandAssessment.ts`**
- `assessThermalDemand(outdoorTemperature: number): AssessedVariable<ThermalDemandState>`

**`solarResourceAssessment.ts`**
- `assessSolarResource(solarADC: number): AssessedVariable<SolarResourceState>`

**`operationalObjective.ts`**
- `determineObjective(situation: SituationAssessment, thermalDemand: ThermalDemandState): OperationalObjective`

**`decisionEngine.ts`**
- `decide(situation, thermalDemand, objective, solarResource): PbifDecision`
- `PBIF_STATE_LABELS: Record<PbifState, string>`

**`trackingPolicy.ts`**
- `policyFor(decision: PbifDecision): TrackingPolicy`
- `resolveTarget(state: PbifState, input: PbifTargetInput): number`

## Live Outputs

- `PbifEvaluation.situation.wind/.rain: AssessedVariable<S> { state, value, display }`
- `PbifEvaluation.thermalDemand: { state: ThermalDemandState, value, display }`
- `PbifEvaluation.solarResource: { state: SolarResourceState, value, display }`
- `PbifEvaluation.objective: OperationalObjective`
- `PbifEvaluation.decision: PbifDecision { state, priority, objective, facadeState, reason, confidence, ruleTriggered }`
- `PbifEvaluation.policy: TrackingPolicy { kind, facadeState, label, behaviour, tracksSun }`
- Read live via `AdaptiveSkinEngine.getPbifEvaluation(): PbifEvaluation | null` (null until PBIF has run at least once).

## Source Files

- `src/lib/pbif/index.ts`
- `src/lib/pbif/situationAssessment.ts`
- `src/lib/pbif/thermalDemandAssessment.ts`
- `src/lib/pbif/solarResourceAssessment.ts`
- `src/lib/pbif/operationalObjective.ts`
- `src/lib/pbif/decisionEngine.ts`
- `src/lib/pbif/trackingPolicy.ts`
- `src/lib/pbif/thresholds.ts`

## Design Rationale

- The decision table is deliberately declarative (an array of `{ when, state, reason }` rules) rather than nested `if`/`else` so, per the module comment, "the whole policy is auditable at a glance and forward-compatible: a future predictive/AI engine replaces the decision *source* and the `confidence` value, while the UI and downstream layers stay unchanged."
- PBIF is architecturally forbidden from computing panel angles itself — this is stated three times across `decisionEngine.ts`, `trackingPolicy.ts`, and `pbif/index.ts`'s headers — specifically so the existing, separately-validated kinematics solver remains the single source of geometric truth, and PBIF can be swapped for a smarter decision source later without touching geometry.
- Dynamic deadband is keyed on Solar Resource (not a fixed constant) because, per `thresholds.ts`'s comment, "High solar availability requires precise tracking (tight deadband). Low solar availability permits relaxed tracking (wide deadband) to reduce actuator wear" — an explicit engineering trade-off between tracking precision and motor/actuator longevity.
- Confidence is hardcoded to 100 rather than omitted, specifically to keep the `PbifDecision` shape stable for a future non-deterministic decision source (per CLAUDE.md §11: "a future predictive/AI PBIF can supply a real confidence source without any UI or architectural change").

## Future Extension Points

- CLAUDE.md §10 lists prediction accuracy tracking and longer horizons as roadmap items for the sibling AI Prediction Layer (Stage 8.1+), which is architecturally separate from PBIF (PBIF controls, the AI layer only observes — CLAUDE.md §11).
- `src/lib/knowledge/subsystems.ts`'s `PBIF` entry names "Model Predictive Control (MPC) utilizing the 48-hour forecast" as a future extension — consistent with the current implementation being explicitly non-predictive.
- Wiring `WIND_SAFE_ANGLE` into `resolveTarget`'s `SAFE_MODE` case, the same way Stage 7.10.2 wired `RAIN_SAFE_ANGLE` into the `WEATHER_PROTECTION` case, would close the remaining half of the dead-constant gap noted in Limitations.
