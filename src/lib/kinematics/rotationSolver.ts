/**
 * RotationSolver — the heart of the kinematic model.
 *
 * Given a panel's geometry, the solar vector and the panel's current angle, it
 * derives — analytically, from vectors alone — the rotation(s) that satisfy each
 * candidate strategy, and returns the one to command. It contains NO time rules
 * and NO optimisation weighting; it is the pure geometry PBIF will later call.
 *
 * ── The five candidate strategies (all reduce to two families) ───────────────
 *   A  Panel normal aligned with the sun's horizontal projection
 *   B  Panel surface perpendicular to incoming sunlight
 *   C  Maximum shading  (largest projected area toward the sun)
 *   E  Minimum incident angle (panel normal closest to the sun)
 *      → A ≡ B ≡ C ≡ E. A vertical-axis panel can only steer in azimuth, so all
 *        four are the SAME rotation: point the normal at the sun's azimuth. This
 *        maximises exposure = cos(altitude) (the physical ceiling).
 *   D  Minimum projected solar exposure (edge-on to the sun) → A ± 90°.
 *
 * ── 360° / two-solution logic ────────────────────────────────────────────────
 *   A flat blade is symmetric: angles θ and θ+180° describe the SAME plane
 *   (opposite face toward the sun) and give identical exposure/shading. So every
 *   target is a family {θ + 180°·k}; the solver commands the member nearest the
 *   current angle (shortest path ≤ 90°), returned as a CONTINUOUS value so motion
 *   never jumps 359°→0° and never reverses unnecessarily.
 *
 * ── Chosen default ───────────────────────────────────────────────────────────
 *   `RECOMMENDED_INTENT = 'shade'` (Strategy C ≡ A ≡ B ≡ E): a kinetic shading
 *   façade physically "tracks" the sun to intercept the beam, which is the motion
 *   that reads as responding to the real sun. `'daylight'` (D) is its complement.
 *   PBIF later just chooses the intent; the geometry is unchanged.
 */
import { facadeSurface, panelNormal, type FacadeSurface } from './facadeSurface'
import { PanelKinematics } from './panelKinematics'
import { projectedExposure, beamIncidenceDeg } from './incidentAngle'
import type { SolarVector } from './solarVector'
import { angleAboutY, dot, nearestCongruent, rad2deg, type Vec3 } from './vectorMath'

export type Intent = 'shade' | 'daylight'
export const RECOMMENDED_INTENT: Intent = 'shade'

/** Panel angle (edge-on) used to rest when the surface has no direct sun. */
export const REST_ANGLE = 90

export type StrategyKey = 'A' | 'B' | 'C' | 'D' | 'E'

export interface CandidateStrategy {
  key: StrategyKey
  name: string
  /** Principal solution angle (deg, wrapped near 0). */
  baseAngle: number
  /** Continuous angle nearest the current rotation (what would be commanded). */
  targetAngle: number
  /** Projected exposure at the target, 0–1. */
  exposure: number
  /** Incident angle (deg) between panel normal and sun at the target. */
  incidenceDeg: number
  rationale: string
}

export interface RotationSolution {
  aboveHorizon: boolean
  sunlit: boolean
  intent: Intent
  /** Principal max-shading angle: panel normal aligned with the sun azimuth. */
  alignAngle: number
  /** CONTINUOUS angle to command this frame (shortest path from current). */
  targetAngle: number
  /** Projected exposure at the commanded target, 0–1. */
  exposure: number
  /** Incident angle (deg) at the commanded target. */
  incidenceAtTarget: number
  /** Exposure ceiling for this sun = cos(altitude). */
  maxExposure: number
  restApplied: boolean
  reason: string
  /** All five candidate strategies, for the comparison view. */
  candidates: CandidateStrategy[]
}

/**
 * Principal angle θ* at which the panel normal aligns with the sun's horizontal
 * projection (Strategy A/B/C/E — maximum shading). Derived analytically from the
 * `rotateY` bearing identity, not by search:
 *   panelNormal(θ) = rotateY(n, −θ)  ⇒  bearing(panelNormal) = bearing(n) − θ
 *   set equal to bearing(sunₕ)       ⇒  θ* = bearing(n) − bearing(sunₕ)
 */
export function alignAngle(surface: FacadeSurface, solar: SolarVector): number {
  return rad2deg(angleAboutY(surface.normal) - angleAboutY(solar.horizontal))
}

/** Evaluate all five candidate strategies at the current rotation. */
export function evaluateCandidates(
  pk: PanelKinematics,
  solar: SolarVector,
  currentAngle: number,
): CandidateStrategy[] {
  const align = alignAngle(pk.surface, solar)
  const make = (key: StrategyKey, name: string, base: number, rationale: string): CandidateStrategy => {
    const target = nearestCongruent(currentAngle, base, 180) // flat-panel 180° symmetry
    const normal = panelNormal(pk.surface, target)
    return {
      key,
      name,
      baseAngle: base,
      targetAngle: target,
      exposure: projectedExposure(normal, solar),
      incidenceDeg: beamIncidenceDeg(normal, solar),
      rationale,
    }
  }
  return [
    make('A', 'Normal ∥ solar projection', align, 'Panel normal points at the sun azimuth.'),
    make('B', 'Surface ⟂ sunlight', align, 'Broad face square to the beam (azimuth-limited).'),
    make('C', 'Maximum shading', align, 'Largest area presented to the sun → max block.'),
    make('D', 'Minimum exposure', align + 90, 'Edge-on to the sun → beam passes, max daylight.'),
    make('E', 'Minimum incident angle', align, 'Panel normal closest to the sun direction.'),
  ]
}

/**
 * Solve the commanded rotation for the given intent. `shade` maximises
 * interception (track the sun), `daylight` minimises it (edge-on). When the
 * surface is back-lit or the sun is down there is no direct sun to respond to, so
 * the panel rests edge-on (open). Handles the near-zenith singularity by holding.
 */
export function solve(
  pk: PanelKinematics,
  solar: SolarVector,
  currentAngle: number,
  intent: Intent = RECOMMENDED_INTENT,
): RotationSolution {
  const candidates = evaluateCandidates(pk, solar, currentAngle)
  const sunlit = pk.isSunlit(solar)
  const maxExposure = pk.maxExposure(solar)
  const align = alignAngle(pk.surface, solar)

  let targetAngle: number
  let restApplied = false
  let reason: string

  if (!solar.aboveHorizon) {
    targetAngle = nearestCongruent(currentAngle, REST_ANGLE, 180)
    restApplied = true
    reason = 'Sun below the horizon — panel rests edge-on (open).'
  } else if (!sunlit) {
    targetAngle = nearestCongruent(currentAngle, REST_ANGLE, 180)
    restApplied = true
    reason = 'Surface is back-lit (sun behind the façade) — no beam to respond to; rests open.'
  } else if (maxExposure < 0.02) {
    // Sun overhead: azimuth control is meaningless, hold to avoid jitter.
    targetAngle = currentAngle
    reason = 'Sun near the zenith — vertical-axis rotation has no effect; holding.'
  } else if (intent === 'daylight') {
    targetAngle = nearestCongruent(currentAngle, align + 90, 180)
    reason = 'Daylight intent — blade turned edge-on to the sun (minimum exposure).'
  } else {
    targetAngle = nearestCongruent(currentAngle, align, 180)
    reason = 'Shade intent — blade tracks the sun azimuth (maximum interception).'
  }

  const normal = panelNormal(pk.surface, targetAngle)
  return {
    aboveHorizon: solar.aboveHorizon,
    sunlit,
    intent,
    alignAngle: align,
    targetAngle,
    exposure: projectedExposure(normal, solar),
    incidenceAtTarget: beamIncidenceDeg(normal, solar),
    maxExposure,
    restApplied,
    reason,
    candidates,
  }
}

/** Convenience: solve directly from a surface normal. */
export function solveForNormal(
  surfaceNormal: Vec3,
  solar: SolarVector,
  currentAngle: number,
  intent: Intent = RECOMMENDED_INTENT,
): RotationSolution {
  return solve(new PanelKinematics(surfaceNormal), solar, currentAngle, intent)
}

/** Small helper so callers can build a surface without importing the module. */
export function surfaceFromNormal(surfaceNormal: Vec3): FacadeSurface {
  return facadeSurface(surfaceNormal)
}

// Re-exported so a consumer needs to know only `dot` from here if at all.
export { dot }
