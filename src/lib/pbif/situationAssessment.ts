/**
 * PBIF v1 — Situation Assessment layer.
 *
 *   Weather  →  [ Situation Assessment ]  →  Engineering States
 *
 * The first layer of the framework. It translates the three raw, continuous
 * weather inputs into discrete, meaningful engineering categories so the
 * downstream decision engine reasons about *states* ("wind is HIGH") — never raw
 * thresholds. All band edges live in `thresholds.ts`; this module owns none of
 * its own magic numbers.
 *
 * Deterministic and pure — no time, no history, no AI.
 */

import { RAIN_LEVEL, WIND_KMH } from './thresholds'

export type WindState = 'LOW' | 'MODERATE' | 'HIGH' | 'EXTREME'
export type RainState = 'NONE' | 'LIGHT' | 'MODERATE' | 'HEAVY'

/** The only three weather variables PBIF v1 is permitted to read. */
export interface WeatherInputs {
  /** Wind speed, km/h. */
  windSpeed: number
  /** Rain intensity, 0–1 normalised. */
  rainIntensity: number
  /** Cloud cover, 0–1 normalised. */
  cloudCoverage: number
  /** Outdoor temperature, °C */
  outdoorTemperature: number
}

/** One classified variable: its engineering state plus the raw value it came from. */
export interface AssessedVariable<S extends string> {
  state: S
  /** The raw input value (kept for full explainability / traceability). */
  value: number
  /** Human-readable value with unit, e.g. `"42 km/h"` or `"94%"`. */
  display: string
}

export interface SituationAssessment {
  wind: AssessedVariable<WindState>
  rain: AssessedVariable<RainState>
}

/**
 * Classify a value into an ordered set of named bands. `bands` are `[edge, state]`
 * pairs sorted ascending by edge; a value takes the state of the highest edge it
 * meets or exceeds, else `base`. Keeps every threshold in one declarative place.
 */
function classify<S extends string>(
  value: number,
  base: S,
  bands: ReadonlyArray<readonly [number, S]>,
): S {
  let state = base
  for (const [edge, s] of bands) {
    if (value >= edge) state = s
  }
  return state
}

const pct = (v: number): string => `${Math.round(v * 100)}%`

export function assessWind(windSpeed: number): AssessedVariable<WindState> {
  const state = classify<WindState>(windSpeed, 'LOW', [
    [WIND_KMH.MODERATE, 'MODERATE'],
    [WIND_KMH.HIGH, 'HIGH'],
    [WIND_KMH.EXTREME, 'EXTREME'],
  ])
  return { state, value: windSpeed, display: `${Math.round(windSpeed)} km/h` }
}

export function assessRain(rainIntensity: number): AssessedVariable<RainState> {
  const state = classify<RainState>(rainIntensity, 'NONE', [
    [RAIN_LEVEL.LIGHT, 'LIGHT'],
    [RAIN_LEVEL.MODERATE, 'MODERATE'],
    [RAIN_LEVEL.HEAVY, 'HEAVY'],
  ])
  return { state, value: rainIntensity, display: pct(rainIntensity) }
}

/** Translate the raw weather inputs into engineering states. */
export function assessSituation(w: WeatherInputs): SituationAssessment {
  return {
    wind: assessWind(w.windSpeed),
    rain: assessRain(w.rainIntensity),
  }
}

/** Display label for each state, for the UI (kept beside the states they map). */
export const STATE_LABELS: Record<WindState | RainState, string> = {
  LOW: 'Low',
  MODERATE: 'Moderate',
  HIGH: 'High',
  EXTREME: 'Extreme',
  NONE: 'None',
  LIGHT: 'Light',
  HEAVY: 'Heavy',
}
