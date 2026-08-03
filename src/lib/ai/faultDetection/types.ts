/**
 * AI Fault Detection & Diagnosis (FDD) — Stage 8.5 type contract.
 *
 * ── What this subsystem is ───────────────────────────────────────────────────
 * A deterministic engineering MONITOR that continuously evaluates the Digital
 * Twin's health by re-deriving each subsystem's expected behaviour from the
 * values the engines have already published, and comparing it against what is
 * actually observed. It is not a fault simulator and it controls nothing — it
 * only reads {@link EngineeringContextBuilder}, {@link EngineeringKnowledgeBase},
 * {@link EngineeringReasoningEngine} and the {@link SimSnapshot} (see
 * `faultDetectionEngine.ts`).
 *
 * ── Nothing is fabricated ─────────────────────────────────────────────────────
 * Every {@link SubsystemHealth} carries the evidence that produced it. A
 * subsystem is graded Warning or Critical only when a real, named cross-check
 * (an energy balance, a physical range, a dispatch consistency rule) fails —
 * never on a timer, a random roll or a hidden counter. Because the twin obeys
 * its own physics by construction, the expected steady state is every
 * subsystem reporting Healthy; §6 of the FDD panel exists to show what the
 * engine COULD detect, clearly labelled as not-currently-active.
 */

import type { SubsystemId } from '../../knowledge/types'

/** Traffic-light grade. Never a fourth state — Warning and Critical both carry
 *  a genuine failing check; there is no ambiguous "Unknown" grade because a
 *  rule that cannot evaluate says so honestly in its reason instead. */
export type HealthStatus = 'Healthy' | 'Warning' | 'Critical'

/** One subsystem's assessment for this pass. */
export interface SubsystemHealth {
  subsystem: SubsystemId
  /** Human label, from the Engineering Knowledge Base. */
  label: string
  status: HealthStatus
  /** 0–100 — how closely the observed behaviour matches the expected physics. */
  healthScore: number
  /** Plain-language justification, quoting the evidence below. */
  reason: string
  /** The values the check actually compared. */
  evidence: Record<string, string>
  /** 0–100 — how much this check's evidence supports the judgement. */
  confidence: number
  /** Simulated hour of day this assessment was generated for. */
  timestamp: number
}

/** A subsystem whose check failed — Warning or Critical only. */
export interface Anomaly {
  id: string
  subsystem: SubsystemId
  label: string
  severity: Exclude<HealthStatus, 'Healthy'>
  /** What was observed. */
  observation: string
  /** The values behind the observation. */
  evidence: Record<string, string>
  /** Why the observation follows from the evidence — the engineering cause. */
  reasoning: string
  conclusion: string
  /** 0–100. */
  confidence: number
  /** What the operator should do about it. */
  recommendation: string
}

/** A condition the engine is architected to detect but is not currently
 *  active — Stage 8.5 §6/§5. Static, hand-authored; never generated from a
 *  live check, so it can never be mistaken for a real anomaly. */
export interface DetectableCondition {
  id: string
  subsystem: SubsystemId
  label: string
  description: string
}

/** The complete, cached output of one FDD pass. */
export interface FaultDetectionReport {
  /** Bumped on every recompute; a stable value means nothing changed. */
  revision: number
  /** "Engineering Fault Detection & Diagnosis Engine v1" */
  model: string
  /** Simulated hour of day the report was generated for. */
  generatedAtHours: number

  /** 0–100, the weakest-link aggregate across every monitored subsystem. */
  overallHealthScore: number
  overallStatus: HealthStatus
  /** One or two sentences summarising the whole assessment. */
  diagnosis: string

  subsystems: SubsystemHealth[]
  /** Short bullet evidence lines drawn from the healthiest checks — the
   *  "Engineering Evidence" section of the panel. */
  evidence: string[]
  /** Empty when every subsystem is Healthy — the expected steady state. */
  anomalies: Anomaly[]
  /** Always populated — the capability demonstration, never live faults. */
  detectableConditions: DetectableCondition[]
}
