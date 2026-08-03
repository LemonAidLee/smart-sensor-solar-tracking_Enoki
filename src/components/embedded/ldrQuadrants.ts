/**
 * Four-LDR quadrant array — PRESENTATION LAYER ONLY.
 *
 * The demonstration hardware mounts four photoresistors, one per quadrant of
 * the façade module's sensor plate. The simulation, however, still models only
 * TWO physical light channels (`ldrUpper` / `ldrLower`, see
 * `src/lib/embedded/sensors.ts`), and that is deliberate — the differential the
 * kinematics solver and PBIF care about is the vertical one.
 *
 * So this module does exactly one thing: it re-presents those two existing
 * signals as four labelled channels for the Virtual Embedded Controller panel.
 *
 *   Top Left  ─┐
 *              ├─ ldrUpper   (identical values, identical wire colour)
 *   Top Right ─┘
 *   Bottom L. ─┐
 *              ├─ ldrLower   (identical values, identical wire colour)
 *   Bottom R. ─┘
 *
 * It performs NO physics, NO averaging and NO decision logic — each derived
 * signal shares its source's `steps` and `raw` by reference. Nothing here
 * reaches the engines: it only changes what the panel draws.
 */

import type { EmbeddedState, SensorSignal } from '@/lib/embedded'

export interface LdrQuadrant {
  /** Unique id — drives React keys, the expand/collapse row state and wiring. */
  id: string
  /** Full display name for the Sensor Layer list. */
  name: string
  /** Abbreviated name for the ESP32 board's pin sublabel (space is tight). */
  short: string
  /** Two-letter tag silkscreened on the circuit-diagram module. */
  tag: string
  /** ADC channel this quadrant is presented on. */
  gpioLabel: string
  /** Which real sensor channel supplies the values. */
  source: 'ldrUpper' | 'ldrLower'
}

/**
 * ADC0–ADC3 are reserved for the four-LDR array, so the two remaining analog
 * inputs move up to ADC4/ADC5. Presentation only — `sensors.ts` still owns the
 * canonical labels, and no firmware/simulation behaviour keys off these.
 */
export const ANALOG_PIN_RELABEL: Record<string, string> = {
  wind: 'ADC4',
  rain: 'ADC5',
}

export const LDR_QUADRANTS: LdrQuadrant[] = [
  { id: 'ldrTopLeft', name: 'LDR Top Left', short: 'LDR Top-L', tag: 'TL', gpioLabel: 'ADC0', source: 'ldrUpper' },
  { id: 'ldrTopRight', name: 'LDR Top Right', short: 'LDR Top-R', tag: 'TR', gpioLabel: 'ADC1', source: 'ldrUpper' },
  { id: 'ldrBottomLeft', name: 'LDR Bottom Left', short: 'LDR Bot-L', tag: 'BL', gpioLabel: 'ADC2', source: 'ldrLower' },
  { id: 'ldrBottomRight', name: 'LDR Bottom Right', short: 'LDR Bot-R', tag: 'BR', gpioLabel: 'ADC3', source: 'ldrLower' },
]

/** True for any of the four presented LDR channels. */
export const isLdrQuadrant = (id: string) => id.startsWith('ldrTop') || id.startsWith('ldrBottom')

/**
 * Re-label the four LDR channels onto ADC0–ADC3, keeping every value
 * (`steps`, `raw`) shared by reference with the source signal — the top pair
 * therefore always reads identically, as does the bottom pair.
 */
export function ldrQuadrantSignals(sensors: EmbeddedState['sensors']): SensorSignal[] {
  return LDR_QUADRANTS.map((q) => ({
    ...sensors[q.source],
    id: q.id,
    name: q.name,
    gpioLabel: q.gpioLabel,
  }))
}

/** Apply `ANALOG_PIN_RELABEL` to a signal, leaving untouched channels as-is. */
export function withRelabelledPin(signal: SensorSignal): SensorSignal {
  const gpioLabel = ANALOG_PIN_RELABEL[signal.id]
  return gpioLabel ? { ...signal, gpioLabel } : signal
}
