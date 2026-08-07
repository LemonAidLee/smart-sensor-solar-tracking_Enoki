# Cyber-Physical Pipeline — Sensor, Embedded Controller & Servo Chain

**Subsystem ID:** CyberPhysicalPipeline
**Version:** 1.1.0
**Last updated:** 2026-08-07

## Purpose

Documents the Environment → Sensor → Embedded Controller → Servo portion of CLAUDE.md §5's pipeline: how raw solar irradiance becomes an electrical sensor reading, how that reading is interpreted by embedded logic, and how a decision becomes a physical servo command. Façade geometry, self-occlusion and the panel state machine belong to [Adaptive Façade](./adaptive_facade.md), not here; the decision logic that PBIF itself runs belongs to [PBIF](./pbif.md).

This subsystem is actually **three distinct code paths** that must not be conflated:

1. **`VirtualSensorEngine`** (`src/lib/engine/virtualSensor.ts`) — the one that actually runs every simulation tick and feeds PBIF's `solarADC` input. It is the single source of "what the sensor reads" for the live twin.
2. **`src/lib/embedded/*`** — a **read-only explainability layer** for the "Virtual Embedded System" UI panel. It never runs in the simulation loop; it re-derives a human-readable Environment → Electrical Signal → ESP32 reading narrative for exactly one selected panel ("Upper Centre"), by reading `VirtualSensorEngine`'s already-computed outputs — it does not recompute sensor physics independently, except for `ldrLowerSignal`'s self-shading proxy, which now runs through the same shared `src/lib/engine/ldrPhysics.ts` chain rather than a local copy of the formula (see Internal Calculation Pipeline).
3. **`src/lib/vec/*`** (the Virtual Embedded Controller / VEC) — a **bidirectional** ESP32 firmware twin (`SimulatedController`) plus its own independent sensor/actuator translation layer, used by the Electronics Digital Twin's Live Embedded Execution Debugger. Per its own module header, this is "the full, currently-disabled Electronics Digital Twin" — a separate control pathway from PBIF, driving only Panel 0.

## Responsibilities

- `src/lib/engine/ldrPhysics.ts`: the single authority for the Effective Irradiance → Lux → LDR Resistance → Divider Voltage → ADC Counts chain (the GL5528 power-law model declared in `embedded/constants.ts`). Every consumer calls it; none re-derive the arithmetic.
- `VirtualSensorEngine`: drive that shared chain for the global reference sensor and one per façade module, adding a first-order digital smoothing filter down to a filtered 12-bit ADC value.
- `src/lib/embedded/sensors.ts` + `panel.ts` + `servo.ts`: derive the ESP32's pin-level readings (LDR, wind, rain, temperature, humidity, PIR, pause switch), servo state, status LEDs and 20×4 LCD text for the "Upper Centre" panel — purely by reading values PBIF/kinematics/`VirtualSensorEngine` already computed. Never writes back to the simulation.
- `src/lib/vec/simulatedController.ts`: port `Enoki/src/sketch.ino`'s 6-level priority state machine byte-for-byte, so Panel 0 reacts exactly as the real board would, and publish a full per-loop `ExecutionTrace` (stages, timings, variables, decision breakdown) for the debugger.
- `src/lib/vec/sensorLayer.ts` / `actuatorLayer.ts`: translate the master simulation's Panel 0 state into a hardware-native `VirtualSensorPacket`, and translate a controller's `ActuatorPacket` back into a call to `AdaptiveSkinEngine.setPanelRotation`.
- `src/components/embedded/ldrQuadrants.ts`: presentation-only remapping of the two real LDR channels onto four displayed quadrants (CLAUDE.md §5.1).

## Inputs

- `VirtualSensorEngine.update`: `BuildingSurface[]`, `SolarPhysicsEngine` (via `getGlobalRawGHI()`, `getGlobalCloudAttenuation()`, `getModuleEffectiveIrradiance(id)`), `dt` (seconds).
- `computeEmbeddedState` (`src/lib/embedded/index.ts`): a `Simulation` instance, a `panelId` (from `pickUpperCentrePanel`), and `ManualEmbeddedInputs` (`occupied`, `paused`).
- `SimulatedController.updateSensors`: a `VirtualSensorPacket` built by `buildSensorPacket(sim, overrides)` from Panel 0's `solarExposure`, `sim.weather`, `sim.sun.worldDir`, and operator-supplied `SensorOverrides` (`motion`, `pauseSwitch`); also accepts injected `FaultKind`s.

## Outputs

- `VirtualSensorEngine`: `getGlobalLux/Resistance/Voltage/ADC/FilteredADC()`, `getModuleLux/Resistance/Voltage/ADC/FilteredADC(id)`.
- `computeEmbeddedState`: an `EmbeddedState` — `servo: ServoState`, `led: LedState`, `lcd: string[]`, `sensors: { ldrUpper, ldrLower, wind, rain, temperature, humidity, pir, pauseSwitch }` (each a `SensorSignal`).
- `SimulatedController.readOutputs()`: an `ActuatorPacket` — `servoAngle` (0–180°), `redLed`, `greenLed`, `lcd`, `state: FirmwareState`.
- `SimulatedController.onTelemetry` / `onSerial`: `TelemetryPacket` (mirrors `sendTelemetry()`) and serial-monitor lines.
- `SimulatedController.getDebugTrace()`: `ExecutionTrace` (stages, variables, `DecisionBreakdown`, `TimingBreakdown`, active faults).

## Internal Calculation Pipeline

**1. `src/lib/engine/ldrPhysics.ts` (the shared GL5528 chain — pure functions, no engine state):**

```
irradianceToLux(irrWm2)        = round(max(0, irrWm2) * LUX_PER_WM2)                         // LUX_PER_WM2 = 120
luxToLdrResistanceOhms(lux)    = lux <= 0 ? LDR_DARK_RESISTANCE_OHMS
                                  : min(LDR_R10_OHMS * (10 / lux) ^ LDR_GAMMA, LDR_DARK_RESISTANCE_OHMS)
                                  // LDR_R10_OHMS = 10,000 Ω, LDR_GAMMA = 0.7, LDR_DARK_RESISTANCE_OHMS = 1,000,000 Ω
ldrResistanceToVoltage(R)      = VCC * (LDR_FIXED_RESISTOR_OHMS / (LDR_FIXED_RESISTOR_OHMS + R))  // VCC = 3.3 V, R_FIXED = 10,000 Ω
voltageToAdcCounts(V)          = round((V / VCC) * ADC_MAX)                                    // ADC_MAX = 4095
computeLdrChain(irrWm2)        = { lux, resistanceOhms, voltage, adc }  // composes the four above, in order
```

**2. `VirtualSensorEngine.update` (runs every tick, `src/lib/engine/simulation.ts` calls it after `solarPhysics.update` and before `skin.update`) — calls `computeLdrChain` once per sensor, adds nothing of its own but the smoothing filter:**

Global reference sensor:
```
globalGHI = solarPhysics.getGlobalRawGHI() * solarPhysics.getGlobalCloudAttenuation()
{ lux: globalLux, resistanceOhms: globalResistance, voltage: globalVoltage, adc: globalADC } = computeLdrChain(globalGHI)
```
Per-module sensor (same call, per panel, driven by `solarPhysics.getModuleEffectiveIrradiance(p.id)`):
```
{ lux, resistanceOhms: res, voltage: vOut, adc } = computeLdrChain(irradiance)
```
Both the global and per-module ADC values are then smoothed by a first-order exponential filter with a 0.5 s time constant:
```
alpha = 1 - exp(-dt / 0.5)
filtered = prevFiltered + (raw - prevFiltered) * alpha
```

**3. `src/lib/embedded/sensors.ts` (explainability layer, computed on demand for the UI, not per tick):**

- `ldrUpperSignal` reads `sim.virtualSensor.getModuleLux/Resistance/Voltage/ADC/FilteredADC(panelId)` directly — it does not recompute the chain.
- `ldrLowerSignal` applies an additional self-shading proxy on top of the module's effective irradiance, then calls the SAME `computeLdrChain` from `ldrPhysics.ts` — no local copy of the formula:
  ```
  selfShade = 1 - (1 - panel.openness) * LDR_LOWER_SELF_SHADE_MAX   // LDR_LOWER_SELF_SHADE_MAX = 0.35
  effIrr = baseEffIrr * selfShade
  { lux, resistanceOhms: res, voltage: volt, adc } = computeLdrChain(effIrr)
  ```
- `windSignal` reconstructs wind speed from a simulated cup-anemometer pulse frequency: `hz = kmh * ANEMOMETER_HZ_PER_KMH`, then `reconstructedKmh = hz / ANEMOMETER_HZ_PER_KMH` (round-trips exactly — a presentation device, not a lossy model).
- `rainSignal` reads `weather.groundWetness` (not `rainIntensity` directly) as "Surface Wetness": `voltage = VCC * (RAIN_DRY_BASELINE_FRACTION + wetness * (1 - RAIN_DRY_BASELINE_FRACTION))`, `RAIN_DRY_BASELINE_FRACTION = 0.1`.
- `temperatureSignal` / `humiditySignal` both call `virtualDHT22(sim, panelExposure)` (from `src/lib/vec/sensorLayer.ts`, reused rather than reimplemented): `temperatureC = round((weather.temperature + exposure * 2) * 10) / 10`.

**3. Servo folding (`src/lib/embedded/servo.ts`) — kinematics-to-actuator boundary:**
```
worldRotationToServoAngle(worldDeg) = ((worldDeg % 180) + 180) % 180
servoAngleToPwmMicros(angle) = round(lerp(1000, 2000, clamp(angle / 180, 0, 1)))
```
This exploits the flat blade's own 180° optical symmetry (θ and θ+180° are the same physical plane, per `rotationSolver.ts`) — folding modulo 180° is exact, not an approximation. `ServoState.moving` is `abs(targetRotation - rotationAngle) > SERVO_SETTLED_DEG` (`SERVO_SETTLED_DEG = 0.5`), the same threshold `src/lib/dt/bladeAngle.ts`'s `describeBladeMotion` uses — the two "is it moving" readouts cannot disagree.

**4. `SimulatedController.updateSensors` (`src/lib/vec/simulatedController.ts`) — the Enoki firmware twin's decision tree, evaluated top-to-bottom, first match wins:**
```
if pauseSwitch                       → PAUSED,   targetAngle = 0
else if windAdc > WIND_CRITICAL      → STORM,    targetAngle = 0
else if rainAdc > RAIN_THRESHOLD     → RAIN,     targetAngle = 180
else if motion                       → OCCUPIED, targetAngle = 45
else if temperatureC > TEMP_OVERHEAT → OVERHEAT, targetAngle = runMPCOptimization(temp)
else:
  avgLeft = (l1+l2)/2 ; avgRight = (l3+l4)/2 ; error = avgLeft - avgRight
  if avgLeft > OVERCAST_THRESHOLD && avgRight > OVERCAST_THRESHOLD
                                      → OVERCAST, targetAngle = astroAngle()
  else                                → TRACKING
       if abs(error) > TRACKING_DEADBAND:
         targetAngle -= TRACK_STEP  (clamped to TRACK_MIN)  if error < 0
         targetAngle += TRACK_STEP  (clamped to TRACK_MAX)  otherwise
```
`astroAngle()` maps time-of-day linearly onto 3–177° between a 07:00 sunrise and 19:00 sunset (`mapRange(totalMinutes, 420, 1140, 3, 177)`), falling back to noon if a `wifi-loss` fault is injected. `runMPCOptimization` evaluates candidate angles 0–180° in 15° steps, scoring each by `cost = remainingSolarGain*100 - daylight*10 + movementPenalty`, and returns the lowest-cost angle — this is a genuine (if simplified) brute-force search, not a stub, and reuses `solarPosition()` from `src/lib/simulation/algorithms.ts` fixed to Kuala Lumpur coordinates (3.1390°, 101.6869°).

**5. `applyActuator` (`src/lib/vec/actuatorLayer.ts`)** drives `sim.skin.setPanelRotation(vecPanelId, packet.servoAngle)` — Panel 0 only.

## Engineering Equations

| Quantity | Equation | Source |
|---|---|---|
| Global/module lux | `lux = round(irradiance_Wm2 * 120)` | `ldrPhysics.ts` (`irradianceToLux`) |
| LDR resistance | `R = lux <= 0 ? 1_000_000 : min(10_000 * (10/lux)^0.7, 1_000_000)` | `ldrPhysics.ts` (`luxToLdrResistanceOhms`) |
| Divider voltage | `V = 3.3 * (10_000 / (10_000 + R))` | `ldrPhysics.ts` (`ldrResistanceToVoltage`) |
| ADC quantization | `ADC = round((V / 3.3) * 4095)` | `ldrPhysics.ts` (`voltageToAdcCounts`) |
| First-order smoothing | `α = 1 - e^(-dt/0.5)`; `filtered += (raw - filtered) * α` | `virtualSensor.ts` |
| Servo fold (180° symmetry) | `servoAngle = ((worldDeg % 180) + 180) % 180` | `embedded/servo.ts:47-49` |
| PWM pulse width | `pwm = lerp(1000, 2000, clamp(angle/180))` | `embedded/servo.ts:52-55` |
| LDR lower self-shade | `selfShade = 1 - (1 - openness) * 0.35` | `embedded/sensors.ts:157` |
| Anemometer pulse | `Hz = kmh * (4.6/18)` | `embedded/constants.ts:54`, `sensors.ts:192` |
| Rain sensor voltage | `V = 3.3 * (0.1 + wetness * 0.9)` | `embedded/sensors.ts:225`, `constants.ts:64` |
| DHT22 temperature | `T = round((weather.temperature + exposure*2) * 10)/10` | `vec/sensorLayer.ts:47` |
| VEC astro fallback | `angle = mapRange(minuteOfDay, 420, 1140, 3, 177)` clamped | `vec/simulatedController.ts:306-313` |
| VEC MPC cost | `cost = remainingSolarGain*100 - daylight*10 + movementPenalty` | `vec/simulatedController.ts:345` |

## Constants

| Constant | Value | File |
|---|---|---|
| `LUX_PER_WM2` | 120 | `src/lib/embedded/constants.ts` |
| `LDR_R10_OHMS` | 10,000 Ω | `constants.ts` — consumed by `ldrPhysics.ts`'s `luxToLdrResistanceOhms` |
| `LDR_GAMMA` | 0.7 | `constants.ts` — same |
| `LDR_DARK_RESISTANCE_OHMS` | 1,000,000 Ω | `constants.ts` — dark-condition ceiling the power law is clamped against as lux→0 |
| `LDR_FIXED_RESISTOR_OHMS` | 10,000 Ω | `constants.ts` |
| `LDR_LOWER_SELF_SHADE_MAX` | 0.35 | `constants.ts` |
| `ANEMOMETER_HZ_PER_KMH` | 4.6/18 ≈ 0.2556 | `constants.ts` |
| `RAIN_DRY_BASELINE_FRACTION` | 0.1 | `constants.ts` |
| `VCC` | 3.3 V | `constants.ts` |
| `ADC_MAX` | 4095 (= `FW.ADC_MAX`) | `constants.ts`, `vec/types.ts` |
| `LOOP_HZ` | `round(1000/FW.LOOP_MS*10)/10` = 5 Hz | `constants.ts`, `vec/types.ts` |
| `SERVO_MIN_DEG` / `SERVO_MAX_DEG` | 0 / 180 | `embedded/servo.ts` |
| `SERVO_SETTLED_DEG` | 0.5° | `embedded/servo.ts` |
| `PWM_MIN_US` / `PWM_MAX_US` | 1000 / 2000 µs | `embedded/servo.ts` |
| `WIND_CRITICAL` (VEC) | 2500 ADC | `vec/types.ts` (`FW`) |
| `RAIN_THRESHOLD` (VEC) | 1800 ADC | `vec/types.ts` |
| `TEMP_OVERHEAT` (VEC) | 33.0 °C | `vec/types.ts` |
| `TRACKING_DEADBAND` (VEC) | 150 ADC | `vec/types.ts` |
| `OVERCAST_THRESHOLD` (VEC) | 2000 ADC (avg) | `vec/types.ts` |
| `TRACK_MIN` / `TRACK_MAX` / `TRACK_STEP` (VEC) | 3° / 177° / 3°-per-200ms | `vec/types.ts` |
| `LOOP_MS` (VEC) | 200 ms | `vec/types.ts` |
| `TELEMETRY_MS` (VEC) | 3000 ms | `vec/types.ts` |
| `SERVO_BOOT_ANGLE` | 90° | `vec/types.ts` |

## Engineering References

- LDR GL5528-style CdS photoresistor datasheet convention (`R10`, `γ`) — cited in `embedded/constants.ts` and wired directly into `ldrPhysics.ts`'s resistance arithmetic; the displayed equation badge and the executed formula are the same code.
- ESP32-S3 12-bit SAR ADC, default attenuation ≈ VCC reference — `embedded/sensors.ts` step comments.
- 3-cup rotor anemometer pulse-counting convention — `embedded/sensors.ts` header.
- FC-37/YL-83-style resistive rain-detection board convention — `embedded/constants.ts`.
- `Enoki/src/sketch.ino` — the real firmware sketch `SimulatedController` ports byte-for-byte (per its own module header).

## Assumptions

- `src/lib/engine/ldrPhysics.ts` is the *only* place lux/resistance/voltage/ADC arithmetic is defined; `VirtualSensorEngine` (the live twin) and `src/lib/embedded/sensors.ts` (read-only explainability, per `embedded/index.ts`'s header) both call it rather than each carrying their own copy — including `ldrLowerSignal`'s self-shading proxy, which recomputes downstream of the shared base irradiance but through the same shared function.
- `src/lib/vec/*`'s `SimulatedController` uses its own, independently-thresholded decision tree (different constants, different states) from PBIF's — it is not a second implementation of PBIF, it is a twin of the physical ESP32 firmware for the Electronics Digital Twin.
- The 20×4 LCD, LED states, and PWM values are formatted exactly as the physical board would render them (`embedded/panel.ts`'s `lcdLines`, `ledState`).

## Limitations

- (Stage 7.10.2 — resolved) **No electrical noise model exists — and no documentation now claims otherwise.** CLAUDE.md's architecture description and the `VirtualSensors` knowledge-base entry previously described noise injection; determined to be a documentation error (noise was never intended — Stage 7.10.1's own validation criterion is "virtual sensor outputs remain deterministic"), both now state plainly that the sensing chain is a deterministic function of irradiance, smoothed only by the legitimate first-order low-pass filter (τ = 0.5 s).
- **The GL5528 power law is extrapolated well beyond its datasheet-calibrated range.** `R10`/`γ` are typical published values characterised over 10–100 lux; the Digital Twin applies the same power law up to full-daylight illuminance (tens of thousands of lux), clamped only by the dark-condition ceiling (`LDR_DARK_RESISTANCE_OHMS`) at the low end. Documented, not hidden — see `embedded/constants.ts`'s doc comments and `PBIF_ENGINEERING_GUIDE.md` §16.5.
- **`applyActuator`'s effect on the rendered façade depends on which control pipeline is active.** In `WEATHER_VALIDATION_MODE = true` (the current setting, `src/lib/engine/validationMode.ts`), `AdaptiveSkinEngine.updateValidation()` resolves each surface's target purely from `resolveTargetRotation(facadeControlMode, …)` and never consults `panelRotationOverride`/`panelStateOverride` — the maps `setPanelRotation` writes to. A VEC `applyActuator` call therefore records the override but has **no visible effect on Panel 0's rendered rotation** while validation mode is active; only the non-validation `updateFull()` path (which does check per-panel overrides in `resolveTarget()`) would honour it. This is a real, code-verified interaction gap, not a documented design decision.
- The VEC's fault-injection model (`dht-fail`, `servo-jam`, `wifi-loss`, etc.) only affects `SimulatedController`'s own internal state and trace — it is independent of the twin's `PanelHealth` (`ok`/`degraded`/`fault`/`offline`) used elsewhere in the engine.

## Dependencies

- Reads from `SolarPhysicsEngine` (effective irradiance, GHI, cloud attenuation) — see the Solar Physics documentation (not in this batch).
- Reads from `Simulation.weather`, `Simulation.sun`, `Simulation.clock` — see the Weather documentation (not in this batch).
- Reads `FacadePanel.rotationAngle` / `.targetRotation` / `.openness` / `.solarExposure` from [Adaptive Façade](./adaptive_facade.md).
- `embedded/panel.ts`'s `ledState` reads `sim.skin.getPbifEvaluation()` from [PBIF](./pbif.md).
- `vec/actuatorLayer.ts` writes into [Adaptive Façade](./adaptive_facade.md) via `AdaptiveSkinEngine.setPanelRotation`.

## Consumers

- `src/lib/engine/simulation.ts` — calls `virtualSensor.update()` every tick, ahead of `skin.update()`.
- `src/lib/engine/adaptiveSkin.ts` — reads `virtualSensor.getGlobalFilteredADC()` as PBIF's `solarADC` input.
- `src/components/twin3d/OcclusionDebug.tsx` — reads `VirtualSensorEngine` outputs for debug visualisation.
- `src/lib/assistant/contextBuilder.ts` — reads `VirtualSensorEngine` and `AdaptiveSkinEngine` state for the AI assistant's engineering context.
- `src/lib/engine/store.ts` and `src/components/embedded/VirtualEmbeddedPanel.tsx` — call `computeEmbeddedState()` for the "Virtual Embedded System" UI panel.
- `src/components/twin3d/SelectedModuleHighlight.tsx` — uses `pickUpperCentrePanel`.
- `src/lib/vec/store.ts` — the synchronisation loop: `buildSensorPacket` → `controller.updateSensors` → `controller.readOutputs` → `applyActuator`.
- `src/components/embedded/VirtualEmbeddedPanel.tsx`, `src/components/embedded/CircuitSimulation.tsx` — use `LDR_QUADRANTS` / `ldrQuadrantSignals` for the four-channel presentation.

## Public API

**`src/lib/engine/ldrPhysics.ts`**
- `irradianceToLux(irradianceWm2: number): number`
- `luxToLdrResistanceOhms(lux: number): number`
- `ldrResistanceToVoltage(resistanceOhms: number): number`
- `voltageToAdcCounts(voltage: number): number`
- `computeLdrChain(effectiveIrradianceWm2: number): { lux, resistanceOhms, voltage, adc }`

**`VirtualSensorEngine`** (`src/lib/engine/virtualSensor.ts`)
- `update(surfaces: BuildingSurface[], solarPhysics: SolarPhysicsEngine, dt: number): void`
- `getGlobalLux/Resistance/Voltage/ADC/FilteredADC(): number`
- `getModuleLux/Resistance/Voltage/ADC/FilteredADC(id: string): number`

**`src/lib/embedded/index.ts`**
- `computeEmbeddedState(sim: Simulation, panelId: string | undefined, manual: ManualEmbeddedInputs): EmbeddedState`

**`src/lib/embedded/panel.ts`**
- `pickUpperCentrePanel(sim: Simulation): FacadePanel | undefined`
- `panelIndex(sim: Simulation, panelId: string): number`
- `servoState(panel: FacadePanel): ServoState`
- `ledState(sim: Simulation, mode: FacadeControlMode): LedState`
- `lcdLines(sim: Simulation, mode: FacadeControlMode, angle: number): string[]`

**`src/lib/embedded/servo.ts`**
- `worldRotationToServoAngle(worldRotationDeg: number): number`
- `servoAngleToPwmMicros(servoAngleDeg: number): number`

**`src/lib/vec/index.ts`**
- `createController(kind: ControllerKind, opts?: CreateControllerOptions): VirtualEmbeddedController`
- `buildSensorPacket(sim: Simulation, overrides: SensorOverrides): VirtualSensorPacket | null`
- `applyActuator(sim: Simulation, packet: ActuatorPacket): string | null`
- `vecPanelId(sim: Simulation): string | null`

**`SimulatedController`** (implements `VirtualEmbeddedController`)
- `connect(): Promise<void>` / `disconnect(): Promise<void>`
- `updateSensors(raw: VirtualSensorPacket): void`
- `readOutputs(): ActuatorPacket`
- `getStatus(): ControllerStatus`
- `onTelemetry(cb): () => void` / `onSerial(cb): () => void`
- `getDebugTrace(): ExecutionTrace | null`
- `injectFault(f: FaultKind): void` / `clearFault(f: FaultKind): void` / `getFaults(): FaultReport[]`

## Live Outputs

- `EmbeddedState.servo: ServoState { worldRotationTarget, worldRotationCurrent, servoCommandAngle, pwmMicros, servoPositionAngle, moving }`
- `EmbeddedState.led: LedState { tracking, maintenance, override }`
- `EmbeddedState.lcd: string[]` (4 lines)
- `EmbeddedState.sensors.{ldrUpper,ldrLower,wind,rain,temperature,humidity,pir,pauseSwitch}: SensorSignal { id, name, pin, gpioLabel, steps: SignalStep[], raw }`
- `ActuatorPacket { servoAngle, redLed, greenLed, lcd, state: FirmwareState }`
- `TelemetryPacket { timestamp, state, temp, humidity, wind, rain, motion, angle }`
- `ExecutionTrace { loop, timestamp, stages: StageRun[], variables: DebugVariable[], decision: DecisionBreakdown, timing: TimingBreakdown, faults: FaultKind[] }`

## Source Files

- `src/lib/engine/ldrPhysics.ts`
- `src/lib/engine/virtualSensor.ts`
- `src/lib/embedded/sensors.ts`, `panel.ts`, `servo.ts`, `constants.ts`, `index.ts`
- `src/lib/vec/simulatedController.ts`, `actuatorLayer.ts`, `sensorLayer.ts`, `types.ts`, `index.ts`
- `src/components/embedded/ldrQuadrants.ts`
- `src/lib/dt/bladeAngle.ts` (canonical rotation labels — not the source of any physics here, only formatting)

## Design Rationale

- `embedded/*` is deliberately kept **independent** of `vec/*` (its own module header states this explicitly): one is read-only explainability layered over PBIF's real control loop, the other is a bidirectional, fault-injectable ESP32 twin for a separate Electronics Digital Twin exhibit. Conflating them would let a debugging/demo tool silently take over the façade PBIF controls.
- The servo-fold math in `embedded/servo.ts` exists specifically because Building Kinematics is allowed to accumulate unbounded world rotation (e.g. −735° across a day) so a blade never "unwinds" — a real servo cannot do that, so folding modulo 180° via the blade's own optical symmetry is presented as the physically-correct translation, not an approximation.
- `SERVO_SETTLED_DEG` is defined once in `embedded/servo.ts` and reused by both `ServoState.moving` and `src/lib/dt/bladeAngle.ts`'s `describeBladeMotion`, so "is it moving" can never disagree between the Advanced Servo Diagnostics panel and the canonical Servo Status readout (CLAUDE.md §5.2).
- `ldrQuadrants.ts` re-presents two real channels as four purely because the demonstration hardware has four physical photoresistor mounting points; CLAUDE.md §5.1 is explicit that no new physics is introduced by this.

## Future Extension Points

- Add a genuine electrical noise/thermal-drift model to `VirtualSensorEngine`, if a future stage decides more realism is worth the added non-determinism — no documentation currently promises this, so it would be new scope, not a gap to close.
- `vec/types.ts` documents `RealEsp32Controller` as a future `ControllerKind` reusing the same MQTT transport as `WokwiMqttController` — no new architecture required to add a physical board.
