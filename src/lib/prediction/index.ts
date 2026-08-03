/**
 * AI Prediction Layer (Stage 8.1) — public surface.
 *
 * The layer is an OBSERVER of the Digital Twin. It reads what the engines have
 * published, projects it forward through those same engines' pure functions, and
 * narrates the result. PBIF continues to make every real façade decision; this
 * subsystem writes nothing back into the simulation.
 */

export { PredictionEngine, PREDICTION_MODEL, PREDICTION_HORIZONS, PREDICTION_HORIZON_HOURS, TIME_BUCKET_HOURS } from './predictionEngine'
export { projectWalk, projectBaseline, projectAt, clockLabel, PROJECTION_STEP_HOURS } from './projection'
export { LIVE_PARAMETERS } from './types'
export { assessConfidence, gradeOf, horizonScore, freshnessScore, stabilityScore } from './confidence'
export { sourceLabel, MAX_INSIGHTS } from './insights'
// ── Stage 8.2 — What-If Analysis ───────────────────────────────────────────
export { WhatIfEngine, WHATIF_MODEL } from './whatif/whatIfEngine'
export {
  WHATIF_SCENARIOS,
  getWhatIfScenario,
  DEFAULT_WHATIF_SCENARIO,
  CATEGORY_LABEL,
} from './whatif/scenarios'
export { compareWalks, findMetric, isUnchanged } from './whatif/compare'
export type {
  MetricAggregation,
  MetricComparison,
  MetricDirection,
  MetricJudgement,
  WhatIfCategory,
  WhatIfRecommendation,
  WhatIfResult,
  WhatIfScenario,
  WhatIfScenarioId,
} from './whatif/types'

export type {
  Confidence,
  ConfidenceBreakdown,
  CurrentSituation,
  HorizonForecast,
  Insight,
  InsightSeverity,
  Prediction,
  PredictionContext,
  PredictionDomain,
  PredictionReport,
  PredictionStatus,
  ProjectionParameters,
  ReasoningStage,
  Trend,
  TwinProjection,
} from './types'
