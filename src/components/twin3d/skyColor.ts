/** Derives sky/fog/light colours from the sun altitude (and cloud cover). */

import { clamp, lerp, smoothstep } from '@/lib/engine/math'

type RGB = [number, number, number]

function mix(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
}

export interface SkyEnv {
  background: RGB
  fog: RGB
  sunColor: RGB
  sunIntensity: number
  ambientIntensity: number
  hemiSky: RGB
  hemiGround: RGB
}

const NIGHT_BG: RGB = [0.06, 0.08, 0.12]
const DUSK_BG: RGB = [0.65, 0.50, 0.45]
const DAY_BG: RGB = [0.75, 0.82, 0.90]

export function skyEnv(altitude: number, cloudCoverage: number): SkyEnv {
  const day = smoothstep(-2, 12, altitude) // 0 night → 1 day
  const golden = clamp(1 - Math.abs(altitude) / 12) // horizon warmth

  let background = mix(NIGHT_BG, DAY_BG, day)
  background = mix(background, DUSK_BG, golden * 0.7 * (altitude > -4 ? 1 : 0))

  // Cloud desaturates toward a soft, bright overcast grey.
  const grey: RGB = [0.78, 0.80, 0.82]
  background = mix(background, grey, cloudCoverage * 0.6 * day)

  // Fog is slightly lighter than the background to create atmospheric depth (aerial perspective).
  const fog = mix(background, [0.85, 0.88, 0.92], 0.2 * day)

  // Softer sunlight (less saturated orange/yellow).
  const sunColor: RGB = mix([1.0, 0.85, 0.75], [1.0, 0.98, 0.96], smoothstep(0, 30, altitude))
  // Slightly lower sun intensity, higher ambient for that GI look.
  const sunIntensity = clamp(day * (1 - cloudCoverage * 0.7)) * 1.8
  const ambientIntensity = lerp(0.3, 0.7, day) * (1 - cloudCoverage * 0.3) + cloudCoverage * 0.4

  return {
    background,
    fog,
    sunColor,
    sunIntensity,
    ambientIntensity,
    hemiSky: mix([0.15, 0.18, 0.25], [0.85, 0.92, 1.0], day),
    hemiGround: [0.25, 0.25, 0.25],
  }
}
