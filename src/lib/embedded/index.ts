/**
 * Virtual Embedded System — Layer 2 of the Digital Twin.
 *
 *   Environment → Physical Sensors → Embedded Controller → PBIF
 *
 * This package visualises how ONE physical façade module ("Upper Centre")
 * observes its environment through real sensor physics and electrical
 * signals, and how the ESP32-S3 firmware would report and act on them. It is
 * strictly a read-only explainability layer:
 *
 *   - It NEVER reads weather values directly for display — every sensor
 *     reading is derived through `sensors.ts`'s physics/electrical models.
 *   - It NEVER writes back to the simulation — servo angle, LEDs and the LCD
 *     are all read from state PBIF/kinematics already computed elsewhere.
 *   - It does not touch PBIF, the Decision Engine, Solar Resource Assessment,
 *     Dynamic Deadband, Operational Objective, Panel Kinematics or the
 *     Environment (weather) controls.
 *
 * This is deliberately independent of `src/lib/vec/` (the bidirectional
 * Virtual Embedded *Controller* used by the full, currently-disabled
 * Electronics Digital Twin) — that system actively COMMANDS the façade via
 * `applyActuator()`. This one only observes, so Weather Validation Mode's
 * Manual/Sun-Tracking/PBIF façade control remains the sole source of truth
 * for the panel's motion, per `PBIF_ENGINEERING_GUIDE.md`.
 */

import type { Simulation } from '@/lib/engine/simulation'
import type { FacadeControlMode } from '@/lib/engine/facadeControl'
import {
  humiditySignal,
  ldrLowerSignal,
  ldrUpperSignal,
  pauseSwitchSignal,
  pirSignal,
  rainSignal,
  temperatureSignal,
  windSignal,
  type SensorSignal,
} from './sensors'
import { ledState, lcdLines, servoState, type LedState, type ServoState } from './panel'
import { LOOP_HZ } from './constants'

export * from './sensors'
export * from './panel'
export * from './constants'
export * from './servo'

export interface ManualEmbeddedInputs {
  occupied: boolean
  paused: boolean
}

export interface EmbeddedState {
  /** Whether an "Upper Centre" panel could be resolved for the current geometry. */
  available: boolean
  panelId: string
  surfaceId: string
  facadeControlMode: FacadeControlMode
  servo: ServoState
  led: LedState
  lcd: string[]
  loopHz: number
  sensors: {
    ldrUpper: SensorSignal
    ldrLower: SensorSignal
    wind: SensorSignal
    rain: SensorSignal
    temperature: SensorSignal
    humidity: SensorSignal
    pir: SensorSignal
    pauseSwitch: SensorSignal
  }
}

const EMPTY_SIGNAL = (id: string, name: string, pin: SensorSignal['pin'], gpioLabel: string): SensorSignal => ({
  id,
  name,
  pin,
  gpioLabel,
  raw: 0,
  steps: [{ label: 'No panel', value: '—' }],
})

/**
 * Run the whole read-only chain once for the given panel: environment (via the
 * panel's own physics + weather) → sensor physics → electrical signal →
 * ESP32-native reading. The caller (the panel component) supplies `panelId`
 * from `pickUpperCentrePanel`, re-resolved only when geometry changes.
 */
export function computeEmbeddedState(
  sim: Simulation,
  panelId: string | undefined,
  manual: ManualEmbeddedInputs,
): EmbeddedState {
  const panel = panelId ? sim.skin.getPanel(panelId) : undefined
  const mode = sim.skin.getFacadeControlMode()

  if (!panel) {
    return {
      available: false,
      panelId: '',
      surfaceId: '',
      facadeControlMode: mode,
      servo: {
        worldRotationTarget: 90,
        worldRotationCurrent: 90,
        servoCommandAngle: 90,
        pwmMicros: 1500,
        servoPositionAngle: 90,
        moving: false,
      },
      led: { tracking: false, maintenance: false, override: false },
      lcd: ['NO PANEL DETECTED'.padEnd(20), ''.padEnd(20), ''.padEnd(20), ''.padEnd(20)],
      loopHz: LOOP_HZ,
      sensors: {
        ldrUpper: EMPTY_SIGNAL('ldrUpper', 'LDR Upper', 'analog', 'ADC0'),
        ldrLower: EMPTY_SIGNAL('ldrLower', 'LDR Lower', 'analog', 'ADC1'),
        wind: EMPTY_SIGNAL('wind', 'Wind Sensor', 'analog', 'ADC2'),
        rain: EMPTY_SIGNAL('rain', 'Rain Sensor', 'analog', 'ADC3'),
        temperature: EMPTY_SIGNAL('temperature', 'Temperature', 'digital', 'GPIO4'),
        humidity: EMPTY_SIGNAL('humidity', 'Humidity', 'digital', 'GPIO4'),
        pir: EMPTY_SIGNAL('pir', 'PIR', 'digital', 'GPIO14'),
        pauseSwitch: EMPTY_SIGNAL('pauseSwitch', 'Pause Switch', 'digital', 'GPIO27'),
      },
    }
  }

  const servo = servoState(panel)
  const exposure = panel.solarExposure

  return {
    available: true,
    panelId: panel.id,
    surfaceId: panel.surfaceId,
    facadeControlMode: mode,
    servo,
    led: ledState(sim, mode),
    lcd: lcdLines(sim, mode, servo.servoPositionAngle),
    loopHz: LOOP_HZ,
    sensors: {
      ldrUpper: ldrUpperSignal(sim, panel.id),
      ldrLower: ldrLowerSignal(sim, panel),
      wind: windSignal(sim.weather),
      rain: rainSignal(sim.weather),
      temperature: temperatureSignal(sim, exposure),
      humidity: humiditySignal(sim, exposure),
      pir: pirSignal(manual.occupied),
      pauseSwitch: pauseSwitchSignal(manual.paused),
    },
  }
}
