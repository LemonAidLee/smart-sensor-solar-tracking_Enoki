/**
 * AI Fault Detection & Diagnosis (Stage 8.5) — public surface.
 *
 * A deterministic, read-only MONITOR of the Digital Twin. It re-derives each
 * subsystem's expected behaviour from values the engines have already
 * published and reports where the observed state agrees or disagrees. It
 * controls nothing and simulates no faults — see `types.ts` for the full
 * architectural contract.
 */

export { FaultDetectionEngine, FDD_MODEL } from './faultDetectionEngine'
export { evaluateSubsystems } from './rules'
export { aggregateOverall, buildAnomalies, buildDiagnosis, buildEvidence } from './diagnostics'
export { recommendationFor, DETECTABLE_CONDITIONS } from './recommendations'

export type {
  Anomaly,
  DetectableCondition,
  FaultDetectionReport,
  HealthStatus,
  SubsystemHealth,
} from './types'
