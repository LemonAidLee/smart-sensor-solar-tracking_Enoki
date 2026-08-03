# SOLIS AI — Claude Onboarding Document

## Purpose

This file is the primary onboarding document for AI coding assistants.

Read this file first.

Do NOT read:

- PBIF_ENGINEERING_GUIDE.md
- walkthrough.md

unless one of the following applies:

1. You are modifying a core engineering algorithm.
2. You require mathematical derivations not summarized here.
3. The user explicitly instructs you to consult them.

For normal implementation tasks, this file contains sufficient architectural context.

## 1. Project Overview

SOLIS AI is a comprehensive digital twin for an adaptive façade. It integrates an embedded ESP32 simulation running a Cyber-Physical Pipeline, alongside a Rooftop PV System and a Building Energy Management System, to evaluate and optimize physical interactions with environmental data.

## 2. Current Architecture

- **WeatherScenarioEngine**: Owns the weather timelines and interpolates the environmental drivers over simulated time. The only authority that produces the current weather whenever the operator is not driving it by hand — it plays back a built-in scenario or a live forecast identically, and does not care which.
- **LiveForecastEngine**: Fetches, caches and converts real hourly forecast data into a `WeatherKeyframe[]` timeline, which it supplies to the WeatherScenarioEngine. It never writes weather itself.
- **ForecastProvider**: The interface the LiveForecastEngine fetches through (`OpenMeteoProvider` today). Swapping services touches nothing else.
- **SolarPhysicsEngine**: Computes astronomical sun position, clear-sky irradiance, and incident vectors.
- **VirtualSensorEngine**: Models physical LDR components, electrical noise, and realistic sensor outputs based on raw irradiance.
- **PBIF**: The Predictive Building Intelligence Framework; evaluates physical state against building objectives.
- **AdaptiveSkinEngine**: Solves physical kinematics for the façade panels and manages structural panel state.
- **PVElectricalEngine**: Maps solar irradiance into DC electrical output array string currents.
- **PVInverterEngine**: Models power electronics to convert DC into usable AC power with clipping.
- **BuildingEnergyEngine**: Simulates dynamic building load and thermal demand.
- **BatteryEnergyEngine**: Handles charging, discharging, and storage of excess AC power.
- **GridEnergyEngine**: Models the interaction between building demand, PV supply, and utility power grid.
- **EnergyLedger**: Centralized energy accounting and tracking over time.
- **PredictionEngine**: The AI Prediction Layer (§11). A read-only *observer* that projects the twin forward and explains it. It controls nothing.
- **WhatIfEngine**: The AI What-If Analysis layer (§11). Evaluates hypothetical alternatives in a throwaway sandbox and compares them against the live twin. It controls nothing and runs only on command.
- **FaultDetectionEngine**: The AI Fault Detection & Diagnosis layer (§11). A read-only *monitor* that re-derives each subsystem's expected behaviour from published values and reports where the twin agrees or disagrees with its own physics. It detects, it never actuates, and it never fabricates a finding.
- **EngineeringKnowledgeBase**: A static, read-only documentation subsystem that organizes engineering concepts, assumptions, and subsystem relationships for future AI assistants. It never modifies or reads simulation state.
- **EngineeringContextBuilder**: A read-only subsystem that transforms live simulation snapshots into human-readable engineering summaries based on a strict schema. It bridges the Digital Twin state to future AI assistants.
- **EngineeringReasoningEngine**: A read-only deterministic graph-traversal layer that sits between the knowledge base and the context builder. It fuses static architecture intent with live context to produce structured, logical explanations for cause, effect, and state.
- **Simulation**: The master loop that orchestrates all engines and steps time forward synchronously.

## 3. Simulation Flow

Environment
↓
Forecast Provider → Live Forecast Engine (Forecast Mode only)
↓
Weather Scenario Engine
↓
Solar Physics
↓
Virtual Sensors
↓
PBIF
↓
Servo
↓
Adaptive Façade
↓
PV System
↓
Inverter
↓
Building Energy
↓
Battery
↓
Utility Grid

## 4. UI Structure

**Left Panels:**

- Building
- Site
- Weather
- Skin
- Embedded Controller

**Right Panels:**

- Environmental Conditions
- PBIF
- Rooftop PV
- Cyber-Physical Pipeline
- AI Prediction
- AI What-If Analysis
   *Note: All right-side floating panels share a standardized `glass-panel` UI token that provides higher background opacity (0.96) for guaranteed readability over the 3D scene.*

## 5. Cyber-Physical Pipeline

1. Environment
2. Sensor
3. Embedded Controller
4. Servo
5. Adaptive Façade
   *Note: Weather influences feed into the pipeline as modifiers without replacing the primary solar energy flow. The Cyber-Physical Pipeline is now the primary engineering visualization, integrating Solar Geometry and Panel Kinematics within its stages rather than presenting them as standalone panels.*

### 5.1 Demonstration Sensor Hardware — Four-LDR Array

The demonstration hardware presents a **four-LDR quadrant array** on the instrumented façade module, mapped to four analog channels:

| Presented channel | Pin  | Internal source |
| ----------------- | ---- | --------------- |
| LDR Top Left      | ADC0 | `ldrUpper`      |
| LDR Top Right     | ADC1 | `ldrUpper`      |
| LDR Bottom Left   | ADC2 | `ldrLower`      |
| LDR Bottom Right  | ADC3 | `ldrLower`      |

This is a **presentation-layer configuration only**. Internally the simulation still models exactly **two** light channels — `ldrUpper` and `ldrLower` (`src/lib/embedded/sensors.ts`) — and the four presented channels reuse them for demonstration purposes: the top pair always reads identically, as does the bottom pair. No averaging, no extra physics and no decision logic is introduced; the four channels are re-labelled views of the two real ones, derived in `src/components/embedded/ldrQuadrants.ts`.

Because ADC0–ADC3 are reserved for the array, the Wind and Rain channels are *displayed* on ADC4/ADC5 — likewise presentation-only, with `sensors.ts` still owning the canonical labels.

VirtualSensorEngine, SolarPhysicsEngine, PBIF and AdaptiveSkinEngine are unaffected by this configuration.

## 5.2 Canonical Rotation Terminology

The Engineering UI exposes exactly **three** rotation quantities. These are the canonical labels and they are used **everywhere** — Cyber-Physical Pipeline, Virtual Embedded Controller, Solar Telemetry, Kinematics Inspector, PBIF panel, Metrics HUD. The same quantity must never appear under a second name.

| Canonical label        | Meaning                                                 | Source value              | Replaces                                                     |
| ---------------------- | ------------------------------------------------------- | ------------------------- | ------------------------------------------------------------ |
| **Current Blade Angle** | Where the façade blade physically is right now          | `FacadePanel.rotationAngle` | "World Rotation", "Current Panel Angle", "Servo Position", "Servo angle" |
| **Target Blade Angle**  | Where the controller wants the blade to go              | `FacadePanel.targetRotation` | "Commanded Rotation", "Target Motor Angle", "PBIF Angle", "Final Panel Rotation" |
| **Servo Status**        | Plain language for what the motor is doing — "Moving to target" / "Holding position", with progress and remaining travel | derived | "Servo Command" + "Servo Position" shown side by side |

**Advanced Servo Diagnostics** is the canonical name of the collapsible section that holds every low-level actuator value. Nothing is deleted — world rotation (target/current), servo command, servo position and PWM output are all preserved there, just no longer permanently visible.

Rules:

- The single source of these labels and of the formatting is `src/lib/dt/bladeAngle.ts` (`BLADE_LABEL`, `formatBladeAngle`, `describeBladeMotion`). Import them; never retype the strings.
- All angles are presented wrapped to 0–360° and rounded. The unbounded kinematic value (e.g. −735°) is engineering detail and appears only under Advanced Servo Diagnostics.
- `SERVO_SETTLED_DEG` (`src/lib/embedded/servo.ts`) is the one definition of "settled vs moving", shared by `ServoState.moving` and every Servo Status readout.
- Prefer explaining **why** over showing another number: pair Target Blade Angle with the reason PBIF already computed, and Current Blade Angle with "Moving toward target" / "Already aligned".
- This is a presentation layer only. It reads values the engines produced; it performs no kinematics, servo or PBIF logic.

## 5.3 Weather Source

The Environment stage of the pipeline has **one** source at a time, selected in the Weather panel:

| Source       | Owner of the drivers                          | Behaviour                                                    |
| ------------ | --------------------------------------------- | ------------------------------------------------------------ |
| **Manual**   | the operator's sliders                        | Original behaviour, unchanged.                                |
| **Scenario** | `WeatherScenarioEngine` (built-in timeline)   | A predefined timeline evolves the weather with simulated time. |
| **Forecast** | `WeatherScenarioEngine` (timeline from `LiveForecastEngine`) | Real hourly forecast data, cached and played back on the simulation clock. |

Rules:

- `WeatherScenarioEngine` is the **only** producer of the current weather. Scenario and Forecast differ solely in where the `WeatherKeyframe[]` came from; interpolation, easing, midnight wrap and determinism are one shared code path.
- The engine emits **only** the five drivers — temperature, humidity, cloud coverage, rain intensity, wind speed. Everything derived from them (visibility, pressure, gust strength, ground wetness, UV) stays owned by `weather.ts` in every mode.
- The source is resolved at the top of the environmental tier in `Simulation.tick()`, before `computeSun`. Nothing downstream — solar, sensors, PBIF, servo, façade, PV, BEMS, battery, grid — is aware of which source is active.
- Sampling is a **pure function of the hour of day**: no RNG, no accumulated state, no frame-rate dependence. Playback speed, pausing and timeline scrubbing therefore need no special handling.
- Timelines are cyclic over 24 h — the last keyframe interpolates around midnight into the first, so the weather is continuous everywhere and never jumps.
- Whole-building presets (`scenario.ts`) carry their own fixed weather, so applying one returns the source to Manual.
- Stage 8 AI observes through read-only getters: `getCurrent`, `getPrevious`, `getTimeline`, `getUpcomingKeyframes`, `getScheduledWeather` on the scenario engine; `getSamples`, `getCurrentSample`, `getUpcomingSamples`, `getAgeMinutes`, `getConfidence` on the forecast engine. See §11.
- **`getTimeline()` returns the LOADED scenario's timeline even in Manual Mode**, where nothing is driving the weather. Anything asking "what timeline owns the weather right now?" must gate on `isActive()` first — `activeTimeline()` in the prediction layer is the reference case.

### 5.3.1 Forecast Mode

- **Never fetch from `tick()`.** The network is touched only by `LiveForecastEngine.start()` (on selecting Forecast Mode), its hourly refresh timer, and the operator's Refresh button. The simulation reads the cache alone.
- The cache holds a 48 h hourly bundle and is mirrored to `localStorage`, so a reload — or a session that starts offline — still has a forecast to play.
- Only the five driver variables are requested from the provider. Pressure is deliberately **not** fetched: `weather.ts` derives it, and a fetched value would be a second, unused source of truth.
- The 48 h bundle is folded into a 24 h playback window because the simulation clock is an hour-of-day cursor: walking the bundle from the hour containing "now" and keeping the first sample seen per hour of day fills every hour with the forecast nearest in time.
- **A failure never interrupts the simulation.** Cached playback continues and the indicator turns amber; with nothing cached at all, the engine returns `null` and the weather is *held* at its last value. Null weather can never reach the simulation.

**Traceability.** Forecast Mode exposes the data's real provenance so the twin can be checked directly against Open-Meteo's published forecast:

- **Forecast Issued** — when the cached bundle was downloaded. **Last Checked** is the last refresh *attempt*; the two diverge exactly when the twin is running on a cached forecast.
- **Forecast Coverage** — the first and last forecast hour held in the cache, e.g. `1 Aug 2026 17:00 MYT → 3 Aug 2026 16:00 MYT`. The provider trims each bundle to the declared horizon, so reported coverage is always the coverage actually cached.
- **Current Forecast Timestamp** — the exact forecast hour being replayed, shown in the Forecast Playback badge and updating continuously with the simulation clock.
- Every timeline row carries its calendar date, so the transition to the following day is visible.

Rules:

- Timestamps are rendered in the **forecast site's** timezone, never the viewer's browser timezone — that is what makes a side-by-side check meaningful. The site's UTC offset and IANA zone come from the provider's own response.
- The single source of these formats is `src/lib/dt/forecastTime.ts`. Import them; never retype the format inline.
- Provenance is display-only. `WeatherKeyframe.sourceEpochMs`, `replayInstantMs()` and `chronologicalOrder()` are read by the UI alone — playback is driven purely by `timeHours`, and built-in scenario keyframes carry no `sourceEpochMs`.
- **Storage order is not reading order.** A forecast timeline is stored ascending by *hour of day*, because that is the contract `segmentAt` interpolates against. The 24 entries are a contiguous real-time window that rarely starts at 00:00, so read in storage order the panel appears to jump back a day at the fold. `chronologicalOrder()` rotates the **view** into true chronological order; the stored array must never be re-sorted by timestamp, or interpolation breaks.

## 6. Engineering Rules

- Single Source of Truth
- One responsibility per engine
- Simulation separated from visualization
- No duplicated calculations
- No magic numbers
- Geometry-agnostic architecture
- Performance first
- Physics drives UI, never vice versa

## 7. Current Building Specification

- Type: Commercial Office
- Storeys: 5
- Footprint: 25 × 40 m
- Height: 19 m
- Façade: Adaptive façade
- Façade Panels: 1620 panels
- PV Modules: 189 PV modules
- Module Type: LONGi LR5-72HBD 550M
- Inverter Type: Huawei SUN2000-80KTL-M1
- Battery: 39.56 kWh Battery
- Building orientation: East (default)

## 8. Current Project Status

- Adaptive façade
- Solar physics
- Occlusion
- PBIF
- Virtual sensors
- PV
- Battery
- Grid
- Weather Scenario Engine
- Real-Time Forecast (Open-Meteo)
- AI Prediction Layer (Stage 8.1)
- AI What-If Analysis (Stage 8.2)
- AI Fault Detection & Diagnosis (Stage 8.5)

## 9. Coding Rules

- Always preserve architecture.
- Do not rewrite completed systems.
- Never duplicate simulation logic.
- Always update walkthrough.md after completing a stage.
- Always maintain TypeScript cleanliness.
- Always avoid performance regressions.

## 10. Current Roadmap

- Energy Analytics
- Financial Analytics — also unblocks the What-If layer's Predicted Energy Cost metric, which currently reports "not modelled"
- **Façade → BEMS thermal coupling.** The skin's solar gain (`metrics.ts`, thermal) and the BEMS's HVAC demand (`buildingEnergy.ts`, electrical) are currently independent. Until they are coupled, a locked-façade study correctly shows a large thermal change and no electrical one — see §11
- Stage 8.3+: prediction accuracy tracking against what actually happened; longer horizons

## 11. AI Layer (Stages 8.1–8.5)

An engineering **advisor**, in `src/lib/prediction/`. Stage 8.1 projects the twin 12 h forward and explains why; Stage 8.2 (`whatif/`) evaluates hypothetical alternatives in a throwaway sandbox. Stage 8.5 (`src/lib/ai/faultDetection/`) is a sibling **monitor**, not a projection: it evaluates the twin as it stands right now rather than a future or hypothetical state.

**PBIF remains the sole controller of the adaptive façade.** The AI controls nothing — not solar physics, virtual sensors, PBIF, the servo, the façade, PV, the battery or the grid.

### 11.1 Shared rules

- **`PredictionContext` is pure data.** No engine, method, setter or mutable array reaches it; `Simulation.predictionContext()` resolves every value up front. This is what makes the observer guarantee structural rather than conventional, AND what makes a What-If sandbox an ordinary object spread. Keep it that way — never add an engine reference back.
- **Never called from `tick()`.** The prediction is pulled as a cached report from the ~8 Hz poll; the What-If runs only from its Run Analysis button. The simulation loop carries no AI cost.
- **It re-uses the engines' physics; it never re-implements it.** The projection composes pure functions the owning engines also call: `computeSun`, `sampleTimeline`, `planeIrradiance` (solarPhysics), `moduleDcPowerW` (pvElectrical), `convertDcToAc` (pvInverter), `buildingDemandKW` (buildingEnergy), `settleBus`, `planStorage` (battery), `facadeSolarGainKW` / `facadeDaylightPercent` / `normalisedExposure` (metrics). If the AI needs physics that only exists inside an engine's method, **extract a pure function that engine then calls** — do not copy the arithmetic.
- **Nothing is fabricated.** Every statement carries its evidence and source. A claim the projection cannot support is not emitted; a causal claim is conditional on the data supporting it; a metric the twin cannot evaluate is listed as unavailable **with its reason**, never as a zero or an invented number.
- **No timeline means no output.** Forecast Mode with an empty cache → the prediction reports `Holding` with zero horizons, and `WhatIfEngine.run()` returns null.
- **Confidence is `horizon × freshness × stability`** (`confidence.ts`) — never random. Freshness reuses the Live Forecast Engine's own age thresholds so the two readouts cannot contradict each other.

### 11.2 Prediction (8.1)

- Blade rotation is deliberately **not** projected — that would mean predicting PBIF. The projection holds the façade at its current measured mean openness. This and the other two simplifications (no forward occlusion ray-cast; HVAC lag at equilibrium) are listed in the panel, never hidden.
- The cache key in `predictionEngine.ts` must contain everything a projection depends on. It includes façade openness *separately from the clock bucket*, because the blades keep moving while the clock barely advances.

### 11.3 What-If (8.2)

- **One change per study.** `WhatIfScenario.apply` overrides exactly one parameter — that is what makes the resulting difference attributable. `ProjectionParameters` carries the plant's true values (`LIVE_PARAMETERS`) in the live context.
- **The sandbox is discarded, not reset.** It is a local object spread that goes out of scope. Never introduce a study that mutates shared state and restores it afterwards.
- **A study runs only on the operator's command.** No polling entry point exists on `WhatIfEngine`. When the twin drifts past the cached study, the panel reports staleness — it must never silently re-run.
- Both walks go through the same `projectWalk` as the live prediction. The regression assertion is that **the study's baseline walk is byte-identical to the live prediction's walk**; if that ever fails, the sandbox and the twin have diverged.

### 11.4 Fault Detection & Diagnosis (8.5)

- **A monitor, not a simulator.** `FaultDetectionEngine` re-derives each of twelve subsystems' expected behaviour from the `SimSnapshot` the rest of the UI already reads and compares it against what was actually observed. It never injects, schedules or randomises a fault — a subsystem grades Warning/Critical only when a named, real comparison in `rules.ts` fails.
- **Consumes exactly four things**: `EngineeringKnowledgeBase`, `EngineeringContextBuilder`, `EngineeringReasoningEngine` (all three as their existing module singletons) and the caller-supplied `SimSnapshot`. No reference to `Simulation` ever reaches it.
- **Health vs. confidence are separate axes.** Health score (0–100) measures how closely the observed state matches the expected physics; confidence measures how much a subsystem's own known modelling limitations (from the Knowledge Base) let that judgement be trusted. Neither is random.
- **Overall health is the weakest-link minimum** across all twelve subsystems, never an average — one real finding must not be diluted by eleven healthy ones.
- **`DETECTABLE_CONDITIONS` is static and hand-authored.** It documents what future rules *could* catch and is never generated from a live value, so it can never be promoted into `anomalies` by mistake. New live detection is added by extending `RULES` in `rules.ts`, not that catalogue.

### 11.5 Known modelling boundaries the AI reports honestly

- **Façade thermal ↔ HVAC electrical are not coupled.** A locked-façade study moves solar gain and daylight, and moves projected HVAC electrical demand by zero. Correct, and stated in the recommendation's `limitation`. Do not invent the coupling to make the output look richer.
- **`FacadePanel.solarExposure` is normalised irradiance (`irradiance / 1000`), not the geometric cosine.** Anything feeding the façade metrics must use `normalisedExposure()`, or the result is blind to cloud. Stage 8.1 got this wrong and the What-If layer caught it.
- **Removing the grid changes no dispatch.** The utility is the balancing component, so islanding reclassifies the residual the bus already settled — it never re-settles it.
