# BuildingLightingEngine

**Subsystem ID:** BuildingLighting (not yet in `src/lib/knowledge/types.ts` `SubsystemId` union — treat as a documented-but-not-yet-registered subsystem)
**Version:** 1.0.0
**Last updated:** 2026-08-06

## Purpose

`BuildingLightingEngine` (`src/lib/engine/buildingLighting.ts`, Stage 7.10) is the second subsystem of the Building Physics Layer, sibling to `BuildingThermalEngine` (Stage 7.9). Before Stage 7.10, "Lighting" was a single occupancy-only load in `BuildingEnergyEngine` — a fixed 8 W/m² whenever the building was occupied, blind to whether the sky outside was clear or the façade blades were open or shut. This engine gives the daylight-responsive share of that load the same daylight awareness Stage 7.9 gave HVAC:

```
Effective Solar Irradiance → Outdoor Illuminance → Envelope Visible Transmission →
Façade Openness → Indoor Illuminance → Daylight-Harvesting Controller →
Artificial Lighting Demand (electrical, occupancy-scaled)
```

## Responsibilities

- Convert the façade's effective irradiance (`BuildingMetrics.averageSolarExposure` — the SAME normalised quantity `facadeSolarGainKW` consumes, per `metrics.ts`) into estimated outdoor illuminance.
- Apply envelope visible transmission and façade openness to derive indoor illuminance.
- Run a proportional daylight-harvesting controller against a target illuminance, lagged through a first-order response time.
- Convert the controller's commanded level into artificial lighting electrical demand (kW), scaled by occupancy and by the daylight-responsive lighting circuit's rated capacity.
- Report energy savings versus a no-daylight-harvesting (always-on-when-occupied) baseline.
- Classify a plain-language lighting operating state.
- It owns only the daylight-responsive lighting share. It does **not** touch occupancy scheduling, HVAC, equipment, elevators or services demand — those remain `BuildingEnergyEngine`'s. It does not re-derive the façade's effective irradiance itself, and `occupancyFraction` is reused from `buildingEnergy.ts`, not reimplemented. `grossFloorArea` (also from `buildingEnergy.ts`) is the same floor-area authority the BEMS itself scales against.
- It has **no dependency on `BuildingThermalEngine`** and vice versa — see Design Rationale.

## Inputs

Passed positionally to `BuildingLightingEngine.update()`, called once per environmental tick from `Simulation.tick()`:

| Parameter | Type | Source |
|---|---|---|
| `avgExposure` | number, 0–1 | `BuildingMetrics.averageSolarExposure` (`metrics.ts`) — the same normalised effective-irradiance quantity `facadeSolarGainKW` consumes |
| `facadeOpenness` | number, 0–1 | `BuildingMetrics.averageOpenness` |
| `floorAreaM2` | number, m² | `BuildingEnergyEngine.getSnapshot().floorAreaM2` — the BEMS's own `grossFloorArea()` authority, not recomputed here |
| `timeHours` | number, 0–24 | Local simulated time of day (drives occupancy scheduling) |
| `dtSimSeconds` | number, simulated seconds | Shared `simSeconds` step, same value fed to `BuildingThermalEngine` and `BuildingEnergyEngine` that tick |

`dtSimSeconds <= 0` means "initialise": the lighting control level snaps straight to its target instead of integrating.

## Outputs

`BuildingLightingState` (from `getState()`), fields mutated in place on one persistent object:

| Field | Unit | Meaning |
|---|---|---|
| `facadeOpenness` | 0–1 | Passthrough of the input |
| `occupancy` | 0–1 | Passthrough, from `occupancyFraction(timeHours)` (`buildingEnergy.ts`) |
| `outdoorLux` | lux | Estimated outdoor illuminance from the façade's effective irradiance |
| `indoorLux` | lux | Estimated indoor illuminance after envelope transmission and façade openness |
| `targetLux` | lux | `BUILDING_LIGHTING.TARGET_INDOOR_LUX`, passthrough constant |
| `lightingLevel` | 0–1 | Lagged daylight-harvesting control level — 0 = daylight alone meets target, 1 = artificial lighting must supply all of it |
| `lightingElectricalKW` | **kW electrical** | Artificial lighting demand — the ONE value `BuildingEnergyEngine` adds to its Lighting category |
| `lightingSavingsKW` | kW | Savings vs. a no-daylight-harvesting baseline: `artificialRatedKW × occupancy − lightingElectricalKW` |
| `lightingStatus` | `LightingStatus` | `'Unoccupied' \| 'Fully Daylit' \| 'Daylight Harvesting' \| 'Full Artificial'` |
| `daylightContribution` | 0–1 | `1 − lightingLevel` |
| `artificialContribution` | 0–1 | `lightingLevel` |

## Internal Calculation Pipeline

Per `BuildingLightingEngine.update()` (`buildingLighting.ts` lines 305–339):

1. `outdoorLux = outdoorIlluminanceLux(avgExposure)`.
2. `indoorLux = indoorIlluminanceLux(outdoorLux, facadeOpenness)`.
3. `target = lightingControlTarget(indoorLux)` — instantaneous proportional-control demand before lag.
4. Exponential-approach lag: `alpha = dtSimSeconds > 0 ? 1 - exp(-dtSimSeconds / RESPONSE_TIME_SIM_SECONDS) : 1`; `lightingLevel += (target - lightingLevel) * alpha`. This persistent instance field (`this.lightingLevel`) is the engine's only carried state.
5. `occupancy = occupancyFraction(timeHours)` (imported from `buildingEnergy.ts`).
6. `artificialRatedKW = (ARTIFICIAL_LIGHTING_DENSITY_WM2 * floorAreaM2) / 1000`.
7. `occupiedRatedKW = artificialRatedKW * occupancy`.
8. `lightingElectricalKW = occupiedRatedKW * lightingLevel`.
9. `lightingSavingsKW = occupiedRatedKW - lightingElectricalKW`.
10. All fields written onto the single mutated `BuildingLightingState` object, including `lightingStatus = lightingStatus(lightingLevel, occupancy)`.

Note: unlike `BuildingThermalEngine`, this module exports no separate `equilibriumLightingState()` — see Limitations for the consequence.

## Engineering Equations

All transcribed verbatim from `src/lib/engine/buildingLighting.ts`:

```
outdoorIlluminanceLux(avgExposure) =
  max(0, avgExposure) * EXPOSURE_REFERENCE_WM2 * DAYLIGHT_LUMINOUS_EFFICACY_LM_PER_W

indoorIlluminanceLux(outdoorLux, facadeOpenness) =
  outdoorLux * VISIBLE_TRANSMISSION * clamp(facadeOpenness)

lightingControlTarget(indoorLux):
  raw = clamp(1 - indoorLux / TARGET_INDOOR_LUX, 0, 1)
  return raw > 0 ? max(raw, LIGHTING_CONTROL_MIN) : 0

alpha = dtSimSeconds > 0 ? 1 - exp(-dtSimSeconds / RESPONSE_TIME_SIM_SECONDS) : 1
lightingLevel += (target - lightingLevel) * alpha

artificialRatedKW = (ARTIFICIAL_LIGHTING_DENSITY_WM2 * floorAreaM2) / 1000
occupiedRatedKW   = artificialRatedKW * occupancy
lightingElectricalKW = occupiedRatedKW * lightingLevel
lightingSavingsKW    = occupiedRatedKW - lightingElectricalKW
```

`lightingStatus(lightingLevel, occupancy)`:
```
if occupancy < OCCUPIED_STATUS_THRESHOLD               → 'Unoccupied'
else if lightingLevel <= DAYLIT_STATUS_THRESHOLD         → 'Fully Daylit'
else if lightingLevel >= FULL_ARTIFICIAL_STATUS_THRESHOLD → 'Full Artificial'
else                                                      → 'Daylight Harvesting'
```

Note: `EXPOSURE_REFERENCE_WM2` (`1000`, the reference full-sun irradiance the 0–1 exposure scale is normalised against) is imported from `metrics.ts`, not redefined here — the same value `normalisedExposure()` uses.

## Constants

All from `BUILDING_LIGHTING` in `src/lib/engine/buildingLighting.ts`:

| Constant | Value | Meaning |
|---|---|---|
| `TARGET_INDOOR_LUX` | `500` | Target indoor illuminance the controller works to maintain |
| `VISIBLE_TRANSMISSION` | `0.6` | Fraction of outdoor daylight surviving the glazing assembly (visible transmittance, distinct from `GLAZING_SHGC`) |
| `DAYLIGHT_LUMINOUS_EFFICACY_LM_PER_W` | `110` | Conversion from effective solar irradiance (W/m²) to outdoor illuminance (lux) |
| `ARTIFICIAL_LIGHTING_DENSITY_WM2` | `5` | Rated power density of the daylight-responsive lighting circuit alone, W/m² |
| `LIGHTING_CONTROL_MIN` | `0.1` | Minimum commanded duty once any artificial lighting is needed |
| `RESPONSE_TIME_SIM_SECONDS` | `20` | First-order controller response time, simulated seconds |
| `DAYLIT_STATUS_THRESHOLD` | `0.02` | At/below this lagged level the space reads as fully daylit |
| `FULL_ARTIFICIAL_STATUS_THRESHOLD` | `0.98` | At/above this level daylight contributes nothing |
| `OCCUPIED_STATUS_THRESHOLD` | `0.05` | Below this occupancy the space reads as unoccupied regardless of daylight |

Related constant, imported (not owned) from `buildingEnergy.ts`: `LOAD_CATEGORIES`'s `'lighting'` entry — `peakDensity: 3` W/m² — is the complementary non-daylight-responsive share; `3 + 5 = 8` W/m², the original total office Lighting Power Density.

## Engineering References

Formalised in `BUILDING_LIGHTING_REFERENCES` (`buildingLighting.ts`):

| Reference | Applies to |
|---|---|
| EN 12464-1:2011 — Light and Lighting: Lighting of Work Places | `TARGET_INDOOR_LUX` |
| NFRC 200 — Visible transmittance rating practice for fenestration | `VISIBLE_TRANSMISSION` |
| CIE 108-1994 / IESNA Lighting Handbook — daylight luminous efficacy | `DAYLIGHT_LUMINOUS_EFFICACY_LM_PER_W` |
| ASHRAE 90.1 — Lighting Power Density allowance, daylight-responsive zone share | `ARTIFICIAL_LIGHTING_DENSITY_WM2` |
| IES RP-1 / common dimmable-driver datasheet practice — minimum stable dimming level | `LIGHTING_CONTROL_MIN` |

Code-cited, present verbatim in `BUILDING_LIGHTING_REFERENCES`. No reference is given for `RESPONSE_TIME_SIM_SECONDS` or the three status thresholds beyond the code comment's own reasoning ("a closed-loop photosensor dimming control responds in seconds to under a minute in reality"); treat any external citation for these as **inferred, not code-cited**.

## Assumptions

- Photosensor dimming control response is modelled as a single first-order lag with a 20-simulated-second time constant — much faster than the building's thermal mass, "far faster... without lagging behind a passing cloud the way the HVAC's 15-simulated-minute plant lag properly does" (module header).
- The daylight-responsive (`ARTIFICIAL_LIGHTING_DENSITY_WM2`, 5 W/m²) and non-daylight-responsive (`buildingEnergy.ts` `LOAD_CATEGORIES` `'lighting'`, 3 W/m²) shares are sized to sum back to the original 8 W/m² total office LPD at full occupancy with zero daylight (night) — "Stage 7.10 changes WHEN the peak is reached, not what it is" (module header).
- A dimmable LED driver's minimum stable dimming level (`LIGHTING_CONTROL_MIN = 0.1`) is applied once any artificial contribution is needed at all, to avoid commanding an unstable near-zero duty and to prevent chattering at the threshold; a fully daylit space (raw target = 0) is exempt from this floor.
- The engine is deterministic given its inputs modulo one carried state variable (`lightingLevel`).

## Limitations

- No `equilibriumLightingState()`-style pure function exists in `buildingLighting.ts` (unlike `buildingThermal.ts`'s `equilibriumThermalState()`). Confirmed by Grep: `src/lib/prediction/projection.ts` calls `buildingDemandKW(...)` with only four arguments (`floorAreaM2, atHours, hvacDemandFactor(...), thermal.coolingLoadKW`) — the fifth parameter, `artificialLightingKW`, is never supplied and defaults to `0`. **The AI Prediction and What-If layers therefore do not yet project daylight-harvesting lighting demand at all** — only the thermal/HVAC coupling was extended to the forward projection in Stage 7.9; the Stage 7.10 lighting coupling has not been. This is a genuine, currently-undocumented gap (not stated anywhere in CLAUDE.md §11.5's list of known modelling boundaries), surfaced here for the first time.
- `outdoorIlluminanceLux` denormalises `avgExposure` back to W/m² via a fixed `EXPOSURE_REFERENCE_WM2` and converts through a single fixed luminous efficacy (`110` lm/W) rather than a sky-condition-dependent value — real daylight luminous efficacy varies with cloud cover and solar altitude.
- The daylight-harvesting controller is a simple proportional law (`lightingControlTarget`), not a closed-loop PID or a real photosensor's non-linear dimming curve.
- `EngineeringContextBuilder` (`src/lib/assistant/contextBuilder.ts`) does not currently read `SimSnapshot.lighting` at all (verified via Grep — no matches for `lighting`/`lightingElectricalKW`).

## Dependencies

- Façade effective irradiance: `BuildingMetrics.averageSolarExposure` from `metrics.ts` (Adaptive Façade / Metrics Engine — not part of this doc batch), the SAME quantity `facadeSolarGainKW` consumes.
- Façade openness: `BuildingMetrics.averageOpenness` (Adaptive Façade).
- `occupancyFraction()` and `grossFloorArea()` / `floorAreaM2`: imported directly from [BuildingEnergy](./building_energy.md) (`buildingEnergy.ts`), reused rather than reimplemented.
- `EXPOSURE_REFERENCE_WM2`: imported directly from `metrics.ts`.
- **No dependency on [BuildingThermal](./building_thermal.md)** — by design (see Design Rationale).

## Consumers

Verified via `Grep` across `src/`:

- **`Simulation.tick()`** (`src/lib/engine/simulation.ts`) — calls `buildingLighting.update(...)` once per environmental tick (lines 366–372, plus a zero-`dt` seed call at line 280), then reads `buildingLighting.getState().lightingElectricalKW` and feeds it into `BuildingEnergyEngine.update()` as `artificialLightingKW` (lines 380–387).
- **`SimSnapshot.lighting`** — `simulation.ts` line 678 publishes `this.buildingLighting.getState()` onto the snapshot every poll.
- **`BuildingLightingPanel.tsx`** (`src/components/twin3d/ui/BuildingLightingPanel.tsx`) — the dedicated engineering UI panel; reads `SimSnapshot.lighting` exclusively (owns no logic, per its own header comment) and imports `BUILDING_LIGHTING` / `BUILDING_LIGHTING_REFERENCES` directly for its "Engineering Model & Calculations" section.

Not a consumer (verified absent): the AI Prediction layer (`src/lib/prediction/projection.ts`), the What-If layer (`src/lib/prediction/whatif/`), and `EngineeringContextBuilder` — see Limitations.

## Public API

From `src/lib/engine/buildingLighting.ts`:

```ts
export class BuildingLightingEngine {
  update(
    avgExposure: number,
    facadeOpenness: number,
    floorAreaM2: number,
    timeHours: number,
    dtSimSeconds: number,
  ): void
  getState(): BuildingLightingState
}

export function outdoorIlluminanceLux(avgExposure: number): number
export function indoorIlluminanceLux(outdoorLux: number, facadeOpenness: number): number
export function lightingControlTarget(indoorLux: number): number
export function lightingStatus(lightingLevel: number, occupancy: number): LightingStatus

export const BUILDING_LIGHTING: { /* the nine constants above */ }
export const BUILDING_LIGHTING_REFERENCES: readonly EngineeringReference[]
export interface EngineeringReference { id: string; citation: string; appliesTo: string; constantId: keyof typeof BUILDING_LIGHTING }
export interface BuildingLightingState { /* see Outputs */ }
export type LightingStatus = 'Unoccupied' | 'Fully Daylit' | 'Daylight Harvesting' | 'Full Artificial'
```

## Live Outputs

`BuildingLightingState` fields, exactly as named in `buildingLighting.ts` (see Outputs table above): `facadeOpenness`, `occupancy`, `outdoorLux`, `indoorLux`, `targetLux`, `lightingLevel`, `lightingElectricalKW`, `lightingSavingsKW`, `lightingStatus`, `daylightContribution`, `artificialContribution`. Published at `SimSnapshot.lighting`.

## Source Files

- `src/lib/engine/buildingLighting.ts` — the engine, its pure functions, constants and references.
- `src/lib/engine/simulation.ts` — instantiation, per-tick invocation, wiring into `BuildingEnergyEngine`, snapshot publication (lines 247, 280, 366–372, 386, 678).
- `src/lib/engine/metrics.ts` — upstream authority for `averageSolarExposure` / `EXPOSURE_REFERENCE_WM2`.
- `src/lib/engine/buildingEnergy.ts` — source of `occupancyFraction()` and `floorAreaM2` (via `BuildingEnergyEngine.getSnapshot()`), and owner of the complementary non-daylight-responsive `'lighting'` load category.
- `src/components/twin3d/ui/BuildingLightingPanel.tsx` — dedicated read-only UI panel.

## Design Rationale

- **Why this engine exists**: per its own module header, before Stage 7.10 "Lighting" in the BEMS was a single occupancy-only 8 W/m² load, "blind to whether the sky outside was clear or the blades were open or shut." This engine gives Lighting the same daylight awareness Stage 7.9 gave HVAC.
- **Why Base Lighting stayed in `BuildingEnergyEngine`** (module header, verbatim in substance): "Mirrors Stage 7.9's HVAC split exactly: `LOAD_CATEGORIES`'s own 'lighting' entry (`buildingEnergy.ts`) is the occupancy-driven, non-daylight-responsive share — egress, corridors, back-of-house — that a photosensor never dims. This engine owns the REMAINING, daylight-responsive share (`ARTIFICIAL_LIGHTING_DENSITY_WM2`), sized so the two sum back to the original 8 W/m² total office LPD at full occupancy with zero daylight (night) — Stage 7.10 changes WHEN the peak is reached, not what it is."
- **Why it is independent of `BuildingThermalEngine`** (CLAUDE.md §2, verbatim in substance): "Independently consumes façade information — neither this nor `BuildingThermalEngine` depends on the other." Both read the same `metrics.ts`-owned quantities (`averageSolarExposure`, `averageOpenness`) but neither reads the other's output; each is a separate sibling chain off the same façade state.
- **Reuse, not re-derivation** (guide §6, §11.1): occupancy and floor area are imported from `buildingEnergy.ts`; effective irradiance is imported from `metrics.ts`. Nothing here recomputes façade physics.
- **Determinism/performance**: one `BuildingLightingState` object allocated once and mutated in place — zero allocations in the hot path, matching `BuildingThermalEngine`'s convention.
- **Gap in the knowledge base**: `src/lib/knowledge/subsystems.ts` has no `BuildingLighting` entry, and `BuildingLighting` is absent from the `SubsystemId` union in `src/lib/knowledge/types.ts` (confirmed via Grep). This document exists in part to close that gap for the Engineering Assistant.

## Future Extension Points

- Extending the AI Prediction/What-If layer's `buildingDemandKW()` call in `projection.ts` to pass a projected `artificialLightingKW` (an `equilibriumLightingState()`-style function analogous to `equilibriumThermalState()` would need to be authored first) — currently the projection silently omits the lighting term entirely.
- A sky-condition-dependent daylight luminous efficacy, rather than the fixed `110` lm/W.
- A more realistic photosensor/dimming-driver response curve in place of the linear proportional controller.
- Registering `BuildingLighting` in `src/lib/knowledge/types.ts`'s `SubsystemId` union and adding a corresponding entry to `src/lib/knowledge/subsystems.ts`.
- Wiring `SimSnapshot.lighting` into `EngineeringContextBuilder` (`src/lib/assistant/contextBuilder.ts`), which currently does not read it at all.
