/**
 * Solar-visualisation helpers (Weather Validation Mode).
 *
 * Pure, framework-free geometry used by BOTH the Solar Geometry inspector (DOM)
 * and the 3D active-surface highlight, so the panel label and the highlighted
 * façade always agree. This is visualisation only — no PBIF, no optimisation.
 */

export type Facing = 'N' | 'E' | 'S' | 'W' | 'ROOF'

export interface ActiveFacing {
  facing: Facing
  /** Human label, e.g. "East Façade". */
  label: string
  /** Accent colour for the chip + 3D glow. */
  color: string
}

/** Above this solar altitude the roof/upper façade takes the most sun. */
export const ROOF_ALTITUDE = 58

/**
 * The building surface currently receiving the most sun, derived from the sun's
 * position and the (locked) building orientation. A vertical façade is most lit
 * when its outward normal points toward the sun's azimuth; when the sun is very
 * high the roof dominates.
 */
export function activeFacing(azimuth: number, altitude: number, orientation: number): ActiveFacing {
  if (altitude >= ROOF_ALTITUDE) return { facing: 'ROOF', label: 'Roof / Upper Façade', color: '#fbbf24' }
  const rel = (((azimuth - orientation) % 360) + 360) % 360
  if (rel >= 45 && rel < 135) return { facing: 'E', label: 'East Façade', color: '#f59e0b' }
  if (rel >= 135 && rel < 225) return { facing: 'S', label: 'South Façade', color: '#f43f5e' }
  if (rel >= 225 && rel < 315) return { facing: 'W', label: 'West Façade', color: '#38bdf8' }
  return { facing: 'N', label: 'North Façade', color: '#94a3b8' }
}

/** Screen unit vector (SVG, y-down) for a compass bearing measured CW from north. */
export function bearingToSvg(bearingDeg: number): { x: number; y: number } {
  const a = (bearingDeg * Math.PI) / 180
  return { x: Math.sin(a), y: -Math.cos(a) }
}
