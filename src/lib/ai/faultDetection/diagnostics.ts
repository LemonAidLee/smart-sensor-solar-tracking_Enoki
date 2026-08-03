/**
 * FDD aggregation — Stage 8.5.
 *
 * Turns the twelve independent {@link SubsystemHealth} assessments into the
 * report's whole-twin story: an overall grade, a one-line diagnosis that names
 * whichever subsystem is actually the limiting factor, a short list of
 * headline evidence, and the anomaly records for anything that failed a
 * check. Nothing here re-derives physics — it only reads what `rules.ts`
 * already computed.
 */

import type { HealthStatus, SubsystemHealth, Anomaly } from './types'
import type { SubsystemId } from '../../knowledge/types'
import type { EngineeringReasoningEngine } from '../../assistant'
import { recommendationFor } from './recommendations'

const HEALTHY_DIAGNOSIS = 'All monitored subsystems are operating within expected engineering limits.'
const PERFECT_SCORE = 100

/** Weakest-link aggregate: the twin is only as healthy as its worst-checked
 *  subsystem, and any single Warning/Critical grade propagates to the whole
 *  report — an average could hide one real finding behind eleven healthy
 *  ones, which is exactly the failure mode a monitoring system exists to avoid. */
export function aggregateOverall(subsystems: readonly SubsystemHealth[]): { score: number; status: HealthStatus } {
  if (subsystems.length === 0) return { score: PERFECT_SCORE, status: 'Healthy' }

  const score = subsystems.reduce((min, s) => Math.min(min, s.healthScore), PERFECT_SCORE)
  const status: HealthStatus = subsystems.some((s) => s.status === 'Critical')
    ? 'Critical'
    : subsystems.some((s) => s.status === 'Warning')
      ? 'Warning'
      : 'Healthy'
  return { score: Math.round(score), status }
}

function weakestOf(subsystems: readonly SubsystemHealth[]): SubsystemHealth | undefined {
  return subsystems.reduce<SubsystemHealth | undefined>(
    (min, s) => (!min || s.healthScore < min.healthScore ? s : min),
    undefined,
  )
}

/** One or two sentences summarising the whole assessment — always names the
 *  weakest subsystem so a Healthy verdict is explainable, not just asserted. */
export function buildDiagnosis(status: HealthStatus, subsystems: readonly SubsystemHealth[]): string {
  const weakest = weakestOf(subsystems)
  if (!weakest) return HEALTHY_DIAGNOSIS

  if (status === 'Healthy') {
    return weakest.healthScore >= PERFECT_SCORE
      ? HEALTHY_DIAGNOSIS
      : `${HEALTHY_DIAGNOSIS} Overall health is bounded by ${weakest.label} at ${weakest.healthScore}/100 — ${weakest.reason}`
  }
  if (status === 'Warning') {
    return `${weakest.label} shows a deviation from expected engineering behaviour: ${weakest.reason}`
  }
  return `${weakest.label} has failed an engineering consistency check: ${weakest.reason}`
}

/** The subsystems the "Engineering Evidence" section draws from, and the
 *  order it presents them — chosen to mirror Stage 8.5 §6's example bullets
 *  (PV, battery, grid, sensors) rather than dumping all twelve reasons. */
const EVIDENCE_SUBSYSTEMS: readonly SubsystemId[] = [
  'RooftopPV',
  'Battery',
  'UtilityGrid',
  'VirtualSensors',
  'PVInverter',
  'AdaptiveFacade',
]

/** The leading clause of a reason string, up to its evidence dash — short
 *  enough for a bullet, still traceable back to the full reason in the
 *  subsystem's own card. */
function leadingClause(text: string): string {
  const dashIndex = text.indexOf(' — ')
  const clause = dashIndex === -1 ? text : text.slice(0, dashIndex)
  return clause.endsWith('.') ? clause : `${clause}.`
}

export function buildEvidence(subsystems: readonly SubsystemHealth[]): string[] {
  const byId = new Map(subsystems.map((s) => [s.subsystem, s] as const))
  return EVIDENCE_SUBSYSTEMS.filter((id) => byId.get(id)?.status === 'Healthy')
    .map((id) => leadingClause(byId.get(id)!.reason))
}

/**
 * Anomaly records for anything that failed a check. Empty on a healthy twin —
 * the expected steady state — never padded to look busier than it is.
 *
 * The `reasoning` field is drawn from the {@link EngineeringReasoningEngine}'s
 * own upstream-cause traversal (the same graph `EngineeringReasoningEngine`
 * uses for the Engineering Assistant's "Cause" intent), so a finding is
 * explained in terms of the dependency graph that actually produced it,
 * rather than a generic restatement of the score.
 */
export function buildAnomalies(subsystems: readonly SubsystemHealth[], reasoning: EngineeringReasoningEngine): Anomaly[] {
  return subsystems
    .filter((s) => s.status !== 'Healthy')
    .map((s) => {
      const severity = s.status as Exclude<HealthStatus, 'Healthy'>
      const explanation = reasoning.generateExplanation('Cause', s.subsystem)
      return {
        id: `${s.subsystem}@${s.timestamp.toFixed(3)}`,
        subsystem: s.subsystem,
        label: s.label,
        severity,
        observation: s.reason,
        evidence: s.evidence,
        reasoning: explanation.engineeringReason,
        conclusion:
          severity === 'Critical'
            ? 'This is a genuine deviation from the physics the subsystem is expected to obey.'
            : 'This is a measurable but non-critical deviation from expected behaviour.',
        confidence: s.confidence,
        recommendation: recommendationFor(s),
      }
    })
}
