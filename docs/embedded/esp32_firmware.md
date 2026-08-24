# ESP32 Firmware & the Virtual Embedded Controller

I built a physical adaptive-façade prototype around an ESP32-S3, wired and simulated in Wokwi, running a C++ sketch that makes its own local shading decisions from four photoresistors, a DHT22, and two potentiometers standing in for wind and rain sensors. It talks to the website over MQTT. Independently, the Digital Twin carries two software models of that hardware: a read-only explainability layer that narrates what the ESP32 would be reading, and a bidirectional Virtual Embedded Controller (VEC) that actually drives one façade panel from firmware logic running in the browser. This page documents all three, and is explicit about where they agree and where they don't.

Source: [`E&M Programming/sketch.ino`](<../../E&M Programming/sketch.ino>) (the physical/Wokwi firmware), [`E&M Programming/diagram.json`](<../../E&M Programming/diagram.json>) (the wired circuit), [`src/lib/embedded/`](../../src/lib/embedded/) (digital-twin explainability layer), [`src/lib/vec/`](../../src/lib/vec/) (the Virtual Embedded Controller), [`src/components/embedded/ldrQuadrants.ts`](../../src/components/embedded/ldrQuadrants.ts) (the four-LDR presentation mapping).

## Hardware

The circuit is defined in [`diagram.json`](<../../E&M Programming/diagram.json>) — a Wokwi project (`author: "LIM YONG HEN"`, board `board-esp32-s3-devkitc-1`) — and driven by the sketch's pin table:

| Component | Wokwi part | Pin(s) | Role in the sketch |
|---|---|---|---|
| 4× photoresistor | `wokwi-photoresistor-sensor` (`ldr1`–`ldr4`) | GPIO 1 / 2 / 3 / 4 | Quadrant light sensing for sun tracking |
| Potentiometer ("wind") | `wokwi-potentiometer` (`pot2`) | GPIO 5 | Stands in for a wind sensor; doubles as a manual time-dial (below) |
| Potentiometer ("rain") | `wokwi-potentiometer` (`pot1`) | GPIO 6 | Stands in for a resistive rain-detection board |
| DHT22 | `wokwi-dht22` (`dht1`) | GPIO 8 (data) | Real temperature/humidity device model |
| 16×2 LCD | `wokwi-lcd1602` (`lcd2`), I²C @ 0x27 | GPIO 47 (SDA) / 48 (SCL) | Two-line status display |
| Servo | `wokwi-servo` (`servo1`) | GPIO 21 (PWM) | Drives the louvre — Wokwi's generic servo part; the diagram doesn't specify a model, so I'm not naming one here |
| PIR motion sensor | `wokwi-pir-motion-sensor` (`pir1`) | *unconnected* | Placed on the board but wired to nothing in `diagram.json`, and never read by the sketch — occupancy sensing isn't part of this firmware revision |

The four photoresistors are genuinely four independent components, laid out as a physical quadrant (`ldr1` top-left, `ldr2` bottom-left, `ldr3` top-right — rotated 180° — `ldr4` bottom-right, by their `diagram.json` coordinates), each on its own analog pin. The two "environmental" sensors are potentiometers, not an anemometer or a rain board — a deliberate prototyping substitution I'll come back to under Assumptions.

`libraries.txt` lists the dependencies: `LiquidCrystal I2C`, `DHT sensor library`, `ESP32Servo`, `PubSubClient`, `SolarCalculator` (NOAA solar-position algorithms).

## Firmware architecture

`loop()` runs four stages in this order, every ~200 ms (`delay(200)` at the end of the loop, ≈5 Hz):

**1. MQTT housekeeping** — reconnect if not connected, then `mqttClient.loop()`.

**2. Sense** — `analogRead()` all four LDRs, the wind pot, and the rain pot; `dht.readTemperature()`, falling back to 27.5 °C if the read returns `NaN`.

**3. Decide** — a priority `if…else if…else` chain, evaluated top to bottom, first match wins:

```
windVal > WIND_CRITICAL        → STORM_LOCKOUT
rainVal < REAL_RAIN_THRESHOLD  → RAIN_RETRACT
temp > TEMP_OVERHEAT           → SHADING
else                           → TRACKING
```

The `FacadeState` enum also declares `SYSTEM_INIT`, used only as the boot-time default before the first loop iteration — the decision chain itself resolves to one of the four states above. `WIND_CRITICAL` is currently `9999`, which the sketch's own comment explains is deliberate: *"Temporarily set to 9999 so you can use the full POT range for the time dial without tripping storm mode"* — the wind branch is effectively disabled for this demo build, not a modelling gap. `rainVal < REAL_RAIN_THRESHOLD` follows the comment *"Real rain sensors read LOW when wet"* — the polarity is written for a real resistive rain board even though the prototype's potentiometer doesn't behave like one.

**4. Act** — each state writes a target angle and an LCD line, then `facadeServo.write(currentAngle)` runs unconditionally after the switch:

| State | Angle | LCD |
|---|---|---|
| `STORM_LOCKOUT` | 0° | `STORM LOCKOUT! / Angle: 0 deg` |
| `RAIN_RETRACT` | 180° | `RAIN DETECTED / Angle: 180 deg` |
| `SHADING` | 45° | `OVERHEAT MODE / Shading: XX.XC` |
| `TRACKING` | see below | `SOLAR TRACKING` or `OVERCAST MODE` |

`TRACKING` itself branches in two: it averages the left pair (`avgLeft = (ldr1+ldr2)/2`) against the right pair (`avgRight = (ldr3+ldr4)/2`) and takes `error = avgLeft - avgRight`.

- If **both** averages read below 400 (dark/overcast — the LDRs can't see a differential), it falls back to `getAstronomicalSunAngle()`: reads the wind potentiometer as a *manual time dial* (0–4095 mapped onto 7:00 AM–7:00 PM), computes the sun's azimuth for that dialled time at fixed Kuala Lumpur coordinates (3.1390° N, 101.6869° E, UTC+8) via the `SolarCalculator` NOAA algorithm, and maps azimuth 90°–270° onto a 0°–180° panel angle.
- Otherwise it does a bounded proportional step: if `|error| > TRACKING_DEADBAND` (150), it nudges the angle ±3° per loop, clamped to roughly 5°–175°.

Setup (`setup()`) initialises the LCD and DHT, attaches the servo and boots it to 90°, connects WiFi (10 attempts × 500 ms), syncs the clock over NTP (`pool.ntp.org`, `time.nist.gov`) for the astronomical fallback, and configures the MQTT server — before the loop ever runs.

## Communication (MQTT)

The sketch publishes telemetry every `TELEMETRY_INTERVAL` (3000 ms) while connected:

| Field | Value |
|---|---|
| Broker | `broker.hivemq.com:1883` — HiveMQ's public test broker, plaintext, no authentication |
| WiFi | SSID `Wokwi-GUEST`, empty password — Wokwi's built-in free simulator network |
| Topic | `iem_facade/telemetry` |
| Client ID | `"ESP32Facade-" + random(0, 10000)` |
| Payload | `{"status":"<state>","temp":<1dp>,"wind":<raw ADC>,"rain":<raw ADC>,"angle":<deg>}` |

This is a prototyping/demo configuration — a public unauthenticated test broker is the right tool for a competition build where the goal is to prove the telemetry path works, not to run a production fleet.

## Relationship to the Digital Twin

The website carries the ESP32 in two separate, independent software forms, plus one presentation-layer relabeling. None of the three reads weather or PBIF state directly — each goes through its own explicit physics/electrical model.

### 1. `src/lib/embedded/` — read-only explainability

This is "Layer 2 of the Digital Twin" (its own module header's phrase): it picks one façade module (`pickUpperCentrePanel`, the "Upper Centre" panel), and derives what its ESP32 would read and display — LDR chain (`sensors.ts`, through the shared GL5528 model in [`src/lib/engine/ldrPhysics.ts`](../../src/lib/engine/ldrPhysics.ts)), wind/rain/temperature/humidity, servo state (`servo.ts`), LEDs and LCD text (`panel.ts`) — purely by reading values PBIF and the kinematics solver already computed elsewhere. It never writes back to the simulation and is explicitly documented as independent of `src/lib/vec/`.

### 2. `src/lib/vec/` — the Virtual Embedded Controller

This one actively commands the façade. `VECDriver` runs its own `setInterval` (100 ms, self-gated to the firmware's 200 ms cadence via `FW.LOOP_MS`) outside the Canvas, entirely separate from `Simulation.tick()` — it is gated off only in Weather Validation Mode. Each tick, `store.ts`'s `sync()` builds a `VirtualSensorPacket` from the live simulation (`buildSensorPacket`), hands it to whichever controller is active, reads back an `ActuatorPacket`, and applies it to exactly one panel (`applyActuator` → `sim.skin.setPanelRotation`, "Panel 0"). Two controllers implement the same `VirtualEmbeddedController` interface:

- **`SimulatedController`** — a pure-TypeScript firmware model, run in-process for the Electronics Digital Twin's Live Embedded Execution Debugger. Beyond the servo/LED/LCD outputs it publishes a full per-loop `ExecutionTrace` (pipeline stages, timings, every internal variable, a decision breakdown) and accepts injected faults (`dht-fail`, `servo-jam`, `wifi-loss`, `mqtt-loss`, `adc-noise`, `ldr-disconnect`, `servo-wire-break`, `power-loss`) so a fault can be triggered and watched resolve.
- **`WokwiMqttController`** — subscribes over MQTT-over-WebSocket to a *different* broker (a private, authenticated HiveMQ Cloud instance, topic `Enokitop1/iem-facade`) and decodes real telemetry frames into the same `ActuatorPacket` shape, so a live board on that broker is a drop-in replacement for the simulated one.

**On the "byte-for-byte" claim.** `SimulatedController`'s own header comment states it "ports `Enoki/src/sketch.ino`'s 6-level priority state machine byte-for-byte." That path doesn't exist anywhere in this repository — `wokwiMqttController.ts` clarifies "Enoki" as a teammate's separate project ("the teammate's public demo credentials, already committed to the *Enoki* repo"), not the `E&M Programming/sketch.ino` documented above. Comparing what's actually here, the two diverge on both structure and numbers:

| | `E&M Programming/sketch.ino` (physical) | `src/lib/vec` `SimulatedController` |
|---|---|---|
| States reached | 4 (`TRACKING`, `SHADING`, `RAIN_RETRACT`, `STORM_LOCKOUT`) | 8 (adds `PAUSED`, `OCCUPIED`, `OVERCAST` as a distinct state, `UNKNOWN`) |
| Wind threshold | `WIND_CRITICAL = 9999` (deliberately disabled) | `FW.WIND_CRITICAL = 2500` ADC (active) |
| Rain threshold | `REAL_RAIN_THRESHOLD = 1500`, triggers *below* | `FW.RAIN_THRESHOLD = 1800`, triggers *above* |
| Overheat threshold | `TEMP_OVERHEAT = 35.0 °C` | `FW.TEMP_OVERHEAT = 33.0 °C` |
| Overcast/dark detection | per-side average `< 400` | average `> FW.OVERCAST_THRESHOLD (2000)` |
| Overheat response | fixed 45° | `runMPCOptimization()` — a 0–180° cost-minimising search over candidate angles using live solar azimuth/elevation |
| Occupancy / pause switch | not present | `PAUSED` and `OCCUPIED` states, driven by a PIR and a maintenance switch |
| Tracking deadband | 150 ADC | `FW.TRACKING_DEADBAND = 150` ADC — matches |
| Boot angle | 90° | `SERVO_BOOT_ANGLE = 90°` — matches |
| MQTT topic / broker | `iem_facade/telemetry` @ `broker.hivemq.com:1883` (public, no auth) | `Enokitop1/iem-facade` @ a private HiveMQ Cloud instance over WSS (authenticated) |

So I'm describing `SimulatedController` as what it actually is: a functional TypeScript reimplementation of the same priority-ordered, first-match-wins decision philosophy as the physical firmware — sense, then an ordered safety/comfort/tracking cascade, then act — extended with additional simulated-only behaviour (PIR occupancy, a pause switch, an MPC-style overheat search, fault injection) that the Electronics Digital Twin debugger needs and that `E&M Programming/sketch.ino` doesn't implement. It is not a literal transliteration of the sketch shipped in this repository, and I've corrected that claim here rather than repeat it.

### 3. The four-LDR presentation mapping

[`ldrQuadrants.ts`](../../src/components/embedded/ldrQuadrants.ts) re-labels the digital twin's sensor readings for the Virtual Embedded Controller panel's UI. This is presentation-only and worth stating precisely, since it's easy to overclaim:

- `src/lib/embedded/sensors.ts` (the explainability layer, item 1 above) models **two** real light channels — `ldrUpper` (ADC0) and `ldrLower` (ADC1) — through the shared GL5528 chain. This is deliberate: the differential the kinematics solver and PBIF actually consume is vertical (upper vs. lower), matching the blade's single rotation axis.
- The panel then presents those two channels across **four** labelled quadrants — Top Left / Top Right both read `ldrUpper`, Bottom Left / Bottom Right both read `ldrLower` — sharing `steps` and `raw` by reference. No averaging, no extra physics, no decision logic is added; it's a relabeling for visual continuity with the physical board's four-photoresistor layout. Wind and rain move to ADC4/ADC5 to make room.
- This is a genuine difference in *axis*, not just channel count, from the physical circuit: `E&M Programming/sketch.ino` wires four independent LDRs and differentiates **left column vs. right column** (`avgLeft = (ldr1+ldr2)/2` vs `avgRight = (ldr3+ldr4)/2`) for its tracking correction. The digital twin's two-channel model differentiates **top vs. bottom** instead. Both are internally consistent with what each system actually needs to track; I'm noting the difference so it isn't mistaken for the same signal under two names.

`VirtualSensorEngine`, `SolarPhysicsEngine`, PBIF and the Adaptive Skin Engine are unaffected by any of this — the relabeling never reaches the engines, per CLAUDE.md §5.1.

## Constants and thresholds

| Constant | Physical firmware (`sketch.ino`) | VEC (`vec/types.ts` `FW`) | PBIF (`pbif/thresholds.ts`) |
|---|---|---|---|
| Wind | `WIND_CRITICAL = 9999` (disabled) | `WIND_CRITICAL = 2500` ADC | `WIND_KMH.HIGH = 35`, `.EXTREME = 50` km/h |
| Rain | `REAL_RAIN_THRESHOLD = 1500` (fires below) | `RAIN_THRESHOLD = 1800` ADC (fires above) | `RAIN_LEVEL.LIGHT/.MODERATE/.HEAVY = 0.05 / 0.35 / 0.65` (normalised) |
| Overheat | `TEMP_OVERHEAT = 35.0 °C` | `TEMP_OVERHEAT = 33.0 °C` | `TEMPERATURE_C.HIGH = 30 °C` |
| Tracking deadband | `TRACKING_DEADBAND = 150` (ADC) | `TRACKING_DEADBAND = 150` (ADC) | `DYNAMIC_DEADBAND_DEG` 2°/5°/8° (degrees — different unit) |
| Track step / bounds | 3° per loop, ~5°–175° | `TRACK_STEP = 3°`, `TRACK_MIN/MAX = 3°/177°` | — |
| Overcast/dark detect | per-side avg `< 400` | avg `> 2000` | `ADC_TO_SOLAR_RESOURCE.MEDIUM_THRESHOLD = 2000` — matches the VEC's convention |
| Rain-safe angle | `RAIN_RETRACT → 180°` | `RAIN → 180°` | `RAIN_SAFE_ANGLE = 135°` |
| Boot angle | 90° | `SERVO_BOOT_ANGLE = 90°` | — |
| Loop cadence | `delay(200)` ≈ 5 Hz | `LOOP_MS = 200` — matches | tied to `Simulation.tick()`, not this loop |
| Telemetry cadence | `TELEMETRY_INTERVAL = 3000` ms | `TELEMETRY_MS = 3000` ms — matches | — |

Three of these are worth reading correctly rather than as contradictions. First, PBIF's thresholds live in physical units (km/h, °C, a 0–1 normalised rain intensity) because they gate the *digital twin's own* software model of wind/rain/temperature; the firmware thresholds live in raw 12-bit ADC counts (0–4095) because that's what a potentiometer or sensor board actually hands the ESP32 — the two domains were never meant to be numerically identical, only conceptually parallel (wind/rain/thermal safety triage, evaluated in priority order). Second, `RAIN_SAFE_ANGLE = 135°` is PBIF's own tuned rain-shedding posture for the twin's kinematics; the firmware's flat 180° is a separate, independently-chosen retract angle for the physical build. Third, where the numbers genuinely do match — `TRACKING_DEADBAND`, boot angle, loop cadence, telemetry cadence, and the VEC's overcast threshold against PBIF's `MEDIUM_THRESHOLD` — that's intentional alignment I'm calling out explicitly, per CLAUDE.md §12's rule that a matching constant should be stated as matching, not left for the reader to notice.

## Engineering assumptions

- **`WIND_CRITICAL = 9999` is a temporary demo override, not a design decision.** The sketch's own comment says so directly — it widens the wind potentiometer's full sweep for use as the astronomical-fallback time dial without accidentally tripping storm lockout during a demo.
- **Wind and rain are potentiometers standing in for real sensors.** The physical build reads a cup-anemometer-shaped and a rain-board-shaped decision purely from two pots; the rain branch's polarity (`rainVal < threshold`) is written to match how a real resistive rain board is wired, even though the substitute component doesn't itself get wet.
- **The PIR motion sensor is present in the circuit but not wired or read.** `diagram.json` places `pir1` with no connections, and `sketch.ino` never references it — occupancy-aware shading exists only in the separate VEC software model (`SimulatedController`'s `OCCUPIED` state), not in this physical build.
- **The astronomical fallback is a genuine second tracking mode, not a placeholder.** When both LDR averages read dark, the sketch computes a real NOAA solar position (via `SolarCalculator`) from fixed Kuala Lumpur coordinates and NTP-synced time, rather than freezing the servo.
- **The MQTT broker is a public, unauthenticated test broker by design.** `broker.hivemq.com:1883` is HiveMQ's open sandbox — the right choice for proving the telemetry path in a demo build, not a claim about production security.
- **`SimulatedController` is a related but separately-tuned firmware model, not a transliteration of the sketch in this repo.** See the comparison table above; I don't repeat the "byte-for-byte" or "Enoki" framing found in its own source comments without qualifying what that actually refers to.
- **I haven't measured continuous physical deployment.** This is a working Wokwi-simulated/prototype build with a real pin-out and a real decision loop; nothing here claims logged field performance or uptime beyond what the sketch and diagram themselves describe.

Related: [PBIF & Adaptive Façade Kinematics](../facade/pbif_and_kinematics.md) — the digital twin's own decision layer and the kinematics solver the VEC's servo output ultimately maps onto. [Façade Design Concept](../facade/design_concept.md) — the target full-scale physical specification (RDS3225 servos, 6063-T6 aluminium blades, a dedicated sensor tower) this prototype's potentiometers and generic servo part are a demo-scale stand-in for.
