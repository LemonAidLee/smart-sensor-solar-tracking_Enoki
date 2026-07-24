/**
 * PBIF v1 — Decision Engine.
 *
 *   Situation Assessment  →  [ PBIF Decision ]  →  Operational State
 *
 * The core of the framework. It maps the engineering states from the Situation
 * Assessment layer to ONE high-level operational objective for the whole building.
 *
 * IMPORTANT — PBIF is **not** a rotation solver. It never outputs a panel angle.
 * It decides *what the building is trying to do*; the Tracking Policy then routes
 * that objective through the existing kinematics engine, which alone computes the
 * physical rotation.
 *
 * ── Decision hierarchy (highest priority first) ──────────────────────────────
 *   1. Structural Safety   — protect the actuator / structure (wind)
 *   2. Weather Protection  — preserve the façade & glazing (rain)
 *   3. Solar Optimization  — track the sun efficiently (cloud)
 *
 * Rules are evaluated top-down and the FIRST match wins, so a higher-priority
 * rule can never be overridden by a lower one. The table is declarative so the
 * whole policy is auditable at a glance and forward-compatible: a future
 * predictive/AI engine replaces the decision *source* and the `confidence`
 * value, while the UI and downstream layers stay unchanged.
 *
 * Deterministic and fully explainable. No AI, ML, prediction, optimization or MPC.
 */

import type { SituationAssessment } from './situationAssessment'
import type { OperationalObjective } from './operationalObjective'
import type { ThermalDemandState } from './thermalDemandAssessment'
import type { SolarResourceState } from './solarResourceAssessment'

/** The high-level operational states PBIF can command. */
export type PbifState =
  | 'NORMAL_TRACKING'
  | 'ECONOMY_TRACKING'
  | 'WEATHER_PROTECTION'
  | 'SAFE_MODE'

/** The physical configuration the façade is commanded into. */
export type FacadeState = 'TRACKING' | 'CLOSED'

/** The four-tier objective hierarchy a decision belongs to. */
export type PbifPriority = 'Structural Safety' | 'Weather Protection' | 'Solar Availability' | 'Thermal Demand'

export interface PbifDecision {
  state: PbifState
  priority: PbifPriority
  /** The high-level operational objective PBIF is currently trying to achieve. */
  objective: OperationalObjective
  /** The physical state the façade is commanded into. */
  facadeState: FacadeState
  /** Plain-language explanation of *why* this objective was chosen. */
  reason: string
  /**
   * Decision confidence, 0–100. Always 100 for this deterministic rule-based
   * engine — the value exists so a future predictive/AI PBIF can supply a real
   * confidence source without any UI or architectural change.
   */
  confidence: number
  /** The exact rule that fired, e.g. `"EXTREME wind → SAFE_MODE"`. */
  ruleTriggered: string
}

/** Confidence of a deterministic rule — certain by construction. */
const RULE_BASED_CONFIDENCE = 100

interface Rule {
  id: string
  priority: PbifPriority
  /** True when this rule applies to the assessed situation. */
  when: (s: SituationAssessment, t: ThermalDemandState, o: OperationalObjective, sr: SolarResourceState) => boolean
  state: PbifState
  facadeState: FacadeState
  reason: (s: SituationAssessment, t: ThermalDemandState, o: OperationalObjective, sr: SolarResourceState) => string
}

/**
 * The ordered decision table. Evaluated top-to-bottom; first match wins. Order
 * encodes the priority hierarchy: all Structural-Safety rules precede all
 * Weather-Protection rules, which precede all Solar-Optimization rules.
 */
const RULES: Rule[] = [
  // ── Priority 1 · Structural Safety (wind) ─────────────────────────────────
  {
    id: 'EXTREME wind → SAFE_MODE',
    priority: 'Structural Safety',
    when: (s) => s.wind.state === 'EXTREME',
    state: 'SAFE_MODE',
    facadeState: 'CLOSED',
    reason: (s) =>
      `Wind is EXTREME (${s.wind.display}). Structural safety overrides all optimisation — the façade moves to its fully closed configuration and suspends tracking.`,
  },
  {
    id: 'HIGH wind → ECONOMY_TRACKING',
    priority: 'Structural Safety',
    when: (s) => s.wind.state === 'HIGH',
    state: 'ECONOMY_TRACKING',
    facadeState: 'TRACKING',
    reason: (s) =>
      `Wind is HIGH (${s.wind.display}). Tracking continues but actuator movement is reduced to limit structural load and wear.`,
  },

  // ── Priority 2 · Weather Protection (rain) ────────────────────────────────
  {
    id: 'HEAVY rain → WEATHER_PROTECTION',
    priority: 'Weather Protection',
    when: (s) => s.rain.state === 'HEAVY',
    state: 'WEATHER_PROTECTION',
    facadeState: 'CLOSED',
    reason: (s) =>
      `Rain is HEAVY (${s.rain.display}). The objective shifts from solar tracking to preserving the façade in a fully closed rain-safe configuration.`,
  },
  {
    id: 'MODERATE rain → WEATHER_PROTECTION',
    priority: 'Weather Protection',
    when: (s) => s.rain.state === 'MODERATE',
    state: 'WEATHER_PROTECTION',
    facadeState: 'CLOSED',
    reason: (s) =>
      `Rain is MODERATE (${s.rain.display}). The façade favours a closed, rain-safe posture over aggressive sun tracking.`,
  },
  {
    id: 'LIGHT rain → ECONOMY_TRACKING',
    priority: 'Weather Protection',
    when: (s) => s.rain.state === 'LIGHT',
    state: 'ECONOMY_TRACKING',
    facadeState: 'TRACKING',
    reason: (s) =>
      `Rain is LIGHT (${s.rain.display}). Tracking continues at reduced movement frequency to limit exposure of the moving parts.`,
  },

  // ── Priority 3 · Solar Availability (cloud/irradiance) ───────────────────
  {
    id: 'LOW Solar Resource → ECONOMY_TRACKING',
    priority: 'Solar Availability',
    when: (s, t, o, sr) => sr === 'LOW' && t !== 'HIGH',
    state: 'ECONOMY_TRACKING',
    facadeState: 'TRACKING',
    reason: (s, t, o, sr) =>
      `Solar Resource is LOW. Direct solar gain is minimal, so movement is economised (wider deadband) to avoid unnecessary actuation.`,
  },
  {
    id: 'MEDIUM Solar Resource → ECONOMY_TRACKING',
    priority: 'Solar Availability',
    when: (s, t, o, sr) => sr === 'MEDIUM' && t !== 'HIGH',
    state: 'ECONOMY_TRACKING',
    facadeState: 'TRACKING',
    reason: (s, t, o, sr) =>
      `Solar Resource is MEDIUM. Diffuse light is significant, so tracking continues but with an economised deadband.`,
  },

  // ── Priority 4 · Thermal Demand (outdoor temperature) ────────────────────
  {
    id: 'HIGH temperature + LOW/MEDIUM Solar Resource → ECONOMY_TRACKING',
    priority: 'Thermal Demand',
    when: (s, t, o, sr) => (sr === 'LOW' || sr === 'MEDIUM') && t === 'HIGH',
    state: 'ECONOMY_TRACKING',
    facadeState: 'TRACKING',
    reason: (s, t, o, sr) =>
      `Thermal Demand is HIGH (${t}) due to high outdoor temperatures. The objective is to ${o}. Since Solar Resource is ${sr}, the façade uses economy tracking to reduce wear while maintaining thermal protection.`,
  },
  {
    id: 'HIGH temperature + HIGH Solar Resource → NORMAL_TRACKING',
    priority: 'Thermal Demand',
    when: (s, t, o, sr) => sr === 'HIGH' && t === 'HIGH',
    state: 'NORMAL_TRACKING',
    facadeState: 'TRACKING',
    reason: (s, t, o, sr) =>
      `Thermal Demand is HIGH (${t}) due to high outdoor temperatures. The objective is to ${o}. Normal tracking is maintained to aggressively reject solar heat gain from the HIGH Solar Resource.`,
  },

  // ── Default ───────────────────────────────────────────────────────────────
  {
    id: 'Default → NORMAL_TRACKING',
    priority: 'Solar Availability',
    when: () => true,
    state: 'NORMAL_TRACKING',
    facadeState: 'TRACKING',
    reason: (s, t, o, sr) =>
      `Weather is benign (Wind: ${s.wind.display}, Rain: ${s.rain.display}, Solar Resource: ${sr}). The objective is to ${o}. Normal solar tracking proceeds with a tight deadband.`,
  },

]

/**
 * Run the decision engine.
 */
export function decide(
  situation: SituationAssessment, 
  thermalDemand: ThermalDemandState, 
  objective: OperationalObjective,
  solarResource: SolarResourceState
): PbifDecision {
  for (const rule of RULES) {
    if (rule.when(situation, thermalDemand, objective, solarResource)) {
      return {
        state: rule.state,
        priority: rule.priority,
        objective,
        facadeState: rule.facadeState,
        reason: rule.reason(situation, thermalDemand, objective, solarResource),
        confidence: RULE_BASED_CONFIDENCE,
        ruleTriggered: rule.id,
      }
    }
  }
  // Should never be reached due to default rule
  return {
    state: 'NORMAL_TRACKING',
    priority: 'Solar Availability',
    objective,
    facadeState: 'TRACKING',
    reason: 'Fallback.',
    confidence: 100,
    ruleTriggered: 'Fallback',
  }
}

/** Short human-readable label for each operational state. */
export const PBIF_STATE_LABELS: Record<PbifState, string> = {
  NORMAL_TRACKING: 'Normal Tracking',
  ECONOMY_TRACKING: 'Economy Tracking',
  WEATHER_PROTECTION: 'Weather Protection',
  SAFE_MODE: 'Safe Mode',
}
