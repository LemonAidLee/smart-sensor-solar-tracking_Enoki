# Adaptive Façade — Geometry, Panel State Machine & Kinematic Actuation

**Subsystem ID:** AdaptiveFacade
**Version:** 1.0.0
**Last updated:** 2026-08-06

## Purpose

Documents `AdaptiveSkinEngine` (`src/lib/engine/adaptiveSkin.ts`), the façade module setting-out rules (`facadeModule.ts`), and the panel operational-state/rotation model (`panelStates.ts`) — the layer downstream of PBIF's decision. PBIF (see [PBIF](./pbif.md)) decides *what* the building should do and hands back a `PbifState`/target angle; this subsystem is what turns that into actual, physically-plausible blade motion: geometry-agnostic per-blade kinematics, self-occlusion/shading derivation, and the state machine that classifies a live angle back into a human-readable operational state. It does not make control decisions of its own — see [PBIF](./pbif.md) for the decision logic and [Cyber-Physical Pipeline](./cyber_physical_pipeline.md) for the sensor chain feeding it.

## Responsibilities

- Own the mechanical rotation model for a single blade: a 0°→180° sweep where flush-to-wall (0°/180°) is fully closed and perpendicular (90°) is fully open (`panelStates.ts`).
- Provide the sole mapping between high-level `PanelState`s (FULLY_OPEN, HEAVY_SHADING, STORM_LOCK, …) and concrete angles, and the inverse classification of a live angle back into a descriptive state (`STATE_ANGLE`, `describeAngle`).
- Drive every blade toward its resolved target rotation each tick, under one of two mutually-exclusive pipelines gated by `WEATHER_VALIDATION_MODE`: a full per-frame motor model with acceleration/deceleration/inertia (`updateFull`), or a simplified exponential-ease pipeline used while Weather Validation Mode is active (`updateValidation`).
- Compute each panel's derived optical/environmental state every tick: `openness`, `shading`, `solarExposure`, `surfaceTemperature`, `windLoad`, `rainExposure`, `powerConsumption`.
- Own the façade module setting-out arithmetic (`facadeModule.ts`): how many panels fit an elevation, what each panel's actual dimensions are, and the resulting layout summary — the single authority the Geometry Engine and the Engineering UI both read from.
- Expose the control API (`setPanelState`, `setPanelRotation`, `setSurfaceState`, `setSurfaceRotation`, whole-façade programs) that every external driver (manual UI, PBIF via `facadeControlMode`, VEC) ultimately goes through.

## Inputs

`AdaptiveSkinEngine.update(cfg, sun, weather, solarPhysics, virtualSensor, dt, resolve)`:
- `cfg: BuildingConfig` (only used by `rebuild()`, not per-tick `update`).
- `sun: SunState`, `weather: WeatherState`.
- `solarPhysics: SolarPhysicsEngine` — read via `getModuleEffectiveIrradiance(id)` and `getModuleIncidentAngle(id)`.
- `virtualSensor: VirtualSensorEngine` — read via `getGlobalFilteredADC()` for PBIF's `solarADC` (validation mode only).
- `dt: number`, `resolve: boolean` (whether this tick runs the expensive environmental tier or only the cheap per-frame ease).

Control inputs: `facadeControlMode: FacadeControlMode` (`manual`/`sun-tracking`/`pbif`), `manualRotation`, `trackingIntent: Intent`, plus the override maps (`panelStateOverride`, `panelRotationOverride`, `surfaceStateOverride`, `surfaceRotationOverride`) written by `setPanelState`/`setPanelRotation`/etc.

## Outputs

- Mutated `FacadePanel[]` state (via `BuildingSurface[]`) — `rotationAngle`, `targetRotation`, `commandedRotation`, `state`, `openness`, `shading`, `openingPercentage`, `solarExposure`, `irradiance`, `incidentAngle`, `surfaceTemperature`, `windLoad`, `rainExposure`, `powerConsumption`, `movementState`, `movementDuration`, `rotationVelocity`.
- `SurfaceMetrics` / `BuildingMetrics` (via `getSurfaceMetrics`/`getBuildingMetrics`, delegating to `metrics.ts`'s `computeSurfaceMetrics`/`computeBuildingMetrics`).
- `SurfaceSummary[]` (via `getSurfaceSummaries`) — per-surface averages plus `dominantState`.
- `PbifEvaluation | null` (via `getPbifEvaluation()`) — cached, computed by [PBIF](./pbif.md), re-exposed here since PBIF is invoked from inside this engine's tick.
- `FacadeLayoutSummary` (via `getFacadeLayout()`) — panel counts, module dimensions, façade/envelope area, measured from the actually-generated `BuildingSurface[]`.

## Internal Calculation Pipeline

**Blade angle → optical state** (`panelStates.ts`, pure functions, geometry-agnostic):
```
shadingFromAngle(θ)   = |cos(θ)|
opennessFromAngle(θ)  = 1 - shadingFromAngle(θ)
angleForOpenness(o)   = acos(clamp(1 - clamp(o, 0, 1), 0, 1))     // inverse, near side 0–90°
describeAngle(θ)      = openness>0.9 ? FULLY_OPEN
                       : openness>0.42 ? PARTIAL_SHADING
                       : openness>0.12 ? HEAVY_SHADING
                       : FULLY_CLOSED
```

**Per-tick dispatch** (`AdaptiveSkinEngine.update`): if `WEATHER_VALIDATION_MODE` (currently `true`, `src/lib/engine/validationMode.ts`), run `updateValidation`; otherwise run `updateFull`. These are two structurally different pipelines, not two configurations of one pipeline.

**`updateValidation`** (the currently-active path):
1. On a `resolve` frame only: cache `sun`/`weather`, transform the world solar vector into the building's local frame (`transformSolarVector`), and run `evaluatePbif(...)` once for the whole building (see [PBIF](./pbif.md)) — cached as `this.pbifEvaluation`.
2. Per surface, on a `resolve` frame: resolve **one** target rotation shared by every panel on that surface (co-planar blades move together) via `resolveTargetRotation(facadeControlMode, {...})` (`facadeControl.ts`) — the single switch between `'manual'` (slider, shortest 360° path via `nearestCongruent`), `'sun-tracking'` (pure `solveForNormal`), and `'pbif'` (routes through [PBIF](./pbif.md)'s `resolveTarget`).
3. Per panel, on a `resolve` frame: run `physics()` (below) and store `targetRotation = commandedRotation = target`.
4. **Every** frame (resolve or not): ease `rotationAngle` toward the stored `targetRotation` by `rotationAngle += remaining * min(1, step * TARGET_EASE_RATE)` where `remaining = target - rotationAngle` and `TARGET_EASE_RATE = 2.4`. If `|remaining| <= SERVO_SETTLED_DEG` (0.5°, imported from `embedded/servo.ts`), the panel snaps exactly to target once and thereafter its derived state (`describeAngle`, `opennessFromAngle`, `shadingFromAngle`) is **not recomputed** while settled — an explicit optimisation so `FacadeLayer`'s renderer can detect "nothing changed" and skip per-panel GPU buffer uploads.
5. `movementState`/`movementDuration`/`rotationVelocity` are hardcoded to `idle`/`0`/`0` in this pipeline — no motor dynamics are modelled while validation mode is active.

**`updateFull`** (non-validation, currently dormant while `WEATHER_VALIDATION_MODE = true`): per panel, per frame — `physics()`, then `resolveTarget()` (checks per-panel/per-surface overrides, then the whole-façade program: `manual`/`solar-tracking`/`maintenance`/`storm`/`privacy`/`auto`), then a mechanical-delay smoothing of `commandedRotation` toward `targetRotation` staggered by row (`ROW_LAG = 0.34s` per full row-depth, `+0.012s` per column mod 4 — a top-down cascade), then `servo()` — a real acceleration/braking motor model (see Engineering Equations).

**`physics()`** (shared by both pipelines, per panel):
```
hFrac = 1 - (row + 0.5) / rows
windward = max(0, -dot(panel.normal, weather.windVector))
effectiveIrradiance = solarPhysics.getModuleEffectiveIrradiance(panel.id)
exposure = normalisedExposure(effectiveIrradiance)          // metrics.ts, clamp(irr/1000)
panel.incidentAngle = solarPhysics.getModuleIncidentAngle(panel.id)
panel.solarExposure = exposure
panel.irradiance = effectiveIrradiance
panel.surfaceTemperature = round((weather.temperature + exposure*(10 + shading*8)) * 10) / 10
panel.windLoad = clamp(windward * weather.windStrength * (0.5 + 0.5*hFrac))
panel.rainExposure = clamp(weather.rainIntensity * (0.35 + 0.65*windward) * (0.5 + 0.5*hFrac))
```

**Façade module setting-out** (`facadeModule.ts`, run once per `rebuild()`, never per frame):
```
moduleColumnsForEdge(edgeLength) = clamp(round(edgeLength / 1.2), 1, 64)
moduleRowsPerFloor(floorToFloor) = clamp(round(floorToFloor / 1.26), 1, 6)
facadeRowCount(cfg) = moduleRowsPerFloor(height/floorCount) * floorCount
```
Rounding (not flooring) per elevation is what makes the four independently-set-out elevations sum to the documented 108 columns × 3 rows × 5 storeys = 1,620 panels (see the module's own worked derivation: 25 m→21 bays, 40 m→33 bays, 3.8 m→3 rows, each ≤1% off the 1.2 m/1.26 m nominal module).

## Engineering Equations

| Quantity | Equation | Source |
|---|---|---|
| Blade shading | `shading = \|cos(θ)\|` | `panelStates.ts:80` |
| Blade openness | `openness = 1 - \|cos(θ)\|` | `panelStates.ts:85` |
| Openness → angle (near side) | `θ = acos(clamp(1-openness, 0, 1))` | `panelStates.ts:93` |
| Validation-mode ease | `angle += (target - angle) * min(1, step * 2.4)` | `adaptiveSkin.ts:419` (`TARGET_EASE_RATE = 2.4`) |
| Full-mode command smoothing | `commanded += (target - commanded) * min(1, step / delay)`, `delay = 0.2 + rowFrac*0.34 + (col%4)*0.012` | `adaptiveSkin.ts:456-457` |
| Full-mode braking speed | `brakeSpeed = sqrt(2 * accel * \|err\|)` | `adaptiveSkin.ts:612` |
| Full-mode desired velocity | `desired = sign(err) * min(speedCap, brakeSpeed)` | `adaptiveSkin.ts:613` |
| Full-mode velocity integration | `Δv = clamp(desired - velocity, -accel*dt, accel*dt)`; `velocity += Δv`; `angle += velocity*dt` | `adaptiveSkin.ts:614-616` |
| Surface temperature | `T = round((T_air + exposure*(10 + shading*8)) * 10)/10` | `adaptiveSkin.ts:499` |
| Wind load | `windLoad = clamp(windward * windStrength * (0.5+0.5*hFrac))` | `adaptiveSkin.ts:500` |
| Rain exposure | `rainExposure = clamp(rainIntensity * (0.35+0.65*windward) * (0.5+0.5*hFrac))` | `adaptiveSkin.ts:501` |
| Solar-track openness target (auto/solar-tracking programs) | `demand = clamp(exposure*0.9 + tempFactor*0.3 - cloud*0.4)`; `opennessTarget = 1 - demand*0.72` | `adaptiveSkin.ts:586-589` |
| Module column count | `cols = clamp(round(edge/1.2), 1, 64)` | `facadeModule.ts:82` |
| Module row count | `rows = clamp(round(floorToFloor/1.26), 1, 6)` | `facadeModule.ts:87` |

## Constants

| Constant | Value | File |
|---|---|---|
| `ROTATION_MIN` / `ROTATION_MAX` | 0° / 180° | `panelStates.ts` |
| `ANGLE_FULLY_OPEN` | 90° | `panelStates.ts` |
| `STATE_ANGLE[FULLY_OPEN]` | 90° | `panelStates.ts` |
| `STATE_ANGLE[PARTIAL_SHADING]` | 60° | `panelStates.ts` |
| `STATE_ANGLE[HEAVY_SHADING]` | 45° | `panelStates.ts` |
| `STATE_ANGLE[FULLY_CLOSED]` / `[STORM_LOCK]` | 0° | `panelStates.ts` |
| `STATE_ANGLE[PRIVACY_MODE]` | 180° | `panelStates.ts` |
| `STATE_ANGLE[MAINTENANCE]` | 90° | `panelStates.ts` |
| `STATE_ANGLE[RAIN_PROTECTION]` | 135° | `panelStates.ts` |
| `describeAngle` bands | openness > 0.9 / 0.42 / 0.12 | `panelStates.ts:103-105` |
| `TARGET_EASE_RATE` | 2.4 s⁻¹ | `adaptiveSkin.ts` |
| `MAX_SPEED` | 58 °/s | `adaptiveSkin.ts` (full-mode motor cap) |
| `MECHANICAL_DELAY` | 0.2 s | `adaptiveSkin.ts` |
| `ROW_LAG` | 0.34 s | `adaptiveSkin.ts` |
| `WAVE_DURATION` | 6 s | `adaptiveSkin.ts` |
| `SERVO_SETTLED_DEG` | 0.5° | `embedded/servo.ts` (imported, not redefined) |
| `NOMINAL_MODULE_WIDTH_M` | 1.2 m | `facadeModule.ts` |
| `NOMINAL_MODULE_HEIGHT_M` | 1.26 m | `facadeModule.ts` |
| `NOMINAL_FLOOR_TO_FLOOR_M` | 3.8 m | `facadeModule.ts` |
| `MAX_COLUMNS_PER_EDGE` | 64 | `facadeModule.ts` (safety guard, never binds at spec) |
| `MAX_ROWS_PER_FLOOR` | 6 | `facadeModule.ts` (safety guard, never binds at spec) |
| `EXPOSURE_REFERENCE_WM2` | 1000 W/m² | `metrics.ts` (used by `normalisedExposure`) |

## Engineering References

- No external structural/actuator-torque standard is cited for the motor model (`MAX_SPEED`, accel/decel) — presented as an engineering-plausible kinetic-façade motor envelope, not a datasheet-derived figure.
- The 1.2 m × 1.26 m nominal module and 108-column/3-row/1,620-panel case-study figures come from the project's own Comprehensive Project Summary, reconciled against real curtain-wall setting-out practice in `facadeModule.ts`'s header derivation.
- `normalisedExposure` / `facadeSolarGainKW` (in `metrics.ts`) are the single source of the façade's thermal-gain physics per CLAUDE.md §11.5 — reused unchanged by the AI Prediction and What-If layers.

## Assumptions

- **`FacadePanel.solarExposure` is normalised irradiance (`clamp(irradiance/1000)`), not the geometric cosine of incidence** — CLAUDE.md §11.5 states this explicitly, and `metrics.ts`'s `normalisedExposure` doc comment confirms it: "emphatically NOT the geometric cosine projection: it carries the cloud attenuation with it, so a metric fed a bare cosine would be blind to the weather." Every metric that consumes exposure (thermal gain, daylight, surface temperature) inherits this weather-aware behaviour.
- Blades are treated as flat, single-DOF (rotation about one vertical mounting axis only) with two optically-equivalent flush positions at 0° and 180°.
- Diffuse light is implicitly isotropic — `physics()` derives `surfaceTemperature`/exposure purely from the already-computed effective irradiance, with no separate diffuse-sky term of its own (that decomposition lives upstream in `SolarPhysicsEngine`).
- In `updateValidation`, `panelStateOverride`/`panelRotationOverride`/`surfaceStateOverride`/`surfaceRotationOverride` are **not consulted** — see Limitations.

## Limitations

- **Per-panel and per-surface overrides (`setPanelRotation`, `setPanelState`, `setSurfaceRotation`, `setSurfaceState`) have no effect while `WEATHER_VALIDATION_MODE = true`.** `updateValidation()`'s target-resolution block calls only `resolveTargetRotation(facadeControlMode, ...)` — it never reads `panelRotationOverride`/`panelStateOverride`/`surfaceRotationOverride`/`surfaceStateOverride`, unlike `updateFull()`'s `resolveTarget()`, which checks them first, before falling back to the whole-façade program. Any caller that sets an override while validation mode is active (including the VEC actuator layer, see [Cyber-Physical Pipeline](./cyber_physical_pipeline.md)) writes to a map that is silently never read. This is verified directly in the code, not merely inferred.
- **Two structurally different façade-control pipelines coexist behind one boolean** (`WEATHER_VALIDATION_MODE`) rather than one implementation with two configurations — `ENGINEERING_DESIGN_REVIEW.md`'s own audit calls this out as a weaker point of an otherwise modular control layer. `updateFull`'s real acceleration/braking motor model, whole-façade programs (`auto`/`solar-tracking`/`maintenance`/`storm`/`privacy`), wave animation, and health-status handling (`offline`/`fault` freezing a blade) are all present in the code but dormant while validation mode is on.
- (Stage 7.10.2 — resolved) Façade thermal gain feeding the HVAC electrical load *is* coupled via `BuildingThermalEngine` per CLAUDE.md §11.5; the `AdaptiveFacade` entry in `src/lib/knowledge/subsystems.ts` previously described this as uncoupled and has been corrected.
- (Stage 7.10.2, then reverted by explicit operator request) `AdaptiveSkinEngine`'s constructor briefly set `facadeControlMode` (the field `resolveTargetRotation` actually switches on) to `'manual'` for `WEATHER_VALIDATION_MODE`, to match `validationMode.ts`'s then-documented "boots without PBIF" claim (`ENGINEERING_DESIGN_REVIEW.md` §5/§11 finding). The product decision was then made the other way: PBIF should be the default façade-control source in every mode, including Weather Validation Mode. The constructor now leaves `facadeControlMode` at its class-field default (`'pbif'`) unconditionally and only forces the separate render `program` to `'manual'`; `validationMode.ts` documents this current behaviour.
- No mechanical backlash, gear wear, or dynamic wind-loading torque is modelled in the `updateFull` motor (self-consistent with `src/lib/knowledge/subsystems.ts`'s `ServoKinematics` entry, which discloses the same gap).
- Rooftop-array self-shading and diffuse-sky fraction simplifications are owned by `SolarPhysicsEngine`, not this subsystem, but propagate into `physics()`'s inputs unchanged.

## Dependencies

- `SolarPhysicsEngine` — `getModuleEffectiveIrradiance(id)`, `getModuleIncidentAngle(id)` (Solar Physics; not in this batch).
- `VirtualSensorEngine.getGlobalFilteredADC()` — see [Cyber-Physical Pipeline](./cyber_physical_pipeline.md).
- [PBIF](./pbif.md) — `evaluatePbif()`, `resolveTarget` (via `facadeControl.ts`'s `resolveTargetRotation`).
- `@/lib/kinematics` — `solveForNormal`, `nearestCongruent`, `solarVector`, `transformSolarVector` (Solar Kinematics solver; not in this batch).
- `metrics.ts` — `normalisedExposure`, `computeSurfaceMetrics`, `computeBuildingMetrics` (co-located in `src/lib/engine`, documented here only where directly consumed).
- `geometry.ts` — `generateSurfaces(cfg)`, the geometry engine that produces `BuildingSurface[]` from `BuildingConfig` (not in this batch).
- `embedded/servo.ts` — `SERVO_SETTLED_DEG` (imported, not redefined — CLAUDE.md §5.2's single-source rule).

## Consumers

- `src/lib/engine/simulation.ts` — owns the `AdaptiveSkinEngine` instance (`sim.skin`), calls `update()` every tick.
- `src/lib/engine/store.ts` — the Zustand store wiring UI controls to `sim.skin`'s control API.
- `src/components/twin3d/FacadeLayer.tsx` — the InstancedMesh renderer consuming `getAllPanels()`'s per-panel transforms, and relying on the "settled panel skip" optimisation in `updateValidation`.
- `src/lib/engine/scenario.ts` — whole-building presets that call façade programs (returns control to Manual per CLAUDE.md §5.3).
- `src/components/twin3d/ui/PbifPanel.tsx`, `ui/CyberPhysicalPipeline.tsx` — read `getPbifEvaluation()` and panel angles for the decision/pipeline UI.
- `src/components/twin3d/KinematicsDebug.tsx`, `CurtainWall.tsx`, `BuildingMesh.tsx`, `ActiveSurfaceHighlight.tsx` — read surface/panel geometry.
- `src/lib/embedded/index.ts` / `panel.ts` — read `FacadePanel.rotationAngle`/`.targetRotation`/`.solarExposure` for the embedded explainability layer (see [Cyber-Physical Pipeline](./cyber_physical_pipeline.md)).
- `src/lib/vec/sensorLayer.ts` / `actuatorLayer.ts` — read Panel 0's `solarExposure`/`normal`, and write `rotationAngle` via `setPanelRotation` (subject to the Limitations note above).
- `src/lib/assistant/contextBuilder.ts` — reads façade/panel state for the AI engineering context.
- `src/lib/prediction/*` (`projection.ts`, `insights.ts`, `whatif/compare.ts`) — reuse `normalisedExposure`/`facadeSolarGainKW`/`facadeDaylightPercent` from `metrics.ts` per CLAUDE.md §11.1's "re-use, never re-implement" rule.
- `src/components/twin3d/ui/ControlDeck.tsx` — imports `panelStates.ts` and `facadeModule.ts` for manual control UI.

## Public API

**`AdaptiveSkinEngine`** (`src/lib/engine/adaptiveSkin.ts`)
- `rebuild(cfg: BuildingConfig): void`
- `getFacadeLayout(): FacadeLayoutSummary`
- `setPanelState(panelId: string, state: PanelState): void` / `setPanelRotation(panelId: string, angle: number): void` / `clearPanelOverride(panelId: string): void`
- `setSurfaceState(surfaceId: string, state: PanelState): void` / `setSurfaceRotation(surfaceId: string, angle: number): void` / `clearSurfaceOverride(surfaceId: string): void`
- `setMode(program: SkinMode): void` / `getMode(): SkinMode`
- `setManualRotation(angle: number): void` / `getManualRotation(): number`
- `setFacadeControlMode(mode: FacadeControlMode): void` / `getFacadeControlMode(): FacadeControlMode`
- `setTrackingIntent(intent: Intent): void` / `getTrackingIntent(): Intent`
- `getPbifEvaluation(): PbifEvaluation | null`
- `openAll()` / `closeAll()` / `solarTracking()` / `maintenanceMode()` / `stormMode()` / `privacyMode()` / `triggerWave()` / `reset()` / `setPowerLoss(fraction: number): void`
- `getSurface(id)` / `getAllSurfaces()` / `getPanel(id)` / `getAllPanels()` / `getSurfaceMetrics(id)` / `getBuildingMetrics()` / `getSurfaceSummaries()`
- `update(cfg, sun, weather, solarPhysics, virtualSensor, dt, resolve?): void`

**`panelStates.ts`**
- `shadingFromAngle(angle)`, `opennessFromAngle(angle)`, `angleForOpenness(openness)`, `describeAngle(angle): PanelState`

**`facadeModule.ts`**
- `moduleColumnsForEdge(edgeLength)`, `moduleRowsPerFloor(floorToFloor)`, `floorToFloorHeight(cfg)`, `facadeRowCount(cfg)`, `floorForRow(row, cfg)`, `summariseFacadeLayout(surfaces, cfg): FacadeLayoutSummary`

## Live Outputs

- `FacadePanel { id, surfaceId, row, column, floor, worldPosition, normal, width, height, state, rotationAngle, targetRotation, commandedRotation, rotationVelocity, rotationAcceleration, rotationLimits, movementDuration, movementState, openness, shading, openingPercentage, incidentAngle, solarExposure, irradiance, surfaceTemperature, windLoad, rainExposure, powerConsumption, healthStatus }`
- `SurfaceSummary { id, name, averageSolarExposure, averagePanelAngle, averageOpenness, dominantState }`
- `SurfaceMetrics` / `BuildingMetrics` — see `metrics.ts` (aggregated cooling load, energy saving, comfort score, daylight %, etc.)
- `FacadeLayoutSummary { storeys, floorToFloor, rowsPerFloor, totalRows, columnsPerRing, panelsPerFloor, totalPanels, facadeArea, envelopeArea, perimeter, moduleWidth: [min,max], moduleHeight, surfaceCount }`

## Source Files

- `src/lib/engine/adaptiveSkin.ts`
- `src/lib/engine/panelStates.ts`
- `src/lib/engine/facadeModule.ts`
- `src/lib/engine/facadeControl.ts` (the target-rotation source switch)
- `src/lib/engine/metrics.ts` (façade thermal/daylight metrics, co-owned)
- `src/lib/engine/validationMode.ts` (`WEATHER_VALIDATION_MODE` gate)

## Design Rationale

- The engine is explicitly **geometry-agnostic**: `physics()` and the rotation model use only surface normals and dot products against environmental vectors, never asking "is this the north façade?" — per the module header, "the same engine therefore runs unchanged on a box, a triangle, a hexagon, a cylinder, an L-shape or a future imported polygon."
- The "settled panel" skip in `updateValidation` (snap-then-skip rather than asymptotically approach forever) is deliberately engineered to make `FacadeLayer`'s per-panel render-skip optimisation *stable* — a panel that never quite reaches its target would re-trigger a GPU upload every frame forever.
- `facadeModule.ts` resolves a real discrepancy between the project report's continuous-perimeter panel count (324/floor from treating the building as one 130 m ring) and what four independently-set-out elevations actually produce (318/floor) by adjusting each elevation's actual module width ≤1% from nominal — the same technique real curtain-wall packages use, documented rather than silently patched.
- `ROW_LAG` and per-column jitter in `updateFull`'s command smoothing exist purely for visual cohesion — "so motion cascades top→bottom" like a real kinetic skin, not because of any structural/control requirement.

## Future Extension Points

- Unify `updateFull` and `updateValidation` into one pipeline with configuration flags, addressing the `ENGINEERING_DESIGN_REVIEW.md`-flagged structural duplication.
- Extend override support (`panelRotationOverride` etc.) into `updateValidation`, or explicitly retire per-panel overrides while validation mode is active, so the two pipelines' capabilities do not silently diverge.
- Model mechanical backlash, gear wear, and dynamic wind-loading torque in the `updateFull` motor model (self-disclosed gap, shared with `ServoKinematics` in the knowledge base).
- `src/lib/knowledge/subsystems.ts`'s `AdaptiveFacade` entry's "future extension" (thermal-gain/HVAC coupling) is understood to have already shipped via `BuildingThermalEngine` per CLAUDE.md §11.5 — the knowledge-base text should be updated to match.
