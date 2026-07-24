/**
 * Virtual Embedded Controller (VEC) — the hardware abstraction boundary.
 *
 * The website is the master simulation; a VEC is whatever is playing the role of
 * the electronics inside ONE façade panel. The website talks ONLY to this
 * interface — never to Wokwi directly — so the implementation is swappable:
 *
 *   SimulatedController   — pure-TS twin of the ESP32 firmware (default, offline)
 *   WokwiMqttController   — the real Wokwi ESP32 over MQTT/WebSocket
 *   RealEsp32Controller   — a physical board over the same MQTT (future)
 *
 * All three satisfy `VirtualEmbeddedController`, so the Digital Twin's
 * synchronisation, sensor, and actuator layers are identical regardless of which
 * controller is plugged in. Packets are expressed in **hardware-native units**
 * (ADC counts, °C, booleans) exactly as the firmware sees them, so a real board
 * running the same sketch is a drop-in replacement.
 */

// ---------------------------------------------------------------------------
// Which implementation is backing the VEC right now.
// ---------------------------------------------------------------------------
export type ControllerKind = 'simulated' | 'wokwi-mqtt' | 'real-esp32'

export type LinkState = 'disconnected' | 'connecting' | 'connected'

/**
 * Firmware operating modes, mirrored 1:1 from `Enoki/src/sketch.ino`'s
 * `SystemState` priority tree. Kept as the wire string the firmware publishes.
 */
export type FirmwareState =
  | 'PAUSED'
  | 'STORM'
  | 'RAIN'
  | 'OCCUPIED'
  | 'OVERHEAT'
  | 'TRACKING'
  | 'OVERCAST'
  | 'UNKNOWN'

// ---------------------------------------------------------------------------
// Sensor packet — what the environment pushes INTO the controller.
// Units are exactly what the ESP32 firmware reads from its pins.
// ---------------------------------------------------------------------------
export interface VirtualSensorPacket {
  timestamp: number
  /** DHT22 temperature, °C. */
  temperatureC: number
  /** DHT22 relative humidity, %. */
  humidityPct: number
  /** Wind potentiometer, ADC 0–4095 (firmware: > 2500 ⇒ storm lockout). */
  windAdc: number
  /** Rain potentiometer, ADC 0–4095 (firmware: > 1800 ⇒ rain retract). */
  rainAdc: number
  /** PIR motion (firmware: HIGH ⇒ occupied mode). */
  motion: boolean
  /** Maintenance slide switch (firmware: LOW/true ⇒ system paused). */
  pauseSwitch: boolean
  /** Four photoresistors, ADC 0–4095 (higher = darker). l1/l2 left, l3/l4 right. */
  ldr: { l1: number; l2: number; l3: number; l4: number }
}

// ---------------------------------------------------------------------------
// Actuator packet — what the controller drives OUT (read by the twin).
// ---------------------------------------------------------------------------
export interface ActuatorPacket {
  /** Louver servo target, 0–180°. Maps directly to Adaptive Skin blade rotation. */
  servoAngle: number
  /** Red status LED — override / emergency active. */
  redLed: boolean
  /** Green status LED — auto solar-tracking active. */
  greenLed: boolean
  /** 20×4 LCD contents (4 lines), as the firmware renders them. */
  lcd: string[]
  /** Decoded firmware decision. */
  state: FirmwareState
}

// ---------------------------------------------------------------------------
// Telemetry packet — the firmware's MQTT JSON, plus an optional serial line.
// Matches `sendTelemetry()` in the sketch exactly.
// ---------------------------------------------------------------------------
export interface TelemetryPacket {
  timestamp: number
  state: FirmwareState
  temp: number
  humidity: number
  wind: number
  rain: number
  motion: boolean
  angle: number
}

// ---------------------------------------------------------------------------
// Controller status — surfaced by the "Virtual Embedded Controller" UI panel.
// ---------------------------------------------------------------------------
export interface ControllerStatus {
  kind: ControllerKind
  /** Human label, e.g. "Virtual ESP32 · SimulatedController". */
  label: string
  online: boolean
  wifi: LinkState
  mqtt: LinkState
  /** ms since connect(). */
  uptimeMs: number
  /** Firmware/board identity string, e.g. "ESP32-S3 · Enoki v1". */
  firmware: string
}

// ---------------------------------------------------------------------------
// Live Embedded Execution Debugger — firmware transparency model.
// A controller MAY expose a per-loop execution trace so the Electronics Digital
// Twin can visualise every computational step, variable, and timing figure.
// ---------------------------------------------------------------------------

/** Ordered stages of one firmware loop iteration (the execution pipeline). */
export type DebugStageId =
  | 'loop-start'
  | 'read-dht'
  | 'read-ldr'
  | 'read-rain'
  | 'read-wind'
  | 'read-pir'
  | 'read-switch'
  | 'update-sensors'
  | 'compute-env'
  | 'evaluate-decision'
  | 'building-objective'
  | 'surface-strategy'
  | 'panel-strategy'
  | 'compute-servo'
  | 'update-pwm'
  | 'move-servo'
  | 'update-lcd'
  | 'publish-mqtt'
  | 'loop-complete'

export type VarGroup = 'sensor' | 'environment' | 'decision' | 'actuator' | 'comm' | 'timing'

/** A single monitored firmware variable, as an embedded debugger would show it. */
export interface DebugVariable {
  name: string
  value: string | number | boolean
  unit?: string
  group: VarGroup
  /** Firmware type annotation, e.g. "float", "int", "bool", "enum". */
  type?: string
}

/** One executed pipeline stage with its firmware-function trace. */
export interface StageRun {
  id: DebugStageId
  label: string
  /** Firmware function, e.g. "readTemperature()". */
  fn: string
  description: string
  inputs: string[]
  outputs: string[]
  /** Execution time of this stage, microseconds. */
  durationUs: number
  note?: string
}

/** Why the firmware chose what it chose (surfaced at the decision stage). */
export interface DecisionBreakdown {
  firmwareState: FirmwareState
  buildingObjective: string
  surfaceStrategy: string
  panelStrategy: string
  reason: string
  confidence: number // 0–1
  alternatives: { label: string; reason: string }[]
}

export interface TimingBreakdown {
  loopFreqHz: number
  computeUs: number
  sensorUs: number
  decisionUs: number
  pwmUs: number
  mqttUs: number
  loopPeriodMs: number
}

/** A full snapshot of one firmware loop, for the execution debugger + replay. */
export interface ExecutionTrace {
  loop: number
  timestamp: number
  stages: StageRun[]
  variables: DebugVariable[]
  decision: DecisionBreakdown
  timing: TimingBreakdown
  faults: FaultKind[]
}

// ---------------------------------------------------------------------------
// Fault injection — the EDT can deliberately break the hardware to demonstrate
// detection, management, and recovery.
// ---------------------------------------------------------------------------
export type FaultKind =
  | 'dht-fail'
  | 'servo-jam'
  | 'wifi-loss'
  | 'mqtt-loss'
  | 'adc-noise'
  | 'ldr-disconnect'
  | 'servo-wire-break'
  | 'power-loss'

export interface FaultReport {
  kind: FaultKind
  active: boolean
  detected: boolean
  detection: string
  response: string
}

// ---------------------------------------------------------------------------
// THE interface. The website communicates only through this.
// ---------------------------------------------------------------------------
export interface VirtualEmbeddedController {
  readonly kind: ControllerKind
  /** Bring the controller online (open MQTT, boot the sim, etc.). Idempotent. */
  connect(): Promise<void>
  /** Take the controller offline and release resources. */
  disconnect(): Promise<void>
  /** Push the latest environment-derived sensor readings to the controller. */
  updateSensors(sensorData: VirtualSensorPacket): void
  /** Read the controller's current actuator outputs (non-blocking snapshot). */
  readOutputs(): ActuatorPacket
  /** Current status for the dashboard. */
  getStatus(): ControllerStatus
  /** Subscribe to telemetry; returns an unsubscribe function. */
  onTelemetry(callback: (telemetry: TelemetryPacket) => void): () => void
  /** Subscribe to serial-monitor lines; returns an unsubscribe function. */
  onSerial(callback: (line: string) => void): () => void

  // -- Optional debugging capability (SimulatedController implements fully) ---
  /** The most recent per-loop execution trace, if the controller exposes one. */
  getDebugTrace?(): ExecutionTrace | null
  /** Inject a hardware fault. */
  injectFault?(fault: FaultKind): void
  /** Clear a hardware fault. */
  clearFault?(fault: FaultKind): void
  /** Currently active faults with detection/response detail. */
  getFaults?(): FaultReport[]
}

/** Type-guard: does this controller expose the execution-debugger capability? */
export function isDebuggable(
  c: VirtualEmbeddedController,
): c is VirtualEmbeddedController & Required<Pick<VirtualEmbeddedController, 'getDebugTrace' | 'injectFault' | 'clearFault' | 'getFaults'>> {
  return typeof c.getDebugTrace === 'function'
}

// ---------------------------------------------------------------------------
// Firmware constants — mirrored from Enoki/src/sketch.ino so the Simulated
// controller and the sensor encodings stay in lock-step with the real board.
// ---------------------------------------------------------------------------
export const FW = {
  WIND_CRITICAL: 2500, // ADC > ⇒ STORM_LOCKOUT
  RAIN_THRESHOLD: 1800, // ADC > ⇒ RAIN_RETRACT
  TEMP_OVERHEAT: 33.0, // °C > ⇒ OVERHEAT_SHADE
  TRACKING_DEADBAND: 150, // ADC |L-R| minimum to step the motor
  OVERCAST_THRESHOLD: 2000, // avg ADC > ⇒ overcast (astronomical fallback)
  ADC_MAX: 4095,
  SERVO_MIN: 0,
  SERVO_MAX: 180,
  TRACK_MIN: 3,
  TRACK_MAX: 177,
  TRACK_STEP: 3, // ° per 200 ms loop
  LOOP_MS: 200, // firmware loop cadence
  TELEMETRY_MS: 3000, // MQTT publish cadence
  MQTT_TOPIC: 'Enokitop1/iem-facade',
} as const

/** The default servo boot angle, matching `int currentServoAngle = 90`. */
export const SERVO_BOOT_ANGLE = 90
