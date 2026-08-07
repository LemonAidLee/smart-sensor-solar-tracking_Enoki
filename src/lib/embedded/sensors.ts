/**
 * Virtual Embedded System — Sensor Physics layer.
 *
 *   Environment  →  [ Virtual Sensor Physics ]  →  Electrical Signal  →  ESP32 reading
 *
 * Mirrors `src/lib/vec/sensorLayer.ts`'s philosophy exactly (translate the
 * master simulation's physical state into hardware-native readings) but for a
 * different purpose: this module is READ-ONLY explainability for the Virtual
 * Embedded System panel, never wired to an actuator layer, so it can never
 * command the façade. It reuses existing engine outputs (`FacadePanel.solarExposure`,
 * `WeatherState.groundWetness`, `virtualDHT22`) rather than recomputing physics
 * that already exists — the environment is never read directly by "ESP32
 * inputs"; every value below is derived through an explicit physical/electrical
 * model first.
 *
 * Every function here is pure and framework-free.
 */

import type { FacadePanel, WeatherState } from '@/lib/engine/types'
import { clamp } from '@/lib/engine/math'
import { virtualDHT22 } from '@/lib/vec/sensorLayer'
import type { Simulation } from '@/lib/engine/simulation'
import { computeLdrChain } from '@/lib/engine/ldrPhysics'
import { RAIN_LEVEL } from '@/lib/pbif/thresholds'
import {
  ADC_MAX,
  ANEMOMETER_HZ_PER_KMH,
  LDR_FIXED_RESISTOR_OHMS,
  LDR_GAMMA,
  LDR_LOWER_SELF_SHADE_MAX,
  LDR_R10_OHMS,
  LUX_PER_WM2,
  RAIN_DRY_BASELINE_FRACTION,
  VCC,
} from './constants'

/** ESP32 pin classification, for the board illustration. */
export type PinGroup = 'analog' | 'digital' | 'pwm' | 'i2c'

export interface SignalStep {
  /** Name of the quantity at this stage, e.g. "Estimated Light". */
  label: string
  /** Its value, already formatted with units, e.g. "72,000 lux". */
  value: string
  /** The governing relationship for this stage, e.g. "Ev ≈ η × G". Shown as a small equation badge; only rendered if present. */
  equation?: string
  /** Plain-language meaning of this stage, for the expandable explanation. */
  meaning?: string
  /** Constants/assumptions used at this stage, for the expandable explanation. */
  assumptions?: string
  /** Citation for the model/equation adopted at this stage. */
  reference?: string
  /** Where this value actually originates, e.g. "Engineering Inspector" — surfaced so a reader can see it is NOT recomputed here. */
  source?: string
}

/** One sensor's full Environment → Electrical Signal → ESP32 reading chain. */
export interface SensorSignal {
  id: string
  name: string
  pin: PinGroup
  /** Pin/channel label for the board illustration, e.g. "ADC0". */
  gpioLabel: string
  steps: SignalStep[]
  /** Normalised 0–1 magnitude — drives the subtle pin-activity indicator only. */
  raw: number
}

const round1 = (n: number): number => Math.round(n * 10) / 10
const fmt = (n: number, digits = 0): string => n.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits })



/**
 * Sensor Physics Pipeline (see PBIF_ENGINEERING_GUIDE.md's "Sensor Physics
 * Pipeline" section for the full traceability write-up).
 * This module now consumes the unified VirtualSensorEngine, which correctly
 * processes effective irradiance (including cosine projection and cloud attenuation).
 */
function ldrPipelineSteps(
  effIrr: number,
  lux: number,
  resistanceOhms: number,
  voltage: number,
  adc: number,
  fadc: number
): SignalStep[] {
  return [
    {
      label: 'Effective Irradiance',
      value: `${Math.round(effIrr)} W/m²`,
      source: 'Virtual Sensor Engine',
      meaning:
        'Solar irradiance arriving at the sensor face, considering the panel’s current angle, orientation, line of sight, cloud cover, and diffuse sky radiation.',
      assumptions: 'Computed centrally by the Virtual Sensor Engine to ensure identical readings across all systems.',
      reference: 'VirtualSensorEngine',
    },
    {
      label: 'Estimated Lux',
      value: `${fmt(lux)} lux`,
      equation: 'Ev ≈ η × G',
      meaning: 'Converts radiometric irradiance (W/m²) into photometric illuminance (lux).',
      assumptions: `η = ${LUX_PER_WM2} lux per W·m⁻².`,
    },
    {
      label: 'LDR Resistance',
      value: `${fmt(resistanceOhms)} Ω`,
      equation: 'R = A · Ev⁻ᴮ',
      meaning: 'A CdS photoresistor’s resistance falls as illuminance rises.',
      assumptions: `A (resistance at 10 lux) = ${fmt(LDR_R10_OHMS)} Ω, B (gamma) = ${LDR_GAMMA}.`,
      reference: 'GL5528 manufacturer datasheet.',
    },
    {
      label: 'Voltage Divider Output',
      value: `${voltage.toFixed(2)} V`,
      equation: 'V = VCC · R_FIXED / (R_FIXED + R_LDR)',
      meaning: 'The LDR forms a resistive voltage divider with a fixed resistor.',
      assumptions: `VCC = ${VCC} V, R_FIXED = ${fmt(LDR_FIXED_RESISTOR_OHMS)} Ω.`,
    },
    {
      label: 'Filtered ADC',
      value: `${Math.round(fadc)} / ${ADC_MAX}`,
      equation: 'ADC = (V / VREF) × 4095',
      meaning: 'The ESP32-S3’s 12-bit SAR ADC quantises the analog voltage, with digital exponential smoothing applied.',
      assumptions: `VREF ≈ VCC = ${VCC} V (default attenuation).`,
    },
  ]
}

/**
 * LDR Upper — the panel's primary light sensor. Sources illuminance from the
 * unified VirtualSensorEngine.
 */
export function ldrUpperSignal(sim: Simulation, panelId: string): SensorSignal {
  const effIrr = sim.solarPhysics.getModuleEffectiveIrradiance(panelId)
  const lux = sim.virtualSensor.getModuleLux(panelId)
  const res = sim.virtualSensor.getModuleResistance(panelId)
  const volt = sim.virtualSensor.getModuleVoltage(panelId)
  const adc = sim.virtualSensor.getModuleADC(panelId)
  const fadc = sim.virtualSensor.getModuleFilteredADC(panelId)

  return {
    id: 'ldrUpper',
    name: 'LDR Upper',
    pin: 'analog',
    gpioLabel: 'ADC0',
    raw: clamp(adc / ADC_MAX),
    steps: ldrPipelineSteps(effIrr, lux, res, volt, adc, fadc),
  }
}

/**
 * LDR Lower — mounted beneath the blade's rotation axis. In the physical system, 
 * this would be shaded by the blade itself. For the digital twin's unified single 
 * source of truth, we apply a self-shading proxy onto the VirtualSensorEngine's base reading.
 */
export function ldrLowerSignal(sim: Simulation, panel: FacadePanel): SensorSignal {
  const baseEffIrr = sim.solarPhysics.getModuleEffectiveIrradiance(panel.id)
  const selfShade = 1 - (1 - panel.openness) * LDR_LOWER_SELF_SHADE_MAX
  
  // Apply self-shading directly on the unified effective irradiance, then
  // run the SAME shared GL5528 chain VirtualSensorEngine uses (ldrPhysics.ts)
  // — no local copy of the resistance/divider/ADC formulas.
  const effIrr = baseEffIrr * selfShade
  const { lux, resistanceOhms: res, voltage: volt, adc } = computeLdrChain(effIrr)

  // (We don't strictly have a filtered ADC in virtualSensor for the shaded lower sensor yet,
  // so we present the raw ADC as the filtered one for explainability here, matching previous logic)
  const fadc = adc

  const steps = ldrPipelineSteps(effIrr, lux, res, volt, adc, fadc)
  steps[1] = {
    ...steps[1],
    assumptions: `${steps[1].assumptions} The lower sensor also sits partly in the blade's own shadow at this rotation angle (×${selfShade.toFixed(2)} self-shading factor).`,
  }
  return {
    id: 'ldrLower',
    name: 'LDR Lower',
    pin: 'analog',
    gpioLabel: 'ADC1',
    raw: clamp(adc / ADC_MAX),
    steps,
  }
}

/**
 * Wind — a 3-cup rotor anemometer. The firmware never reads km/h directly: it
 * counts pulses per second and reconstructs wind speed from the calibration
 * constant, exactly as a real cup anemometer works.
 */
export function windSignal(weather: WeatherState): SensorSignal {
  const kmh = weather.windSpeed
  const hz = kmh * ANEMOMETER_HZ_PER_KMH
  const reconstructedKmh = hz / ANEMOMETER_HZ_PER_KMH
  return {
    id: 'wind',
    name: 'Wind Sensor',
    pin: 'analog',
    gpioLabel: 'ADC2',
    raw: clamp(kmh / 60),
    steps: [
      { label: 'Wind Speed', value: `${Math.round(kmh)} km/h` },
      { label: 'Virtual Cup Rotation', value: `${hz.toFixed(1)} Hz` },
      { label: 'Calculated Wind Speed', value: `${Math.round(reconstructedKmh)} km/h` },
    ],
  }
}

/** Qualitative rain-intensity label — reads the SAME `RAIN_LEVEL` bands PBIF's Situation Assessment classifies against, never a re-hardcoded copy. */
function rainLabel(intensity: number): string {
  if (intensity >= RAIN_LEVEL.HEAVY) return 'Heavy Rain'
  if (intensity >= RAIN_LEVEL.MODERATE) return 'Moderate Rain'
  if (intensity >= RAIN_LEVEL.LIGHT) return 'Light Rain'
  return 'No Rain'
}

/**
 * Rain — a resistive rain-detection board. Reuses the existing (previously
 * unused) `groundWetness` accumulation model from `weather.ts` as "Surface
 * Wetness" rather than reading rain intensity directly — wetness rises fast
 * and dries slowly, which is what actually wets the sensor traces. Wetter →
 * higher ADC, matching `FW.RAIN_THRESHOLD`'s "ADC > threshold ⇒ rain" sense.
 */
export function rainSignal(weather: WeatherState): SensorSignal {
  const wetness = clamp(weather.groundWetness)
  const voltage = VCC * (RAIN_DRY_BASELINE_FRACTION + wetness * (1 - RAIN_DRY_BASELINE_FRACTION))
  const adc = Math.round(clamp(voltage / VCC) * ADC_MAX)
  return {
    id: 'rain',
    name: 'Rain Sensor',
    pin: 'analog',
    gpioLabel: 'ADC3',
    raw: clamp(voltage / VCC),
    steps: [
      { label: 'Rain Intensity', value: `${rainLabel(weather.rainIntensity)} (${Math.round(weather.rainIntensity * 100)}%)` },
      { label: 'Surface Wetness', value: `${Math.round(wetness * 100)}%` },
      { label: 'Sensor Voltage', value: `${voltage.toFixed(2)} V` },
      { label: 'ESP32 ADC', value: `${adc} / ${ADC_MAX}` },
    ],
  }
}

/** Temperature — reuses `virtualDHT22` (the existing VEC sensor model) directly. */
export function temperatureSignal(sim: Simulation, panelExposure: number): SensorSignal {
  const dht = virtualDHT22(sim, panelExposure)
  return {
    id: 'temperature',
    name: 'Temperature',
    pin: 'digital',
    gpioLabel: 'GPIO4',
    raw: clamp((dht.temperatureC - 16) / (44 - 16)),
    steps: [
      { label: 'Air Temperature', value: `${round1(sim.weather.temperature)}°C` },
      { label: 'DHT22 Reading', value: `${dht.temperatureC.toFixed(1)}°C` },
    ],
  }
}

/** Humidity — reuses `virtualDHT22` directly (same physical sensor as temperature). */
export function humiditySignal(sim: Simulation, panelExposure: number): SensorSignal {
  const dht = virtualDHT22(sim, panelExposure)
  return {
    id: 'humidity',
    name: 'Humidity',
    pin: 'digital',
    gpioLabel: 'GPIO4',
    raw: clamp(dht.humidityPct / 100),
    steps: [
      { label: 'Relative Humidity', value: `${Math.round(sim.weather.humidity)}%` },
      { label: 'DHT22 Reading', value: `${dht.humidityPct.toFixed(1)}%` },
    ],
  }
}

/** PIR — occupancy is a manual demonstration input (see the panel's assumptions). */
export function pirSignal(occupied: boolean): SensorSignal {
  return {
    id: 'pir',
    name: 'PIR',
    pin: 'digital',
    gpioLabel: 'GPIO14',
    raw: occupied ? 1 : 0,
    steps: [
      { label: 'Occupancy', value: occupied ? 'Detected' : 'Clear' },
      { label: 'GPIO', value: occupied ? 'HIGH' : 'LOW' },
    ],
  }
}

/**
 * Pause switch — a maintenance slide switch, manual input. Wired as a pull-up
 * digital input on the real board (LOW when engaged) — see `vec/types.ts`'s
 * `VirtualSensorPacket.pauseSwitch` doc.
 */
export function pauseSwitchSignal(paused: boolean): SensorSignal {
  return {
    id: 'pauseSwitch',
    name: 'Pause Switch',
    pin: 'digital',
    gpioLabel: 'GPIO27',
    raw: paused ? 1 : 0,
    steps: [
      { label: 'Maintenance', value: paused ? 'ON' : 'OFF' },
      { label: 'GPIO', value: paused ? 'LOW' : 'HIGH' },
    ],
  }
}
