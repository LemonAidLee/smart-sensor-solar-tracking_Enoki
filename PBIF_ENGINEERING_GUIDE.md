# PBIF Engineering Guide

Welcome to the **Predictive Building Intelligence Framework (PBIF)** project. 

This document serves as the **authoritative engineering constitution** for all human and AI contributors. Before making any code modifications, creating new files, or proposing architectural changes, you **must** read and understand this guide.

---

## 1. Project Overview

### Vision
To revolutionize sustainable building design by creating an intelligent, predictive, and adaptive façade system powered by real-time environmental data and optimization algorithms.

### Competition Objective
To deliver a world-class, competition-winning digital twin and physical prototype that demonstrates advanced engineering, physics simulation, and decision intelligence.

### Research Contribution
To bridge the gap between static building automation and dynamic, predictive intelligence, providing measurable improvements in energy efficiency, visual comfort, and thermal regulation.

### Scope
The project encompasses a complete hardware-software ecosystem:
1. **Digital Twin Platform (React/Three.js)**: A physically accurate simulation of the building and its environment.
2. **PBIF Optimizer**: The intelligence engine that predicts and decides optimal façade behaviors.
3. **Hardware (ESP32/Wokwi)**: The physical actuation of the adaptive façade based on digital twin commands.

---

## 2. PBIF Philosophy

Every line of code and architectural decision must align with the following core principles:

- **Physics Before AI**: The foundation of the system is rooted in established physics (e.g., solar geometry, irradiance). Do not rely on AI "magic" or arbitrary approximations when a scientific formula exists.
- **Digital Twin First**: The digital twin is not a dashboard; it is a live, rigorous simulation. The physical hardware follows the twin, not vice versa.
- **Explainability**: Every calculation, environmental metric, and optimization decision must be fully explainable and traceable. The system must educate the user on *why* a decision was made. Every future PBIF calculation must be mathematically traceable and explainable in the exact same manner.
- **Scientific Accuracy**: Use established scientific models (e.g., Meeus astronomical algorithms, ASHRAE Clear Sky model).
- **Modularity**: Strict separation of concerns. Physics calculations must not be tangled with UI rendering or React state.
- **Progressive Validation**: Features are built, validated against reality (e.g., Weather Validation Mode), and then integrated into the larger optimization loop.

---

## 3. Current Development Stage

**Phase: Weather & Solar Validation Mode** _(status updated 2026-07-23)_

- **Active Systems**:
  - Environmental Engine — NOAA/Meeus solar position, ASHRAE Clear-Sky irradiance, WHO/WMO UV Index, weather.
  - Digital Twin 2.5D Rendering (Three.js/Fiber) — the building is now a **Double-Skin Kinetic Façade** (curtain wall + air cavity + centre-pivot aluminium fins).
  - **Façade Kinematics geometry engine** (`src/lib/kinematics/`) — a pure Sun-vector → panel-rotation model.
  - **Three façade control modes** (Manual · Sun-Tracking · **PBIF**) sharing ONE renderer + animation pipeline (`src/lib/engine/facadeControl.ts`).
  - **PBIF Version 1** (`src/lib/pbif/`) — the first, deterministic decision-making layer: weather → situation assessment → decision → tracking policy → existing kinematics. See §15.
  - Educational UI overlays (progressive disclosure) — Solar Geometry inspector, world Orientation compass, Panel Kinematics inspector, PBIF Decision panel, active-surface highlight.
- **Temporarily Disabled Systems** (feature-flagged `WEATHER_VALIDATION_MODE`, never deleted):
  - The full PBIF multi-objective **optimization** loop, predictive intelligence, MPC (PBIF v1 above is deterministic rule-based only — no AI/prediction/optimization).
  - Virtual Embedded Controller / Electronics / Explainability layers.
  - The fault framework and the servo/inertia motor model.
- **Developer Focus**:
  - Keep the environmental and kinematic models mathematically flawless and fully cited.
  - Maintain a clean, professional, "engineering-grade" visualization.
  - Do NOT re-enable PBIF optimization until the foundation is validated.

---

## 4. Overall Architecture

The system follows a strict, unidirectional data and logic flow:

```mermaid
flowchart TD
    A[World Environment] --> B[Weather]
    B --> C[Solar Geometry]
    C --> O[Building Orientation Transform]
    O --> D[Local Facade Physics]
    D --> E[PBIF Intelligence]
    E --> F[Optimization]
    F --> G[Electronics / Actuation]
    F --> H[Explainability / UI]

    style A fill:#1e293b,stroke:#475569,color:#fff
    style B fill:#334155,stroke:#475569,color:#fff
    style C fill:#334155,stroke:#475569,color:#fff
    style O fill:#0f172a,stroke:#34d399,color:#34d399
    style D fill:#475569,stroke:#64748b,color:#fff
    style E fill:#0f172a,stroke:#3b82f6,color:#38bdf8,stroke-width:2px
    style F fill:#1e3a8a,stroke:#3b82f6,color:#fff
    style G fill:#064e3b,stroke:#10b981,color:#fff
    style H fill:#4a044e,stroke:#d946ef,color:#fff
```

### Layer Responsibilities
- **World Environment & Weather**: Generates real-time ambient conditions in fixed world space (temperature, cloud cover, wind).
- **Solar Geometry**: Calculates rigorous astronomical sun positions, fixed entirely in world coordinates. Do NOT artificially rotate the sun.
- **Building Orientation**: Pure coordinate transformation layer. Rotates the incoming world-space environmental vectors into the building's Local Coordinate System based on its heading.
- **Local Facade Physics**: Computes the physical impact on the building skin. Operates entirely in Local Space.
- **PBIF**: Evaluates the physical state against building objectives (e.g., minimize cooling, maximize daylight).
- **Optimization**: Resolves conflicting objectives to determine the exact target angle for the adaptive panels.
- **Electronics**: Translates target angles into hardware signals (ESP32/Servos).
- **Explainability**: Surfaces the math, logic, and telemetry to the user interface in an educational manner.

---

## 5. Development Workflow

Before writing code, execute the following workflow:

1. **Understand the Objective**: Read the prompt or issue fully. Do not rush to implementation.
2. **Read this Guide**: Ensure your proposed solution aligns with the project philosophy.
3. **Inspect Existing Implementation**: Use `grep` or `view_file` to thoroughly search the codebase. **Reuse existing architecture** whenever possible.
4. **Avoid Duplicate Implementations**: Do not recreate utility functions, UI panels, or math models that already exist.
5. **Design Before Coding**: For complex tasks, outline your mathematical models and architectural changes.
6. **Validate Mathematically**: Ensure your logic is scientifically sound.
7. **Implement & Test**: Write clean, modular code. Check for regressions.
8. **Summarize Changes**: Provide clear, concise commit/PR descriptions explaining the *why* alongside the *what*.

---

## 6. Coding Standards

- **One Responsibility Per Module**: Do not mix math logic into React components. Physics goes in `src/lib/engine/`. UI goes in `src/components/`.
- **No Magic Numbers**: All constants must be extracted, named clearly, and ideally cited with a comment (e.g., `const SOLAR_CONSTANT = 1361 // W/m²`).
- **No Duplicated Utilities**: Search `src/lib/` before writing new helper functions.
- **Prefer Vector Mathematics**: Use `THREE.Vector3` or established linear algebra patterns for spatial calculations. Avoid messy trigonometric workarounds.
- **Scientific References Required**: When implementing a physical formula, cite the source in the JSDoc (e.g., "Source: ASHRAE Fundamentals 2021").
- **Maintain Future Compatibility**: When operating in Validation Mode, do not delete PBIF code. Use feature flags (e.g., `WEATHER_VALIDATION_MODE`) to cleanly separate current testing from future capabilities.

---

## 7. Digital Twin Principles

The Digital Twin is not built all at once. It evolves progressively:

1. **Geometry & Environment**: Establish the building massing and accurate solar/weather parameters.
2. **Physics**: Apply the environment to the geometry to calculate raw physical impact (heat, light).
3. **Kinematics**: Build the mechanical model of the adaptive skin (blade rotation, limits).
4. **PBIF**: Introduce the predictive intelligence to govern the kinematics based on the physics.
5. **Hardware Integration**: Sync the fully simulated environment with the physical Wokwi/ESP32 prototype.
6. **Explainability**: At every step, the UI must explain *how* the simulation is reaching its conclusions.

---

## 8. Digital Twin Scene Graph Principles

The Digital Twin explicitly distinguishes three different spatial layers, reflecting best practices in CAD, BIM, and game engines. This hierarchy ensures that orientation, physics, and kinematics remain completely decoupled from the fixed environment.

### 8.1 The Layer Hierarchy

```text
World Space (Stationary)
│
├── Sun
├── Sky
├── Ground
├── Roads
├── Trees
├── Neighbour Buildings
├── Compass (World North)
│
└── Main Building Node (Receives Building Orientation Transform)
      │
      ├── Structural Components
      ├── Glass Curtain Wall
      ├── Air Cavity
      ├── Adaptive Façade
      │
      └── Façade Local Space
            ├── Surface Normals
            ├── Panel Rotation Axes
            ├── Panels
            └── Panel Debug Objects
```

### 8.2 Scene Graph Rules

1. **World Objects Never Inherit Building Transforms**: The surrounding environment (neighbors, sun, compass, trees) must always sit in the root `World Space`. They must never inherit or manually apply the building's orientation.
2. **Building-Mounted Components Always Inherit**: The glass curtain wall, core geometry, adaptive façade, and any associated debug visualizations must sit *inside* the `Main Building Node`. They will naturally inherit the orientation transform.
3. **Hierarchy Over Math**: Never manually synchronize transforms across separate nodes (e.g. rotating the roof and the glass independently). Let the parent-child scene graph do the work. The building orientation transform is applied **exactly once** at the `Main Building Node`.
4. **AI Contributor Guidelines**:
   - When introducing new building-mounted objects (e.g., roof HVAC, interior sensors), attach them beneath the `Main Building` node.
   - When introducing environmental objects (e.g., cars, clouds), attach them beneath the `World` root.
   - **Never rotate the entire scene to simulate building orientation.**

---

## 9. Panel Kinematics Explainability

The kinematics and rendering layers of the digital twin must serve as an educational tool for the user. When implementing or modifying visual debugging panels (such as the `KinematicsInspector`):

1. **Traceability**: All displayed quantities must be mathematically traceable. Do not show magic numbers.
2. **Mathematical Sourcing**: Every engineering value must have a documented mathematical source, equation, and explanation (e.g. `acos(n̂ · ŝ)` for Incident Angle).
3. **Engineering Education**: Debug visualizations should support engineering education, not just software debugging. Label arrows explicitly (e.g. using HTML floating text) and explain *why* angles are chosen (e.g., shortest-path rotation, symmetry, maximizing interception).
4. **Conditional Accuracy**: Debug visualizations must accurately represent the current physical state of the simulation. Sun-dependent debug visualizations (e.g., solar vectors, projected shadows, and their labels) must be conditionally rendered and should only appear when a valid solar vector exists (i.e., during daytime).
5. **Scientific Citations**: Scientific references (e.g., NOAA solar models, Rodrigues' Rotation Formula) must accompany implemented equations whenever practical within the UI.

---

## 10. User Interface Principles

The digital twin must feel like a premium, professional engineering tool (akin to Autodesk Forma, Unreal Engine, or ArcGIS). 

- **Progressive Disclosure**: Do not overwhelm the user. Hide complex data behind expandable panels, inspector modals, or tabs.
- **The Building is the Hero**: The 3D visualization is the centerpiece. The UI should float cleanly over the canvas without obstructing the view.
- **Engineering Visualization**: Use data visualization (heatmaps, vectors, charts) over plain text when possible.
- **Minimal Clutter**: Maintain high contrast, clean typography, and consistent spacing. Avoid visual noise. Related controls (e.g., Building Orientation and Geometry) must be integrated into a single configuration panel rather than fragmented into standalone components.
- **Educational Interface**: Provide tooltips, inline citations, and explicit formulas to teach the user how the metrics are derived.

---

## 11. AI Contributor Rules

As an AI assistant (Claude, Gemini, etc.), you are bound by these strict constraints:

1. **Modify Before Creating**: Always attempt to modify existing files before generating new ones. Never create duplicate pages or redundant components.
2. **Never Redesign Architecture Without Justification**: If you believe a refactor is necessary, explain *why* and seek approval. Do not silently rewrite core systems.
3. **Preserve PBIF Compatibility**: Do not permanently delete optimization logic just because it is temporarily disabled.
4. **Explain Engineering Reasoning**: Your responses must include the mathematical or architectural reasoning behind your code changes.
5. **Cite Scientific Sources**: When implementing physics or environmental features, you must cite real-world sources in the code comments.
6. **Keep Implementations Modular**: Strictly enforce the boundary between `src/lib/engine/` (pure logic/math) and `src/components/` (React/UI).

---

## 12. Future Roadmap

1. **Current** — Weather & Solar Validation Mode. ✅ Environmental models (NOAA solar, ASHRAE irradiance, WHO UV) validated & cited; educational UI in place. Ongoing: polish.
2. **Kinematics** — Re-enable Façade Kinematics. ✅ Pure geometry engine (`src/lib/kinematics/`) built & mathematically validated; centre-pivot blade rendering + shading vectors verified; Manual + Sun-Tracking control modes share one renderer/pipeline.
3. **PBIF v1 (current)** — ✅ First decision layer live. A deterministic, rule-based PBIF (`src/lib/pbif/`) plugs into the `resolveTargetRotation()` control-source seam as the third mode. It reads three weather variables (cloud, rain, wind), assesses them into engineering states, and chooses an operational objective by a strict priority hierarchy; the existing kinematics engine still computes every rotation. See §15.
4. **Mid-term (next)** — PBIF v2+. Replace the deterministic decision *source* with predictive / AI / multi-objective optimization / MPC, supplying a real confidence value. The Situation Assessment, Tracking Policy, kinematics engine, and PBIF Decision UI stay unchanged — only the decision source is swapped.
5. **Long-term** — Hardware in the Loop (HIL). Connect PBIF to the physical ESP32/Wokwi prototype for bidirectional control and telemetry.

---

## 13. Definition of Done

Before submitting a change, ensure it passes this checklist:

- [ ] Does the change adhere to the "Physics Before AI" philosophy?
- [ ] Are all scientific formulas properly cited in the source code?
- [ ] Is the code modular (logic separated from UI)?
- [ ] Have all magic numbers been eliminated or properly documented?
- [ ] Does the UI maintain a professional, uncluttered engineering aesthetic?
- [ ] Is progressive disclosure utilized for any new dense data sets?
- [ ] Does the change maintain compatibility with the future PBIF roadmap?
- [ ] Have you explained your engineering reasoning in your response?

---

## 14. Implementation Progress Log

> A running record of validated work, newest first. Everything below is gated by
> `WEATHER_VALIDATION_MODE`; no PBIF/optimization/electronics code was deleted.

### 2026-07-30 — Cyber-Physical Pipeline & Virtual Embedded Controller Synchronization
- **`src/lib/embedded/sensors.ts`** — Refactored to enforce a single source of truth for all embedded hardware readings. Replaced duplicated raw GHI-to-ADC calculations (`ldrDivider`) with direct reads from the unified `VirtualSensorEngine` (`sim.virtualSensor`). This guarantees that both the Pipeline (conceptual) and the Controller (implementation) display identical values that correctly factor in Effective Irradiance, including cosine projection and shading.
- **Terminology Standardization** — Updated VEC displays to strictly match the Cyber-Physical Pipeline terminology (e.g., 'Filtered ADC', 'Target Angle', 'Current Angle', 'Estimated Lux').
- **Pipeline Stage Linking** — Added an **"Inspect Live Controller"** button to Stage 3 of the Cyber-Physical Pipeline, allowing users to deeply inspect the exact controller state from within the conceptual workflow.
- **Visual Connection** — Applied the Stage 3 accent color (`#a78bfa` / violet) to the VEC header and introduced a breadcrumb (`Cyber-Physical Pipeline › Stage 3 › Virtual Embedded Controller`) to instantly link the implementation detail back to the conceptual stage.

### 2026-07-31 — Utility Grid Integration (Stage 7.6)
- **`src/lib/engine/grid.ts`** (new, pure) — `GridEnergyEngine`: import/export power, grid state (Importing · Exporting · Idle, with `Offline` declared for a future islanding mode) and the point-of-common-coupling specification (Three-Phase AC, 415 V, 50 Hz — TNB distribution practice / MS IEC 60038).
- **The grid performs no routing, by design.** Because the utility connection is unlimited and unconditional, its import and export are *already* `requiredGridImportKW` and `surplusKW` — the residual after PV served the load and the battery took its turn. Re-deriving them would create a second authority for the same numbers, so the engine **projects** the settled bus and adds no arithmetic beyond classification. The whole routing change in `buildingEnergy.ts` is one line: `bus.gridKW = requiredGridImport − surplus`.
- **`src/lib/engine/energyLedger.ts`** (new, pure) — `DailyEnergyLedger`: the six daily energy totals (PV generation, building consumption, battery charge/discharge, grid import/export) plus daily peak import/export. It is a separate module because the day boundary is a system-level concept owned by no single engine, and it is the **sole** place a kW becomes a kWh — so the grid card and the daily list can never disagree. Integrated over **simulated** time; resets on a genuine midnight wrap and restarts on a timeline scrub (a pause correctly does neither).
- **Export is never fabricated** — exactly zero with no surplus, verified over a full simulated day. That follows from Stage 7.4's sizing finding, not from a special case in the grid code.
- **Conservation** — `PV + BatteryDischarge + GridImport == Load + BatteryCharge + GridExport` holds identically (both sides reduce to `generation + load − pvToLoad`). Verified to a worst imbalance of **2.84×10⁻¹⁴ over 50,000 randomised cases**, with import/export never simultaneous and `bus.gridKW == grid.netKW` asserted on every case.
- **Scope respected**: no pricing, bills, ROI, payback, carbon, financial savings, tariff optimisation or demand charges. Solar Physics, the PV engines, the battery, the adaptive façade, PBIF, the Virtual Sensor, the servo model, the Cyber-Physical Pipeline, the camera and the neighbour system are untouched; `BuildingEnergyEngine`'s class body is unchanged.

### 2026-07-31 — Battery Energy Storage System (Stage 7.5)
- **`src/lib/engine/battery.ts`** (new, pure) — `BatteryEnergyEngine`: state of charge, charge/discharge dispatch, power and reserve limits, constant round-trip efficiency. Renders nothing and reaches into no other engine.
- **Storage port, not a dependency.** `buildingEnergy.ts` declares a `StoragePort` interface and imports **nothing** from `battery.ts`; the bus hands the port the PV-only imbalance and receives a dispatch. The router knows there is *a* store, not *which* store, so the future grid connection plugs in the same way and `connectStorage(null)` recovers exact Stage 7.4 behaviour.
- **Bus routing** — `settleBus()` gained its storage terms at the seam Stage 7.4 reserved, in strict priority: PV→load, surplus→battery, battery→load, remainder = `requiredGridImport`. Conservation is enforced on both sides and the dispatch is **clamped to the offered imbalance**, so a misbehaving store cannot break the bus. `requiredGridImportKW` became `deficit − batteryDischarge` exactly as predicted, leaving every existing consumer correct. The BuildingEnergyEngine's demand model is byte-identical.
- **Specification** — capacity **39.56 kWh from the report**; the report gives nothing else, so the C-rate (0.5C → 19.78 kW), efficiencies (96% each way, 92.2% round-trip) and 10% reserve are labelled **engineering assumptions** in the UI rather than presented as datasheet values. `BATTERY_CAPACITY_KWH` is the single authority for 39.56.
- **Energy integrated over simulated time**, matching the load model and HVAC lag; `dt = 0` (pause, init, scrub) provably transfers no energy.
- **Designed for a battery that rarely charges.** The case-study PV plant never exceeds demand, so charging is driven strictly by real surplus and never fabricated; with none available the battery parks at its reserve floor and reports *why* through a `reason` string. Verified: with the only change being a larger array, the identical code charges 10%→100% and later discharges 19.8 kW, cutting grid import from 53.8 to 34.0 kW — no architectural change.
- **Scope respected**: no pricing, savings, carbon, ROI, payback, grid export, net metering or tariffs. Solar Physics, the PV engines, the adaptive façade, PBIF, the Virtual Sensor, the servo model, the Cyber-Physical Pipeline, the camera and the neighbour system are untouched.
- **Validation**: bus conservation to 2.8×10⁻¹⁴ over 20,000 randomised cases including rogue dispatches; charge round-trip exact; overcharge and reserve floors both provably respected.

### 2026-07-31 — Building Energy Management System (Stage 7.4)
- **`src/lib/engine/buildingEnergy.ts`** (new, pure) — the BEMS. Gives the PV plant's AC output a destination: `PV Plant → AC Output → Building Energy Bus → Building Load`. Contains the demand model, the bus and the energy balance; renders nothing and reaches into no other engine.
- **Single authority preserved.** The BEMS **never re-derives PV power** — `pvACOutputKW` is read from `PVInverterEngine.getMetrics().currentACPowerKW`, exactly as `SolarPhysicsEngine` remains the sole authority for irradiance. It runs in the environmental tier immediately after `pvInverter.update()`.
- **Building AC Bus** — `settleBus()` is the one place the balance is resolved, enforcing `generation = selfConsumption + surplus` and `load = selfConsumption + deficit`. Battery and Grid ports are **declared and pinned to 0**; `requiredGridImportKW` is a separate field so it stays correct once storage subtracts from it in Stage 7.5.
- **Load model** — five categories (HVAC · Lighting · Office Equipment · Elevators · Building Services) as W/m² power densities with unoccupied-hour fractions, cited to ASHRAE 90.1, CIBSE Guide F and MS 1525. 42 W/m² peak (210 kW) / 7.4 W/m² base (37 kW) at 5,000 m² GFA. Occupancy is built from `smoothstep` transitions so the curve is C¹-continuous; HVAC adds a degree-hour temperature response behind a 15-minute first-order thermal lag.
- **Simulated vs real time.** The thermal lag is integrated in **simulated** seconds derived from the clock (`Simulation.energyStepSimSeconds()`), not frame time — the twin compresses a day into ~2 real minutes, so a wall-clock lag would span simulated days. Correct when paused, at any speed, across midnight, and on a timeline scrub.
- **`src/lib/engine/pvEquipment.ts`** (new, pure data) — nameplate specification from the project report (LONGi LR5-72HBD 550M ×189, 104.02 kW DC; Huawei SUN2000-80KTL-M1, 80 kW AC, 98%), kept separate from the PV engines so those files stay untouched. The 104.02 vs 103.95 kW arithmetic difference is surfaced and labelled, never reconciled silently — the same nominal-vs-as-built convention as §18.2.
- **UI** — the Rooftop PV panel now separates static specification from live telemetry (Plant Summary · PV Array · Inverter · Building Energy Flow) and draws the balance as two proportional bars on one shared scale; static, no game-like animation.
- **Scope respected**: no battery, no grid, no net metering, no financial or carbon calculation. Solar Physics, the PV engines, the adaptive façade, PBIF, the Virtual Sensor, the servo model, the Cyber-Physical Pipeline, the camera and the neighbour system are untouched.
- **Engineering finding**: surplus is structurally zero for this building — the 80 kW AC plant never exceeds demand during generation hours, so peak coverage is ~53% at solar noon. A 104 kW array on a 5,000 m² tropical office is a partial-offset system, not a net exporter. The surplus path is implemented and correct; it simply never activates. No figure was tuned to make the metric non-zero.

### 2026-07-31 — UI architecture: Rooftop PV separated from Building Engineering (Stage 7.3.1)
- **Rule applied**: the UI's top-level panel structure must mirror the engine's subsystem boundaries — one panel per independent subsystem. `pvArray` / `pvElectrical` / `pvInverter` are **siblings** of `skin` on `Simulation`, not children of it, and Stage 7.1.5 deliberately excluded the PV array from the Cyber-Physical Façade pipeline. Nesting the PV dashboard inside the Building panel asserted a containment relationship the simulation does not have.
- **`src/components/twin3d/ui/RooftopPvPanel.tsx`** (new) — the dedicated Rooftop PV Plant panel: plant AC headline + DC→Loss→AC chain, **DC Array** (installed capacity, current DC output, array utilisation, operating modules, average irradiance) and **AC Inverter** (current AC output, rated capacity, efficiency, operating state, clipping, conversion loss). It owns no logic — every value is read from `SimSnapshot`, which the PV engines already publish (guide §6).
- **Registered as a top-level workspace tool** (`workspaceTools.tsx`, `WindowId` gains `'pv'`), so it appears on the right-hand Tool Dock beside the other engineering categories and inherits the standard `FloatingWindow` chrome, animation, styling and persistence.
- **`ControlDeck.tsx` Building tab restored** to a pure engineering-specification panel: Orientation (unchanged, still interactive) · read-only Geometry (programme, storeys, height, width, length) · the Adaptive Façade block measured off `summariseFacadeLayout()`. The tower-ranged shape picker and Height/Width sliders were removed — the case-study massing is a locked specification (§18), not an operator control.
- **Presentation only.** Four files touched, all UI; no engine, PBIF or kinematics file modified. Solar Physics, the PV electrical/inverter models, the adaptive façade, the Virtual Sensor and the Cyber-Physical Pipeline are byte-identical.
- **Forward compatibility**: the panel is a stack of one `PvSection` component; five reserved slots (Battery, Energy Flow, Grid, Financial, Carbon) already render behind a collapsed disclosure, so a future stage is a content change inside an existing section rather than another UI redesign.

### 2026-07-31 — Geometry migration to the engineering case study
- **`src/lib/engine/facadeModule.ts`** (new, pure) — the curtain-wall setting-out specification: nominal 1.2 m × 1.26 m adaptive module, per-elevation bay counts, storey-aligned row counts, and `summariseFacadeLayout()` (measured off the generated panels, never a parallel formula). Documents and resolves the one inconsistency in the report's figures (see §18.2).
- **Building is now the report's case study**, not a generic tower: Commercial Office · 5 storeys · 25 × 40 m · 19 m · 3.8 m floor-to-floor · 100% curtain wall. `DEFAULT_BUILDING`, the `kl-rect` scenario and the neighbour context were all migrated; the other scenarios became footprint studies of the same programme.
- **Façade grid rebuilt from the module spec.** `geometry.ts` no longer uses a 4.2 m demonstration cell; `cols = moduleColumnsForEdge(len)`, `rows = facadeRowCount(cfg)`. Result: 21 + 33 bays per elevation × 3 rows per storey = **108 columns · 324 panels/floor · 1,620 panels · 2,470 m²**, matching the report exactly. `FacadePanel` gains `floor`, so every module is addressable by storey.
- **No building dimension is assumed anywhere any more.** Camera presets, the rooftop plant, the kinematics debug vectors, and the curtain-wall/second-skin member sizes are all derived from the live massing or the bay pitch.
- **Performance.** `OcclusionDebug` no longer allocates two `Float32Array`s and two `BufferAttribute`s per frame; buffers are allocated once and reused with `setDrawRange`. Full spec in §18.

### 2026-07-30 — Environmental Influence Model (Cyber-Physical Pipeline)
- **`src/lib/engine/environmentalInfluence.ts`** (new, pure/framework-free) — the single authoritative declaration of *which environmental parameter influences which pipeline stage, and by what mechanism*. Cloud → Environment; Temperature → Embedded Controller; Rain → Embedded Controller; Wind → Embedded Controller **and** Actuation. Owns no thresholds of its own (all imported from `src/lib/pbif/thresholds.ts`) and asserts no coupling the simulation does not implement.
- **`src/components/twin3d/ui/EnvironmentalInfluence.tsx`** (new, reusable) — `InfluenceRail`, `InfluenceCard`, `InfluenceLegend`. Side-entry cards on a dashed rail, deliberately subordinate to the primary spine: smaller type, desaturated accents, no output chip, no animated flow connector.
- **`CyberPhysicalPipeline.tsx`** — `Stage` gains an optional `influences` slot rendered *after* the summary and *before* the output chip (an influence modifies the stage before it produces its output). Sensor and Façade stages deliberately have none; the Sensor carries an explicit "no environmental influence enters here" note instead. The Environment stage's input rows no longer list temperature/wind, which were never environmental measurements in this pipeline.
- Educational contract: the primary Sun → Environment → Sensor → Controller → Servo → Façade story remains dominant; weather is secondary context. Each influence carries a *"Does not affect"* line, because preventing the wrong mental model (e.g. "wind reduces sunlight", "rain dims the sensor") is half the teaching value. Full spec in §17.

### 2026-07-23 — Virtual Embedded Controller Circuit Redesign
- **`src/components/embedded/CircuitSimulation.tsx`** — Completely redesigned from a literal hardware mockup into a professional, layered architectural diagram.
- **Top-Down Topology**: Separated into three distinct horizontal zones (Input Devices, Controller, Output Devices) to clearly communicate signal flow and hardware hierarchy.
- **Orthogonal Wire Harnesses**: Eliminated visual spaghetti by routing all signals through bundled horizontal "signal buses" using 90-degree orthogonal traces, mimicking professional PCB/schematic routing.
- **Visual Polish**: Upgraded all SVG modules (LDR, PIR, DHT22, Servo, LCD, etc.) to feature realistic electronics textures, proper pinouts, and a 5:4 aspect ratio engineering grid layout.

### 2026-07-23 — PBIF Version 1 (deterministic decision layer)
- **`src/lib/pbif/`** — a new, self-contained, framework-free decision package: `situationAssessment.ts` (raw weather → engineering states), `decisionEngine.ts` (ordered priority-ranked rule table → operational state + reason + priority + confidence + rule id), `trackingPolicy.ts` (decision → façade behaviour + per-surface target, routed through the existing kinematics solver), `thresholds.ts` (all tunable constants + safe orientations), `index.ts` (`evaluatePbif`).
- **Third façade control mode.** `FacadeControlMode` gains `'pbif'`; `facadeControl.ts`'s `resolveTargetRotation` switch adds a `case 'pbif'` that calls the Tracking Policy. PBIF never returns a panel angle — it decides the policy; the kinematics engine (unchanged) computes every rotation.
- **Engine integration.** `AdaptiveSkinEngine.update()` computes ONE building-global `PbifEvaluation` per tick from `{windSpeed, rainIntensity, cloudCoverage}` and passes the decided state into the per-surface target resolver. Exposed to the UI via `getPbifEvaluation()`.
- **UI.** `ControlDeck` façade-control selector is now Manual · Sun Tracking · PBIF. New `PbifPanel` (right rail, shown only in PBIF mode) renders the full explainable chain — Weather → Situation Assessment → PBIF Decision → Tracking Policy → Kinematics Solver → Current Façade Behaviour — with reason, priority, rule triggered and confidence.
- Decision logic validated against the four canonical cases (EXTREME wind → SAFE_MODE, HEAVY rain → WEATHER_PROTECTION, OVERCAST → ECONOMY_TRACKING, benign → NORMAL_TRACKING). Deterministic, rule-based, 100% confidence by construction. **No AI, ML, prediction, optimization or MPC.** Full spec in §15.

### 2026-07-23 — Two façade control modes, one pipeline
- **`src/lib/engine/facadeControl.ts`** — `resolveTargetRotation(mode, input)`, the single *source of target rotation* abstraction. `FacadeControlMode = 'manual' | 'sun-tracking'`; future **PBIF / ESP32 / fault** sources become new `case`s with **zero** renderer changes.
- **`adaptiveSkin.ts`** resolves ONE target per surface and eases every blade toward it identically (`TARGET_EASE_RATE`) — both modes share the renderer + animation pipeline; only the target *source* differs. Renderer (`FacadeLayer`) still consumes only `panel.rotationAngle`.
- **UI** (`ControlDeck`): Manual / Sun-Tracking selector; progressive-disclosure tracking-intent (Shade/Daylight) shown only under Sun-Tracking; manual slider shown only in Manual.

### 2026-07-23 — Façade kinematics geometry engine
- **`src/lib/kinematics/`** (VectorMath · SolarVector · FacadeSurface · IncidentAngle · PanelKinematics · RotationSolver) — pure, dependency-free Sun-vector → panel-rotation geometry. No PBIF, no weather, no time-of-day rules.
- Result: strategies A≡B≡C≡E (track the sun) vs D (edge-on); interception ceiling `cos(altitude)`; flat-blade 180° symmetry → shortest-path continuous 360° rotation. Numerically validated across a Kuala Lumpur day. Docs: **`src/lib/kinematics/KINEMATICS.md`**.
- Visualization: `KinematicsInspector` (explains *why* a blade rotated), `KinematicsDebug` (3D solar / surface-normal / panel-normal / axis / shadow vectors).

### 2026-07-23 — Solar position upgraded to NOAA/Meeus
- **`src/lib/engine/solarPosition.ts`** — NOAA Solar Calculator methodology (Meeus, *Astronomical Algorithms*). True-north-referenced and building-independent (world coords → solar model → building orientation offset → façades). Docs/citations: **`src/lib/engine/SOLAR_MODEL.md`**. The legacy simplified model in `simulation/algorithms.ts` is left intact for the ESP32/PBIF layer.
- **`OrientationOverlay`** world compass added; building-orientation removed from the Solar Geometry panel (no duplication).

### 2026-07-22 — Weather Validation Mode + environmental models
- **`WEATHER_VALIDATION_MODE`** flag disables (not deletes) faults, PBIF/VEC/servo and the Decision/Electronics/Explainability layers.
- Irradiance: **ASHRAE Clear-Sky (τb/τd)**; UV Index: **WHO/WMO** — both cited in `solar.ts`.
- Educational overlays: Solar Geometry inspector, active-surface highlight, simplified weather/solar metrics.

### 2026-07-22 — Building redesigned as a Double-Skin Kinetic Façade
- **`BuildingMesh` → `CurtainWall`** (static glazing + aluminium mullions) **+ `FacadeLayer`** (exterior frame + central rotation shaft + centre-pivot aluminium fins) across a real air cavity; the module is offset so the blade sweeps entirely outside the building envelope at every angle. Driven by the same engine surfaces/panels — PBIF-compatible.

---

## 15. PBIF Version 1 — Deterministic Decision Layer

> **Status:** Active (2026-07-23). PBIF v1 is the project's first decision-making
> layer. It is **deterministic and rule-based** — there is deliberately **no AI,
> machine learning, prediction, optimization, or MPC**. Those are future phases
> (§12) that will replace the decision *source* without changing this
> architecture, the Tracking Policy, the kinematics engine, or the UI.

### 15.1 Purpose & Non-Goals

PBIF v1 answers one question: *given the weather, what is the building trying to
do right now?* It outputs a high-level **operational objective**, never a panel
angle. The existing Façade Kinematics engine (`src/lib/kinematics/`, §2 kinematics)
remains the sole authority on physical rotation.

**PBIF v1 explicitly does NOT:**
- output panel angles, or duplicate any solar/kinematics maths;
- predict, optimize, learn, or run an MPC loop;
- read any weather variable other than the three permitted inputs;
- bypass or modify the existing façade-control architecture.

### 15.2 Architecture

```text
Weather (cloud, rain, wind)
        │
        ▼
Situation Assessment      src/lib/pbif/situationAssessment.ts
  (continuous → engineering states)
        │
        ▼
Weather
      │
      ▼
Situation Assessment
      │
      ▼
Thermal Demand Assessment
      │         │
      ▼         ▼
Operational Objective
      │
      ▼
PBIF Decision
      │
      ▼
Tracking Policy (Dynamic Deadband)
      │
      ▼
Target Rotation ──► Façade Animation (one shared easing pipeline)
```

Integration seam: `resolveTargetRotation(mode, input)` in
`src/lib/engine/facadeControl.ts` gains `case 'pbif'`. The building-global PBIF
decision is computed **once per tick** in `AdaptiveSkinEngine.update()` and passed
to the per-surface target resolver, which routes it through the Tracking Policy.
Every module under `src/lib/pbif/` is pure and framework-free (guide §6).

### 15.3 Situation Assessment Layer

Translates the three raw, continuous inputs into discrete engineering states.
Callers reason about states ("wind is HIGH"), never raw numbers. All band edges
live in `thresholds.ts` — the decision engine embeds none.

| Variable | Input | States (low → high) |
|---|---|---|
| **Wind Speed** | km/h | `LOW` · `MODERATE` · `HIGH` · `EXTREME` |
| **Rain** | 0–1 intensity | `NONE` · `LIGHT` · `MODERATE` · `HEAVY` |
| **Cloud Cover** | 0–1 cover | `CLEAR` · `PARTLY_CLOUDY` · `MOSTLY_CLOUDY` · `OVERCAST` |

Default band edges (all tunable in `thresholds.ts`):
`WIND_KMH = {MODERATE:20, HIGH:35, EXTREME:50}`,
`RAIN_LEVEL = {LIGHT:0.05, MODERATE:0.35, HEAVY:0.65}`.

### 15.3b Solar Resource Assessment

Adaptive façades react to available solar energy, not just atmospheric cloud cover. PBIF v1 translates Cloud Cover into an Estimated Solar Resource. Future versions can replace this with a physical irradiance sensor without changing the rest of PBIF.

| Variable | Derived From | States |
|---|---|---|
| **Solar Resource** | Cloud Cover | `LOW` · `MEDIUM` · `HIGH` |

Default band edges (`thresholds.ts`):
`CLOUD_TO_SOLAR_RESOURCE = {MEDIUM_THRESHOLD: 0.25, LOW_THRESHOLD: 0.60}`.

### 15.4 Thermal Demand Assessment & Operational Objective

Temperature is integrated into PBIF without directly commanding physical rotation. Instead, it determines the **Operational Objective** of the building:

1. **Thermal Demand Assessment**: Outdoor temperature is classified into states (`LOW`, `NORMAL`, `HIGH`).
2. **Operational Objective**: A higher-level goal is determined based on the situation:
   - **Protect Structure**: The overriding objective during extreme wind.
   - **Protect Building Envelope**: The objective during heavy rain.
   - **Reduce Cooling Load**: The objective when thermal demand is `HIGH` (driven by outdoor temperature).
   - **Maintain Balanced Solar Performance**: The default objective when weather and thermal demand are benign.

#### Engineering Traceability & Attribution

1. **Engineering concept adopted**: Passive Solar Control via dynamic heat exclusion (altering the setpoint of adaptive shading based on outdoor temperature rather than indoor simulation).
2. **Original reference or publication**: CIBSE Guide A (Environmental Design) and ASHRAE Fundamentals (Heat Balance Method).
3. **Organisation or author**: Chartered Institution of Building Services Engineers (CIBSE) and American Society of Heating, Refrigerating and Air-Conditioning Engineers (ASHRAE).
4. **Why this concept is appropriate for PBIF**: High outdoor temperatures directly correlate with peak cooling loads in commercial buildings. Since PBIF Version 1 lacks an indoor HVAC simulation, shifting the overall *objective* to "Reduce Cooling Load" provides a deterministic, scientifically justified reason to maintain solar tracking (with tighter deadbands) specifically for solar heat exclusion rather than daylighting. It prevents temperature from acting as a raw kinematics override.
5. **Assumptions made for this project**: We assume outdoor temperature is a reliable proxy for building thermal demand, and that reducing solar gain is always beneficial when outdoor temperatures exceed 30°C. Indoor temperature, occupancy, and HVAC load are explicitly excluded in Version 1.
6. **Where this reference has been documented**: `src/lib/pbif/operationalObjective.ts` and `PBIF_ENGINEERING_GUIDE.md` (§15.4).

### 15.5 Decision Hierarchy

A strict, always-respected priority order. The decision engine evaluates rules
top-down and the **first match wins**, so a higher priority can never be
overridden by a lower one.

1. **Structural Safety** — protect the actuator/structure (wind).
2. **Weather Protection** — preserve the façade & glazing (rain).
3. **Solar Availability** — track the sun efficiently (cloud).
4. **Thermal Demand** — optimize building cooling load (outdoor temperature).

### 15.6 PBIF Operational States

| State | Meaning | Priority tier |
|---|---|---|
| `NORMAL_TRACKING` | Follow the sun normally for maximum solar performance. | Solar Availability / Thermal Demand |
| `ECONOMY_TRACKING` | Follow the sun, but only re-command when the target moves more than the dead-band (`ECONOMY_DEADBAND_DEG`), reducing actuator wear. | Structural Safety / Solar Availability / Thermal Demand |
| `WEATHER_PROTECTION` | Preserve the façade in a configurable rain-safe orientation (`RAIN_SAFE_ANGLE`) rather than tracking the sun. | Weather Protection |
| `SAFE_MODE` | Highest priority. Move to the configurable wind-safe / feathered orientation (`WIND_SAFE_ANGLE`) and suspend tracking. | Structural Safety |

### 15.7 Decision Priority (rule table)

Ordered rules in `decisionEngine.ts` (first match wins):

| # | Condition | → State | Priority |
|---|---|---|---|
| 1 | wind `EXTREME` | `SAFE_MODE` | Structural Safety |
| 2 | wind `HIGH` | `ECONOMY_TRACKING` | Structural Safety |
| 3 | rain `HEAVY` | `WEATHER_PROTECTION` | Weather Protection |
| 4 | rain `MODERATE` | `WEATHER_PROTECTION` | Weather Protection |
| 5 | solar resource `LOW` (and Thermal NORMAL) | `ECONOMY_TRACKING` | Solar Availability |
| 6 | solar resource `MEDIUM` (and Thermal NORMAL) | `ECONOMY_TRACKING` | Solar Availability |
| 7 | temp `HIGH` + solar resource `LOW/MEDIUM` | `ECONOMY_TRACKING` | Thermal Demand |
| 8 | temp `HIGH` + solar resource `HIGH` | `NORMAL_TRACKING` | Thermal Demand |
| — | otherwise (default) | `NORMAL_TRACKING` | Solar Availability |

Worked examples (validated):

### 15.7 Tracking Policy Layer

Bridges the abstract objective to the physical façade. The PBIF decision determines the `Facade State`, which can be:

- **`TRACKING`**: The tracking policy routes the current sun position and intent to the existing kinematics solver `solveForNormal(...)`. `NORMAL_TRACKING` and `ECONOMY_TRACKING` output `TRACKING`.
- **`CLOSED`**: The tracking policy bypasses the sun geometry and commands the panel to its fully closed configuration (0° rotation, where the panel normal is parallel to the building surface normal). `SAFE_MODE` and `WEATHER_PROTECTION` output `CLOSED`.

PBIF never directly outputs an angle; the rotation strategy (kinematics solver for `TRACKING`, closed geometry for `CLOSED`) calculates the target rotation. Both paths route through the same shortest-path helper (`nearestCongruent`) and animation easing.

### 15.8 Decision Confidence (forward-compatibility)

Every decision carries a `confidence` field. For this rule-based engine it is
**always 100%** (certain by construction). The field exists so a future
predictive/AI PBIF can supply a real confidence value with **zero UI change** —
the PBIF Decision panel already renders it. This is the core forward-compatibility
contract: v2+ replaces the decision *source*, not the surrounding architecture.

### 15.9 UI — PBIF Decision Panel & Visualization

`ControlDeck` exposes the third mode (Manual · Sun Tracking · **PBIF**). When PBIF
is active, `PbifPanel` (`src/components/twin3d/ui/PbifPanel.tsx`, right rail)
renders the full explainable decision flow and explains **why** the decision was
made:

```text
Current Weather → Situation Assessment → PBIF Decision → Facade State
  → Tracking Policy → Final Panel Rotation
```

showing, for the live instant: the three weather values, their engineering
states, the operational state, the priority tier, the exact rule triggered, the
plain-language reason, and the confidence.

### 15.10 Current Weather Validation Scope

PBIF v1 ships inside `WEATHER_VALIDATION_MODE`. In this scope: the façade is
driven by exactly one of three sources (Manual / Sun-Tracking / PBIF); faults, the
Virtual Embedded Controller, the servo/inertia model and the multi-objective
optimization loop remain disabled (never deleted); and PBIF reads only cloud
cover, rain and wind speed. All other weather variables are ignored by PBIF by
design. Re-enabling the full twin (`WEATHER_VALIDATION_MODE = false`) is out of
scope for v1 and unchanged by this work.

### 15.11 Dynamic Deadband Control (Economy Tracking)

To mitigate actuator wear and prevent limit cycling (also known as "hunting") caused by cloud transients and rapid irradiance fluctuations, PBIF employs **Dynamic Deadband Control** when in the `ECONOMY_TRACKING` state. 

**Engineering Objective**: Extending the operational lifespan of mechanical actuators while maintaining passive solar control efficiency under variable solar resources.
**Dynamic Deadband Concept**: Rather than a fixed threshold, the deadband width scales inversely with Solar Resource Assessment:
- **HIGH Solar Resource** → Tight deadband (e.g. 2°). Precise tracking is required because small errors lead to large solar heat gain or glare.
- **MEDIUM Solar Resource** → Moderate deadband (e.g. 5°).
- **LOW Solar Resource** → Wide deadband (e.g. 8°). Direct solar gain is minimal; wide tolerance prevents useless micro-actuation.

**Mechanism**: The system continuously evaluates the theoretical solar-tracking target. If the absolute difference between this theoretical target and the current panel angle is smaller than the `DYNAMIC_DEADBAND_DEG` threshold for the current solar resource, the façade holds its current position. Only when the difference exceeds the threshold is a new movement command issued.

#### Engineering Traceability & Attribution

1. **Engineering concept adopted**: Dynamic Deadband Control for Solar Transients.
2. **Original reference or publication**: ASHRAE Standard 55 (Thermal Environmental Conditions for Human Occupancy) and CIBSE Environmental Design (Adaptive control strategies).
3. **Organisation or author**: ASHRAE / CIBSE.
4. **Why this concept is appropriate for PBIF**: High-frequency irradiance changes (cloud attenuation) cause adaptive façades to "chatter" or hunt, wearing out actuators and distracting occupants. A dynamic deadband provides a robust signal-processing buffer without fully suspending tracking.
5. **Assumptions made for this project**: We assume cloud coverage inversely correlates with available solar resource. In the future, this layer seamlessly upgrades to consume measured irradiance (W/m²) directly from a pyranometer sensor without needing PBIF architectural changes.
6. **Where this reference has been documented**: `src/lib/pbif/solarResourceAssessment.ts`, `src/lib/pbif/trackingPolicy.ts`, and `PBIF_ENGINEERING_GUIDE.md` (§15.11).

---

## 16. Sensor Physics Pipeline

### 16.1 Two Domains: Environmental Physics vs. Sensor Physics

The Digital Twin explicitly separates two domains that must never be conflated:

```text
Environmental Physics                    Sensor Physics
(Engineering Inspector)                  (Virtual Embedded Controller)
─────────────────────────                ──────────────────────────────
Solar position (NOAA/Meeus)               Illuminance estimation (eta x GHI)
Air mass, optical depth (ASHRAE)    -->    LDR resistance (datasheet power law)
Cloud modification                        Voltage divider (Ohms law)
Global Horizontal Irradiance (GHI)        ESP32 ADC quantisation
```

- **Environmental Physics** (`src/lib/engine/solar.ts`, surfaced by the Engineering Inspector — `IrradianceInspector.tsx`) is the **sole, authoritative source** of Global Horizontal Irradiance. It is not modified, duplicated, or re-derived anywhere in this section.
- **Sensor Physics** (`src/lib/embedded/sensors.ts`) begins **exactly where Environmental Physics ends** — it consumes the Inspector's final GHI value and continues the engineering chain into the electrical domain: illuminance, photoresistor behaviour, voltage-divider circuits, and ADC quantisation.

No irradiance calculation exists in `src/lib/embedded/`. `ldrUpperSignal()` and `ldrLowerSignal()` (`src/lib/embedded/sensors.ts`) read `sim.sun.irradiance` — the identical field the Engineering Inspector displays as "GHI (final)" — and never compute solar position, air mass, or cloud attenuation themselves.

### 16.2 The Pipeline

```text
Global Horizontal Irradiance (GHI)     <- Engineering Inspector (ASHRAE Clear Sky)
        |
        v   Ev = eta x G
Estimated Illuminance (lux)
        |
        v   R = A x Ev^-B
LDR Resistance (Ohm)
        |
        v   V = VCC x R_FIXED / (R_FIXED + R_LDR)
Voltage Divider Output (V)
        |
        v   ADC = (V / VREF) x 4095
ESP32 ADC Counts (0-4095)
        |
        v   analogRead(GPIOx)
Firmware - sees ONLY an integer, never irradiance/lux/voltage
        |
        v
PBIF (Solar Resource Assessment, Dynamic Deadband, ...)
```

Every stage is a **named, exported constant or pure function** in `src/lib/embedded/constants.ts` / `src/lib/embedded/sensors.ts` (`ldrPipelineSteps()`) — no magic numbers, one source of truth per stage, matching §6's Coding Standards.

### 16.3 Configurable Constants

| Constant | Stage | Meaning | Default |
|---|---|---|---|
| `LUX_PER_WM2` (eta) | Illuminance | Daylight luminous efficacy | 120 lux/W·m² |
| `LDR_R10_OHMS` (A) | LDR Resistance | Resistance at 10 lux | 10,000 Ω |
| `LDR_GAMMA` (B) | LDR Resistance | Datasheet log-log slope | 0.7 |
| `LDR_FIXED_RESISTOR_OHMS` | Voltage Divider | Fixed divider resistor | 10,000 Ω |
| `VCC` | Voltage Divider / ADC | Logic supply (approx. VREF) | 3.3 V |
| `ADC_MAX` | ADC Conversion | 12-bit ADC span (reused from `FW.ADC_MAX`) | 4095 |

All live in `src/lib/embedded/constants.ts` — the single place any of these may be tuned; none are inlined elsewhere.

### 16.4 UI: The Signal Translation Panel

`src/components/embedded/SignalChain.tsx` renders each stage as **label + value** only, by default (matching the collapsed pipeline: `741 W/m^2 -> 88,920 lux -> 315 Ohm -> 2.91 V -> 3612 / 4095`). A stage carrying an `equation`, `meaning`, `assumptions` or `reference` (see `SignalStep` in `src/lib/embedded/sensors.ts`) gets a small info toggle that reveals all four together — collapsed by default, so the interface is never overwhelmed. The GHI stage additionally carries a `source: "Engineering Inspector"` tag, visually marking it as consumed, not recomputed. The chain's start/end tags read **"ENGINEERING INSPECTOR" -> `analogRead(ADCx)`** for the LDR pipeline specifically, reinforcing that the firmware's `analogRead()` call is the literal last step — it never touches irradiance, lux, or voltage.

### 16.5 Engineering Traceability & Attribution

#### Stage: Illuminance Conversion (Ev = eta x G)

1. **Engineering concept adopted**: Daylight luminous efficacy — converting radiometric irradiance (W/m²) into photometric illuminance (lux).
2. **Reference or datasheet**: CIE (International Commission on Illumination) daylight luminous efficacy literature; illuminating engineering handbooks citing approximately 90-120 lux per W/m² for daylight.
3. **Author or organisation**: Commission Internationale de l'Eclairage (CIE).
4. **Equation adopted**: `Ev = eta x G`, where `Ev` = illuminance (lux), `eta` = luminous efficacy constant, `G` = GHI (W/m²).
5. **Assumptions made**: A single representative `eta = 120 lux/W·m²` is used rather than a spectrum- and altitude-dependent function; real daylight efficacy varies with solar altitude and sky condition.
6. **Why this approximation is appropriate for the Digital Twin**: The Virtual Embedded Controller demonstrates the shape of the physical-to-electrical conversion chain, not a spectroradiometric instrument. A single constant keeps the chain traceable and configurable in one place without adding an unvalidated daylight-spectrum model.
7. **Where documented**: `src/lib/embedded/constants.ts` (`LUX_PER_WM2`), `src/lib/embedded/sensors.ts` (`ldrPipelineSteps`), `PBIF_ENGINEERING_GUIDE.md` (§16.5).

#### Stage: LDR Resistance (R = A x Ev^-B)

1. **Engineering concept adopted**: Photoresistor (CdS cell) power-law response — resistance falls as illuminance rises.
2. **Reference or datasheet**: GL5528 (or equivalent CdS photoresistor) manufacturer datasheet.
3. **Author or organisation**: LDR component manufacturers (e.g. Advanced Photonix and other GL55-series datasheet publishers).
4. **Equation adopted**: `R = A x L^-B`, parameterised as `R10 x (10/L)^gamma` where `R10` = resistance at 10 lux and `gamma` = the datasheet's log-log slope.
5. **Assumptions made**: `R10 = 10,000 Ω`, `gamma = 0.7` — typical published GL5528 values, characterised over a datasheet's usual 10-100 lux range, extrapolated here to full-daylight illuminance (tens of thousands of lux).
6. **Why this approximation is appropriate for the Digital Twin**: No CdS-cell datasheet characterises full outdoor daylight illuminance; the power law is the correct functional form even outside its calibrated range, and this extrapolation is documented, not hidden, so the reader understands its limits.
7. **Where documented**: `src/lib/embedded/constants.ts` (`LDR_R10_OHMS`, `LDR_GAMMA`), `src/lib/embedded/sensors.ts` (`ldrDivider`), `PBIF_ENGINEERING_GUIDE.md` (§16.5).

#### Stage: Voltage Divider Output (V = VCC x R_FIXED / (R_FIXED + R_LDR))

1. **Engineering concept adopted**: Resistive voltage-divider circuit.
2. **Reference or datasheet**: Texas Instruments application notes on resistive voltage dividers; standard electronics textbooks (e.g. Horowitz and Hill, The Art of Electronics).
3. **Author or organisation**: Texas Instruments (applications engineering).
4. **Equation adopted**: `V = VCC x R_FIXED / (R_FIXED + R_LDR)` — the LDR is wired as the VCC-side leg, so brighter light (lower `R_LDR`) yields a higher divider output.
5. **Assumptions made**: `VCC = 3.3 V`, `R_FIXED = 10,000 Ω`; no load current drawn by the ADC input (a standard, negligible-load assumption for a high-impedance SAR ADC input).
6. **Why this approximation is appropriate for the Digital Twin**: This is the exact circuit already used by the existing virtual LDR model — this stage only exposes its calculation, per this task's explicit instruction not to alter the circuit implementation.
7. **Where documented**: `src/lib/embedded/sensors.ts` (`ldrDivider`), `PBIF_ENGINEERING_GUIDE.md` (§16.5).

#### Stage: ADC Conversion (ADC = (V / VREF) x 4095)

1. **Engineering concept adopted**: Successive-Approximation-Register (SAR) ADC quantisation.
2. **Reference or datasheet**: Espressif ESP32-S3 Technical Reference Manual, ADC chapter.
3. **Author or organisation**: Espressif Systems.
4. **Equation adopted**: `ADC = (V / VREF) x 4095` — a 12-bit ADC (0-4095 counts).
5. **Assumptions made**: `VREF is approximately VCC = 3.3 V` (default attenuation, no external reference or calibration curve applied).
6. **Why this approximation is appropriate for the Digital Twin**: The ESP32-S3's ADC is genuinely close to linear over this range at default attenuation for this demonstration's purposes; modelling its full non-linearity/calibration curve would add complexity without changing the pipeline's educational purpose — showing that firmware reads only an integer.
7. **Where documented**: `src/lib/embedded/constants.ts` (`ADC_MAX`, reused from `src/lib/vec/types.ts`'s `FW.ADC_MAX`), `src/lib/embedded/sensors.ts` (`ldrDivider`), `PBIF_ENGINEERING_GUIDE.md` (§16.5).

### 16.6 Validation: Single Source of Truth for GHI

`sim.sun.irradiance` — computed once per tick in `src/lib/engine/solar.ts`'s `computeSun()` — is read by exactly two consumers: the Engineering Inspector (`IrradianceInspector.tsx`, display only) and `ldrUpperSignal()`/`ldrLowerSignal()` (`src/lib/embedded/sensors.ts`, as their pipeline's first stage). Neither consumer mutates it, and no second irradiance model exists anywhere in `src/lib/embedded/`. Changing the weather (cloud cover) or time of day updates `sim.sun.irradiance` once; both the Inspector and the Virtual Embedded Controller reflect that single change identically and immediately — confirmed by inspection of the two call sites rather than a duplicated formula.

---

## 17. Environmental Influence Model

> **Status:** Active (2026-07-30). A presentation-layer model that extends the
> Cyber-Physical Pipeline without altering any physics, decision logic or control
> path. No engine behaviour changed; this section defines *how the twin explains
> itself*, not what it computes.

### 17.1 Purpose

The Cyber-Physical Pipeline tells one primary engineering story:

```text
Sun → Environment → Sensor → Embedded Controller → Servo → Adaptive Façade
```

That story is intuitive and must remain dominant. But it answers only half of a
beginner's question. The other half — *how do weather and environmental
conditions influence this process?* — was previously invisible or, worse,
implied incorrectly (the Environment stage listed temperature and wind among its
"inputs", which suggested they are environmental *measurements* feeding the
sensor; they are not).

The Environmental Influence Model answers the second question **without creating
a second pipeline**. Cloud, temperature, rain and wind are presented as
*contextual influences* that branch into the one existing stage each genuinely
acts on.

### 17.2 Design Philosophy

1. **One story, not many.** There is exactly one signal path. Influences enter it
   from the side; they never form parallel chains of their own.
2. **Attach only where the coupling is real.** A parameter appears at a stage if
   and only if the simulation actually reads it there. Nothing is drawn "for
   symmetry".
3. **Visual hierarchy is structural, not decorative.** The primary spine owns
   every strong visual cue (numbered stage, large title, saturated accent,
   output chip, animated flow connector). Influence cards are denied all of them
   by construction — dashed rail, smaller type, desaturated accent, no chip, no
   connector. The hierarchy therefore cannot drift as content is added.
4. **Teach the negative too.** Every influence carries a **"Does not affect"**
   line. Preventing the wrong mental model ("wind reduces sunlight", "rain dims
   the sensor", "the sensor knows it is cloudy") is as valuable as stating the
   mechanism, and it is the specific misconception a naive multi-pipeline
   diagram would create.
5. **Progressive disclosure, two levels.** Level 1 is a single plain-language
   sentence, always visible. Level 2 (on click) adds the mechanism, the traceable
   code path, the governing thresholds, the "does not affect" guard, and the
   citation.

### 17.3 The Mapping

| Parameter | Stage influenced | Mechanism in this codebase |
|---|---|---|
| **Cloud Cover** | 1 · Environment | Multiplies clear-sky GHI by the Cloud Modification Factor **before** any geometry, occlusion or sensing. |
| **Temperature** | 3 · Embedded Controller | Classified to a Thermal Demand state → sets the **Operational Objective** (e.g. *Reduce Cooling Load*). |
| **Rain** | 3 · Embedded Controller | Classified to a Rain state → Weather Protection tier → **operational strategy** changes to a closed, rain-safe posture. |
| **Wind** | 3 · Embedded Controller | Structural-Safety tier, evaluated **first** → can override every other objective. |
| **Wind** | 4 · Actuation (Servo) | The safety decision reaches the servo as a **movement constraint**: tracking suspended, or dynamic-deadband suppression of small commands. |
| — | 2 · Sensor | **Deliberately none.** A measurement is not modified by weather; it reports what arrived. |
| — | 5 · Adaptive Façade | **Deliberately none.** The façade executes; it is not a decision stage. |

The two empty rows are as important as the five populated ones. The Sensor stage
renders an explicit note in their place:

> *No environmental influence enters here. The sensor cannot tell whether the
> light dropped because of cloud, a shadow or nightfall — it only converts
> whatever irradiance arrives.*

This is the single most important idea in the interface: **cloud reaches the
controller only as a smaller number, never as the fact "it is cloudy".**

### 17.4 Why Each Mapping Is Correct

- **Cloud → Environment only.** `computeSun()` produces `cloudModificationFactor`
  (`CMF = 1 − cover × 0.75`); `SolarPhysicsEngine.update()` applies it to
  clear-sky GHI *before* cosine projection, occlusion and the diffuse term. By
  the time `VirtualSensorEngine` runs, the reduction is already baked into the
  irradiance value. Cloud is never read by the sensor or the decision engine.
- **Temperature → Controller only.** `assessThermalDemand()` → `determineObjective()`
  → the Thermal Demand rules in `decisionEngine.ts` (§15.4). It changes what the
  building is *trying to achieve*. It never enters the illuminance → LDR →
  divider → ADC chain.
- **Rain → Controller only.** `assessRain()` → the Weather Protection tier →
  `WEATHER_PROTECTION` → façade state `CLOSED` (§15.5–15.7). This is the clearest
  demonstration of the split between environmental **measurement** and
  operational **strategy**: the light reading can be unchanged while the façade
  behaviour changes completely.
- **Wind → Controller and Actuation.** `assessWind()` feeds the Structural Safety
  tier, which is evaluated first so a safety rule can never be outvoted (§15.5).
  It then reaches the servo as a *constraint*, not a different goal:
  `resolveTarget()` routes `SAFE_MODE` to the fully closed configuration (0°) and
  suspends tracking, while economised tracking suppresses commands smaller than
  `DYNAMIC_DEADBAND_DEG` (§15.11). No aerodynamic torque model runs on the blade —
  wind limits movement through the control policy, it does not push the blade.

### 17.5 Architecture

```text
src/lib/engine/environmentalInfluence.ts     (pure, framework-free)
  describeEnvironmentalInfluences(inputs) → EnvironmentalInfluence[]
  influencesForStage(all, stage)          → EnvironmentalInfluence[]
        │
        ▼
src/components/twin3d/ui/EnvironmentalInfluence.tsx   (presentation only)
  InfluenceRail · InfluenceCard · InfluenceLegend
        │
        ▼
src/components/twin3d/ui/CyberPhysicalPipeline.tsx
  <Stage … influences={<InfluenceRail … />} />
```

Per §6 and §11 the mapping, the wording, the live-effect text and the thresholds
live in the pure module; the React layer renders what it is given and asserts no
coupling of its own. Every band edge is imported from
`src/lib/pbif/thresholds.ts` — the influence module defines exactly one constant
of its own (`CLOUD_NEGLIGIBLE`, the cover below which clear-sky irradiance is
effectively untouched), and it is named and documented.

`InfluenceStatus` (`idle` · `active` · `overriding`) drives visual weight only.
An idle influence stays on screen rather than disappearing, so the user can watch
it engage as the weather changes — the interface teaches by state transition, not
by things appearing from nowhere.

### 17.6 Engineering Traceability & Attribution

1. **Engineering concept adopted**: Separation of *environmental measurement*
   from *operational strategy* in a supervisory control chain, presented as a
   single signal path with annotated contextual inputs.
2. **Original reference or publication**: ISA-95 / ISA-88 control-hierarchy
   practice (measurement → control → actuation as distinct layers); CIBSE Guide H
   (Building Control Systems) on separating sensed variables from control
   objectives.
3. **Organisation or author**: International Society of Automation (ISA); CIBSE.
4. **Why this concept is appropriate for PBIF**: The twin's credibility rests on
   the claim that every decision is explainable and traceable (§2,
   Explainability). A diagram that implies every weather variable feeds every
   subsystem destroys that claim even when the underlying code is correct. Making
   each coupling explicit — and each *non*-coupling equally explicit — keeps the
   presentation as rigorous as the engine.
5. **Assumptions made for this project**: The mapping reflects PBIF v1 as
   implemented. In particular, rain does not attenuate irradiance in this model
   (only cloud does), and no aerodynamic load model acts on the blade. Both are
   stated in the UI rather than hidden.
6. **Where this reference has been documented**:
   `src/lib/engine/environmentalInfluence.ts`,
   `src/components/twin3d/ui/EnvironmentalInfluence.tsx`,
   `PBIF_ENGINEERING_GUIDE.md` (§17), `walkthrough.md`.

### 17.7 Forward Compatibility

When PBIF v2+ replaces the deterministic decision source (§12), the influence
mapping changes in exactly one file. Adding a new environmental parameter (e.g.
humidity, air quality, occupancy) means adding one descriptor function to
`environmentalInfluence.ts` and naming its stage — the pipeline component, the
`Stage` slot and the card component need no change. Should a future version give
rain a genuine optical effect, its `stage` moves from `controller` to
`environment` in that one declaration and the UI follows automatically.

---

## 18. Building Geometry — The Engineering Case Study

> **Status:** Active (2026-07-31). The Digital Twin represents the specific
> commercial office building defined in the project report, not a generic
> demonstration massing. No physics, PBIF logic or control path changed; the
> geometry they operate on did.

### 18.1 The Specification

From the report's Comprehensive Project Summary Table:

| Parameter | Value |
|---|---|
| Programme | Commercial Office |
| Storeys | 5 |
| Width × Length | 25 m × 40 m |
| Total height | 19 m |
| Floor-to-floor | 3.8 m |
| Façade | 100% curtain wall + external adaptive façade |
| Adaptive module | 1.2 m × 1.26 m (nominal) |
| Panels per floor | 324 |
| Total panels | 1,620 |
| Façade area | ≈2,470 m² |

These figures are self-consistent: 5 × 3.8 = 19 m ✓; perimeter 2 × (25 + 40) =
130 m, so envelope area = 130 × 19 = **2,470 m²** ✓; 324 × 5 = **1,620** ✓;
3.8 / 1.26 = 3.02 → **3 module rows per storey**, so 324 / 3 = **108 columns** ✓.

### 18.2 The One Inconsistency, and Its Resolution

130 / 1.2 = 108.33, which is where the report's 108 columns comes from. But that
divides the *continuous* perimeter, and a real façade is four separate planar
elevations — a module cannot wrap a corner. Setting each elevation out
independently at exactly 1.2 m gives:

```text
25 m elevation → floor(25 / 1.2) = 20 bays  (24.0 m used, 1.0 m stranded)
40 m elevation → floor(40 / 1.2) = 33 bays  (39.6 m used, 0.4 m stranded)
ring = 2 × (20 + 33) = 106 columns → 318 panels/floor → 1,590 total
```

That is **30 panels short** of the report and leaves an unglazed sliver at every
corner. No uniform module width fixes it either: requiring `a + b = 54` with
`a ≤ 25/w`, `b ≤ 40/w` and `b = 1.6a` has no integer solution.

**Resolution — nominal module, per-elevation bay adjustment.** This is how real
curtain walls are set out: the 1.2 m × 1.26 m module is the *nominal* catalogue
size, and each elevation adjusts its bay width slightly so the bays close exactly
on the structural grid. Rounding rather than flooring the bay count gives:

| Elevation | Bays | Actual module width | Deviation from nominal |
|---|---|---|---|
| 25 m (×2) | 21 | 25 / 21 = **1.1905 m** | −0.79% |
| 40 m (×2) | 33 | 40 / 33 = **1.2121 m** | +1.01% |
| 3.8 m storey | 3 rows | 19 / 15 = **1.2667 m** | +0.53% |

```text
ring = 2 × (21 + 33) = 108 columns
    × 3 rows/storey  = 324 panels/floor    ✓ report
    × 5 storeys      = 1,620 panels         ✓ report
    covering 130 × 19 = 2,470 m², 100%      ✓ report
```

**Every headline figure in the report is met exactly.** The only adjustment is
≤1.01% on an individual module's dimensions — smaller than the tolerance any real
curtain-wall package is set out to, and far smaller than the 1.85% panel-count
error the alternative would introduce. Nothing is changed silently: the nominal
module is a named constant, the actual per-elevation width is derived, and the
Engineering UI displays **both** side by side.

### 18.3 Panel Generation Strategy

`src/lib/engine/facadeModule.ts` is the single authority; `geometry.ts` consumes
it and owns no grid arithmetic of its own:

```text
BuildingConfig (width, depth, height, floorCount, shape)
      │
      ▼  footprintPolygon()            — shape-agnostic, unchanged
edge lengths
      │
      ▼  moduleColumnsForEdge(len)     — round(len / 1.2), clamped
bays on THIS elevation
      │
      ▼  facadeRowCount(cfg)           — rowsPerFloor × floorCount
rows (shared by every elevation → transoms line through)
      │
      ▼  cellW = len/cols · cellH = height/rows
ACTUAL module dimensions, per elevation
      │
      ▼  floorForRow(r, cfg)
every panel tagged with its storey
```

Rules this enforces:

1. **No hardcoded panel positions.** Every module's `worldPosition` is derived
   from its surface basis and its `(row, column)` index, exactly as before.
2. **Storey alignment is structural.** Row count is `rowsPerFloor × floorCount`,
   never `height / moduleHeight`, so the grid can never straddle a floor slab.
3. **Rows are global, columns are per-elevation.** Transoms line through around
   the whole building; each elevation closes its own bays.
4. **Shape-agnostic.** A triangle, hexagon, 24-facet cylinder or concave L is set
   out by the same rules with no special cases.
5. **Bounded.** `MAX_COLUMNS_PER_EDGE` (64) and `MAX_ROWS_PER_FLOOR` (6) never
   bind at the specification (33 and 3) and exist only so an extreme interactive
   configuration cannot produce an unbounded grid.

### 18.4 No Remaining Dimensional Assumptions

The previous massing (60 × 40 × 120 m, 32 storeys) had leaked into presentation
code as absolute metres. Every such constant was re-expressed as a ratio of the
live geometry:

| Consumer | Was | Now |
|---|---|---|
| Camera presets | `pos [210, 80, 70]`, `target [0, 45, 0]`, `zoom 2.8` | Derived from footprint diagonal, overall span and `height × 0.42`; ortho zoom = `K / span` (the same K the old constants implied at span = 120) |
| Orbit limits | `minDistance 40`, `maxDistance 950` | `diag × 0.35` … `span × 20` — close enough to inspect one 1.2 m module |
| Rooftop plant | 6 m box + 16 m mast at `height + 3` | `height × 0.12` and `height × 0.30` |
| Kinematics debug vectors | `L = 16 m` | `height × 0.35`, floor 4 m |
| Curtain-wall mullions | `0.22 m` fixed | `bay × 0.06` (≈71 mm on a 1.19 m module) |
| Second-skin rails / shafts / brackets | `0.18` / `0.10` / `0.12 m` fixed | `bay × 0.09` / `× 0.06` / `× 0.10`, bounded |
| Neighbour context | 90 m and 150 m towers at 120/165 m | 24 m and 34 m mid-rise at 70/92 m — still genuinely occluding a 19 m façade at low sun |

The double-skin cavity is a direct consequence: the fin's swept radius is now
0.55 m instead of 1.98 m, so the pivot sits **1.15 m** off the glass rather than
2.58 m — a plausible double-skin zone for this building class.

### 18.5 Physics Verification

The Solar Physics, Virtual Sensor, kinematics and PBIF layers required **no
changes**, which is the point: they were already geometry-agnostic (§8, §16).
Confirmed by inspection of every consumer —

- `SolarPhysicsEngine.update()` iterates `surfaces → panels` and uses only
  `p.normal`, `p.worldPosition` and neighbour AABBs. No dimension is assumed.
- `neighborOcclusion()` ray-casts from each module's world position; the rescaled
  neighbours keep occlusion physically meaningful at low sun angles.
- `VirtualSensorEngine` consumes effective irradiance per module id — unaffected.
- The kinematics solver is per-surface (co-planar blades share one solution), so
  its cost is O(surfaces), not O(panels), regardless of grid density.
- `pickUpperCentrePanel()`, `panelIndex()`, module selection, the Solar Debugger,
  the Kinematics Inspector and `SelectedModuleHighlight` all address panels by
  id/row/column and re-resolve on geometry change — they follow the new grid
  automatically.

### 18.6 Performance

| Measure | Before (60×40×120, 32 storeys) | After (report spec) |
|---|---|---|
| Kinetic fins (1 InstancedMesh) | 1,392 | 1,620 (+16%) |
| Static frame instances | 60 | 120 |
| Bracket / shaft instances | 96 / 48 | 216 / 108 |
| Mullion instances | 172 | 176 |
| Draw calls for the building | 4 + glass | unchanged |
| Occlusion ray-casts per env tick (20 Hz) | 1,392 × neighbours | 1,620 × neighbours |

One real regression was found and fixed rather than accepted: `OcclusionDebug`
allocated two `Float32Array`s **and** two `BufferAttribute`s every frame in ray
mode (~24 kB/frame of garbage at the reference elevation's 495 modules). The
buffers are now allocated once with headroom, written in place, and bounded with
`setDrawRange`; the two ray colours became module constants. Worst case under the
interactive sliders (10 storeys, 45 × 60 m) is 5,280 modules — still one
instanced mesh.

### 18.7 Engineering Traceability & Attribution

1. **Engineering concept adopted**: Curtain-wall setting-out from a nominal
   module with per-elevation bay adjustment to close on the structural grid.
2. **Original reference or publication**: CWCT *Standard for Systemised Building
   Envelopes* (setting-out and dimensional tolerance of unitised curtain
   walling); ASHRAE Fundamentals for the envelope-area convention (gross
   perimeter × floor-to-floor height).
3. **Organisation or author**: Centre for Window and Cladding Technology (CWCT);
   ASHRAE.
4. **Why this concept is appropriate for PBIF**: it is the only way to satisfy the
   report's panel count, panel size and building dimensions simultaneously, and it
   is what a real façade contractor does. Flooring the bay count instead would
   strand a 1.0 m unglazed sliver at every corner and lose 30 panels.
5. **Assumptions made for this project**: modules are equal-width within one
   elevation (no feature bay at corners); glazing is 100% of the envelope, so
   façade area equals envelope area; the 3.8 m floor-to-floor is uniform across
   all storeys, including the ground floor.
6. **Where this reference has been documented**: `src/lib/engine/facadeModule.ts`,
   `PBIF_ENGINEERING_GUIDE.md` (§18), `walkthrough.md`.

---

## 19. UI Cleanup & Scene Scale Refinement (Stage 6.1)

### 19.1 Objective
Simplify the UI, lock the finalized engineering geometry, and improve the visual scale of the simulation to match the new 25 m × 40 m building footprint. The focus is exclusively on UI and scale tweaks, leaving all physics simulations entirely untouched.

### 19.2 Locking Building Geometry
The building massing is now an engineering constant conforming to the case study specifications:
- 5 storeys
- 19.0 m height
- 25.0 m width
- 40.0 m length

Interactive sliders for these parameters in the Control Deck (`ControlDeck.tsx`) were replaced with read-only specifications to prevent the user from altering the foundational geometry. The orientation slider remains intact.

### 19.3 Visual Scale Adjustments
Decorative environmental assets in `cityLayout.ts` and `GroundScene.tsx` (such as avenue trees and campus vegetation) were scaled down by ~50% to visually harmonize with the compact commercial office footprint. Simulation-relevant neighbours remained physically untouched (but defaults were zeroed).

### 19.4 Debugger Consolidation
The standalone Solar Debugger menu (`SolarOcclusionInspector.tsx`) was removed along with its state `solarDebugMode` from the global store. 
- The `heatmap` mode was removed.
- The `rays` mode was removed.
- The `selected` mode (Selected Module interaction) is now permanently enabled across the twin as the sole active debugging interface, displaying the comprehensive Solar Telemetry for any clicked panel.

---

## 20. Rooftop PV System - Stage 1 (Stage 7.0)

### 20.1 Objective
Introduce the physical representation of the 104.02 kW DC Rooftop PV array into the Digital Twin, serving as an independent architectural subsystem. This stage focuses entirely on geometry, placement, and visual scene graph integration without any electrical or simulation logic.

### 20.2 Architectural Separation
The Rooftop PV subsystem (`RoofSolarArray.tsx`) operates independently of the Adaptive Façade, Solar Physics, Virtual Sensor, and PBIF subsystems. By rendering directly under the main `BuildingMesh` group, it accurately inherits building rotation and positioning but exerts no coupling with facade-specific data.

### 20.3 Layout Generation
The array layout is derived procedurally to fit the 189 panels specified in the engineering report. 
- Dimensions used: 1.134 m × 2.278 m (representing a LONGi 550 W Bifacial module).
- Panels are mounted with a fixed 15° tilt.
- Layout algorithm accounts for building margins and dynamically routes around the central HVAC rooftop plant.
- Exactly 189 panels are spawned, leaving deliberate gaps for roof access/maintenance pathways where necessary.

### 20.4 UI Integration
The Engineering UI (`ControlDeck.tsx`) has been extended to provide fixed engineering specifications for the Rooftop PV system (installed capacity, module count, type, and status) without modifying any interactive control flows.

---

## 21. Rooftop PV System - Stage 2 (Stage 7.1)

### 21.1 Objective
Connect the Rooftop PV Geometry to the existing Solar Physics Engine. The PV array now receives physically meaningful incident irradiance data (front irradiance only), ensuring both the Adaptive Façade and the PV array consume the exact same solar model.

### 21.2 Architectural Integration
The geometric generation of the PV modules (positions and normals) was extracted from the visual renderer (`RoofSolarArray.tsx`) into the core simulation engine (`src/lib/engine/pvArray.ts`).
This allows the `SolarPhysicsEngine` to loop over both `surfaces` (the façade) and `pvModules` (the roof array) during its 20Hz environment tick.
Calculations for Cosine Projection, Incident Angle, and Effective Irradiance are shared and utilize the exact same memory Maps, keyed by `PV-[id]`.

### 21.3 Future-Ready State
The architecture is deliberately structured to support future stages:
- **Shading Factor:** Currently hardcoded to `1.0`, but ready to accept neighbor/self-shading attenuation.
- **Bifacial Gain:** Currently calculating front incident irradiance, leaving room to add rear irradiance from albedo.
- **Power Generation:** All physical inputs required for electrical modelling (inverter, strings, temperature) are now continuously available in the engine.

### 21.4 Visual Feedback
The 3D instances in `RoofSolarArray.tsx` now dynamically tint based on the exact irradiance hitting each panel. Selected modules via click also highlight in green, mirroring the Façade interaction, and display their distinct metrics in the Control Deck.
