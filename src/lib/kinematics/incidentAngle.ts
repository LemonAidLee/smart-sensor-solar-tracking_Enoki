/**
 * IncidentAngle — the geometric quantities that describe how sunlight strikes a
 * surface or a panel. Pure functions of vectors; no rules, no thresholds.
 *
 * A kinetic blade is a FLAT, double-sided plate: it intercepts the same beam
 * whether its front or its back face is turned toward the sun. So beam
 * interception is face-agnostic and uses |n̂·ŝ| (not max(0, n̂·ŝ)). The signed
 * cosine is kept separately for the fixed, single-sided façade (which window is
 * actually lit).
 */
import { angleBetweenDeg, clamp, dot, rad2deg, type Vec3 } from './vectorMath'
import type { SolarVector } from './solarVector'

/**
 * Projected solar exposure of a flat blade with the given normal: the fraction of
 * the direct beam its area intercepts (= shading fraction), |n̂·ŝ| ∈ [0, 1].
 * 1 = broad face square to the sun (max shading), 0 = edge-on (beam passes).
 */
export function projectedExposure(normal: Vec3, solar: SolarVector): number {
  return Math.abs(dot(normal, solar.toSun))
}

/**
 * Beam incident angle on the blade PLANE (deg, 0–90): acos(|n̂·ŝ|). 0° when the
 * blade faces the sun (either face), 90° when edge-on. At maximum shading this
 * equals the solar altitude — the residual a vertical-axis blade cannot remove.
 */
export function beamIncidenceDeg(normal: Vec3, solar: SolarVector): number {
  return rad2deg(Math.acos(clamp(Math.abs(dot(normal, solar.toSun)), 0, 1)))
}

/** Full angle (deg, 0–180) between a specific panel normal and the sun. */
export function incidenceDeg(normal: Vec3, solar: SolarVector): number {
  return angleBetweenDeg(normal, solar.toSun)
}

/** Signed cosine of incidence for a single-sided face (− when back-lit). */
export function cosIncidence(normal: Vec3, solar: SolarVector): number {
  return clamp(dot(normal, solar.toSun), -1, 1)
}
