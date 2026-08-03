/**
 * AI What-If Analysis — Stage 8.2 type contract.
 *
 * Stage 8.1 answered *what will happen*. Stage 8.2 answers *what would happen
 * instead if one thing were different* — the twin's first decision-support
 * subsystem.
 *
 * ── It still controls nothing ────────────────────────────────────────────────
 * PBIF remains the sole controller of the adaptive façade. A What-If never
 * touches the live twin: it clones the read-only {@link PredictionContext},
 * overrides exactly one parameter, projects the clone through the same engines,
 * and throws the clone away. The live simulation is not even aware it happened.
 *
 * ── Why the sandbox is trivially safe ────────────────────────────────────────
 * Because Stage 8.2 made `PredictionContext` pure data, a sandbox is an ordinary
 * object spread. There is no engine to reset, no state to restore and no
 * teardown that could be forgotten — isolation is a property of the data
 * structure rather than of the discipline applied to it.
 */

import type { Confidence, PredictionContext, TwinProjection } from '../types'

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

export type WhatIfCategory = 'weather' | 'building' | 'pv' | 'battery' | 'grid' | 'facade'

export type WhatIfScenarioId =
  | 'overcast'
  | 'weather-earlier'
  | 'warmer'
  | 'pv-derate'
  | 'battery-double'
  | 'island'
  | 'facade-open'
  | 'facade-closed'

/**
 * One hypothetical study. `apply` must change exactly ONE thing about the twin —
 * that is what makes the comparison attributable. A scenario that changed two
 * parameters would produce a difference nobody could assign a cause to.
 */
export interface WhatIfScenario {
  id: WhatIfScenarioId
  category: WhatIfCategory
  /** Short label for the selector. */
  label: string
  /** "What if tomorrow becomes heavily overcast?" */
  question: string
  /** The exact modification, in engineering terms — the audit trail. */
  modification: string
  /** Any assumption the modification forced, or null when it needed none. */
  assumption: string | null
  /** Produce the sandbox context. Never mutates the input. */
  apply: (ctx: PredictionContext) => PredictionContext
}

// ---------------------------------------------------------------------------
// Comparison
// ---------------------------------------------------------------------------

/** How a metric is reduced from the 12-hour walk to a single number. */
export type MetricAggregation = 'total' | 'peak' | 'final' | 'daytimeMean'

/** Whether the sandbox value moved up, down, or not at all. */
export type MetricDirection = 'higher' | 'lower' | 'unchanged'

/**
 * Whether the movement is an improvement. `neutral` is used deliberately for
 * quantities that are not goals — building demand and irradiance are inputs to
 * the design, not scores to be won.
 */
export type MetricJudgement = 'better' | 'worse' | 'neutral'

export interface MetricComparison {
  id: string
  label: string
  unit: string
  aggregation: MetricAggregation
  /** How to read the number, e.g. "12 h total". */
  basis: string
  baseline: number
  sandbox: number
  delta: number
  /** Null when the baseline is zero — a percentage of nothing is not a number. */
  deltaPercent: number | null
  direction: MetricDirection
  judgement: MetricJudgement
  /**
   * Set when the twin cannot evaluate this metric at all. The comparison is
   * still listed — with its reason — rather than silently omitted, so a missing
   * capability is visible instead of looking like a zero.
   */
  unavailable: string | null
}

// ---------------------------------------------------------------------------
// Recommendation
// ---------------------------------------------------------------------------

/**
 * The four-part explainability chain required of every conclusion:
 * Observation → Evidence → Reason → Expected Impact.
 */
export interface WhatIfRecommendation {
  /** The conclusion in one sentence. */
  headline: string
  /** What changed. */
  observation: string
  /** The numbers that show it — quoted from the comparison, never invented. */
  evidence: string
  /** Why the twin's physics produced that change. */
  reason: string
  /** What it would mean in practice. */
  impact: string
  /**
   * What this study genuinely cannot tell you — a modelling boundary, not a
   * hedge. Null when the twin fully covers the question.
   */
  limitation: string | null
}

// ---------------------------------------------------------------------------
// Result
// ---------------------------------------------------------------------------

export interface WhatIfResult {
  scenarioId: WhatIfScenarioId
  label: string
  question: string
  category: WhatIfCategory
  modification: string
  assumption: string | null

  /** Simulated hour the analysis was run at. */
  generatedAtHours: number
  /** "15:30" */
  generatedAtLabel: string
  /** Identity of the timeline it ran against, for staleness detection. */
  timelineId: string
  /** Horizon both walks were projected over, hours. */
  horizonHours: number
  /** Label of the data source both walks used. */
  sourceLabel: string
  /** Bumped on every run. */
  revision: number

  comparisons: MetricComparison[]
  recommendation: WhatIfRecommendation
  confidence: Confidence
  confidenceReason: string

  /** The two walks, for charting. */
  baselineWalk: TwinProjection[]
  sandboxWalk: TwinProjection[]
}
