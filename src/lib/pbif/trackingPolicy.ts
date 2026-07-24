/**
 * PBIF v1 — Tracking Policy layer.
 *
 *   PBIF Decision  →  [ Tracking Policy ]  →  Existing Kinematics Solver  →  Target Rotation
 *
 * The bridge between the abstract operational objective and the physical façade.
 * PBIF decides *what* the building should do; the Tracking Policy decides *how*
 * that objective drives the blades — and it does so ONLY by:
 *
 *   • calling the existing kinematics engine (`solveForNormal`) for tracking, or
 *   • selecting a predefined, configurable safe orientation for protection.
 *
 * It never computes solar geometry or panel angles of its own. `SAFE_MODE` and
 * `WEATHER_PROTECTION` route their configured target through the SAME shortest-
 * path helper (`nearestCongruent`) the kinematics solver uses, so the animation
 * pipeline is identical for every state. The kinematics engine is untouched.
 *
 * Deterministic and explainable. No optimization, no prediction.
 */

import { nearestCongruent, solveForNormal, type Intent, type SolarVector, type Vec3 } from '@/lib/kinematics'
import type { FacadeState, PbifDecision, PbifState } from './decisionEngine'
import { DYNAMIC_DEADBAND_DEG } from './thresholds'
import type { SolarResourceState } from './solarResourceAssessment'

/** How a policy drives the blades — for UI classification and behaviour text. */
export type PolicyKind = 'track' | 'economy-track' | 'protect' | 'safe'

export interface TrackingPolicy {
  kind: PolicyKind
  /** The physical state the façade is commanded into. */
  facadeState: FacadeState
  /** Short name of the resulting façade configuration. */
  label: string
  /** One-line description of the actual façade behaviour, for the UI. */
  behaviour: string
  /** Whether the façade is actively following the sun under this policy. */
  tracksSun: boolean
}

/** Flat-blade 180° symmetry period — θ and θ+180° describe the same plane. */
const BLADE_PERIOD_DEG = 180

/** Map an operational decision to its façade-behaviour policy. */
export function policyFor(decision: PbifDecision): TrackingPolicy {
  switch (decision.state) {
    case 'SAFE_MODE':
      return {
        kind: 'safe',
        facadeState: 'CLOSED',
        label: 'Wind-Safe Configuration',
        behaviour: `Blades move to the fully closed configuration (0°, parallel to surface normal) to minimise wind load; automatic tracking is suspended.`,
        tracksSun: false,
      }
    case 'WEATHER_PROTECTION':
      return {
        kind: 'protect',
        facadeState: 'CLOSED',
        label: 'Rain-Safe Configuration',
        behaviour: `Blades move to the fully closed configuration (0°) to preserve the glazing instead of tracking the sun.`,
        tracksSun: false,
      }
    case 'ECONOMY_TRACKING':
      return {
        kind: 'economy-track',
        facadeState: 'TRACKING',
        label: 'Deadband Control Active',
        behaviour: `The façade tracks the sun but ignores target changes smaller than the dynamic deadband (varies by Solar Resource) to mitigate actuator wear and prevent limit cycling.`,
        tracksSun: true,
      }
    case 'NORMAL_TRACKING':
    default:
      return {
        kind: 'track',
        facadeState: 'TRACKING',
        label: 'Full Sun Tracking',
        behaviour: 'Follows the sun continuously via the kinematics solver for maximum solar performance.',
        tracksSun: true,
      }
  }
}

export interface PbifTargetInput {
  /** Outward normal of the surface being solved. */
  surfaceNormal: Vec3
  /** Current (building-local) solar vector. */
  solar: SolarVector
  /** This surface's current continuous rotation. */
  currentAngle: number
  /** Tracking flavour handed to the kinematics solver when tracking. */
  intent: Intent
  /** The current estimated solar resource, used to select the dynamic deadband. */
  solarResource: SolarResourceState
}

/**
 * Resolve the continuous target rotation for one surface under a PBIF decision.
 *
 * Tracking states defer entirely to the existing kinematics solver; protection
 * states move toward a configured safe orientation. `ECONOMY_TRACKING` applies a
 * dead-band around the current angle so small solar drift produces no movement.
 */
export function resolveTarget(state: PbifState, input: PbifTargetInput): number {
  const { surfaceNormal, solar, currentAngle, intent } = input

  // In PBIF v1, map the legacy state to a FacadeState to resolve the rotation.
  // This maintains the existing API shape while enforcing the new CLOSED logic.
  const facadeState: FacadeState = (state === 'SAFE_MODE' || state === 'WEATHER_PROTECTION') ? 'CLOSED' : 'TRACKING'

  if (facadeState === 'CLOSED') {
    // The panel normal should become parallel to the façade surface normal.
    // In our geometry engine, this is exactly 0°.
    return nearestCongruent(currentAngle, 0, BLADE_PERIOD_DEG)
  }

  // facadeState === 'TRACKING'
  switch (state) {
    case 'ECONOMY_TRACKING': {
      // Dynamic Deadband control: compute the new theoretical target, but only command a move
      // if the angular difference exceeds the dynamic tracking deadband for the current solar resource.
      const theoreticalTarget = solveForNormal(surfaceNormal, solar, currentAngle, intent).targetAngle
      const angularDifference = Math.abs(theoreticalTarget - currentAngle)
      
      const deadband = DYNAMIC_DEADBAND_DEG[input.solarResource]
      
      if (angularDifference > deadband) {
        return theoreticalTarget // Update panel rotation
      } else {
        return currentAngle // Hold position
      }
    }

    case 'NORMAL_TRACKING':
    default:
      // Full sun tracking — the existing kinematics engine, unchanged.
      return solveForNormal(surfaceNormal, solar, currentAngle, intent).targetAngle
  }
}
