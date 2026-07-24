/**
 * FacadeControl — the single "source of target rotation" abstraction.
 *
 * The façade renderer and animation pipeline consume ONLY a `targetRotation`
 * angle; they never know which mode produced it. Exactly one switch, here, maps
 * the active control mode to that angle. This is the seam the roadmap plugs into:
 * PBIF, ESP32 feedback and fault injection become new `case`s that return a target
 * — with zero changes to the renderer, the engine loop, or the kinematics.
 *
 *                     Facade Renderer  (consumes targetRotation only)
 *                            ▲
 *                     Target Rotation
 *                            ▲
 *        ┌───────────────────┼───────────────────────────────┐
 *   Manual Slider     Kinematics Engine              PBIF Decision Layer
 *   (mode: 'manual')  (mode: 'sun-tracking')         (mode: 'pbif')
 *                                                     weather → decision → policy
 *                                                     → kinematics (same solver)
 *
 * Modularity per PBIF_ENGINEERING_GUIDE.md §6: pure logic, no React; reuses the
 * existing kinematics engine (`solveForNormal`) rather than duplicating geometry.
 * PBIF plugs in here as a third target *source*: it decides the operating policy,
 * then the Tracking Policy routes that policy through the SAME kinematics solver —
 * PBIF never returns a panel angle of its own.
 */
import { solveForNormal, nearestCongruent, type Intent, type SolarVector, type Vec3 } from '@/lib/kinematics'
import { resolveTarget as resolvePbifTarget, type PbifState } from '@/lib/pbif'
import type { SolarResourceState } from '@/lib/pbif/solarResourceAssessment'

export type FacadeControlMode = 'manual' | 'sun-tracking' | 'pbif'

export interface FacadeTargetInput {
  /** Outward normal of the surface being solved. */
  surfaceNormal: Vec3
  /** Current solar vector (shared, computed once per tick). */
  solar: SolarVector
  /** This surface's current continuous rotation (its blades move together). */
  currentAngle: number
  /** Manual slider value, 0–360° (used only in `'manual'` mode). */
  manualAngle: number
  /** Tracking intent for the geometry engine (used in `'sun-tracking'` and `'pbif'`). */
  trackingIntent: Intent
  /**
   * The PBIF operational state for this tick (used only in `'pbif'` mode). It is
   * decided ONCE per tick from weather and passed in — the target source stays a
   * pure per-surface function.
   */
  pbifState?: PbifState
  /**
   * The PBIF estimated solar resource, used to configure the tracking policy (dynamic deadband).
   */
  solarResource?: SolarResourceState
}

/** Manual uses the full 360° circle — every orientation is a distinct command. */
const MANUAL_PERIOD_DEG = 360

/**
 * Resolve the continuous target rotation for one surface from the active mode.
 * The engine applies the SAME easing to this value regardless of source, so the
 * animation pipeline is identical across modes.
 */
export function resolveTargetRotation(mode: FacadeControlMode, input: FacadeTargetInput): number {
  switch (mode) {
    case 'manual':
      // The slider directly specifies the angle; take the shortest 360° path so a
      // blade never unwinds when the user crosses the 0°/360° boundary.
      return nearestCongruent(input.currentAngle, input.manualAngle, MANUAL_PERIOD_DEG)
    case 'sun-tracking':
      // Pure geometry engine — unchanged behaviour (RotationSolver).
      return solveForNormal(input.surfaceNormal, input.solar, input.currentAngle, input.trackingIntent).targetAngle
    case 'pbif':
      // PBIF v1 — the decision was made once this tick; the Tracking Policy
      // routes it through the SAME kinematics solver (or a configured safe
      // orientation). PBIF itself never returns a panel angle.
      return resolvePbifTarget(input.pbifState ?? 'NORMAL_TRACKING', {
        surfaceNormal: input.surfaceNormal,
        solar: input.solar,
        currentAngle: input.currentAngle,
        intent: input.trackingIntent,
        solarResource: input.solarResource ?? 'HIGH',
      })
    // Future roadmap sources plug in here without touching the renderer:
    //   case 'esp32': return telemetry.feedbackAngle(...)
    //   case 'fault': return faultModel.stuckAngle(...)
    default:
      return input.currentAngle
  }
}
