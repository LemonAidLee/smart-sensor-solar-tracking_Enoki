/**
 * Confidence derivation — Stage 8.1.
 *
 * Confidence is a **product of three measurable factors** and nothing else. It
 * contains no randomness, no tuning against a desired answer and no hidden
 * state: the same twin in the same condition always yields the same grade.
 *
 *   score = horizon × freshness × stability
 *
 *   • horizon    — how far ahead the projection reaches. A twelve-hour
 *                  statement is inherently weaker than a one-hour statement.
 *   • freshness  — how recently the driving data was obtained. Only Forecast
 *                  Mode can be stale; a built-in scenario is a definition, not
 *                  an observation, so it never decays.
 *   • stability  — how settled the weather is across the interval being
 *                  projected. Cloud and rain are the volatile drivers, and they
 *                  are the ones that move irradiance, so their swing across the
 *                  window is what erodes confidence.
 *
 * The report always shows which factor was the binding constraint, so a Low
 * grade is actionable ("refresh the forecast") rather than mysterious.
 */

import { clamp } from '../engine/math'
import type { WeatherSourceMode } from '../engine/weatherScenario'
import type { Confidence, ConfidenceBreakdown, TwinProjection } from './types'

// ---------------------------------------------------------------------------
// Thresholds — every constant named, none inline (guide §6, no magic numbers)
// ---------------------------------------------------------------------------

/** Score at or above which a prediction is High / Medium. Below → Low. */
const GRADE_HIGH = 0.72
const GRADE_MEDIUM = 0.45

/**
 * Horizon decay. Anchored on meteorological practice: hour-ahead nowcasts are
 * near-certain, half-day forecasts materially less so.
 */
const HORIZON_SCORE: readonly { hours: number; score: number }[] = [
  { hours: 1, score: 1 },
  { hours: 3, score: 0.88 },
  { hours: 6, score: 0.74 },
  { hours: 12, score: 0.58 },
]

/**
 * Freshness decay for Forecast Mode, keyed to the cache-age grades the Live
 * Forecast Engine already reports (Excellent / Good / Fair / Stale) so the two
 * readouts can never contradict each other.
 */
const FRESHNESS = {
  /** ≤ 1 h old — the engine's own refresh interval. */
  EXCELLENT_MINUTES: 60,
  EXCELLENT_SCORE: 1,
  /** ≤ 6 h old. */
  GOOD_MINUTES: 6 * 60,
  GOOD_SCORE: 0.88,
  /** ≤ 24 h old. */
  FAIR_MINUTES: 24 * 60,
  FAIR_SCORE: 0.66,
  /** Older than a day. */
  STALE_SCORE: 0.4,
  /** No forecast has ever been cached. */
  MISSING_SCORE: 0.25,
} as const

/**
 * A built-in scenario is a deterministic definition of the day, so its future is
 * known exactly — nothing about it can go stale.
 */
const SCENARIO_FRESHNESS_SCORE = 1

/**
 * Manual Mode has no timeline. The projection can only assume the operator's
 * sliders persist, which is a real assumption rather than data — so the ceiling
 * is deliberately low even one hour out.
 */
const MANUAL_FRESHNESS_SCORE = 0.5

/**
 * Weather stability. Cloud swing is measured as the peak-to-trough range of
 * cloud coverage across the window; rain swing likewise. A fully clearing or
 * fully clouding sky (range 1.0) is the most volatile case there is.
 */
const STABILITY = {
  /** Weight of the cloud swing in the penalty. */
  CLOUD_WEIGHT: 0.55,
  /** Weight of the rain swing. Rain moves irradiance hardest, so it dominates. */
  RAIN_WEIGHT: 0.45,
  /** Score when the drivers are perfectly steady across the window. */
  MAX_SCORE: 1,
  /** Score when they swing across their full range. */
  MIN_SCORE: 0.45,
} as const

// ---------------------------------------------------------------------------
// Derivation
// ---------------------------------------------------------------------------

/** Piecewise-linear interpolation of the horizon decay table. */
export function horizonScore(hoursAhead: number): number {
  const table = HORIZON_SCORE
  if (hoursAhead <= table[0].hours) return table[0].score
  for (let i = 1; i < table.length; i++) {
    const a = table[i - 1]
    const b = table[i]
    if (hoursAhead <= b.hours) {
      const t = (hoursAhead - a.hours) / (b.hours - a.hours)
      return a.score + (b.score - a.score) * t
    }
  }
  return table[table.length - 1].score
}

/**
 * Freshness of the data driving the projection.
 *
 * @param ageMinutes Minutes since the forecast was retrieved; -1 when none is
 *                   cached. Ignored outside Forecast Mode.
 */
export function freshnessScore(mode: WeatherSourceMode, ageMinutes: number): number {
  if (mode === 'manual') return MANUAL_FRESHNESS_SCORE
  if (mode === 'scenario') return SCENARIO_FRESHNESS_SCORE
  if (ageMinutes < 0) return FRESHNESS.MISSING_SCORE
  if (ageMinutes <= FRESHNESS.EXCELLENT_MINUTES) return FRESHNESS.EXCELLENT_SCORE
  if (ageMinutes <= FRESHNESS.GOOD_MINUTES) return FRESHNESS.GOOD_SCORE
  if (ageMinutes <= FRESHNESS.FAIR_MINUTES) return FRESHNESS.FAIR_SCORE
  return FRESHNESS.STALE_SCORE
}

/**
 * How settled the weather is across a window of projected hours. Measured from
 * the projection walk itself, so it reflects the data actually used.
 */
export function stabilityScore(window: readonly TwinProjection[]): number {
  if (window.length === 0) return STABILITY.MAX_SCORE

  let cloudMin = Infinity
  let cloudMax = -Infinity
  let rainMin = Infinity
  let rainMax = -Infinity
  for (const p of window) {
    if (p.cloudCoverage < cloudMin) cloudMin = p.cloudCoverage
    if (p.cloudCoverage > cloudMax) cloudMax = p.cloudCoverage
    if (p.rainIntensity < rainMin) rainMin = p.rainIntensity
    if (p.rainIntensity > rainMax) rainMax = p.rainIntensity
  }

  const swing = clamp(
    STABILITY.CLOUD_WEIGHT * (cloudMax - cloudMin) + STABILITY.RAIN_WEIGHT * (rainMax - rainMin),
  )
  return STABILITY.MAX_SCORE - swing * (STABILITY.MAX_SCORE - STABILITY.MIN_SCORE)
}

export function gradeOf(score: number): Confidence {
  if (score >= GRADE_HIGH) return 'High'
  if (score >= GRADE_MEDIUM) return 'Medium'
  return 'Low'
}

/** Name the factor that cost the most confidence, so the grade is actionable. */
function bindingReason(
  mode: WeatherSourceMode,
  hoursAhead: number,
  horizon: number,
  freshness: number,
  stability: number,
  ageMinutes: number,
): string {
  const weakest = Math.min(horizon, freshness, stability)

  if (weakest === freshness) {
    if (mode === 'manual') {
      return 'Manual weather is held constant — the projection assumes current conditions persist.'
    }
    if (mode === 'forecast') {
      if (ageMinutes < 0) return 'No forecast is cached, so the projection has no observed data behind it.'
      const hours = Math.floor(ageMinutes / 60)
      return hours >= 1
        ? `The cached forecast is ${hours} h old — refreshing it would raise confidence.`
        : 'The forecast is current; confidence is limited by the other factors.'
    }
  }
  if (weakest === stability) {
    return 'Cloud and rain swing widely across this window, so the irradiance path is uncertain.'
  }
  return `Confidence falls with distance — this statement reaches ${hoursAhead} h ahead.`
}

/**
 * The full confidence assessment for one horizon.
 *
 * @param window The projected hours between now and this horizon — the interval
 *               whose volatility is being judged.
 */
export function assessConfidence(
  mode: WeatherSourceMode,
  hoursAhead: number,
  ageMinutes: number,
  window: readonly TwinProjection[],
): ConfidenceBreakdown {
  const horizon = horizonScore(hoursAhead)
  const freshness = freshnessScore(mode, ageMinutes)
  const stability = stabilityScore(window)
  const score = horizon * freshness * stability

  return {
    score,
    grade: gradeOf(score),
    horizonScore: horizon,
    freshnessScore: freshness,
    stabilityScore: stability,
    reason: bindingReason(mode, hoursAhead, horizon, freshness, stability, ageMinutes),
  }
}
