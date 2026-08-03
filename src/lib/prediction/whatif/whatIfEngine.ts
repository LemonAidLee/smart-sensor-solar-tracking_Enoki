/**
 * What-If Engine — Stage 8.2.
 *
 * Orchestration only. It owns no physics, no thresholds and no wording: it
 * clones a context, hands both the original and the clone to `projectWalk`,
 * passes the two walks to the comparator, and passes the comparison to the
 * recommendation generator.
 *
 *   Clone PredictionContext
 *     ↓  scenario.apply() — exactly one parameter overridden
 *   Project the clone through the SAME engines as the live twin
 *     ↓  projectWalk()
 *   Compare against the baseline walk
 *     ↓  compareWalks()
 *   Conclude
 *     ↓  recommend()
 *   Discard the sandbox
 *
 * ── Isolation ────────────────────────────────────────────────────────────────
 * `PredictionContext` is pure data and `projectWalk` only reads it, so the
 * sandbox is an object spread that goes out of scope when `run()` returns. There
 * is nothing to reset and no teardown to forget — the live simulation cannot
 * observe that a study happened.
 *
 * ── It never runs itself ─────────────────────────────────────────────────────
 * There is no polling entry point on this class. `run()` is called only from the
 * panel's Run Analysis button, and the result is cached until the operator runs
 * another study or resets. The simulation loop and the 8 Hz snapshot poll carry
 * no What-If cost whatsoever.
 */

import { projectWalk } from '../projection'
import { assessConfidence } from '../confidence'
import { sourceLabel } from '../insights'
import { clockLabel } from '../projection'
import { PREDICTION_HORIZON_HOURS } from '../predictionEngine'
import type { PredictionContext } from '../types'
import { compareWalks } from './compare'
import { recommend } from './recommend'
import { getWhatIfScenario } from './scenarios'
import type { WhatIfResult, WhatIfScenarioId } from './types'

/** The What-If model identity reported alongside the Prediction Engine's. */
export const WHATIF_MODEL = 'Engineering What-If Engine v1'

export class WhatIfEngine {
  private result: WhatIfResult | null = null
  private revision = 0
  /**
   * The context identity the cached result was computed against. Compared —
   * never used to trigger a recompute — so the panel can tell the operator their
   * analysis predates the twin's current state.
   */
  private ranAgainst = ''

  /**
   * Run one study. Called ONLY from the operator's Run Analysis action.
   *
   * @returns the completed result, or null when the scenario id is unknown or
   *          there is no timeline to project (Forecast Mode with an empty cache),
   *          which is the same condition that makes a prediction impossible.
   */
  run(ctx: PredictionContext, scenarioId: WhatIfScenarioId): WhatIfResult | null {
    const scenario = getWhatIfScenario(scenarioId)
    if (!scenario) return null
    // A study with no data behind it would compare two persistence assumptions
    // and label the result with a forecast source. Refuse, exactly as the
    // Prediction Engine refuses to emit horizons in the same condition.
    if (ctx.weatherMode === 'forecast' && ctx.timeline === null) return null

    // ── The sandbox ────────────────────────────────────────────────────────
    const sandboxCtx = scenario.apply(ctx)

    // Both walks run the identical function over identically-shaped data; the
    // ONLY difference between them is the one parameter the scenario changed.
    const baselineWalk = projectWalk(ctx, PREDICTION_HORIZON_HOURS)
    const sandboxWalk = projectWalk(sandboxCtx, PREDICTION_HORIZON_HOURS)

    const comparisons = compareWalks(baselineWalk, sandboxWalk)
    const breakdown = assessConfidence(
      ctx.weatherMode,
      PREDICTION_HORIZON_HOURS,
      ctx.forecastAgeMinutes,
      baselineWalk,
    )

    this.revision++
    this.ranAgainst = contextIdentity(ctx)
    this.result = {
      scenarioId: scenario.id,
      label: scenario.label,
      question: scenario.question,
      category: scenario.category,
      modification: scenario.modification,
      assumption: scenario.assumption,

      generatedAtHours: ctx.clock.timeHours,
      generatedAtLabel: clockLabel(ctx.clock.timeHours),
      timelineId: ctx.timelineId,
      horizonHours: PREDICTION_HORIZON_HOURS,
      sourceLabel: sourceLabel(ctx.weatherMode, ctx.forecastStatus.providerName),
      revision: this.revision,

      comparisons,
      recommendation: recommend(scenario, comparisons, baselineWalk, sandboxWalk),
      confidence: breakdown.grade,
      confidenceReason: breakdown.reason,

      baselineWalk,
      sandboxWalk,
    }
    // `sandboxCtx` goes out of scope here. Nothing to tear down.
    return this.result
  }

  /** The cached result, or null when nothing has been run or it was reset. */
  getResult(): WhatIfResult | null {
    return this.result
  }

  /**
   * True when the twin has moved far enough that the cached analysis no longer
   * describes the current state. Read-only — it never triggers a re-run, because
   * a study must only ever execute on the operator's command.
   */
  isStale(ctx: PredictionContext): boolean {
    return this.result !== null && contextIdentity(ctx) !== this.ranAgainst
  }

  /** Clear the cached study. */
  reset(): void {
    this.result = null
    this.ranAgainst = ''
  }
}

/**
 * How the panel decides a cached study is out of date.
 *
 * Deliberately coarser than the Prediction Engine's invalidation key: an
 * analysis stays valid across a slow drift of the clock (a whole simulated hour)
 * because re-reading it after a few simulated minutes tells the operator
 * nothing new, whereas changing the weather source, the scenario or the site
 * genuinely invalidates the conclusion.
 */
function contextIdentity(ctx: PredictionContext): string {
  return [
    Math.floor(ctx.clock.timeHours),
    ctx.clock.date.getDate(),
    ctx.weatherMode,
    ctx.timelineId,
    Math.round(ctx.parameters.facadeOpenness * 100),
    ctx.pvModules.length,
    Math.round(ctx.batteryLimits.capacityKWh * 100),
  ].join('|')
}
