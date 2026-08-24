/**
 * WokwiMqttController — the real Enoki ESP32 (running in Wokwi) as a VEC.
 *
 * The Enoki firmware connects its Wokwi WiFi to HiveMQ Cloud and publishes JSON
 * telemetry to `Enokitop1/iem-facade`. This controller subscribes to that topic
 * over MQTT-over-WebSocket (WSS 8884, browser-reachable) and decodes each message
 * into an {@link ActuatorPacket}, so the Digital Twin drives Panel 0 from the
 * *actual* firmware's decisions in real time — with the current sketch unchanged.
 *
 * `updateSensors()` publishes the environment packet to a `.../sensors` command
 * topic. The stock firmware ignores it (it reads physical Wokwi parts); an
 * optional, additive firmware patch can later subscribe to that topic to close
 * the loop into the real board. Either way, NOTHING above this interface changes
 * — and a physical ESP32 on the same broker is a drop-in replacement.
 *
 * NOTE: the broker credentials are read from environment variables
 * (`NEXT_PUBLIC_ENOKI_MQTT_*`) rather than committed to source — this
 * controller is inert (no host/credentials) until they're configured
 * locally in `.env.local`. See `.env.example`.
 */

import mqtt, { type MqttClient } from 'mqtt'
import {
  FW,
  SERVO_BOOT_ANGLE,
  type ActuatorPacket,
  type ControllerStatus,
  type FirmwareState,
  type LinkState,
  type TelemetryPacket,
  type VirtualEmbeddedController,
  type VirtualSensorPacket,
} from './types'

export interface WokwiMqttConfig {
  /** HiveMQ Cloud host. */
  host: string
  /** WebSocket TLS port (8884 for HiveMQ browser clients). */
  wsPort: number
  username: string
  password: string
  /** Telemetry topic the firmware publishes to. */
  topic: string
}

export const ENOKI_MQTT: WokwiMqttConfig = {
  host: process.env.NEXT_PUBLIC_ENOKI_MQTT_HOST ?? '',
  wsPort: 8884,
  username: process.env.NEXT_PUBLIC_ENOKI_MQTT_USERNAME ?? '',
  password: process.env.NEXT_PUBLIC_ENOKI_MQTT_PASSWORD ?? '',
  topic: FW.MQTT_TOPIC,
}

/** Reconstruct the LED / servo actuator view from a decoded telemetry frame. */
function actuatorFromTelemetry(t: TelemetryPacket): ActuatorPacket {
  const red = t.state === 'STORM' || t.state === 'RAIN' || t.state === 'OCCUPIED' || t.state === 'OVERHEAT'
  const green = t.state === 'TRACKING' || t.state === 'OVERCAST'
  return {
    servoAngle: t.angle,
    redLed: red,
    greenLed: green,
    state: t.state,
    lcd: [
      `MODE: ${t.state}`,
      `Temp:${t.temp.toFixed(1)}C Hum:${Math.round(t.humidity)}%`,
      `Wind:${t.wind} Rain:${t.rain}`,
      `Track Angle: ${t.angle} deg`,
    ],
  }
}

export class WokwiMqttController implements VirtualEmbeddedController {
  readonly kind = 'wokwi-mqtt' as const

  private client: MqttClient | null = null
  private cfg: WokwiMqttConfig
  private wifi: LinkState = 'disconnected'
  private mqttState: LinkState = 'disconnected'
  private connectedAt = 0
  private outputs: ActuatorPacket = {
    servoAngle: SERVO_BOOT_ANGLE,
    redLed: false,
    greenLed: true,
    state: 'TRACKING',
    lcd: ['Awaiting ESP32...', '', '', ''],
  }

  private telemetryCbs = new Set<(t: TelemetryPacket) => void>()
  private serialCbs = new Set<(line: string) => void>()

  constructor(cfg: WokwiMqttConfig = ENOKI_MQTT) {
    this.cfg = cfg
  }

  connect(): Promise<void> {
    if (this.client?.connected) return Promise.resolve()
    const url = `wss://${this.cfg.host}:${this.cfg.wsPort}/mqtt`
    this.mqttState = 'connecting'
    this.wifi = 'connected' // the browser's network stands in for the board's WiFi
    this.serial(`Connecting to HiveMQ Cloud: ${url}`)

    return new Promise<void>((resolve) => {
      const client = mqtt.connect(url, {
        username: this.cfg.username,
        password: this.cfg.password,
        clientId: `pbif-twin-${Math.random().toString(16).slice(2, 8)}`,
        reconnectPeriod: 3000,
        connectTimeout: 8000,
      })
      this.client = client

      client.on('connect', () => {
        this.mqttState = 'connected'
        this.connectedAt = Date.now()
        this.serial(`MQTT connected — subscribing to ${this.cfg.topic}`)
        client.subscribe(this.cfg.topic, (err) => {
          if (err) this.serial(`Subscribe failed: ${err.message}`)
        })
        resolve()
      })
      client.on('reconnect', () => {
        this.mqttState = 'connecting'
      })
      client.on('offline', () => {
        this.mqttState = 'disconnected'
      })
      client.on('error', (err) => {
        this.serial(`MQTT error: ${err.message}`)
      })
      client.on('message', (topic, payload) => this.onMessage(topic, payload.toString()))
    })
  }

  async disconnect(): Promise<void> {
    this.wifi = 'disconnected'
    this.mqttState = 'disconnected'
    await new Promise<void>((res) => {
      if (!this.client) return res()
      this.client.end(true, {}, () => res())
    })
    this.client = null
    this.serial('MQTT disconnected.')
  }

  /** Publish the environment packet for an (optional) sensor-injecting firmware. */
  updateSensors(sensorData: VirtualSensorPacket): void {
    if (!this.client?.connected) return
    this.client.publish(`${this.cfg.topic}/sensors`, JSON.stringify(sensorData))
  }

  readOutputs(): ActuatorPacket {
    return { ...this.outputs, lcd: [...this.outputs.lcd] }
  }

  getStatus(): ControllerStatus {
    const online = this.mqttState === 'connected'
    return {
      kind: this.kind,
      label: 'Wokwi ESP32 · HiveMQ (live)',
      online,
      wifi: this.wifi,
      mqtt: this.mqttState,
      uptimeMs: online ? Date.now() - this.connectedAt : 0,
      firmware: 'ESP32-S3 · Enoki (Wokwi)',
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

  // -- internals -------------------------------------------------------------
  private onMessage(topic: string, raw: string): void {
    if (topic !== this.cfg.topic) return
    this.serial(`RX ${topic}: ${raw}`)
    try {
      const j = JSON.parse(raw) as Partial<Record<string, unknown>>
      const t: TelemetryPacket = {
        timestamp: Date.now(),
        state: (j.state as FirmwareState) ?? 'UNKNOWN',
        temp: Number(j.temp ?? 0),
        humidity: Number(j.humidity ?? 0),
        wind: Number(j.wind ?? 0),
        rain: Number(j.rain ?? 0),
        motion: Boolean(j.motion),
        angle: Number(j.angle ?? SERVO_BOOT_ANGLE),
      }
      this.outputs = actuatorFromTelemetry(t)
      this.telemetryCbs.forEach((cb) => cb(t))
    } catch {
      this.serial(`Malformed telemetry ignored.`)
    }
  }

  private serial(line: string): void {
    this.serialCbs.forEach((cb) => cb(line))
  }
}
