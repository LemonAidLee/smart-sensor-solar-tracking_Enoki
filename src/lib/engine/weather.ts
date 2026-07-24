/**
 * Weather + Wind engines. They take the user-driven weather inputs and derive
 * the dependent fields (visibility, pressure, gust strength, ground wetness).
 * Nothing downstream reads a hard-coded value — it all comes from WeatherState.
 */

import type { WeatherState } from './types'
import { clamp, compassToWorld } from './math'

let gustPhase = 0

/** Derive visibility/pressure/uv and integrate ground wetness. */
export function updateWeather(w: WeatherState, sunUv: number, dt: number): void {
  const haze = w.humidity / 100
  const vis = 40 * (1 - haze * 0.45) * (1 - w.cloudCoverage * 0.2) * (1 - w.rainIntensity * 0.7)
  w.visibility = Math.max(1.5, Math.round(vis * 10) / 10)

  const targetPressure = 1013 - w.rainIntensity * 12 - w.cloudCoverage * 4 + (1 - haze) * 3
  w.pressure = Math.round((w.pressure + (targetPressure - w.pressure) * Math.min(1, dt * 0.5)) * 10) / 10

  w.uvIndex = sunUv

  // Ground wetness rises quickly with rain and dries slowly.
  const wetTarget = clamp(w.rainIntensity * 1.15)
  if (wetTarget > w.groundWetness) w.groundWetness += (wetTarget - w.groundWetness) * Math.min(1, dt * 0.8)
  else w.groundWetness = Math.max(wetTarget, w.groundWetness - dt * 0.03)
  w.groundWetness = clamp(w.groundWetness)
}

/** Turn wind speed into a gusty normalised strength + a world travel vector. */
export function updateWind(w: WeatherState, dt: number): void {
  gustPhase += dt * (0.6 + w.windSpeed * 0.02)
  const base = clamp(w.windSpeed / 60)
  const gust = (Math.sin(gustPhase) * 0.5 + Math.sin(gustPhase * 2.3 + 1) * 0.25 + 0.75) / 1.5
  w.windStrength = clamp(base * (0.6 + gust * 0.4))
  // windDirection is the bearing the wind blows FROM; travel is the opposite way.
  w.windVector = compassToWorld((w.windDirection + 180) % 360, 0)
}
