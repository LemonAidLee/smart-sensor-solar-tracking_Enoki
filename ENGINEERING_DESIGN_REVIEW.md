# SOLIS AI — Digital Twin Engineering Design Review

**Reviewer stance:** independent systems-engineering audit, pre-deployment. This document does not modify, fix, or refactor any code — it is an assessment only. Findings are sourced from a full read of the simulation engines (`src/lib/engine`, `src/lib/kinematics`, `src/lib/pbif`, `src/lib/embedded`), the AI layer (`src/lib/prediction`, `src/lib/ai/faultDetection`, `src/lib/knowledge`, `src/lib/assistant`), the orchestration/state layer (`src/lib/engine/simulation.ts`, `store.ts`, `src/lib/vec`, `src/lib/edt`, `src/lib/dt`), and the rendering/UI layer (`src/components/twin3d`). Every claim below is anchored to a `file:line` citation discovered by direct code reading, not inferred from documentation alone — where documentation and code disagree, that disagreement is called out explicitly.

---

## 1. Executive Summary

**Overall assessment.** This is an unusually rigorous student/independent-research digital twin — the solar geometry and clear-sky irradiance models are genuinely citable, peer-reviewable physics (Meeus/NOAA solar position, ASHRAE τb/τd clear-sky decomposition, Kasten–Young air mass, Spencer 1971 eccentricity), and the energy-conservation chain (PV → inverter → bus → battery → grid → ledger) is provably leak-free by construction. Against that strength sits a set of real, specific defects: a sensor model whose displayed physics does not match its actual arithmetic, an architecture document (the static Knowledge Base) that is stale on a point actively fed into every LLM prompt, a repeatedly-stated "never called from `tick()`" invariant that is demonstrably false, and a control-logic layer with three mutually contradictory definitions of the façade's rain-safe angle. None of these are subtle — they are the kind of finding a second engineer catches on first read, which is itself informative about review cadence on this project.

**Architecture maturity: Medium-High.** Clear separation of engines, an explicit single-direction pipeline, and a genuinely disciplined "pure function reuse" convention in the AI layer (prediction/what-if never re-implement physics — verified). Undercut by two independent vector-math libraries, two independent façade-control code paths with different mechanical models of the same actuator, and one significant dead/legacy module (`src/lib/simulation/algorithms.ts`) still living in the shipped source tree.

**Engineering maturity: Medium.** Most constants are cited (ASHRAE, CIBSE, EN 12464-1, NFRC 200); a meaningful minority are not (envelope conductance, gust model, visibility model). Several "the physics is right, the plumbing is wrong" defects exist — the LDR sensor being the clearest example.

**Simulation realism: Medium-High for irradiance/solar geometry, Medium for thermal/lighting/PV/battery (defensible first-order reductions, self-disclosed), Low for the LDR sensing chain (the displayed model and the executing model are two different equations) and for wind/gust/visibility (undocumented ad-hoc formulas).

**Control quality: Medium.** PBIF is, by its own code and its own docstring, a first-match-wins rule table with `confidence` hardcoded to `100` always — not an optimizer, not predictive, not MPC. That is fine as a design choice, but it is currently exposed to real oscillation risk: situation classification has no hysteresis band, and wind hovering near the `EXTREME` threshold can flip the façade between actively tracking and fully closed every control tick.

**AI integration quality: Medium.** The deterministic prediction/what-if/fault-detection stack is the strongest-engineered part of the whole codebase (verified zero physics duplication). The generative layer (Gemini) is undermined by a stale static Knowledge Base it is explicitly instructed to trust over its own reasoning, and by client-exposed API credentials.

**Maintainability: Medium.** Strong naming/documentation discipline in most files; several large files (849, 634, 604, 584 lines) with near-duplicate internal structure; one committed MQTT credential; one filename that doesn't match its export.

**Scalability: Medium-High for rendering (instancing + dirty-checking is correctly applied to all three high-count entity classes — 1,620 façade fins, 189 PV modules, procedural city). Weaker for state management (whole-snapshot re-renders acknowledged in-code as a known cost) and for the ASHRAE clear-sky model, which is hardcoded to one city (Kuala Lumpur) despite the forecast layer supporting arbitrary coordinates.

**Major strengths**
- Solar position and clear-sky irradiance: real, cited, cross-validated against a worked example (`SOLAR_MODEL.md` §6).
- Energy/power conservation across PV→Inverter→Bus→Battery→Grid→Ledger: traced end-to-end, no leaks or double-counts found.
- AI prediction/what-if layer's "reuse the engine's own pure function, never re-derive" discipline: verified with zero exceptions across the files read.
- Rendering performance engineering: instancing, dirty-flag caching, shadow-map manual invalidation, and rate-limited debug overlays are consistently and thoughtfully applied.
- Honest self-disclosure culture: dozens of comments explicitly flag simplifications (thermal lag at equilibrium, no forward occlusion, PWM convention, battery ageing hooks) rather than hiding them.

**Major weaknesses**
- The LDR sensor's displayed governing equation is not the equation that runs (§3, §11).
- The static Engineering Knowledge Base is stale on the façade-thermal/BEMS-HVAC coupling and that stale claim is injected into every Gemini prompt with an instruction not to contradict it (§7, §11).
- `PredictionEngine` is, contrary to three separate explicit comments (including in `CLAUDE.md`'s own referenced architecture), reachable from `tick()` (§7, §11).
- Three different, contradictory rain-safe façade angles exist in three different files, only one of which is ever executed (§5, §11).
- Hardcoded MQTT broker credentials committed to source, self-flagged as needing a fix that was never applied (§12, §14).
- No hysteresis anywhere in PBIF's situation classification — a documented, traceable oscillation path exists for wind near the `EXTREME` boundary (§5).

---

## 2. Architecture Review

**Pipeline.** The documented pipeline (CLAUDE.md §3) is `Environment → Forecast → WeatherScenario → SolarPhysics → VirtualSensors → PBIF → Servo → Façade → BuildingThermal → BuildingLighting → PV → Inverter → BuildingEnergy → Battery → Grid`. The implemented order in `simulation.ts` (env-tier block, lines 320–399) is: weather source → sun → weather/wind → solarPhysics → **BuildingThermal → BuildingLighting → PV → Inverter → BuildingEnergy → Grid/Ledger → VirtualSensors → EngineeringContext**, with `skin.update()` (PBIF + servo + façade) run **outside** that block, once per render frame rather than once per env-tick. This is a genuine ordering deviation: Thermal/Lighting/PV/BEMS consume `this.metrics`, which is explicitly commented (`simulation.ts:343-347`) as "the façade's most recently **settled** state" — i.e., one env-tick (~50 ms at `ENV_HZ=20`) stale relative to the façade update that will happen later in the same call. The lag is self-documented as negligible, and at 50 ms it almost certainly is for a building-scale thermal/lighting system — but the pipeline diagram in the onboarding document is not literally what the code does, and a future engineer who trusts the diagram over the code will misread the causality.

**Subsystem ownership.** Mostly clean and well-drawn: `BuildingThermalEngine` and `BuildingLightingEngine` correctly and verifiably consume different façade quantities (`facadeSolarGainKW` vs. raw `avgExposure`) and neither imports the other, exactly as documented. `GridEnergyEngine` is confirmed to do no dispatch of its own — it is a pure classifier over the bus's already-settled numbers, exactly as its own header states. `EnergyLedger` is confirmed to be the sole energy-integral authority (grid/battery hold no independent counters).

**Data flow / Single Source of Truth — repeated violations.** The project's own stated engineering rule (§6, "No duplicated calculations", "No magic numbers") is violated in several concrete, checkable places:
- Two independent hand-rolled vector-math libraries (`src/lib/kinematics/vectorMath.ts` and `src/lib/engine/math.ts`) implement `normalize`, `rotateY`, `clamp`, `dot`, etc. in parallel, kept consistent only by comment cross-reference, not shared code.
- The LDR sensor's `500/lux` resistance/voltage/ADC formula is written independently three times (`virtualSensor.ts` global sensor, `virtualSensor.ts` per-module loop, `embedded/sensors.ts:155-183` lower-LDR sensor) rather than factored into one function.
- `LUX_PER_WM2 = 120` is declared once as a named constant (`embedded/constants.ts:27`) and separately hardcoded as a bare `120` literal in `virtualSensor.ts:43`.
- Rain-intensity display thresholds (`0.05/0.35/0.65`) are declared in `pbif/thresholds.ts` and separately re-hardcoded in `embedded/sensors.ts`'s `rainLabel()`.
- `src/lib/simulation/algorithms.ts` is a nearly-complete second façade-decision implementation (its own deadband, rate-limit, wind-threshold logic) that is 90% dead code, still shipping in `src/lib/`, with constants that materially disagree with the live firmware model (`WIND_LIMIT: 40 km/h` vs. `FW.WIND_CRITICAL: 2500 ADC` in `vec/types.ts`).

**Coupling.** `EngineeringContextBuilder` holds a live reference to the full `Simulation` object (`contextBuilder.ts:25`, `update(sim: Simulation)`) and calls its getters directly — every call found is read-only in practice, but the guarantee is enforced by convention, not the type system, unlike `PredictionContext`, which is genuinely inert data by construction. This is a real asymmetry in how seriously the "read-only observer" principle is enforced across the AI layer's own sub-modules.

**Circular dependency.** `src/lib/assistant/index.ts` and `src/lib/assistant/reasoningEngine.ts` import each other (`index.ts` re-exports from `reasoningEngine.ts`; `reasoningEngine.ts` imports the `engineeringContext` singleton from `index.ts`). It currently works only because the circular reference is used inside method bodies, never at module-evaluation time — a fragile invariant that any future top-level use would break.

**State ownership / synchronization issues.**
- `WeatherScenarioEngine`'s `mode` field **defaults to `'forecast'`** at construction (`weatherScenario.ts:296`), before `connectForecast()` is ever called — `getMode()` can report `'forecast'` while `forecastProvider` is `null`, in which case `getTimeline()` resolves to `null`. Whether this window is ever observed depends on external initialization order not visible in this file.
- `FaultDetectionEngine.evaluateSubsystems()` reads the **live singleton** `engineeringContext` (cached on its own, coarser key) alongside the caller-supplied `snap` — the two are not guaranteed to be from the same tick, so rules that lean on `contexts.getSubsystemContext()` are comparing two independently-cached views of the simulation.
- `contextBuilder.ts`'s own cache key is coarser than both `PredictionEngine`'s and `FaultDetectionEngine`'s — it keys only on clock/weather-mode/PBIF-mode/battery-SoC(1dp)/sun-irradiance(0dp), omitting PV output, grid import/export, and façade openness entirely. Grid import can swing from 0→40 kW without busting this cache key.

**Modularity / extensibility.** Genuinely strong in the physics engines (each new engine — Thermal, Lighting — was added as a sibling without touching its neighbors, matching the "geometry-agnostic, one responsibility per engine" rule). Weaker in the control layer, where two structurally different façade-control implementations coexist behind a single boolean flag (`WEATHER_VALIDATION_MODE`) rather than one implementation with two configurations.

---

## 3. Physics Review

**Weather.** The five canonical drivers (temperature, humidity, cloud, rain, wind) are correctly the sole authority per §5.3, and `WeatherScenarioEngine.segmentAt` is verified to be a pure, deterministic function of hour-of-day (no RNG, no accumulated state) — the documented determinism claim holds. Everything *derived* from the drivers (`weather.ts`) is a set of hand-tuned, uncited ad-hoc formulas: visibility (`40*(1-haze*0.45)*(1-cloud*0.2)*(1-rain*0.7)`), pressure (linear combination of rain/cloud/humidity around a 1013 hPa base), ground wetness (asymmetric rise/dry rates), and a two-sine-wave synthetic gust signal — none of these cite a real meteorological model (Koschmieder for visibility, a real gust spectrum for turbulence), unlike the solar model, which cites its sources meticulously. This is a real internal inconsistency in citation rigor between two files that both claim to be "physics."

**Solar geometry and irradiance — the strongest part of the codebase.** `solarPosition.ts` implements the Meeus/NOAA algorithm essentially term-for-term (Julian Day, equation of centre, apparent longitude with nutation, refraction correction with the standard three-regime polynomial), and `solar.ts` implements the ASHRAE 2009+ τb/τd clear-sky model with genuine DNI/DHI decomposition, Kasten & Young (1989) air mass, and Spencer (1971) eccentricity — this is real, checkable, cited physics, cross-validated against a hand-computed worked example in `SOLAR_MODEL.md` §6. Two caveats: (1) the ASHRAE τb/τd monthly coefficients are hardcoded to Kuala Lumpur (`solar.ts:87-88`) — solar *position* is geometry-agnostic but solar *irradiance intensity* is not, despite `LiveForecastEngine` supporting arbitrary `setLocation()` coordinates; moving the site would silently keep KL's atmosphere. (2) The diffuse-sky fraction is a flat 15% regardless of cloud cover (`DIFFUSE_SKY_FRACTION`, `solarPhysics.ts:10`) — physically, overcast skies should shift strongly toward diffuse-dominated irradiance, and this simplification is not surfaced anywhere in the user-facing "how does cloud affect the twin" narrative (`environmentalInfluence.ts`), unlike most of the codebase's other simplifications, which are disclosed.

**Occlusion.** `neighborOcclusion` (`shading.ts`) is a real, if simplified, ray-vs-AABB slab-method intersection test, honestly self-described as "no ray tracing" — not a placeholder. It is, however, strictly binary (occluded/not-occluded) with no penumbra or soft-shadow blending, and rooftop-array self-shading is hardcoded to `1.0` (`solarPhysics.ts:116`, explicit "Stage 2 prepares the architecture but leaves it at 1.0 for now" comment) — a disclosed but unimplemented placeholder.

**Virtual sensors — the weakest physics in the codebase.** The chain that runs is: `lux = round(GHI*120)` → `resistance = lux>0 ? 500/lux : 10000` → `voltage = 3.3*(10/(resistance+10))` → `ADC = round((10/(resistance+10))*4095)`. This is an internally self-consistent, made-up model — but it is not the model documented and displayed to the user. `embedded/constants.ts` declares (and `embedded/sensors.ts` displays via an equation badge, `"R = A·Ev⁻ᴮ"`) a real GL5528-datasheet-style power law (`R10=10,000Ω`, `γ=0.7`) and a `10,000Ω` fixed divider resistor — neither of which is used anywhere in the actual arithmetic. `LDR_R10_OHMS` and `LDR_GAMMA` are dead constants read only inside a display string. Separately, CLAUDE.md's own architecture description states VirtualSensorEngine models "electrical noise" — no noise model of any kind exists in the sensing chain (confirmed via repo-wide grep: zero `Math.random`/`noise`/`jitter` outside an unrelated cosmetic window-shimmer shader). The chain is a fully deterministic function of irradiance, smoothed only by a legitimate first-order low-pass filter (τ=0.5 s, correctly discretized).

**Adaptive façade kinematics.** Genuinely real single-DOF (azimuth-only) 3D geometry: `alignAngle` is a closed-form analytical bearing solve, not a search; the double-sided-blade `|n̂·ŝ|` exposure formula is explicitly and correctly distinguished from the single-sided window's signed, clamped cosine; near-zenith is correctly guarded against a division-by-near-zero singularity. `evaluateCandidates`'s "five strategies" reduce algebraically to two distinct angles — a labeling choice that oversells what is happening, but the underlying geometry is sound.

**Building thermal.** A legitimate first-order RC-style reduction (single exponential-approach integrator, τ=20 simulated minutes, cited to CIBSE Guide A "heavyweight" response class) rather than a literal multi-node network — a defensible simplification for a system-level twin, and it is the only cross-tick state carried in this engine. The 90%-transmission-efficiency and convective/radiant split both cite ASHRAE sources. `coolingRequiredKW` is explicitly and honestly flagged as always equal to `indoorHeatGainKW` because "capacity is assumed sufficient" — no HVAC-capacity ceiling exists yet, self-disclosed.

**Building lighting.** Correct photometric conversion (CIE 108-1994 luminous efficacy, `W/m² → lux`), correctly kept as an independently-cited glazing property (`VISIBLE_TRANSMISSION=0.6`, NFRC 200) distinct from the thermal chain's `GLAZING_SHGC=0.45` — a genuine, deliberate avoidance of conflating two different real glazing properties. The artificial-lighting density (5 W/m²) is verified to sum correctly with `buildingEnergy.ts`'s baseline lighting category (3 W/m²) to reconstruct the cited ASHRAE 90.1 8 W/m² total — additive, not double-counted.

**PV.** A simplified linear STC (irradiance-proportional) model, not an IV-curve/single-diode model — a legitimate system-level simplification, but with one real, undisclosed gap: the temperature-derating hook (`temperatureFactor`) is declared and always left at `1.0`. Real modules lose several %/10 °C above 25 °C (~-0.35 %/°C typical); this is not modeled and, unlike most of the codebase's other simplifications, is not flagged as a limitation anywhere.

**Inverter.** Flat 98% efficiency with hard clipping above the 80 kW rated AC capacity — a real, self-flagged gap (`pvInverter.ts:47`, "Future: hook in partial load and temperature derating here"). Real inverters have a partial-load efficiency curve (dipping at low and very high loading) that this model does not capture. Given the plant's ~1.3 DC:AC ratio, midday clipping is a realistic and expected regular operating state, and the clipping arithmetic itself (excess DC above 80 kW entirely lost, effective efficiency recomputed as it degrades) is physically sound.

**Battery.** A kWh-bucket model with asymmetric one-way charge/discharge efficiency (0.96/0.96, ≈92% round-trip, realistic for LiFePO₄) — not electrochemistry, and openly disclosed as such via explicit "FUTURE HOOKS — deliberately not simulated" comments for temperature/ageing effects. Headroom/available-energy clamping correctly prevents overshoot within a single timestep, a real correctness safeguard many system-level twins get wrong.

**Grid.** No physics at all beyond classification — verified and self-documented; this is by design (the grid is modeled as unconditional/unlimited), not an oversight.

---

## 4. Building Physics Layer Review

**Is the chain physically meaningful?** Yes, largely. Façade → Thermal → Lighting → Energy is a real, traceable causal chain: `facadeSolarGainKW` (owned by `metrics.ts`, computed once) flows into `BuildingThermalEngine`'s lagged RC model, whose COP-converted electrical output (`solarCoolingLoadKW`) is additively summed into `BuildingEnergyEngine`'s bus alongside a fully independent, occupancy-driven HVAC baseline. `BuildingLightingEngine` independently consumes `avgExposure` (not `facadeSolarGainKW`) for a genuinely separate daylight-harvesting path, exactly as CLAUDE.md claims — this was checked and holds.

**Are any quantities duplicated?** Yes, twice, in ways that could confuse an operator even though neither is a computation bug:
- **Two "cooling load" figures**: `metrics.ts`'s `coolingLoad` (a thermal-kW comfort estimate with no COP, explicitly labeled "estimates only") and `buildingThermal.ts`'s `coolingLoadKW` (the real, COP-converted electrical-kW consequence). Both are user-facing under similar names.
- **Two "daylight" figures**: `metrics.ts`'s `facadeDaylightPercent` (a magic-constant percentage heuristic, `0.35+0.65*sunI`) and `buildingLighting.ts`'s physically modeled lux chain. Different units, different formulas, both surfaced in the UI.

**Are any quantities missing?** The HVAC-capacity ceiling (§3) and PV temperature derating are the two clearest missing physical effects in this chain. There is also no coupling from `BuildingLightingEngine`'s artificial-lighting heat output back into the thermal load — internal lighting heat gain is a real, if secondary, cooling-load contributor in commercial buildings that this architecture's clean separation (deliberately) does not capture.

**What additional physical relationship should exist?** A capacity-limited HVAC response (currently `coolingRequiredKW === indoorHeatGainKW` unconditionally) is the most consequential gap — at extreme solar-gain conditions the twin will always show the cooling plant meeting demand exactly, which cannot be true of any real plant.

---

## 5. PBIF Review

**Decision hierarchy.** Four tiers exist in code (`PbifPriority`: Structural Safety, Weather Protection, Solar Optimization, Thermal Demand) though the docstring claims three — a minor doc/code mismatch. The rule table (`decisionEngine.ts:83-184`) was hand-verified to have no rule-shadowing: solar-resource rules are correctly guarded against the thermal-HIGH case, so no branch is unreachable. This part is genuinely well engineered.

**Thresholds.** Hardcoded, named, and mostly reasonable (wind bands, rain bands, ADC-to-solar-resource bands, temperature bands) — but every one of them is a single-value edge with no hysteresis band (see below).

**Control logic — is this a rule engine or an intelligent controller?** **A rule engine, unambiguously**, and the code is honest about it: `decide()` is a linear first-match-wins scan, `confidence` is hardcoded to `100` on every decision (`RULE_BASED_CONFIDENCE`), and the module's own docstring states "No AI, ML, prediction, optimization or MPC." `operationalObjective` — despite appearing as a first-class field in `PbifDecision` — has **zero causal effect** on the actual decision; no rule in `RULES` branches on it. It exists purely as explanatory text.

**Hysteresis: absent.** `situationAssessment.ts`'s `classify()` is a single-pass ascending-band walk with no separate rising/falling thresholds and no memory of the previous tick. This creates a concrete, traceable oscillation path: wind hovering near `WIND_KMH.EXTREME=50` toggles the façade between `ECONOMY_TRACKING` (still tracking) and `SAFE_MODE` (façade fully closes, tracking suspended) on every PBIF resolve tick that crosses the boundary — the highest-consequence oscillation case in the codebase, since it swings the actuator between two very different physical states with no debounce, filtering, or minimum-dwell-time anywhere in the chain. A milder version of the same defect exists for rain near `RAIN_LEVEL.MODERATE=0.35`.

**Prediction / Optimization: none, by design.** Confirmed at the code level, not just the docstring level.

**Failure handling.** `facadeControl.ts:76-82` and `panel.ts:106-108` both **fail open** — if a PBIF evaluation is unexpectedly absent, the system defaults to `'NORMAL_TRACKING'` / `tracksSun: true` rather than to a protective state. For a system whose highest-priority tier is "Structural Safety," defaulting toward full tracking on an evaluation failure is the wrong direction to fail in.

**Conflicting objectives.** Arbitrated by strict priority order (first-match-wins), not weighting — a defensible, explainable choice, and verified free of shadowing.

**Mode transitions — the most serious PBIF-adjacent finding.** `WEATHER_VALIDATION_MODE`'s own documentation states this mode disables PBIF entirely. The code does not do this: `adaptiveSkin.ts`'s `updateValidation()` unconditionally calls `evaluatePbif()`, and `facadeControlMode` defaults to `'pbif'` (not `'manual'`) at construction, a default that flows straight into the UI store on boot. The constructor comment claiming "Weather Validation Mode boots straight into manual-only control" sets a different field (`this.program`) that `updateValidation()` never reads. **PBIF is active by default even in the mode whose entire documented purpose is to disable it.**

**A second, materially different control model coexists.** The non-validation path (`updateFull`) never calls PBIF or the kinematics package at all — it uses a separate weighted-sum heuristic (`solarTrackAngle`, hardcoded coefficients 0.9/0.3/0.4/0.72) blended via smoothstep with rain/storm targets, driving a genuinely more physically detailed second-order servo (acceleration, speed cap, brake-distance deceleration, hard mechanical stops at 0–180°) than the validation path's plain exponential ease over an unbounded 0–360° range. Two different control philosophies and two different mechanical models of the same physical actuator exist side by side, selected by one boolean flag.

**Rain-safe angle: three contradictory values.** `trackingPolicy.ts` actually drives both `SAFE_MODE` and `WEATHER_PROTECTION` to an identical 0°. `thresholds.ts` separately defines and documents `WIND_SAFE_ANGLE=90` and `RAIN_SAFE_ANGLE=135` (with real physical rationale — wind-turbine-style feathering, water-shedding tilt) — grep-confirmed these constants are **never imported anywhere in `src/`**, i.e. dead documentation of intended behavior the real path does not implement. Meanwhile `panelStates.ts`'s `STATE_ANGLE` table independently sets `RAIN_PROTECTION: 135`, and this value **is** live — consumed by the *other* control path's `autoTarget`. Depending which file a reviewer reads, the façade's rain-safe angle is 0°, 135° (unused), or 135° (used elsewhere) — three answers to the same question.

**Determinism (servo).** `SERVO_SETTLED_DEG=0.5` is genuinely single-sourced and consistently reused across three call sites (`adaptiveSkin.ts`, `panel.ts`, `bladeAngle.ts`) — this specific quantity is a model of the single-source-of-truth discipline the codebase otherwise fails to apply consistently.

---

## 6. Building Energy Review

**Do the loads interact correctly?** Yes for the electrical settlement — `settleBus` enforces `generation = pvToLoad + batteryCharge + surplus` and `load = pvToLoad + batteryDischarge + requiredGridImport` by construction, with dispatch clamped to the offered imbalance at every step; traced end-to-end with no leak found. Lag realism is well judged: HVAC baseline responds on a 15-simulated-minute lag, façade-driven solar cooling on a 20-simulated-minute lag, lighting on a 20-simulated-*second* lag — correctly ordered relative to each other (photosensors are fast, thermal mass is slow), and equipment/elevators/services correctly have **no** lag (plug loads have no thermal inertia, so instant response to occupancy is physically appropriate, not a flaw).

**Two independent HVAC models, additively combined.** `buildingEnergy.ts`'s own `hvacDemandFactor` (occupancy/outdoor-temperature-driven, CIBSE-cited, 15-minute lag) and `buildingThermal.ts`'s COP-converted solar-driven addition are summed, not blended or reconciled — conceptually clean (base HVAC + solar-induced HVAC) but it means the same physical building fabric is governed by two different lag time constants (15 vs. 20 minutes) depending on which driver is being modeled.

**Can any subsystem produce unrealistic behaviour?** The header comment in `buildingEnergy.ts:60` claims "22 W/m² of a 42 W/m² peak," but the actual `LOAD_CATEGORIES` array sums to 37 W/m² (22+3+7+2+3) — a stale number in a comment, not a computation bug, but worth reconciling before it misleads a reader cross-checking the model against the comment.

**Hidden assumptions.** The islanding claim in CLAUDE.md ("removing the grid changes no dispatch... it never re-settles it") was independently verified against `grid.ts`, `prediction/types.ts`, and `whatif/recommend.ts` and found to be **exactly accurate** — `gridAvailable: false` is a pure relabeling of `requiredGridImportKW` as `unservedLoadKW`, and the code itself generates the honest caveat that a real islanded building would shed non-critical load, so the twin over-reports the unserved shortfall. This is a rare case of a documented limitation that is *more* self-aware than most digital twins bother to be.

**Financial/cost.** Confirmed root cause: `grid.ts`'s `tariffPeriod` is permanently pinned `null`, which is exactly why `WhatIfEngine`'s "Predicted Energy Cost" row is reported as `unavailable` rather than fabricated — matches the roadmap and the "nothing fabricated" principle precisely.

---

## 7. AI Review

**Prediction (8.1) and What-If (8.2): the best-engineered subsystem in the codebase.** Every quantity in `projectAt()` was traced back to an imported pure function from the owning engine (`computeSun`, `moduleDcPowerW`, `convertDcToAc`, `buildingDemandKW`, `equilibriumThermalState`, `planStorage`, `facadeSolarGainKW`, etc.) — **zero duplicated physics found**, a genuinely rare and verifiable strength. `insights.ts` narration is disciplined about only asserting what the data supports (checks `isDaytime` before claiming a façade-irradiance consequence, checks the actual GHI comparison before claiming rain suppressed irradiance). `WhatIfEngine`'s one-parameter-per-scenario rule and pure-object-spread sandbox were both verified to hold with no exceptions.

**But the "never called from `tick()`" invariant is false.** This is stated three separate times in the codebase (`predictionEngine.ts:17-31`, `simulation.ts:178-179,193,596-597`) and in CLAUDE.md §11.1 itself. The actual call chain, traced concretely: `tick()` → `engineeringContext.update(this)` (`simulation.ts:396`, inside the `resolve` block, i.e. genuinely reachable from the simulation loop at `ENV_HZ`) → `buildAIPrediction()` → `sim.getPrediction()` → `PredictionEngine.getReport()` → (on cache-key rollover) `PredictionEngine.build()`. The cost is bounded by the prediction engine's own caching, so this is not a performance emergency — but it is a concrete, checkable violation of an architectural invariant the project treats as load-bearing enough to state four times. `FaultDetectionEngine` does not have this problem — confirmed genuinely unreachable from `tick()`.

**The static Knowledge Base is stale, and that staleness has a real blast radius.** `subsystems.ts` still describes `AdaptiveFacade` and `BuildingEnergy` as having "uncoupled" thermal-gain/HVAC-electrical-demand — a limitation Stage 7.9 (`BuildingThermalEngine`) resolved, per CLAUDE.md's own current text and per `recommend.ts`/`projection.ts`'s working implementation of exactly that coupling. This is not a cosmetic doc-drift issue: `projectContext.ts`'s hand-written `PROJECT_OVERVIEW` repeats the same stale claim verbatim ("today they are computed independently... that is correct, not a bug"), and this text is injected into **every single Gemini prompt** regardless of topic, alongside a system-prompt rule that says "never contradict the supplied engineering context or knowledge base." The result is a specific, demonstrable failure mode: the LLM assistant can confidently and citably tell a user something false about the simulation's current behavior, because it was instructed to trust a document that is wrong. `FaultDetectionEngine`'s confidence scoring is also indirectly degraded by the same stale entries (`confidenceFor()` deflates confidence based on `knownLimitations.length`, which still counts a limitation that no longer applies). Separately, the knowledge graph (`relationships.ts`) is *not* stale on this point — `AdaptiveFacade.downstreamDependencies` correctly lists `BuildingEnergy` — so the Knowledge Base is internally inconsistent with itself, not just with the live code.

**Confidence/health scoring: real mechanism, unverified calibration.** `confidence.ts`'s `horizon × freshness × stability` formula is genuinely deterministic and non-trivial (not a dressed-up random number), but its specific constants (grade cutoffs, stability weights) are hand-picked engineering judgment with no backtesting — CLAUDE.md's own roadmap lists "prediction accuracy tracking against what actually happened" as future work, which is the correct next step to close this gap. The same caveat applies to `intentRegistry.ts`'s keyword-match confidence scores for routing user queries to the deterministic assistant vs. Gemini.

**Placeholder-quality context builders.** `contextBuilder.ts`'s `buildServoKinematics` hardcodes `currentState: 'Holding'`/`status: 'Active'` unconditionally, never checking whether the façade is actually moving — a slewing panel is still reported as "Holding" to the Assistant and Reasoning Engine. `buildAIWhatIf` similarly hardcodes `'Idle'`/`'Ready'` regardless of whether a completed or stale study exists. Both are silent placeholders, not disclosed simplifications.

**Fault Detection severity mapping is disproportionate for one specific rule.** `panelFaultDeviation` floors deviation at 0.35 the instant any panel fault exists at all (`MIN_DETECTABLE_DEVIATION=0.35`), which — given `SCORE_CRITICAL_BELOW=70` — means **one faulted panel out of 1,620** jumps straight to a Critical grade with zero Warning-tier headroom. This is a deliberate design choice ("a genuine finding, not noise," per its comment) but is worth re-examining: 1-in-1,620 and 50%-of-1,620 currently grade identically unless the fault ratio itself exceeds 0.35.

**Security: the Gemini API key path is a real exposure risk.** `geminiAssistant.ts` resolves the key via `process.env.NEXT_PUBLIC_GEMINI_API_KEY || process.env.GEMINI_API_KEY`. `NEXT_PUBLIC_`-prefixed variables are inlined into the client bundle by Next.js at build time, and the call path is confirmed to run entirely client-side (`AiAssistantPanel.tsx` is `'use client'`, calls straight through to `GoogleGenAI({apiKey})` with no server-side proxy route). If the deployed environment sets the `NEXT_PUBLIC_` variant, the key ships in the browser bundle.

---

## 8. Performance Review

**Simulation tick.** A single, correctly-applied spiral-of-death guard (`dt = Math.min(dtSeconds, 0.05)`) prevents a backgrounded-tab wakeup from integrating a multi-second jump. `energyStepSimSeconds()` correctly derives elapsed time from the simulation clock (not wall time) and correctly discards >1-simulated-hour jumps as non-physical (timeline scrubbing), rather than integrating a fabricated energy step. A minor duplication exists: the `localSun`/`localNeighbors` construction block is written out twice, near-identically, in the constructor and in `tick()`.

**Rendering — the strongest-engineered layer in the codebase.** `InstancedMesh` is used for every high-count entity class with no exceptions found (1,620 façade fins, 189 PV modules, procedural city buildings/trees/vehicles/lamps). `FacadeLayer` and `RoofSolarArray` both implement genuine per-instance dirty-checking (typed arrays compared before any matrix/color recompute or GPU upload is issued), with an explicit comment explaining why `Float64Array` was chosen over `Float32Array` specifically to make the dirty-compare exact. Shadow maps are manually invalidated (`autoUpdate=false`, flagged only when something shadow-relevant actually changed) with a 2 Hz safety-net refresh. Debug overlays are consistently rate-limited to 15–20 Hz rather than running at render framerate. The one inconsistency found: `RainFX.tsx`'s 1,600-particle loop runs at full render framerate with no rate limit, unlike every sibling effect (`CloudLayer`, `CityLife`) — a minor, isolated departure from an otherwise disciplined pattern.

**React re-render architecture — the acknowledged weak point.** `sim.snapshot()` constructs a brand-new top-level object on every poll (~8 Hz), and multiple panel bodies subscribe to the whole `s.snapshot` rather than a stable sub-slice, **with explicit in-code comments admitting this is necessary because Zustand's default equality check would never fire otherwise**. This means every open, expanded engineering panel re-renders its full subtree 8 times a second regardless of whether its displayed numbers actually changed — a real, self-acknowledged cost, and there is no `React.memo` anywhere in the component tree to blunt it (grep confirms zero usages). `moduleHighlightStore.setScreen` is written every R3F frame (~60 Hz) with no dead-zone/epsilon check before triggering subscriber re-renders.

**Memory allocation.** No `.map`/`.filter` chains over the 1,620-panel or 189-module sets were found in the simulation core's hot path (that iteration is delegated to `skin`/`solarPhysics`, not directly reviewed at that granularity in this pass) — but `simulation.ts`'s env-tier block does allocate a fresh `localSun` object and `localNeighbors` array every ~50 ms regardless of neighbor count, which would scale poorly if the neighbor list grows.

**Caching.** The forecast pipeline is genuinely robust: fetch failures, quota errors, corrupted `localStorage`, and cross-session staleness are all caught and degrade gracefully without ever throwing into the simulation loop — matches its documented resilience contract precisely, and is one of the more defensively engineered files in the codebase.

---

## 9. UI / UX Review

**Terminology consistency.** Verified good: grep found zero live UI usages of retired rotation terminology outside of `Advanced Servo Diagnostics` (where the retired terms are, per the project's own rule, supposed to live) and two comments explicitly documenting the rename. `BLADE_LABEL`/`formatBladeAngle`/`describeBladeMotion` are consistently imported rather than retyped everywhere checked.

**Duplicate information.** The same numbers are legitimately surfaced in multiple panels by design (e.g., HVAC electrical demand in both `BuildingThermalPanel` and `RooftopPvPanel`'s breakdown row; PV output/building load/grid import/battery SoC appear near-identically in three separate floating windows). Formatting is consistent across duplicates (no drift found), but a user with several windows open will see the same headline numbers three or more times with no single "the answer is here" anchor.

**Naming/discoverability issues.**
- `MetricsHUD.tsx` contains no `MetricsHUD` export at all — it fully implements and exports `WeatherPanelBody`, imported elsewhere under that name. A filename that doesn't match its content is a real maintainability trap for anyone navigating by filename.
- Ten tool-launch icons are split across two visually similar docks (`ToolDock`, cyan ring; `AiDock`, emerald ring) plus a separate left-panel set, with no onboarding affordance found — a first-time user has three places to look for functionality.
- Default window positions for the two dock groups overlap (e.g., `thermal` and `ai` share Y=302 with only a 52 px gutter difference), and since any number of the ten windows can be open simultaneously with only click-to-front z-ordering, overlapping/stacked windows are a plausible, unmitigated outcome.

**Accessibility — a consistent gap across the panel layer.**
- Icon-only buttons (tool-dock launchers, window collapse/close) rely on hover-only `title` attributes or CSS-hover tooltips, not `aria-label` — no accessible name reaches assistive tech, and hover-triggered tooltips don't appear on keyboard focus.
- None of the dozens of disclosure/accordion buttons (`Stage`, `SubSection`, `HorizonCard`, `ComparisonRow`, etc.) set `aria-expanded`.
- Window drag/resize is pointer-event-only with no keyboard equivalent.
- Very low-contrast small text (`text-[8px] text-white/25`) is used repeatedly for engineering caveat/assumption text specifically — the content most likely to matter to a careful reader is also the hardest to read.
- `framer-motion` UI animations (window open/close, dock slide-in, refresh spin) are not gated behind `prefers-reduced-motion`, unlike the 3D scene layer, which correctly checks it in several places.

**Minor production artifacts.** `FacadeLayer.tsx` contains a permanent, unconditional debug visual (panel 0 strobes cyan/magenta via a sine wave whenever the VEC is enabled) and a paired `console.log` — both feature-flag-gated, not accidental leftovers, but still a debug affordance shipping in otherwise production-quality rendering code.

---

## 10. Mathematical Consistency

**Units.** Broadly consistent and, in the newer engines (`buildingThermal.ts`, `buildingLighting.ts`), explicitly labeled in comments ("THERMAL kW" vs. "ELECTRICAL kW") specifically to prevent the mix-up that thermal/electrical conflation would cause — the COP conversion at `buildingThermal.ts` is the single, correctly-identified point where that conversion happens. `metrics.ts`, the older file, is less disciplined about labeling thermal-vs-electrical kW inline.

**Energy conservation.** Traced end-to-end from PV generation through the inverter, the bus settlement (`settleBus`), battery charge/discharge (with correctly asymmetric one-way efficiency accounting, not a single flat round-trip multiplier applied carelessly), and the energy ledger's bucketed, overwrite-not-sum integration (specifically designed to survive timeline scrubbing without double-counting). No leak, creation, or double-count was found anywhere in this chain.

**Unit mismatch found.** The LDR sensor's displayed fixed-resistor value (`10,000 Ω`, shown in the UI equation badge) is two orders of magnitude larger than the literal `10` actually used in the executing divider formula (`virtualSensor.ts:45`) — self-consistent internally (the model was built around the smaller literal throughout), but a genuine mismatch between the *displayed* assumption and the *executed* arithmetic (§3, §11).

**Contradictory equations.** The three-way rain-safe-angle contradiction (§5, §11) is the clearest case of contradictory equations governing what should be a single physical quantity.

**Missing/incorrect conversions.** None found in the core electrical chain. The clearest gap is not a wrong conversion but a missing one: no PV cell-temperature derating and no inverter partial-load efficiency curve, both flat-line assumptions where real hardware has a curve (§3).

---

## 11. Contradictions

This section lists every direct contradiction found — cases where two parts of the system (code-vs-code, or documentation-vs-code) cannot both be describing the same reality.

1. **LDR sensor model.** `embedded/constants.ts`/`embedded/sensors.ts` document and *display* a power-law model (`R = A·Ev⁻ᴮ`, A=10,000 Ω, B=0.7, R_FIXED=10,000 Ω). `virtualSensor.ts` (the code that actually produces the number) computes `R = 500/lux` with a `/10` divider. The two cannot both be true of the same sensor reading; the displayed equation is not the executing one.

2. **CLAUDE.md vs. `virtualSensor.ts`.** CLAUDE.md §2 states `VirtualSensorEngine` "models... electrical noise." No noise model exists anywhere in the sensing chain (fully deterministic + a low-pass filter). One of the two must be considered wrong; currently the architecture document is.

3. **"Never called from `tick()`" (prediction).** Stated as fact in `predictionEngine.ts`, twice in `simulation.ts`, and in CLAUDE.md §11.1. The traced call chain (`tick()` → `engineeringContext.update()` → `buildAIPrediction()` → `sim.getPrediction()` → `PredictionEngine.build()`) shows it is reachable and does run from `tick()`.

4. **Rain-safe façade angle — three values.** `trackingPolicy.ts` (executed): 0°. `thresholds.ts` (`RAIN_SAFE_ANGLE`, dead, unused): 135°. `panelStates.ts` `STATE_ANGLE.RAIN_PROTECTION` (executed, but only on the *other* control path): 135°. Three sources, two values, and the two files that agree on 135° are not the same file that is actually consulted by the validation-mode control path.

5. **`WEATHER_VALIDATION_MODE` documentation vs. behavior.** `validationMode.ts`'s doc comment states this mode means "no PBIF." `adaptiveSkin.ts`'s `updateValidation()` unconditionally calls `evaluatePbif()` and defaults `facadeControlMode` to `'pbif'`. PBIF is active by default in the mode documented to disable it.

6. **Static Knowledge Base vs. live architecture.** `subsystems.ts` and `projectContext.ts` (the latter fed into every Gemini prompt) both state façade-thermal gain and BEMS HVAC electrical demand are "uncoupled." CLAUDE.md itself (§2, §11.5) and the working code (`buildingThermal.ts`, `recommend.ts`, `projection.ts`) confirm they *are* coupled, via Stage 7.9. The Knowledge Base is also internally inconsistent with its own dependency graph (`relationships.ts`), which correctly lists the coupling.

7. **Documentation-duplication drift risk (KINEMATICS.md).** `KINEMATICS.md` claims "there are no heuristics or time-based curves" in the façade's rotation logic. True only for the PBIF/validation control path; the non-validation `updateFull` path is heuristic-and-smoothstep-driven throughout and never touches the kinematics package the doc is describing.

8. **`buildingEnergy.ts` header comment vs. its own data.** The header claims "22 W/m² of a 42 W/m² peak"; `LOAD_CATEGORIES`'s actual densities sum to 37 W/m², not 42.

9. **Two "cooling load" and two "daylight" figures** (§4) — not a logical contradiction (each is internally consistent and separately documented as an estimate/model), but a naming collision that presents two different numbers as answers to what reads, to an operator, as the same question.

---

## 12. Technical Debt

- **`src/lib/simulation/algorithms.ts`** — ~90% dead/legacy code (only `solarPosition` is still imported, and only by one fallback branch in `simulatedController.ts`). Contains a full second façade-decision-logic implementation with constants that disagree with the live firmware model. Only remaining live references outside this file are in an already-archived `archive/legacy/` tree — this file itself was never moved there.
- **Hardcoded MQTT credentials** committed in `wokwiMqttController.ts`, with a comment acknowledging they need to move to env config — a known issue that was flagged and never resolved.
- **Stale Knowledge Base entries** (§7, §11) — five specific entries across `subsystems.ts` and `projectContext.ts` describing a limitation Stage 7.9 already resolved.
- **`src/lib/engine/integration/sensors.ts`** — an entire "future stage, not yet wired" file, self-documented as inert, but containing a `virtualDHT22` export whose name collides with a differently-behaved, actually-used `virtualDHT22` in `vec/sensorLayer.ts` — a "which one is live" trap for a future contributor.
- **Placeholder context builders** (`buildServoKinematics`, `buildAIWhatIf` in `contextBuilder.ts`) hardcode plausible-looking but not-actually-derived values.
- **Rooftop self-shading pinned at 1.0**, PV temperature derating pinned at 1.0, inverter partial-load curve absent — three declared-but-inert "future hook" points in the generation chain.
- **`old localStorage cache key never migrated**: `liveForecast.ts`'s cache versioning bump (`v1`→`v2`) orphans the old key forever rather than migrating or purging it.
- **Duplicate large panel components** (`BuildingThermalPanel.tsx`, `BuildingLightingPanel.tsx`, ~600 lines each) share a near-identical internal structure (`EnergyBalanceCard`/`LightingBalanceCard`, `ThermalChain`/`LightingChain`, etc.) that was never factored into a shared "chain visualization" component.
- **`RooftopPvPanel.tsx` at 849 lines** — the largest file in the UI layer, combining PV, inverter, battery, grid, energy-flow, load-breakdown, and daily-ledger concerns in one component.
- **Two independent vector-math libraries** kept in sync by convention (§2).

---

## 13. Improvement Opportunities

### Weather / Solar / Sensors
- **Quick wins:** delete the dead `LDR_R10_OHMS`/`LDR_GAMMA` display path or wire the real formula through it; import `LUX_PER_WM2` instead of re-hardcoding `120`; fetch wind direction from Open-Meteo so Forecast Mode's wind vector is real.
- **Medium:** replace the ad-hoc visibility/pressure/gust formulas in `weather.ts` with cited models, or explicitly document them as illustrative-only the way `solar.ts` does for its one self-declared simplification (cloud modification factor).
- **Major:** parameterize the ASHRAE τb/τd coefficients by location (a lookup table or a fallback generic-atmosphere model) so `setLocation()` actually changes the atmosphere, not just the sun's geometric path; add a real electrical-noise model to `VirtualSensorEngine` to match its own documented claim.

### Kinematics / Façade / PBIF
- **Quick wins:** reconcile the three rain-safe-angle definitions to one value in one file; fix the `WEATHER_VALIDATION_MODE` doc/behavior mismatch (either genuinely disable PBIF in validation mode, or correct the documentation).
- **Medium:** add a hysteresis band (rising/falling thresholds, or a minimum-dwell-time) to `situationAssessment.classify()`, prioritizing the wind `EXTREME` boundary given its consequence (full façade closure).
- **Major:** unify the two façade-control code paths (validation vs. full-simulation) behind one control/servo model with configuration flags, rather than two independently-maintained implementations of the same actuator.

### Building Physics / Energy
- **Quick wins:** fix the `22/42 W/m²` comment drift in `buildingEnergy.ts`; rename or clearly distinguish the two "cooling load" and two "daylight" quantities in the UI.
- **Medium:** add an HVAC-capacity ceiling so `coolingRequiredKW` can genuinely diverge from `indoorHeatGainKW` under extreme load; add PV temperature derating (the hook already exists, it is just never populated).
- **Major:** an inverter partial-load efficiency curve; a real tariff/financial layer to unblock the What-If cost metric (already on the roadmap).

### AI Layer
- **Quick wins:** update the five stale Knowledge Base entries describing the façade/HVAC coupling as absent; fix or remove the three explicit "never called from tick()" claims to match actual behavior (either genuinely decouple the call, or correct the documentation).
- **Medium:** replace `contextBuilder.ts`'s placeholder `buildServoKinematics`/`buildAIWhatIf` with real derivations from `snap`; move the Gemini API key resolution server-side (an API route/proxy) rather than a client-exposed `NEXT_PUBLIC_` variable; add a Warning tier to `panelFaultDeviation`'s severity mapping so 1-of-1,620 and 50%-of-1,620 don't grade identically.
- **Major:** the roadmap's own "prediction accuracy tracking against what actually happened" item — this is the correct way to move confidence/health scoring from "meaningful mechanism, hand-picked constants" to something empirically calibrated.

### Performance / Architecture
- **Quick wins:** rate-limit `RainFX.tsx` to match its sibling effects; add an epsilon/dead-zone check before `moduleHighlightStore.setScreen`.
- **Medium:** introduce `React.memo` boundaries inside the panel components that already isolate their own state reads, to blunt the acknowledged whole-snapshot re-render cost without restructuring the store; remove or archive `src/lib/simulation/algorithms.ts`.
- **Major:** consolidate `kinematics/vectorMath.ts` and `engine/math.ts` into one vector-math module (a genuinely mechanical, low-risk refactor that directly closes a stated engineering-rule violation).

### UI/UX
- **Quick wins:** rename `MetricsHUD.tsx` (or its export) so the filename matches its content; add `aria-label` to icon-only buttons; add `aria-expanded` to disclosure toggles.
- **Medium:** raise contrast on the sub-9px "assumption/limitation" caption text specifically, since it is the content most worth a careful reader's attention; gate `framer-motion` UI animations behind `prefers-reduced-motion` to match the 3D layer's existing discipline.
- **Major:** a lightweight onboarding affordance for the two tool docks + left-panel set, and a window-layout default that doesn't overlap out of the box.

---

## 14. Risk Assessment

**High-risk assumptions.**
- That the LDR sensor's displayed model matches its behavior — anyone validating the twin's sensor output against the GL5528 datasheet cited in the UI will be validating against a formula that isn't running.
- That the Gemini assistant's answers are trustworthy because they cite "the knowledge base" — the knowledge base itself is demonstrably wrong on at least one specific, checkable point, and the assistant is explicitly instructed to defer to it.
- That `WEATHER_VALIDATION_MODE` produces the simplified, PBIF-free behavior its name and documentation promise — it does not, for the façade-control path specifically.

**Possible failure points.**
- The wind-`EXTREME` oscillation path (§5) is the clearest actuator-level failure point — a façade repeatedly slamming between tracking and fully-closed at a threshold boundary is both a wear concern (in a real system) and a jarring visual/UX artifact (in this one).
- The `NEXT_PUBLIC_` Gemini key path and the committed MQTT credentials are both concrete, exploitable exposure points if the corresponding env var/deployment configuration is ever set the "wrong" way.

**Scalability concerns.**
- The location-locked ASHRAE atmosphere model means the twin cannot be genuinely relocated without new coefficients — a real limit if the project's ambitions include other sites.
- The whole-snapshot re-render pattern, while currently acceptable, does not scale gracefully if more panels are added or poll frequency increases — it is already at the point where the code itself has to explain why it's subscribing "wrong."

**Maintainability concerns.**
- Two vector-math libraries, two façade-control paths, and a partially-dead legacy algorithms file all represent the same underlying risk: a future contributor editing one implementation without realizing a second one exists.
- The Knowledge Base's staleness is itself a maintainability signal — it was apparently not updated when Stage 7.9 shipped, despite AI_KNOWLEDGE.md's own governance rule that it should be "updated ONLY when the user explicitly requests" — worth revisiting whether that governance rule is too conservative given it just produced a documented factual regression.

**Future integration risks.**
- Any future subsystem (following `BuildingThermalEngine`/`BuildingLightingEngine`'s pattern) that gets added to `subsystems.ts`/`relationships.ts` late (as those two were) risks repeating the same staleness pattern unless Knowledge Base updates are tied to stage completion rather than opt-in request.

---

## 15. Final Score

Scored out of 10, with the specific evidence driving each score restated briefly.

| Subsystem | Score | Justification |
|---|---|---|
| **Architecture** | 6.5 | Clean pipeline and engine boundaries undercut by two vector-math libraries, two façade-control paths, one dead legacy module, and a circular import — all violations of the project's own stated "no duplication" rule. |
| **Software Engineering** | 6.5 | Strong typing, disciplined caching patterns, genuinely good defensive coding in the forecast pipeline and battery headroom clamping — offset by placeholder context builders and a stale-but-load-bearing documentation source. |
| **Physics** | 7 | Solar geometry/irradiance is genuinely excellent (cited, cross-validated). Thermal/lighting/PV/battery are defensible, mostly self-disclosed simplifications. The sensor chain and the weather-derivative formulas (visibility, gust, pressure) drag the average down significantly. |
| **PBIF / Control** | 5.5 | Internally consistent as a rule engine and honest about being one, but has a real, traceable oscillation path with zero mitigation, a fail-open failure mode on the highest-priority tier, and a control-mode default that contradicts its own documented purpose. |
| **Building Physics Layer** | 7 | The Façade→Thermal→Lighting→Energy chain is real and correctly independent where it should be, correctly additive where it should be — the main deduction is two confusingly-named duplicate metrics rather than any physics error. |
| **Energy Simulation** | 8 | The standout quantitative result of this review: full conservation traced end-to-end with zero leaks, well-reasoned lag time constants, and an honestly self-aware islanding limitation. |
| **AI Layer** | 6 | The deterministic prediction/what-if engine is arguably the best-engineered code in the project (zero duplicated physics, verified). That ceiling is pulled down hard by a stale Knowledge Base actively misinforming the LLM assistant, a falsified "never called from tick()" invariant, and a client-exposed API key. |
| **UI / UX** | 6.5 | Excellent terminology discipline and rendering performance engineering; a genuine, unaddressed accessibility gap across the panel layer, and an acknowledged (not hidden) re-render inefficiency. |
| **Performance** | 7.5 | The rendering layer (instancing, dirty-checking, manual shadow invalidation, rate-limited overlays) is executed about as well as this class of problem can be at this scale; the React/state layer is the visible weak point, and it knows it. |
| **Explainability** | 7 | The "nothing fabricated, every claim carries evidence and a stated limitation" discipline is real and was verified across `insights.ts`, `compare.ts`, and the fault-detection recommendation text — undermined specifically where that discipline depends on a Knowledge Base that turned out to be wrong. |
| **Overall** | **6.7 / 10** | A physically rigorous, architecturally ambitious twin with a small number of concrete, fixable defects that happen to sit at exactly the places a reviewer would check first: the sensor everyone will validate against a datasheet, the AI layer everyone will ask "can I trust this," and the control logic everyone will stress-test at a threshold boundary. None of the findings require an architectural rewrite — most are a few hours each — which is itself the most encouraging thing in this review. |

---

## Appendix A — Issue Priority Matrix

| # | Issue | Severity | Category | Impact | Difficulty | Priority | Reason |
|---|---|---|---|---|---|---|---|
| 1 | LDR sensor's displayed model (`R=A·Ev⁻ᴮ`) doesn't match the executing formula (`R=500/lux`) | High | Physics | Anyone validating sensor output against the cited datasheet will fail to reproduce it; undermines the "explicit physical model" claim in `sensors.ts` | Medium | Fix Now | The displayed equation is the twin's own claim to correctness for this subsystem; leaving it wrong is a credibility risk, not just a code-quality one |
| 2 | Stale Knowledge Base entries fed into every Gemini prompt (façade/HVAC "uncoupled" claim) | High | AI | The assistant can confidently state something false about current system behavior, backed by an explicit "trust the knowledge base" instruction | Easy | Fix Now | Five-line text edits in `subsystems.ts`/`projectContext.ts`; highest ratio of impact to effort in this entire review |
| 3 | `PredictionEngine` reachable from `tick()`, contradicting 3 explicit code comments and CLAUDE.md §11.1 | Medium | Architecture | Not a performance emergency today, but the documented guarantee ("simulation loop carries no AI cost") is false, which will mislead future performance work | Medium | Before Demo | Either genuinely decouple `engineeringContext.update()` from `tick()`, or correct every place the false claim is written |
| 4 | PBIF wind-`EXTREME` threshold has no hysteresis — façade can oscillate open/closed | High | Control | Actuator-level chattering at a real, reachable weather condition; visually jarring and, in a real system, a wear/reliability concern | Medium | Before Demo | Concrete, demonstrable failure mode a live demo could actually hit if wind is near 50 km/h |
| 5 | Three contradictory rain-safe façade angles across `trackingPolicy.ts`, `thresholds.ts`, `panelStates.ts` | Medium | Control | Confusing to maintain, and the two files that agree (135°) aren't the one actually consulted on the validation-mode path | Easy | Before Demo | Small, mechanical fix — pick one value, delete the dead constants |
| 6 | `WEATHER_VALIDATION_MODE` doc says "no PBIF"; code runs PBIF anyway | Medium | Architecture | A developer trusting the doc will misunderstand what's actually driving the façade in the mode currently active in the running app | Easy | Before Demo | Either the doc or the default needs to change; currently neither matches the other |
| 7 | Hardcoded MQTT broker credentials committed in source | Medium | Security | Client-exposed credentials to a demo broker; self-flagged in a comment and never fixed | Easy | Before Demo | Low actual blast radius (demo broker) but it's a live secret in version control with a known remediation path already written down |
| 8 | Gemini API key resolvable via a `NEXT_PUBLIC_` client-exposed env var, no server proxy | Medium | Security | If deployment sets the public variant, the key ships in the browser bundle | Medium | Before Demo | Requires a small server-side API route, not a large refactor |
| 9 | No PV temperature derating; no inverter partial-load efficiency curve | Low | Physics | Generation is somewhat over-optimistic at high cell temperature / partial load vs. real hardware | Medium | Future Work | Both hooks already exist in the code; genuinely additive, not corrective, work |
| 10 | ASHRAE τb/τd clear-sky coefficients hardcoded to Kuala Lumpur | Low | Physics | Irradiance intensity would stay KL-calibrated if `setLocation()` were ever used for a different site | Hard | Future Work | Requires either a coefficient table per climate zone or a generic-atmosphere fallback model — genuine research effort |
| 11 | Diffuse-sky fraction flat 15% regardless of cloud cover | Low | Physics | Understates diffuse dominance under overcast skies; not currently surfaced as a limitation to the user | Hard | Future Work | Would require an anisotropic sky model (e.g., Perez); the codebase already self-identifies this class of upgrade as out of scope for now |
| 12 | `panelFaultDeviation` floors at 0.35 — 1 faulted panel of 1,620 grades identically to 50% faulted | Medium | AI | Fault Detection severity is disproportionate for the single-fault case, undermining trust in the Critical grade | Easy | Before Demo | A graded ramp instead of a floor is a small, local change to `rules.ts` |
| 13 | Two independent vector-math libraries (`kinematics/vectorMath.ts`, `engine/math.ts`) | Low | Architecture | Currently consistent by convention; a future edit to one without the other is the realistic failure mode | Medium | Future Work | Mechanical consolidation, low risk, direct fix to a stated engineering-rule violation |
| 14 | Two façade-control code paths (validation vs. full-simulation) with different mechanical models | Medium | Architecture | Doubles the maintenance surface for the single most safety-relevant control loop in the system | Hard | Future Work | Requires reconciling a real second-order servo model with a simpler exponential-ease one — non-trivial control-systems work |
| 15 | `src/lib/simulation/algorithms.ts` — ~90% dead legacy code with inconsistent constants still in `src/lib` | Low | Architecture | Confuses future maintainers searching for "the" façade-decision logic | Easy | Future Work | Archive or delete; only one function is still imported |
| 16 | Whole-`snapshot`-object re-renders at ~8 Hz, self-acknowledged in code comments | Low | Performance | Real but bounded CPU cost; already engineered around rather than ignored | Medium | Future Work | `React.memo` boundaries on the already-isolated panel sub-components would blunt this without a store redesign |
| 17 | No electrical-noise model in `VirtualSensorEngine`, contradicting CLAUDE.md's own description | Low | Physics | Sensor readings are unrealistically clean; mostly a documentation-accuracy issue rather than a simulation-quality one at present | Medium | Future Work | Add a small shot-noise/quantization term, or correct the architecture doc's claim |
| 18 | Accessibility gaps across floating panels (no `aria-label`/`aria-expanded`, low-contrast caption text, no keyboard drag/resize) | Low | UI | Assistive-technology users cannot fully operate the workspace; low-contrast text specifically buries the engineering caveats most worth reading | Medium | Future Work | Incremental, panel-by-panel fixes; no architectural change needed |
| 19 | `buildingEnergy.ts` header comment ("42 W/m²") vs. actual `LOAD_CATEGORIES` sum (37 W/m²) | Low | Documentation | Misleads a reader cross-checking the model against its own comment | Easy | Future Work | One-line comment fix |
| 20 | Two "cooling load" and two "daylight" figures shown under similar names in different panels | Low | UI | Risk of operator confusion about which number is authoritative | Easy | Future Work | Rename one of each pair to make the distinction explicit in the UI, not just in code comments |
