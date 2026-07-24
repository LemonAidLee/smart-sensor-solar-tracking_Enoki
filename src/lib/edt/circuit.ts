/**
 * Electronics Digital Twin — circuit graph.
 *
 * A faithful, engineering-accurate model of the Enoki Wokwi circuit: the same
 * components, the same GPIO wiring (from `diagram.json`), the same wire colours
 * and signal types. The layout mirrors the reference photo (PIR + DHT top-left,
 * two pots top-centre, LCD top-right, ESP32 centre, LDR breakout boards left and
 * mid, LEDs + servo + slide-switch right). This module owns NO simulation logic —
 * every `live()` accessor merely *reads* PBIF/VEC state.
 */

import type { ActuatorPacket, DebugStageId, ExecutionTrace, VirtualSensorPacket } from '@/lib/vec/types'

export const CANVAS = { w: 1040, h: 560 }

export type SignalType = 'analog' | 'digital' | 'pwm' | 'i2c' | 'power' | 'ground'
export type Health = 'healthy' | 'warn' | 'fault' | 'active' | 'idle'
export type CompType =
  | 'esp32'
  | 'dht22'
  | 'pir'
  | 'pot'
  | 'ldr'
  | 'lcd'
  | 'led'
  | 'servo'
  | 'switch'

export interface LiveReading {
  value: string
  unit?: string
  health: Health
}

export interface ComponentMeta {
  id: string
  type: CompType
  no: number // legend number
  name: string
  x: number
  y: number
  w: number
  h: number
  color?: string // artwork accent (LED colour, etc.)
  gpio: string
  signalType: SignalType
  samplingHz?: number
  firmwareVar: string
  source: string // PBIF module of origin
  purpose: string
  howItWorks: string
  electrical: string
  algorithmStage: string[]
  relatedStrategy: string
  relatedDecision: string
  relatedPhysics: string
  notes: string
  equations: string[]
  live: (s: VirtualSensorPacket | null, o: ActuatorPacket | null, t: ExecutionTrace | null) => LiveReading
}

const faultOn = (t: ExecutionTrace | null, k: string) => !!t?.faults.includes(k as never)

export const COMPONENTS: ComponentMeta[] = [
  {
    id: 'esp',
    type: 'esp32',
    no: 1,
    name: 'ESP32-S3',
    x: 275,
    y: 262,
    w: 122,
    h: 238,
    gpio: '—',
    signalType: 'digital',
    firmwareVar: 'currentState',
    source: 'Virtual Embedded Controller',
    purpose: 'Runs the embedded firmware: reads every sensor, executes the panel control logic, drives the actuators, and publishes MQTT telemetry.',
    howItWorks: 'A dual-core Xtensa LX7 MCU. The Arduino loop() samples GPIO every 200 ms, evaluates the 6-level priority state machine, then writes the servo, LCD and LEDs.',
    electrical: '3.3 V logic · 12-bit ADC (0–4095) · hardware I²C, LEDC PWM, WiFi radio.',
    algorithmStage: ['Virtual Embedded Controller', 'Decision Execution', 'Actuation'],
    relatedStrategy: 'All surface/panel strategies are resolved here',
    relatedDecision: 'Building Objective selection (priority tree)',
    relatedPhysics: 'Consumes Weather/Solar/Physics via the Virtual Sensor Layer',
    notes: 'In PBIF this is the Virtual Embedded Controller — swappable for a real ESP32 on the same MQTT.',
    equations: ['f_loop = 1 / 200 ms = 5 Hz'],
    live: (s, o, t) => ({ value: t?.decision.firmwareState ?? o?.state ?? 'BOOT', health: faultOn(t, 'power-loss') ? 'fault' : 'active' }),
  },
  {
    id: 'dht1',
    type: 'dht22',
    no: 2,
    name: 'DHT22',
    x: 165,
    y: 58,
    w: 72,
    h: 96,
    gpio: 'GPIO8',
    signalType: 'digital',
    samplingHz: 5,
    firmwareVar: 'ambientTemperature / humidity',
    source: 'Weather Engine',
    purpose: 'Measures ambient temperature and relative humidity behind the panel.',
    howItWorks: 'A capacitive humidity element + thermistor on a single-wire digital bus; the firmware decodes a 40-bit frame each read.',
    electrical: '3.3 V · single-wire (bit-banged) · ±0.5 °C, ±2 %RH.',
    algorithmStage: ['Weather Engine', 'Virtual Sensor Layer', 'Situation Assessment'],
    relatedStrategy: 'HEAT_REJECTION / AGGRESSIVE_SHADE when hot',
    relatedDecision: 'Priority 5: temp > 33 °C ⇒ OVERHEAT',
    relatedPhysics: 'Solar heat-gain raises façade skin temperature',
    notes: 'Driven by the Weather Engine — the firmware believes it is a real DHT22.',
    equations: ['thermalDemand = clamp((T − 26) / 12)'],
    live: (s, _o, t) =>
      faultOn(t, 'dht-fail')
        ? { value: 'FALLBACK 25.0', unit: '°C', health: 'fault' }
        : { value: s ? s.temperatureC.toFixed(1) : '—', unit: '°C', health: s && s.temperatureC > 33 ? 'warn' : 'healthy' },
  },
  {
    id: 'pir1',
    type: 'pir',
    no: 3,
    name: 'PIR Motion',
    x: 30,
    y: 150,
    w: 96,
    h: 82,
    gpio: 'GPIO7',
    signalType: 'digital',
    samplingHz: 5,
    firmwareVar: 'motionDetected',
    source: 'Situation Assessment (Occupancy)',
    purpose: 'Detects occupant presence behind the panel for comfort shading.',
    howItWorks: 'A pyroelectric sensor under a Fresnel lens outputs a digital HIGH on infrared motion.',
    electrical: '3.3 V · digital output · ~5 m range.',
    algorithmStage: ['Situation Assessment', 'Decision Intelligence'],
    relatedStrategy: 'GLARE_MANAGED (occupant comfort)',
    relatedDecision: 'Priority 4: motion ⇒ OCCUPIED (45°)',
    relatedPhysics: 'Occupancy adds internal heat load',
    notes: 'Toggle occupancy from the VEC panel; a real PIR would trip here.',
    equations: [],
    live: (s) => ({ value: s ? (s.motion ? 'MOTION' : 'clear') : '—', health: s?.motion ? 'active' : 'idle' }),
  },
  {
    id: 'pot_wind',
    type: 'pot',
    no: 9,
    name: 'Wind Pot (Anemometer)',
    x: 350,
    y: 62,
    w: 66,
    h: 72,
    gpio: 'GPIO5',
    signalType: 'analog',
    samplingHz: 5,
    firmwareVar: 'windAdc',
    source: 'Weather Engine',
    purpose: 'Analog wind-speed input — the storm-lockout trigger.',
    howItWorks: 'A potentiometer stands in for an anemometer; its wiper voltage is read by the ESP32 ADC.',
    electrical: '3.3 V divider · ADC 0–4095.',
    algorithmStage: ['Weather Engine', 'Virtual Sensor Layer'],
    relatedStrategy: 'STORM_LOCK',
    relatedDecision: 'Priority 2: wind > 2500 ADC ⇒ STORM',
    relatedPhysics: 'Wind load on the façade',
    notes: 'ADC = clamp(windSpeed / 60) × 4095.',
    equations: ['windAdc = (windSpeed / 60) × 4095'],
    live: (s) => ({ value: s ? `${s.windAdc}` : '—', unit: 'adc', health: s && s.windAdc > 2500 ? 'warn' : 'healthy' }),
  },
  {
    id: 'pot_rain',
    type: 'pot',
    no: 10,
    name: 'Rain Pot (Rain Sensor)',
    x: 440,
    y: 62,
    w: 66,
    h: 72,
    gpio: 'GPIO6',
    signalType: 'analog',
    samplingHz: 5,
    firmwareVar: 'rainAdc',
    source: 'Weather Engine',
    purpose: 'Analog rain-intensity input — the rain-retract trigger.',
    howItWorks: 'A potentiometer stands in for a rain board; its wiper voltage is read by the ESP32 ADC.',
    electrical: '3.3 V divider · ADC 0–4095.',
    algorithmStage: ['Weather Engine', 'Virtual Sensor Layer'],
    relatedStrategy: 'WATER_SHED',
    relatedDecision: 'Priority 3: rain > 1800 ADC ⇒ RAIN (180°)',
    relatedPhysics: 'Rain wets the façade; louvers shed water',
    notes: 'ADC = rainIntensity × 4095.',
    equations: ['rainAdc = rainIntensity × 4095'],
    live: (s) => ({ value: s ? `${s.rainAdc}` : '—', unit: 'adc', health: s && s.rainAdc > 1800 ? 'warn' : 'healthy' }),
  },
  ldr('ldr1', 5, 'LDR ▲L', 'GPIO1', 20, 275, 'l1'),
  ldr('ldr2', 5, 'LDR ▼L', 'GPIO2', 20, 435, 'l2'),
  ldr('ldr3', 5, 'LDR ▲R', 'GPIO3', 470, 285, 'l3'),
  ldr('ldr4', 5, 'LDR ▼R', 'GPIO4', 470, 445, 'l4'),
  {
    id: 'lcd1',
    type: 'lcd',
    no: 7,
    name: 'LCD 20×4 (I²C)',
    x: 610,
    y: 48,
    w: 300,
    h: 152,
    gpio: 'GPIO47 / GPIO48',
    signalType: 'i2c',
    firmwareVar: 'lcd[]',
    source: 'Virtual Actuator Layer',
    purpose: 'Displays the live firmware status exactly as written by updateLCD().',
    howItWorks: 'A HD44780 20×4 module behind a PCF8574 I²C backpack at address 0x27 (SDA 47, SCL 48).',
    electrical: '3.3 V · I²C two-wire · 0x27.',
    algorithmStage: ['Virtual Actuator Layer'],
    relatedStrategy: 'Mirrors the active surface strategy',
    relatedDecision: 'Shows the current MODE line',
    relatedPhysics: '—',
    notes: 'Contents are the firmware LCD buffer verbatim.',
    equations: [],
    live: (_s, o) => ({ value: o?.lcd[0]?.trim() ?? 'LCD', health: 'active' }),
  },
  {
    id: 'led_red',
    type: 'led',
    no: 8,
    name: 'Red LED (Override)',
    x: 660,
    y: 250,
    w: 26,
    h: 44,
    color: '#ef4444',
    gpio: 'GPIO40',
    signalType: 'digital',
    firmwareVar: 'RED_LED',
    source: 'Virtual Actuator Layer',
    purpose: 'Indicates an override / emergency mode (storm, rain, occupied, overheat).',
    howItWorks: 'GPIO drives the LED anode through a series resistor; HIGH = lit.',
    electrical: '3.3 V · ~10 mA · current-limited.',
    algorithmStage: ['Virtual Actuator Layer'],
    relatedStrategy: 'Any non-tracking override',
    relatedDecision: 'HIGH whenever an override state is active',
    relatedPhysics: '—',
    notes: 'Red = auto-tracking suspended.',
    equations: [],
    live: (_s, o) => ({ value: o?.redLed ? 'ON' : 'off', health: o?.redLed ? 'active' : 'idle' }),
  },
  {
    id: 'led_green',
    type: 'led',
    no: 8,
    name: 'Green LED (Tracking)',
    x: 700,
    y: 250,
    w: 26,
    h: 44,
    color: '#22c55e',
    gpio: 'GPIO39',
    signalType: 'digital',
    firmwareVar: 'GREEN_LED',
    source: 'Virtual Actuator Layer',
    purpose: 'Indicates automatic solar-tracking is active.',
    howItWorks: 'GPIO drives the LED anode through a series resistor; HIGH = lit.',
    electrical: '3.3 V · ~10 mA · current-limited.',
    algorithmStage: ['Virtual Actuator Layer'],
    relatedStrategy: 'SOLAR_TRACK / ASTRO_TRACK',
    relatedDecision: 'HIGH in the tracking / overcast branch',
    relatedPhysics: '—',
    notes: 'Green = healthy autonomous tracking.',
    equations: [],
    live: (_s, o) => ({ value: o?.greenLed ? 'ON' : 'off', health: o?.greenLed ? 'active' : 'idle' }),
  },
  {
    id: 'servo1',
    type: 'servo',
    no: 6,
    name: 'Louver Servo',
    x: 830,
    y: 352,
    w: 150,
    h: 100,
    gpio: 'GPIO21',
    signalType: 'pwm',
    firmwareVar: 'currentServoAngle',
    source: 'Adaptive Skin Engine',
    purpose: 'Rotates the façade louver 0–180°, the physical output of every decision.',
    howItWorks: 'A 50 Hz PWM signal (500–2500 µs pulse) sets the horn angle; the twin maps this straight onto the Adaptive Skin blade rotation.',
    electrical: '5 V · 50 Hz PWM · ~1.5 kg·cm.',
    algorithmStage: ['Model Predictive Control', 'Adaptive Skin', 'Actuation'],
    relatedStrategy: 'Realises the panel strategy angle',
    relatedDecision: '0 / 45 / 180 / tracked per state',
    relatedPhysics: 'Blade angle sets shading + daylight + heat gain',
    notes: 'Servo 0–180° maps 1:1 onto the Panel-0 blade.',
    equations: ['pulse = map(angle, 0–180°, 500–2500 µs)'],
    live: (_s, o, t) => ({
      value: o ? `${o.servoAngle}` : '—',
      unit: '°',
      health: faultOn(t, 'servo-jam') || faultOn(t, 'servo-wire-break') ? 'fault' : 'active',
    }),
  },
  {
    id: 'sw1',
    type: 'switch',
    no: 11,
    name: 'Maintenance Switch',
    x: 946,
    y: 250,
    w: 62,
    h: 78,
    gpio: 'GPIO14',
    signalType: 'digital',
    firmwareVar: 'pauseActive',
    source: 'Operator Input',
    purpose: 'Latches the panel into a safe maintenance pause.',
    howItWorks: 'A slide switch pulls GPIO14 (INPUT_PULLUP) LOW when engaged.',
    electrical: '3.3 V · INPUT_PULLUP · active-LOW.',
    algorithmStage: ['Operator Input', 'Decision Intelligence'],
    relatedStrategy: 'SERVICE_FLAT',
    relatedDecision: 'Priority 1: pause ⇒ SYSTEM_PAUSED (0°)',
    relatedPhysics: '—',
    notes: 'Highest priority — overrides all automatic logic.',
    equations: [],
    live: (s) => ({ value: s ? (s.pauseSwitch ? 'PAUSE' : 'run') : '—', health: s?.pauseSwitch ? 'warn' : 'idle' }),
  },
]

function ldr(id: string, no: number, name: string, gpio: string, x: number, y: number, key: 'l1' | 'l2' | 'l3' | 'l4'): ComponentMeta {
  return {
    id,
    type: 'ldr',
    no,
    name,
    x,
    y,
    w: 150,
    h: 66,
    gpio,
    signalType: 'analog',
    samplingHz: 5,
    firmwareVar: `analogRead(${gpio})`,
    source: 'Solar Engine',
    purpose: 'One of four photoresistors; the left/right pair drives differential sun-tracking.',
    howItWorks: 'An LDR + fixed resistor form a divider; brighter light lowers the ADC value. avgLeft−avgRight steers the servo.',
    electrical: '5 V divider · ADC 0–4095 · higher = darker.',
    algorithmStage: ['Solar Engine', 'Virtual Sensor Layer'],
    relatedStrategy: 'SOLAR_TRACK / ASTRO_TRACK',
    relatedDecision: 'Differential tracker + overcast (>2000) fallback',
    relatedPhysics: 'Sun incidence on the façade normal',
    notes: 'The L/R split is derived from the sun bearing vs the panel normal.',
    equations: ['error = avgLeft − avgRight', 'step ±3° when |error| > 150'],
    live: (s, _o, t) =>
      faultOn(t, 'ldr-disconnect') && (key === 'l1' || key === 'l2')
        ? { value: '4095', unit: 'adc', health: 'fault' }
        : { value: s ? `${s.ldr[key]}` : '—', unit: 'adc', health: 'healthy' },
  }
}

// ---------------------------------------------------------------------------
// Wires — signal harness (from diagram.json), plus power/ground rails.
// ---------------------------------------------------------------------------
export interface WireMeta {
  id: string
  fromId: string
  color: string
  signal: SignalType
  gpio: string
  dir: 'in' | 'out' | 'bi'
  label: string
  kind: 'signal' | 'power' | 'ground'
}

const w = (id: string, fromId: string, color: string, signal: SignalType, gpio: string, dir: WireMeta['dir'], label: string, kind: WireMeta['kind'] = 'signal'): WireMeta => ({ id, fromId, color, signal, gpio, dir, label, kind })

export const WIRES: WireMeta[] = [
  w('w_ldr1', 'ldr1', '#22c55e', 'analog', 'GPIO1', 'in', 'LDR ▲L → ADC1'),
  w('w_ldr2', 'ldr2', '#22c55e', 'analog', 'GPIO2', 'in', 'LDR ▼L → ADC2'),
  w('w_ldr3', 'ldr3', '#22c55e', 'analog', 'GPIO3', 'in', 'LDR ▲R → ADC3'),
  w('w_ldr4', 'ldr4', '#22c55e', 'analog', 'GPIO4', 'in', 'LDR ▼R → ADC4'),
  w('w_wind', 'pot_wind', '#3b82f6', 'analog', 'GPIO5', 'in', 'Wind → ADC5'),
  w('w_rain', 'pot_rain', '#3b82f6', 'analog', 'GPIO6', 'in', 'Rain → ADC6'),
  w('w_pir', 'pir1', '#d946ef', 'digital', 'GPIO7', 'in', 'PIR OUT → GPIO7'),
  w('w_dht', 'dht1', '#eab308', 'digital', 'GPIO8', 'bi', 'DHT22 1-wire → GPIO8'),
  w('w_sw', 'sw1', '#06b6d4', 'digital', 'GPIO14', 'in', 'Switch → GPIO14'),
  w('w_servo', 'servo1', '#f97316', 'pwm', 'GPIO21', 'out', 'PWM → Servo'),
  w('w_led_red', 'led_red', '#22c55e', 'digital', 'GPIO40', 'out', 'GPIO40 → Red LED'),
  w('w_led_green', 'led_green', '#22c55e', 'digital', 'GPIO39', 'out', 'GPIO39 → Green LED'),
  w('w_lcd_sda', 'lcd1', '#9ca3af', 'i2c', 'GPIO47', 'bi', 'I²C SDA → LCD'),
  w('w_lcd_scl', 'lcd1', '#9ca3af', 'i2c', 'GPIO48', 'out', 'I²C SCL → LCD'),
]

// ---------------------------------------------------------------------------
// Execution-stage → highlight map (component + wire + PBIF module).
// ---------------------------------------------------------------------------
export interface StageHighlight {
  components: string[]
  wires: string[]
  pbif: string
}

export const STAGE_MAP: Record<DebugStageId, StageHighlight> = {
  'loop-start': { components: ['esp'], wires: [], pbif: 'Firmware Loop' },
  'read-dht': { components: ['dht1'], wires: ['w_dht'], pbif: 'Prediction' },
  'read-ldr': { components: ['ldr1', 'ldr2', 'ldr3', 'ldr4'], wires: ['w_ldr1', 'w_ldr2', 'w_ldr3', 'w_ldr4'], pbif: 'Prediction' },
  'read-rain': { components: ['pot_rain'], wires: ['w_rain'], pbif: 'Prediction' },
  'read-wind': { components: ['pot_wind'], wires: ['w_wind'], pbif: 'Prediction' },
  'read-pir': { components: ['pir1'], wires: ['w_pir'], pbif: 'Situation Assessment' },
  'read-switch': { components: ['sw1'], wires: ['w_sw'], pbif: 'Situation Assessment' },
  'update-sensors': { components: ['esp'], wires: [], pbif: 'Situation Assessment' },
  'compute-env': { components: ['esp'], wires: [], pbif: 'Situation Assessment' },
  'evaluate-decision': { components: ['esp'], wires: [], pbif: 'Decision Intelligence' },
  'building-objective': { components: ['esp'], wires: [], pbif: 'Decision Intelligence' },
  'surface-strategy': { components: ['esp'], wires: [], pbif: 'Building Strategy' },
  'panel-strategy': { components: ['esp'], wires: [], pbif: 'Building Strategy' },
  'compute-servo': { components: ['esp'], wires: [], pbif: 'Model Predictive Control' },
  'update-pwm': { components: ['esp', 'servo1'], wires: ['w_servo'], pbif: 'Adaptive Skin' },
  'move-servo': { components: ['servo1'], wires: ['w_servo'], pbif: 'Adaptive Skin' },
  'update-lcd': { components: ['lcd1'], wires: ['w_lcd_sda', 'w_lcd_scl'], pbif: 'Actuator' },
  'publish-mqtt': { components: ['esp'], wires: [], pbif: 'Actuator' },
  'loop-complete': { components: ['esp'], wires: [], pbif: 'Firmware Loop' },
}

/** PBIF pipeline modules, in order — the debugger highlights the active one. */
export const PBIF_MODULES = [
  'Prediction',
  'Situation Assessment',
  'Decision Intelligence',
  'Building Strategy',
  'Model Predictive Control',
  'Adaptive Skin',
  'Actuator',
]

export const COMPONENT_BY_ID = new Map(COMPONENTS.map((c) => [c.id, c]))
export const WIRE_BY_ID = new Map(WIRES.map((x) => [x.id, x]))
