/**
 * SimulatedController — a pure-TypeScript twin of the Enoki ESP32 firmware,
 * instrumented for the Live Embedded Execution Debugger.
 *
 * It ports `Enoki/src/sketch.ino`'s 6-level priority state machine byte-for-byte
 * (thresholds live in {@link FW}), so Panel 0 reacts *exactly* as the real board
 * would — but with zero network and zero latency. Beyond running the logic, it
 * publishes a full {@link ExecutionTrace} for every loop iteration: the ordered
 * pipeline stages, per-stage firmware-function timing, every internal variable,
 * and the decision breakdown (objective / strategy / confidence / alternatives).
 * The Electronics Digital Twin observes this trace — it owns no logic itself.
 *
 * It also accepts injected {@link FaultKind}s so judges can break the hardware
 * and watch detection, management, and recovery.
 */

import {
  FW,
  SERVO_BOOT_ANGLE,
  type ActuatorPacket,
  type ControllerStatus,
  type DebugVariable,
  type DecisionBreakdown,
  type ExecutionTrace,
  type FaultKind,
  type FaultReport,
  type FirmwareState,
  type StageRun,
  type TelemetryPacket,
  type TimingBreakdown,
  type VirtualEmbeddedController,
  type VirtualSensorPacket,
} from './types'
import { solarPosition } from '../simulation/algorithms'

const clampi = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const mapRange = (x: number, inLo: number, inHi: number, outLo: number, outHi: number) =>
  ((x - inLo) * (outHi - outLo)) / (inHi - inLo) + outLo

export interface SimulatedControllerOptions {
  nowHours?: () => number
}

// -- Firmware-decision → PBIF semantic mapping (ties the sketch to the report) --
const OBJECTIVE: Record<FirmwareState, string> = {
  PAUSED: 'MAINTENANCE',
  STORM: 'STORM_PROTECTION',
  RAIN: 'RAIN_PROTECTION',
  OCCUPIED: 'OCCUPANT_COMFORT',
  OVERHEAT: 'HEAT_REJECTION',
  TRACKING: 'MAXIMUM_DAYLIGHT',
  OVERCAST: 'PASSIVE_DAYLIGHT',
  UNKNOWN: 'HOLD',
}
const SURFACE_STRATEGY: Record<FirmwareState, string> = {
  PAUSED: 'SERVICE_FLAT',
  STORM: 'STORM_LOCK',
  RAIN: 'WATER_SHED',
  OCCUPIED: 'GLARE_MANAGED',
  OVERHEAT: 'AGGRESSIVE_SHADE',
  TRACKING: 'SOLAR_TRACK',
  OVERCAST: 'ASTRO_TRACK',
  UNKNOWN: 'HOLD',
}
const FAULT_DETAIL: Record<FaultKind, { detection: string; response: string }> = {
  'dht-fail': {
    detection: 'isnan(dht.readTemperature()) — 1-wire timeout',
    response: 'Fallback to 25 °C / 70 %RH; decision loop continues.',
  },
  'servo-jam': {
    detection: 'PWM asserted but target ≠ actual over N loops (stall current)',
    response: 'Panel flagged JAMMED; Swarm Compensation shifts load to neighbours.',
  },
  'wifi-loss': {
    detection: 'WiFi.status() ≠ WL_CONNECTED',
    response: 'NTP astro uses fallback noon; offline buffering; auto-retry.',
  },
  'mqtt-loss': {
    detection: 'PubSubClient disconnected (rc<0)',
    response: 'Telemetry paused; reconnect attempted every loop.',
  },
  'adc-noise': {
    detection: 'ADC sample variance beyond σ band',
    response: 'Deadband + median filtering suppress motor hunting.',
  },
  'ldr-disconnect': {
    detection: 'LDR channel floats to 4095 (rail)',
    response: 'Treated as dark → automatic astronomical tracking fallback.',
  },
  'servo-wire-break': {
    detection: 'PWM commanded, zero motion detected',
    response: 'Actuation fault latched; panel held at last safe angle.',
  },
  'power-loss': {
    detection: 'Brown-out / telemetry keep-alive lost',
    response: 'Panel fails to safe pose; twin marks Panel 0 OFFLINE.',
  },
}

function panelStrategyFor(angle: number): string {
  const openness = 1 - Math.abs(Math.cos((angle * Math.PI) / 180))
  if (openness > 0.9) return 'FULLY_OPEN'
  if (openness > 0.42) return 'PARTIAL_SHADE'
  if (openness > 0.12) return 'HEAVY_SHADE'
  return 'FULLY_CLOSED'
}

export class SimulatedController implements VirtualEmbeddedController {
  readonly kind = 'simulated' as const

  private targetAngle = SERVO_BOOT_ANGLE
  private angle = SERVO_BOOT_ANGLE
  private state: FirmwareState = 'TRACKING'
  private red = false
  private green = true
  private lcd: string[] = ['Smart Facade Sync...', '', '', '']

  private online = false
  private connectedAt = 0
  private lastTelemetryAt = 0
  private loopCount = 0
  private trace: ExecutionTrace | null = null
  private faults = new Set<FaultKind>()
  private nowHours: () => number

  private telemetryCbs = new Set<(t: TelemetryPacket) => void>()
  private serialCbs = new Set<(line: string) => void>()

  constructor(opts: SimulatedControllerOptions = {}) {
    this.nowHours = opts.nowHours ?? (() => new Date().getHours() + new Date().getMinutes() / 60)
  }

  async connect(): Promise<void> {
    if (this.online) return
    this.online = true
    this.connectedAt = Date.now()
    this.serial(`Connecting to WiFi: Wokwi-GUEST`)
    this.serial(`WiFi Connected successfully!`)
    this.serial(`Connecting to Private HiveMQ Cloud... CONNECTED!`)
  }

  async disconnect(): Promise<void> {
    this.online = false
    this.serial(`Disconnected.`)
  }

  updateSensors(raw: VirtualSensorPacket): void {
    if (!this.online) return
    this.loopCount++

    // Power loss short-circuits everything: fail to a safe, dead state.
    if (this.faults.has('power-loss')) {
      this.state = 'UNKNOWN'
      this.red = false
      this.green = false
      this.trace = this.buildTrace(raw, raw, 0)
      return
    }

    const p = this.applyFaults(raw)
    const prev = this.state

    const avgLeft = (p.ldr.l1 + p.ldr.l2) / 2
    const avgRight = (p.ldr.l3 + p.ldr.l4) / 2
    const error = avgLeft - avgRight

    // ---- DECISION PRIORITY TREE (mirrors sketch.ino loop()) ----------------
    if (p.pauseSwitch) {
      this.state = 'PAUSED'
      this.targetAngle = 0
      this.red = false
      this.green = false
    } else if (p.windAdc > FW.WIND_CRITICAL) {
      this.state = 'STORM'
      this.targetAngle = 0
      this.red = true
      this.green = false
    } else if (p.rainAdc > FW.RAIN_THRESHOLD) {
      this.state = 'RAIN'
      this.targetAngle = 180
      this.red = true
      this.green = false
    } else if (p.motion) {
      this.state = 'OCCUPIED'
      this.targetAngle = 45
      this.red = true
      this.green = false
    } else if (p.temperatureC > FW.TEMP_OVERHEAT) {
      this.state = 'OVERHEAT'
      this.targetAngle = this.runMPCOptimization(p.temperatureC)
      this.red = true
      this.green = false
    } else {
      this.red = false
      this.green = true
      if (avgLeft > FW.OVERCAST_THRESHOLD && avgRight > FW.OVERCAST_THRESHOLD) {
        this.state = 'OVERCAST'
        this.targetAngle = this.astroAngle()
      } else {
        this.state = 'TRACKING'
        if (Math.abs(error) > FW.TRACKING_DEADBAND) {
          if (error < 0) this.targetAngle = Math.max(FW.TRACK_MIN, this.targetAngle - FW.TRACK_STEP)
          else this.targetAngle = Math.min(FW.TRACK_MAX, this.targetAngle + FW.TRACK_STEP)
        }
      }
    }

    // Servo actuation — a jam or a broken wire freezes the physical angle.
    const jammed = this.faults.has('servo-jam') || this.faults.has('servo-wire-break')
    if (!jammed) this.angle = this.targetAngle

    this.renderLcd(p)
    if (this.state !== prev) this.serial(`MODE: ${this.state}`)

    this.trace = this.buildTrace(raw, p, error)

    // MQTT telemetry every 3 s (suppressed while MQTT is down).
    const mqttUp = !this.faults.has('mqtt-loss') && !this.faults.has('wifi-loss')
    if (mqttUp && p.timestamp - this.lastTelemetryAt > FW.TELEMETRY_MS) {
      this.lastTelemetryAt = p.timestamp
      this.publishTelemetry(p)
    }
  }

  readOutputs(): ActuatorPacket {
    return {
      servoAngle: this.angle,
      redLed: this.red,
      greenLed: this.green,
      lcd: [...this.lcd],
      state: this.state,
    }
  }

  getStatus(): ControllerStatus {
    const power = !this.faults.has('power-loss')
    const wifi = power && this.online && !this.faults.has('wifi-loss')
    const mqtt = wifi && !this.faults.has('mqtt-loss')
    return {
      kind: this.kind,
      label: 'Virtual ESP32 · SimulatedController',
      online: power && this.online,
      wifi: wifi ? 'connected' : 'disconnected',
      mqtt: mqtt ? 'connected' : 'disconnected',
      uptimeMs: this.online ? Date.now() - this.connectedAt : 0,
      firmware: 'ESP32-S3 · Enoki (in-process twin)',
    }
  }

  onTelemetry(cb: (t: TelemetryPacket) => void): () => void {
    this.telemetryCbs.add(cb)
    return () => this.telemetryCbs.delete(cb)
  }
  onSerial(cb: (line: string) => void): () => void {
    this.serialCbs.add(cb)
    return () => this.serialCbs.delete(cb)
  }

  // -- Debugger capability ---------------------------------------------------
  getDebugTrace(): ExecutionTrace | null {
    return this.trace
  }
  injectFault(f: FaultKind): void {
    this.faults.add(f)
    this.serial(`!! FAULT INJECTED: ${f} — ${FAULT_DETAIL[f].detection}`)
  }
  clearFault(f: FaultKind): void {
    this.faults.delete(f)
    this.serial(`.. fault cleared: ${f}`)
  }
  getFaults(): FaultReport[] {
    return [...this.faults].map((kind) => ({
      kind,
      active: true,
      detected: true,
      detection: FAULT_DETAIL[kind].detection,
      response: FAULT_DETAIL[kind].response,
    }))
  }

  // -- internals -------------------------------------------------------------
  private applyFaults(p: VirtualSensorPacket): VirtualSensorPacket {
    const q: VirtualSensorPacket = { ...p, ldr: { ...p.ldr } }
    if (this.faults.has('dht-fail')) {
      q.temperatureC = 25 // firmware isnan() fallback
      q.humidityPct = 70
    }
    if (this.faults.has('ldr-disconnect')) {
      q.ldr = { l1: FW.ADC_MAX, l2: FW.ADC_MAX, l3: q.ldr.l3, l4: q.ldr.l4 } // left channel floats
    }
    if (this.faults.has('adc-noise')) {
      const n = () => Math.round((Math.random() - 0.5) * 600)
      q.windAdc = clampi(q.windAdc + n(), 0, FW.ADC_MAX)
      q.rainAdc = clampi(q.rainAdc + n(), 0, FW.ADC_MAX)
      q.ldr = {
        l1: clampi(q.ldr.l1 + n(), 0, FW.ADC_MAX),
        l2: clampi(q.ldr.l2 + n(), 0, FW.ADC_MAX),
        l3: clampi(q.ldr.l3 + n(), 0, FW.ADC_MAX),
        l4: clampi(q.ldr.l4 + n(), 0, FW.ADC_MAX),
      }
    }
    return q
  }

  private astroAngle(): number {
    const hours = this.faults.has('wifi-loss') ? 12 : this.nowHours() // NTP fallback noon
    const totalMinutes = hours * 60
    const sunrise = 7 * 60
    const sunset = 19 * 60
    if (totalMinutes < sunrise || totalMinutes > sunset) return 0
    return Math.round(clampi(mapRange(totalMinutes, sunrise, sunset, 3, 177), 3, 177))
  }

  private runMPCOptimization(temp: number): number {
    const hours = this.faults.has('wifi-loss') ? 12 : this.nowHours()
    const d = new Date()
    d.setHours(Math.floor(hours))
    d.setMinutes(Math.floor((hours % 1) * 60))
    
    // Using Kuala Lumpur coordinates (Latitude 3.1390, Longitude 101.6869)
    const solar = solarPosition(d, 3.1390, 101.6869, 8)
    const sunAzRad = solar.azimuth * Math.PI / 180.0
    const sunElRad = solar.elevation * Math.PI / 180.0

    const FACADE_AZIMUTH = 0.0 // North facing
    const facadeAzRad = FACADE_AZIMUTH * Math.PI / 180.0

    let bestAngle = 90
    let lowestCost = 999999.0

    const windowIncidentCos = Math.cos(sunElRad) * Math.cos(sunAzRad - facadeAzRad)
    const baseSolarLoad = Math.max(0.0, windowIncidentCos)

    for (let candAngle = 0; candAngle <= 180; candAngle += 15) {
      const panelAzRad = (FACADE_AZIMUTH + candAngle) * Math.PI / 180.0
      const panelIncidentCos = Math.cos(sunElRad) * Math.cos(sunAzRad - panelAzRad)
      
      const shadowFactor = Math.abs(panelIncidentCos)
      const remainingSolarGain = Math.max(0.0, baseSolarLoad - shadowFactor)
      
      const daylight = Math.sin(candAngle * Math.PI / 180.0)
      const movementPenalty = Math.abs(candAngle - 90) * 0.01
      
      const cost = (remainingSolarGain * 100.0) - (daylight * 10.0) + movementPenalty
      
      if (cost < lowestCost) {
        lowestCost = cost
        bestAngle = candAngle
      }
    }
    
    return bestAngle
  }

  private renderLcd(p: VirtualSensorPacket): void {
    const modeLine: Record<FirmwareState, string> = {
      PAUSED: 'MODE: SYSTEM PAUSED ',
      STORM: 'MODE: STORM LOCKOUT!',
      RAIN: 'MODE: RAIN RETRACT  ',
      OCCUPIED: 'MODE: OCCUPIED MODE ',
      OVERHEAT: 'MODE: OVERHEAT SHADE',
      TRACKING: 'MODE: SOLAR TRACKING',
      OVERCAST: 'MODE: OVERCAST(ASTRO)',
      UNKNOWN: 'MODE: UNKNOWN       ',
    }
    this.lcd = [
      modeLine[this.state],
      `Temp:${p.temperatureC.toFixed(1)}C Hum:${Math.round(p.humidityPct)}%`,
      `Wind:${p.windAdc} Rain:${p.rainAdc}`,
      `Track Angle: ${this.angle} deg`,
    ]
  }

  private publishTelemetry(p: VirtualSensorPacket): void {
    const t: TelemetryPacket = {
      timestamp: p.timestamp,
      state: this.state,
      temp: p.temperatureC,
      humidity: p.humidityPct,
      wind: p.windAdc,
      rain: p.rainAdc,
      motion: p.motion,
      angle: this.angle,
    }
    const json = `{"state":"${t.state}","temp":${t.temp.toFixed(1)},"humidity":${t.humidity.toFixed(
      1,
    )},"wind":${t.wind},"rain":${t.rain},"motion":${t.motion},"angle":${t.angle}}`
    this.serial(`Publishing to ${FW.MQTT_TOPIC}: ${json}`)
    this.telemetryCbs.forEach((cb) => cb(t))
  }

  private serial(line: string): void {
    this.serialCbs.forEach((cb) => cb(line))
  }

  // -- Execution trace assembly ---------------------------------------------
  private buildTrace(raw: VirtualSensorPacket, p: VirtualSensorPacket, error: number): ExecutionTrace {
    const avgLeft = (p.ldr.l1 + p.ldr.l2) / 2
    const avgRight = (p.ldr.l3 + p.ldr.l4) / 2
    const thermalDemand = clamp01((p.temperatureC - 26) / 12)
    const daylightDemand = p.motion ? 0.85 : clamp01(0.4 + 0.4 * (1 - thermalDemand))
    const comfortScore = Math.round(
      clampi(100 - thermalDemand * 45 - (p.rainAdc / FW.ADC_MAX) * 15 - (this.state === 'OCCUPIED' ? 0 : 0), 0, 100),
    )
    const servoPwm = Math.round(mapRange(this.angle, 0, 180, 500, 2500))
    const status = this.getStatus()
    const dhtNote = this.faults.has('dht-fail') ? 'FALLBACK 25 °C (DHT fault)' : undefined
    const ldrNote = this.faults.has('ldr-disconnect') ? 'LEFT channel railed (disconnect)' : undefined
    const servoNote = this.faults.has('servo-jam')
      ? 'JAMMED — actual angle frozen'
      : this.faults.has('servo-wire-break')
        ? 'NO MOTION — PWM wire break'
        : undefined

    const stages: StageRun[] = [
      st('loop-start', 'Loop Start', 'loop()', `Begin iteration #${this.loopCount}`, [], ['millis()'], 5),
      st('read-dht', 'Read DHT22', 'dht.readTemperature()', 'Sample ambient temperature + humidity (1-wire).', ['GPIO8'], [`temp=${p.temperatureC.toFixed(1)}C`, `hum=${Math.round(p.humidityPct)}%`], 1200, dhtNote),
      st('read-ldr', 'Read LDRs ×4', 'analogRead(LDR1..4)', 'Sample the four photoresistor channels (12-bit ADC).', ['GPIO1', 'GPIO2', 'GPIO3', 'GPIO4'], [`L=${Math.round(avgLeft)}`, `R=${Math.round(avgRight)}`], 240, ldrNote),
      st('read-rain', 'Read Rain', 'analogRead(POT_1_RAIN)', 'Sample rain sensor ADC.', ['GPIO6'], [`rain=${p.rainAdc}`], 60),
      st('read-wind', 'Read Wind', 'analogRead(POT_2_WIND)', 'Sample anemometer ADC.', ['GPIO5'], [`wind=${p.windAdc}`], 60),
      st('read-pir', 'Read PIR', 'digitalRead(PIR_PIN)', 'Sample occupancy motion.', ['GPIO7'], [`motion=${p.motion}`], 8),
      st('read-switch', 'Read Switch', 'digitalRead(PAUSE_SW_PIN)', 'Sample maintenance switch.', ['GPIO14'], [`pause=${p.pauseSwitch}`], 5),
      st('update-sensors', 'Update Virtual Sensors', 'updateVirtualSensors()', 'Normalise raw ADC into engineering values.', ['raw ADC'], ['sensor cache'], 30),
      st('compute-env', 'Compute Environment', 'computeEnvironment()', 'Derive error, thermal & daylight demand, comfort.', ['sensor cache'], [`err=${Math.round(error)}`, `thermal=${thermalDemand.toFixed(2)}`], 25),
      st('evaluate-decision', 'Evaluate Decision', 'evaluateDecisionTree()', 'Run the 6-level priority state machine.', ['environment'], [`state=${this.state}`], 40),
      st('building-objective', 'Building Objective', 'selectBuildingObjective()', 'Map firmware state → PBIF objective.', [`state=${this.state}`], [OBJECTIVE[this.state]], 15),
      st('surface-strategy', 'Surface Strategy', 'deriveSurfaceStrategy()', 'Objective → per-surface strategy.', [OBJECTIVE[this.state]], [SURFACE_STRATEGY[this.state]], 12),
      st('panel-strategy', 'Panel Strategy', 'derivePanelStrategy()', 'Surface strategy → panel state.', [SURFACE_STRATEGY[this.state]], [panelStrategyFor(this.targetAngle)], 12),
      st('compute-servo', 'Compute Servo Target', 'computeServoTarget()', 'Resolve louver target angle.', ['panel state'], [`target=${this.targetAngle}°`], 18),
      st('update-pwm', 'Update PWM', 'ledcWrite()', 'Convert angle → servo pulse width.', [`target=${this.targetAngle}°`], [`pwm=${servoPwm}µs`], 20),
      st('move-servo', 'Move Servo', 'louverServo.write()', 'Drive the louver actuator.', [`pwm=${servoPwm}µs`], [`angle=${this.angle}°`], 10, servoNote),
      st('update-lcd', 'Update LCD', 'updateLCD()', 'Render 20×4 status display (I²C).', ['state', 'sensors'], ['LCD frame'], 900),
      st('publish-mqtt', 'Publish MQTT', 'sendTelemetry()', 'Publish JSON telemetry every 3 s (TLS).', ['telemetry'], [status.mqtt === 'connected' ? FW.MQTT_TOPIC : 'SKIPPED'], status.mqtt === 'connected' ? 15000 : 0),
      st('loop-complete', 'Loop Complete', 'delay(200)', 'Yield until the next 200 ms tick.', [], [], 5),
    ]

    const sensorUs = stages.filter((s) => s.id.startsWith('read-')).reduce((a, s) => a + s.durationUs, 0)
    const decisionUs = stages
      .filter((s) => ['evaluate-decision', 'building-objective', 'surface-strategy', 'panel-strategy', 'compute-servo'].includes(s.id))
      .reduce((a, s) => a + s.durationUs, 0)
    const pwmUs = stages.filter((s) => ['update-pwm', 'move-servo'].includes(s.id)).reduce((a, s) => a + s.durationUs, 0)
    const mqttUs = stages.find((s) => s.id === 'publish-mqtt')?.durationUs ?? 0
    const computeUs = stages.reduce((a, s) => a + s.durationUs, 0)
    const timing: TimingBreakdown = {
      loopFreqHz: Math.round(1000 / FW.LOOP_MS),
      computeUs,
      sensorUs,
      decisionUs,
      pwmUs,
      mqttUs,
      loopPeriodMs: FW.LOOP_MS,
    }

    const variables: DebugVariable[] = [
      { name: 'ambientTemperature', value: p.temperatureC.toFixed(1), unit: '°C', group: 'sensor', type: 'float' },
      { name: 'humidity', value: Math.round(p.humidityPct), unit: '%', group: 'sensor', type: 'float' },
      { name: 'luxLeft', value: Math.round(avgLeft), unit: 'adc', group: 'sensor', type: 'int' },
      { name: 'luxRight', value: Math.round(avgRight), unit: 'adc', group: 'sensor', type: 'int' },
      { name: 'rainAdc', value: p.rainAdc, unit: 'adc', group: 'sensor', type: 'int' },
      { name: 'windAdc', value: p.windAdc, unit: 'adc', group: 'sensor', type: 'int' },
      { name: 'motionDetected', value: p.motion, group: 'sensor', type: 'bool' },
      { name: 'pauseActive', value: p.pauseSwitch, group: 'sensor', type: 'bool' },
      { name: 'ldrError', value: Math.round(error), unit: 'adc', group: 'environment', type: 'int' },
      { name: 'thermalDemand', value: thermalDemand.toFixed(2), group: 'environment', type: 'float' },
      { name: 'daylightDemand', value: daylightDemand.toFixed(2), group: 'environment', type: 'float' },
      { name: 'comfortScore', value: comfortScore, unit: '/100', group: 'environment', type: 'int' },
      { name: 'buildingObjective', value: OBJECTIVE[this.state], group: 'decision', type: 'enum' },
      { name: 'surfaceStrategy', value: SURFACE_STRATEGY[this.state], group: 'decision', type: 'enum' },
      { name: 'panelState', value: panelStrategyFor(this.targetAngle), group: 'decision', type: 'enum' },
      { name: 'targetAngle', value: this.targetAngle, unit: '°', group: 'decision', type: 'int' },
      { name: 'currentAngle', value: this.angle, unit: '°', group: 'actuator', type: 'int' },
      { name: 'servoPWM', value: servoPwm, unit: 'µs', group: 'actuator', type: 'int' },
      { name: 'redLED', value: this.red, group: 'actuator', type: 'bool' },
      { name: 'greenLED', value: this.green, group: 'actuator', type: 'bool' },
      { name: 'wifiConnected', value: status.wifi === 'connected', group: 'comm', type: 'bool' },
      { name: 'mqttConnected', value: status.mqtt === 'connected', group: 'comm', type: 'bool' },
      { name: 'loopCount', value: this.loopCount, group: 'timing', type: 'ulong' },
      { name: 'loopFreq', value: timing.loopFreqHz, unit: 'Hz', group: 'timing', type: 'float' },
    ]

    return {
      loop: this.loopCount,
      timestamp: raw.timestamp,
      stages,
      variables,
      decision: this.buildDecision(p, error, thermalDemand),
      timing,
      faults: [...this.faults],
    }
  }

  private buildDecision(p: VirtualSensorPacket, error: number, thermalDemand: number): DecisionBreakdown {
    const s = this.state
    const reason: Record<FirmwareState, string> = {
      PAUSED: 'Maintenance switch engaged — servo parked flat, LEDs off.',
      STORM: `Wind ${p.windAdc} ADC > ${FW.WIND_CRITICAL} critical — louvers locked flat to protect actuators.`,
      RAIN: `Rain ${p.rainAdc} ADC > ${FW.RAIN_THRESHOLD} — canopy retracted (180°) to shed water.`,
      OCCUPIED: `PIR motion detected — comfort shading (45°) for the occupant.`,
      OVERHEAT: `Ambient ${p.temperatureC.toFixed(1)} °C > ${FW.TEMP_OVERHEAT} °C — MPC active (Target: ${this.targetAngle}°).`,
      TRACKING: `Differential |L−R| = ${Math.abs(Math.round(error))} ADC — stepping toward the brighter side.`,
      OVERCAST: `Both LDR averages > ${FW.OVERCAST_THRESHOLD} (dark) — astronomical NTP fallback.`,
      UNKNOWN: 'No power — failed to safe state.',
    }
    // Confidence: distance of the winning condition past its threshold.
    const conf: Record<FirmwareState, number> = {
      PAUSED: 1,
      STORM: clamp01(0.75 + (p.windAdc - FW.WIND_CRITICAL) / FW.ADC_MAX),
      RAIN: clamp01(0.75 + (p.rainAdc - FW.RAIN_THRESHOLD) / FW.ADC_MAX),
      OCCUPIED: 0.99,
      OVERHEAT: clamp01(0.7 + (p.temperatureC - FW.TEMP_OVERHEAT) / 8),
      TRACKING: clamp01(0.6 + Math.abs(error) / 2000),
      OVERCAST: 0.8,
      UNKNOWN: 0,
    }
    const alternatives: { label: string; reason: string }[] = []
    if (s !== 'STORM') alternatives.push({ label: 'STORM_PROTECTION', reason: `wind ${p.windAdc} ≤ ${FW.WIND_CRITICAL}` })
    if (s !== 'RAIN') alternatives.push({ label: 'RAIN_PROTECTION', reason: `rain ${p.rainAdc} ≤ ${FW.RAIN_THRESHOLD}` })
    if (s !== 'OCCUPIED') alternatives.push({ label: 'OCCUPANT_COMFORT', reason: p.motion ? 'pre-empted by higher priority' : 'no motion' })
    if (s !== 'OVERHEAT') alternatives.push({ label: 'HEAT_REJECTION', reason: `temp ${p.temperatureC.toFixed(1)} ≤ ${FW.TEMP_OVERHEAT} (demand ${thermalDemand.toFixed(2)})` })

    return {
      firmwareState: s,
      buildingObjective: OBJECTIVE[s],
      surfaceStrategy: SURFACE_STRATEGY[s],
      panelStrategy: panelStrategyFor(this.targetAngle),
      reason: reason[s],
      confidence: conf[s],
      alternatives: alternatives.slice(0, 3),
    }
  }
}

function st(
  id: StageRun['id'],
  label: string,
  fn: string,
  description: string,
  inputs: string[],
  outputs: string[],
  durationUs: number,
  note?: string,
): StageRun {
  return { id, label, fn, description, inputs, outputs, durationUs, note }
}
