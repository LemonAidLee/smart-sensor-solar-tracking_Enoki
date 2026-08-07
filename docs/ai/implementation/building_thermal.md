# BuildingThermalEngine

**Subsystem ID:** BuildingThermal (not yet in `src/lib/knowledge/types.ts` `SubsystemId` union — treat as a documented-but-not-yet-registered subsystem)
**Version:** 1.0.0
**Last updated:** 2026-08-06

## Purpose

`BuildingThermalEngine` (`src/lib/engine/buildingThermal.ts`) is the physical bridge between the Adaptive Façade and the Building Energy Management System. Before Stage 7.9 the two were thermally independent: closing the façade blades changed only the façade's own displayed cooling-load estimate (a `metrics.ts` comfort/display figure), never a watt of the BEMS's real HVAC electrical demand. This engine makes that connection physical rather than asserted, carrying the chain all the way to occupant comfort:

```
Solar Heat → Building Heat → Cooling Requirement → HVAC Response → Conditioned Indoor Environment
```

i.e. façade solar gain (thermal, kW) → envelope transmission → indoor heat accumulation (thermal inertia) → cooling requirement (thermal, kW) → HVAC electrical demand (kW, via `COOLING_PLANT_COP`) → conditioned indoor temperature (°C, via `HVAC_SETPOINT_C`).

## Responsibilities

- Convert `facadeSolarGainKW` (owned by `metrics.ts`, never re-derived here) into the heat that actually crosses the full envelope assembly (`envelopeHeatGainKW`).
- Split that heat into a convective share (loads room air immediately) and a radiant share (absorbed by thermal mass, released gradually).
- Integrate the radiant share through a first-order thermal-mass lag to produce `indoorHeatGainKW`.
- Convert the resulting cooling requirement into electrical kW via a fixed cooling-plant COP (`coolingLoadKW`) — the one field `BuildingEnergyEngine` is allowed to add straight onto its HVAC category.
- Produce two DISPLAY-ONLY comfort estimates: a free-floating indoor temperature proxy and a post-HVAC conditioned indoor temperature.
- Classify the HVAC's plain-language operating state (`coolingStatus`).
- It does **not** touch occupancy, lighting, equipment, elevators or building-services demand — those remain entirely `BuildingEnergyEngine`'s. It does not re-derive façade solar gain itself.

## Inputs

Passed positionally to `BuildingThermalEngine.update()`, called once per environmental tick from `Simulation.tick()`:

| Parameter | Type | Source |
|---|---|---|
| `facadeOpenness` | number, 0–1 | `BuildingMetrics.averageOpenness` (`metrics.ts`) |
| `facadeSolarGainKW` | number, kW thermal | `facadeSolarGainKW()` in `metrics.ts`, computed by `Simulation.tick()` from `this.metrics.averageSolarExposure`, `this.metrics.averageOpenness`, and the façade area — **never recomputed inside this engine** |
| `outdoorTempC` | number, °C | `WeatherState.temperature` |
| `irradianceWm2` | number, W/m² | `SunState.irradiance` (raw global irradiance, not façade-mediated) |
| `dtSimSeconds` | number, simulated seconds | Shared `simSeconds` step computed once per tick and reused by every lagged integrator (thermal mass, HVAC plant, battery, daily ledger) |

`dtSimSeconds <= 0` means "initialise": the radiant-release lag snaps straight to its target instead of integrating, so a seed call or a timeline scrub produces no startup transient.

## Outputs

`BuildingThermalState` (from `getState()`), all fields mutated in place on one persistent object:

| Field | Unit | Meaning |
|---|---|---|
| `facadeOpenness` | 0–1 | Passthrough of the input, for the dashboard |
| `outdoorTempC` | °C | Passthrough of the input |
| `facadeSolarGainKW` | kW thermal | Clamped ≥0 copy of the input |
| `envelopeHeatGainKW` | kW thermal | Heat that crosses the full envelope assembly |
| `convectiveKW` | kW thermal | Convective share, loads room air immediately |
| `radiantReleaseKW` | kW thermal | Radiant share currently released from thermal-mass storage (lagged) |
| `indoorHeatGainKW` | kW thermal | `convectiveKW + radiantReleaseKW` |
| `coolingRequiredKW` | kW thermal | Heat the HVAC must remove — today always equal to `indoorHeatGainKW` |
| `coolingLoadKW` | **kW electrical** | Power the cooling plant draws — the value `BuildingEnergyEngine` consumes |
| `indoorTemperatureProxy` | °C | Free-floating indoor temperature estimate (no HVAC) — display only |
| `conditionedIndoorTemperatureC` | °C | Post-HVAC indoor temperature estimate — display only |
| `coolingStatus` | `CoolingStatus` | `'Standby' \| 'Cooling' \| 'Recovering' \| 'Maintaining Setpoint'` |
| `thermalLag` | kW thermal | `envelopeHeatGainKW − indoorHeatGainKW`; positive while loading into mass, negative while releasing |

## Internal Calculation Pipeline

Per `BuildingThermalEngine.update()` (`buildingThermal.ts` lines 444–482):

1. `envelope = envelopeHeatGainKW(facadeSolarGainKW)` — apply `ENVELOPE_TRANSMISSION_EFFICIENCY`.
2. `convective = convectiveFraction(facadeOpenness)` — base convective fraction plus an openness-proportional cavity-ventilation bonus, clamped 0–1.
3. `convectiveKW = envelope * convective`; `radiantTargetKW = envelope * (1 - convective)`.
4. Exponential-approach lag: `alpha = dtSimSeconds > 0 ? 1 - exp(-dtSimSeconds / TIME_CONSTANT_SIM_SECONDS) : 1`; `radiantReleaseKW += (radiantTargetKW - radiantReleaseKW) * alpha`. This is a persistent instance field (`this.radiantReleaseKW`), the engine's only carried state.
5. `indoor = convectiveKW + radiantReleaseKW`; `lag = envelope - indoor`.
6. `coolingRequiredKW = indoor` (capacity assumed sufficient — see Limitations).
7. `coolingLoadKW = coolingRequiredKW / COOLING_PLANT_COP`.
8. `indoorTemperatureProxy = outdoorTempC + indoor / THERMAL_CAPACITANCE_KW_PER_C + max(0, irradianceWm2) * IRRADIANCE_PROXY_COEFFICIENT_C_PER_WM2`.
9. `conditionedIndoorTemperatureC = HVAC_SETPOINT_C + max(0, coolingRequiredKW) * HVAC_PROPORTIONAL_DROOP_C_PER_KW`.
10. `coolingStatus = coolingStatus(coolingRequiredKW, lag)` — thresholded classification.
11. All fields written onto the single mutated `BuildingThermalState` object.

A parallel pure function, `equilibriumThermalState()`, evaluates steps 1–3, 5–10 with the lag pre-settled (`indoor === envelope`, `thermalLag === 0`) — used by the AI Prediction/What-If layer instead of live integration (see Consumers).

## Engineering Equations

All transcribed verbatim from `src/lib/engine/buildingThermal.ts`:

```
envelopeHeatGainKW(facadeSolarGainKW) = max(0, facadeSolarGainKW) * ENVELOPE_TRANSMISSION_EFFICIENCY

convectiveFraction(facadeOpenness) =
  clamp(SOLAR_CONVECTIVE_FRACTION_BASE + OPENNESS_CONVECTIVE_BONUS * clamp(facadeOpenness), 0, 1)

convectiveKW = envelope * convective
radiantTargetKW = envelope * (1 - convective)

alpha = dtSimSeconds > 0 ? 1 - exp(-dtSimSeconds / TIME_CONSTANT_SIM_SECONDS) : 1
radiantReleaseKW += (radiantTargetKW - radiantReleaseKW) * alpha

indoorHeatGainKW = convectiveKW + radiantReleaseKW
thermalLag = envelopeHeatGainKW - indoorHeatGainKW

coolingRequiredKW = indoorHeatGainKW          // capacity assumed sufficient
coolingLoadKW = coolingRequiredKW / COOLING_PLANT_COP

indoorTemperatureProxy(outdoorTempC, indoorHeatGainKW, irradianceWm2) =
  outdoorTempC
  + indoorHeatGainKW / THERMAL_CAPACITANCE_KW_PER_C
  + max(0, irradianceWm2) * IRRADIANCE_PROXY_COEFFICIENT_C_PER_WM2

conditionedIndoorTemperatureC(coolingRequiredKW) =
  HVAC_SETPOINT_C + max(0, coolingRequiredKW) * HVAC_PROPORTIONAL_DROOP_C_PER_KW
```

`coolingStatus(coolingRequiredKW, thermalLag)`:
```
if coolingRequiredKW < COOLING_STATUS_STANDBY_KW        → 'Standby'
else if thermalLag >  COOLING_STATUS_SETTLED_BAND_KW     → 'Cooling'
else if thermalLag < -COOLING_STATUS_SETTLED_BAND_KW     → 'Recovering'
else                                                      → 'Maintaining Setpoint'
```

## Constants

All from `BUILDING_THERMAL` in `src/lib/engine/buildingThermal.ts`:

| Constant | Value | Meaning |
|---|---|---|
| `ENVELOPE_TRANSMISSION_EFFICIENCY` | `0.9` | Fraction of glazing-transmitted solar heat that survives frame/edge conduction and cavity re-radiation losses |
| `SOLAR_CONVECTIVE_FRACTION_BASE` | `0.4` | Base convective share of envelope heat gain (RTS-method glazing split) |
| `OPENNESS_CONVECTIVE_BONUS` | `0.2` | Additional convective fraction at fully-open blades (cavity ventilation) |
| `TIME_CONSTANT_SIM_SECONDS` | `20 * 60` (1200) | First-order thermal-mass time constant, simulated seconds — 20 simulated minutes |
| `COOLING_PLANT_COP` | `3.5` | Electrical kW drawn per kW of thermal heat rejected |
| `THERMAL_CAPACITANCE_KW_PER_C` | `25` | kW of heat gain per °C the indoor proxy sits above outdoor temperature (display only) |
| `IRRADIANCE_PROXY_COEFFICIENT_C_PER_WM2` | `0.003` | °C per W/m² residual raw-irradiance contribution to the proxy (display only) |
| `HVAC_SETPOINT_C` | `24.0` | Commanded indoor air temperature, °C |
| `HVAC_PROPORTIONAL_DROOP_C_PER_KW` | `0.0015` | Proportional-control offset, °C per kW of cooling requirement |
| `COOLING_STATUS_STANDBY_KW` | `1` | Below this cooling requirement, HVAC reads as idle |
| `COOLING_STATUS_SETTLED_BAND_KW` | `2` | `\|thermalLag\|` band inside which the response reads as settled |

## Engineering References

Formalised in `BUILDING_THERMAL_REFERENCES` (`buildingThermal.ts`), each entry linked to the constant it backs:

| Reference | Applies to |
|---|---|
| ASHRAE Fundamentals — fenestration U-factor / frame-and-edge loss practice | `ENVELOPE_TRANSMISSION_EFFICIENCY` |
| ASHRAE Radiant Time Series (RTS) Method | `SOLAR_CONVECTIVE_FRACTION_BASE` |
| CIBSE Guide A — Environmental Design, "heavyweight" dynamic thermal response class | `TIME_CONSTANT_SIM_SECONDS` |
| ASHRAE 90.1 — minimum efficiency tables for commercial cooling equipment | `COOLING_PLANT_COP` |
| ASHRAE 55 — Thermal Environmental Conditions for Human Occupancy | `HVAC_SETPOINT_C` |

These are code-cited (present verbatim in `BUILDING_THERMAL_REFERENCES`), not inferred. No reference is given in code for `THERMAL_CAPACITANCE_KW_PER_C`, `IRRADIANCE_PROXY_COEFFICIENT_C_PER_WM2`, `HVAC_PROPORTIONAL_DROOP_C_PER_KW`, or the two status thresholds — these are documented in code comments as reasonable engineering assumptions but carry no external citation; treat any external standard for these as **inferred, not code-cited**.

## Assumptions

- HVAC capacity is assumed sufficient to remove all `indoorHeatGainKW`; `coolingRequiredKW` is therefore always numerically equal to `indoorHeatGainKW` today (module header, "Forward compatibility" note).
- `coolingRequiredKW` is kept as its own field specifically so a future HVAC capacity limit (`MAX_HVAC_CAPACITY_KW`-style constant) has exactly one place to apply itself; `coolingLoadKW` and `conditionedIndoorTemperatureC` are both derived from `coolingRequiredKW`, not from `indoorHeatGainKW` directly, so they would inherit that limit automatically.
- The engine is deterministic given its inputs modulo one carried state variable (`radiantReleaseKW`) — same convention as `BuildingEnergyEngine`'s `hvacFactor` lag.
- `indoorTemperatureProxy` and `conditionedIndoorTemperatureC` are explicitly DISPLAY ONLY — nothing electrical is ever derived from a temperature in this engine.

## Limitations

- Cooling plant capacity is not modelled — the plant can never be undersized in this simulation.
- The COP is a single fixed value (`3.5`), not a dynamic curve responsive to part-load ratio, outdoor wet-bulb, or equipment staging.
- The thermal-mass model is a single first-order lag (one time constant), not a multi-node RC network — CLAUDE.md §11.5 confirms the AI Prediction layer reads this chain **at equilibrium** rather than integrating the lag hour-by-hour, which this file's own `equilibriumThermalState()` exists specifically to serve.
- `indoorTemperatureProxy` and `conditionedIndoorTemperatureC` are simplified comfort estimates (a linear capacitance term and a linear proportional-droop term respectively), not a full psychrometric or zone-air-balance model.
- No heating load is modelled — the building is treated as strictly cooling-dominant, consistent with `BuildingEnergyEngine`'s own assumption.

## Dependencies

- Façade solar gain: consumes `facadeSolarGainKW()` from `metrics.ts` (Adaptive Façade / Metrics Engine — not part of this doc batch).
- Façade openness: `BuildingMetrics.averageOpenness` (Adaptive Façade).
- Weather: `WeatherState.temperature` (Weather Scenario Engine).
- Solar: `SunState.irradiance` (Solar Physics Engine).
- No dependency on [BuildingLightingEngine](./building_lighting.md) — the two are independent siblings by design (see Design Rationale).

## Consumers

Verified via `Grep` across `src/`:

- **`Simulation.tick()`** (`src/lib/engine/simulation.ts`) — calls `buildingThermal.update(...)` once per environmental tick (lines 354–360, and a zero-`dt` seed call at line 279), then reads `buildingThermal.getState().coolingLoadKW` and feeds it into `BuildingEnergyEngine.update()` as `solarCoolingLoadKW` (lines 380–387).
- **`SimSnapshot.thermal`** — `simulation.ts` line 677 publishes `this.buildingThermal.getState()` onto the snapshot every poll.
- **`BuildingThermalPanel.tsx`** (`src/components/twin3d/ui/BuildingThermalPanel.tsx`) — the dedicated engineering UI panel; reads `SimSnapshot.thermal` exclusively (owns no logic of its own) and also imports `BUILDING_THERMAL` / `BUILDING_THERMAL_REFERENCES` directly to render the constants and citations.
- **AI Prediction / What-If layer** (`src/lib/prediction/projection.ts` line 262, `src/lib/prediction/whatif/recommend.ts`) — calls the exported pure function `equilibriumThermalState()` (not the live engine) to project the same physics forward without touching engine state; `whatif/recommend.ts` reads `.coolingLoadKW` off the result and states the equilibrium/fixed-COP simplification in its `limitation` field.
- **`bootstrapDailyEnergy()`** (`src/lib/engine/dailyEnergyBootstrap.ts`) — indirectly, via `projectAt()` walking `equilibriumThermalState()` from midnight to reconstruct today's ledger.

Not yet a consumer: `EngineeringContextBuilder` (`src/lib/assistant/contextBuilder.ts`) does not currently read `SimSnapshot.thermal` at all (verified via Grep — no matches for `thermal`/`coolingLoadKW` in that file). See Design Rationale.

## Public API

From `src/lib/engine/buildingThermal.ts`:

```ts
export class BuildingThermalEngine {
  update(
    facadeOpenness: number,
    facadeSolarGainKW: number,
    outdoorTempC: number,
    irradianceWm2: number,
    dtSimSeconds: number,
  ): void
  getState(): BuildingThermalState
}

export function envelopeHeatGainKW(facadeSolarGainKW: number): number
export function convectiveFraction(facadeOpenness: number): number
export function indoorTemperatureProxy(outdoorTempC: number, indoorHeatGainKW: number, irradianceWm2: number): number
export function conditionedIndoorTemperatureC(coolingRequiredKW: number): number
export function coolingStatus(coolingRequiredKW: number, thermalLag: number): CoolingStatus
export function equilibriumThermalState(
  facadeOpenness: number,
  facadeSolarGainKW: number,
  outdoorTempC: number,
  irradianceWm2: number,
): BuildingThermalState

export const BUILDING_THERMAL: { /* the eleven constants above */ }
export const BUILDING_THERMAL_REFERENCES: readonly EngineeringReference[]
export interface EngineeringReference { id: string; citation: string; appliesTo: string; constantId: keyof typeof BUILDING_THERMAL }
export interface BuildingThermalState { /* see Outputs */ }
export type CoolingStatus = 'Standby' | 'Cooling' | 'Recovering' | 'Maintaining Setpoint'
```

## Live Outputs

`BuildingThermalState` fields, exactly as named in `buildingThermal.ts` (see Outputs table above for units/meaning): `facadeOpenness`, `outdoorTempC`, `facadeSolarGainKW`, `envelopeHeatGainKW`, `convectiveKW`, `radiantReleaseKW`, `indoorHeatGainKW`, `coolingRequiredKW`, `coolingLoadKW`, `indoorTemperatureProxy`, `conditionedIndoorTemperatureC`, `coolingStatus`, `thermalLag`. Published at `SimSnapshot.thermal`.

## Source Files

- `src/lib/engine/buildingThermal.ts` — the engine, its pure functions, constants and references.
- `src/lib/engine/simulation.ts` — instantiation, per-tick invocation, wiring into `BuildingEnergyEngine`, snapshot publication (lines 246, 279–280, 354–360, 385, 677).
- `src/lib/engine/metrics.ts` — upstream authority for `facadeSolarGainKW`.
- `src/components/twin3d/ui/BuildingThermalPanel.tsx` — dedicated read-only UI panel.
- `src/lib/prediction/projection.ts` — AI layer's equilibrium consumer.
- `src/lib/prediction/whatif/recommend.ts`, `src/lib/prediction/whatif/compare.ts` — What-If layer's use of the thermal chain in comparative studies.
- `src/lib/engine/dailyEnergyBootstrap.ts` — historical reconstruction via the same equilibrium path.

## Design Rationale

- **Why this engine exists at all**: per its own module header, before Stage 7.9 the façade and the BEMS were thermally independent — closing the blades changed only a façade-local comfort display, never real HVAC electrical demand. This engine "is what makes that connection physical instead of asserted."
- **Three authorities, three units** (module header): `facadeSolarGainKW`/`envelopeHeatGainKW`/`indoorHeatGainKW`/`coolingRequiredKW` are THERMAL kW; `coolingLoadKW` is ELECTRICAL kW (the only field `BuildingEnergyEngine` may add to its own electrical HVAC category); `conditionedIndoorTemperatureC` is a third, separate, display-only °C quantity. Keeping these separate prevents unit confusion propagating downstream.
- **Reuse, not re-derivation** (guide §6, §11.1): this engine never re-derives `facadeSolarGainKW` — it consumes `metrics.ts`'s output exactly as the AI Prediction layer does.
- **Subsystem boundary** (guide §6): thermal owns only the chain from solar gain to cooling electrical demand and comfort display; occupancy, lighting, equipment, elevators and services demand remain `BuildingEnergyEngine`'s.
- **Forward-compatible field separation**: `coolingRequiredKW` exists as a field distinct from `indoorHeatGainKW`, even though numerically identical today, purely so a future HVAC capacity cap has one place to apply itself without moving any UI label.
- **Determinism/performance**: one `BuildingThermalState` object allocated once and mutated in place — zero allocations in the hot path, matching `BuildingEnergyEngine`'s convention.
- **Gap in the knowledge base (Stage 7.10.2 — resolved)**: `src/lib/knowledge/subsystems.ts` still has no `BuildingThermal` entry in its `SubsystemId` union — that narrowness is a deliberate choice (`implementationIndex.ts`'s own header: widening the union "would ripple into the knowledge base, context builder and intent registry"), not an oversight, and this implementation doc plus `EXTRA_DOC_KEYWORDS` in `implementationIndex.ts` is how the Engineering Assistant reaches this subsystem instead. What WAS stale — the `BuildingEnergy` entry's `knownLimitations`/`futureExtensions` describing the façade/HVAC coupling as absent — has been corrected (Stage 7.10.2) to state the coupling as implemented, with the genuinely still-open gap (no HVAC capacity ceiling) in its place.

## Future Extension Points

- An HVAC capacity limit (`MAX_HVAC_CAPACITY_KW`-style constant) — explicitly designed for in the `coolingRequiredKW` field separation, not yet implemented.
- A dynamic COP curve responsive to part-load ratio or ambient wet-bulb, replacing the fixed `COOLING_PLANT_COP`.
- Multi-node thermal-mass modelling (beyond the single first-order lag).
- Registering `BuildingThermal` in `src/lib/knowledge/types.ts`'s `SubsystemId` union and adding a corresponding entry to `src/lib/knowledge/subsystems.ts`, and updating the stale `BuildingEnergy` entry's `knownLimitations`/`futureExtensions` to reflect that the thermal coupling is now implemented.
- Wiring `SimSnapshot.thermal` into `EngineeringContextBuilder` (`src/lib/assistant/contextBuilder.ts`), which currently does not read it at all.
