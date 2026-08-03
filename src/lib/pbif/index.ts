/**
 * PBIF v1 — Predictive Building Intelligence Framework (deterministic, rule-based).
 *
 *   Weather → Situation Assessment → PBIF Decision → Tracking Policy → Kinematics Solver
 *
 * The first decision-making layer of the digital twin. It reads only three
 * weather variables (cloud cover, rain, wind speed), classifies them into
 * engineering states, and chooses ONE building-level operational objective by a
 * strict priority hierarchy (Structural Safety › Weather Protection › Solar
 * Optimization). It NEVER outputs a panel angle — the existing kinematics engine
 * computes every physical rotation.
 *
 * This "V1" is fully deterministic and explainable. AI, machine learning,
 * prediction, optimization and MPC are future phases that will replace the
 * decision *source* (and the confidence value) without changing this interface,
 * the Tracking Policy, or the kinematics engine.
 */

export * from './situationAssessment'
export * from './thermalDemandAssessment'
export * from './solarResourceAssessment'
export * from './operationalObjective'
export * from './decisionEngine'
export * from './trackingPolicy'
export * from './thresholds'

import { assessSituation, type SensorInputs, type SituationAssessment } from './situationAssessment'
import { assessThermalDemand, type ThermalDemandState } from './thermalDemandAssessment'
import { assessSolarResource, type SolarResourceState } from './solarResourceAssessment'
import { determineObjective, type OperationalObjective } from './operationalObjective'
import { decide, type PbifDecision } from './decisionEngine'
import { policyFor, type TrackingPolicy } from './trackingPolicy'

/** A full PBIF evaluation for one instant — everything the UI needs to explain. */
export interface PbifEvaluation {
  situation: SituationAssessment
  thermalDemand: { state: ThermalDemandState; value: number; display: string }
  solarResource: { state: SolarResourceState; value: number; display: string }
  objective: OperationalObjective
  decision: PbifDecision
  policy: TrackingPolicy
}

/**
 * Run the whole chain once: weather → assessment → decision → policy. Pure and
 * cheap; the engine calls it once per tick and the UI reads the result.
 */
export function evaluatePbif(inputs: SensorInputs): PbifEvaluation {
  const situation = assessSituation(inputs)
  const thermalDemand = assessThermalDemand(inputs.outdoorTemperature)
  const solarResource = assessSolarResource(inputs.solarADC)
  
  const objective = determineObjective(situation, thermalDemand.state)
  const decision = decide(situation, thermalDemand.state, objective, solarResource.state)
  const policy = policyFor(decision)
  
  return { situation, thermalDemand, solarResource, objective, decision, policy }
}
