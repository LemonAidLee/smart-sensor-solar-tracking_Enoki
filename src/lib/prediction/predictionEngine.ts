/**
 * Prediction Engine — Stage 8.1.
 *
 * The AI Prediction Layer's single entry point: an **observer** that reads the
 * Digital Twin, projects it twelve hours forward through the engines' own
 * physics, and explains the result.
 *
 * ── It is not a controller ───────────────────────────────────────────────────
 * PBIF remains the sole authority over the adaptive façade. Nothing in this
 * subsystem writes to solar physics, virtual sensors, PBIF, the servo, the
 * façade, the PV chain, the battery or the grid. It is handed a
 * {@link PredictionContext} — a flat, `Readonly`-typed view of values the
 * engines have already published — and has no other handle on the simulation, so
 * the guarantee holds by construction rather than by discipline. Nothing it
 * produces is fed back in; the report is consumed by the UI alone.
 *
 * ── Recompute policy ─────────────────────────────────────────────────────────
 * `getReport()` is called from the store's snapshot poll (~8 Hz) but a full pass
 * runs only when the twin has actually moved. The invalidation key is built from
 * everything a projection depends on:
 *
 *   • the simulation clock, quantised to {@link TIME_BUCKET_HOURS}
 *   • the weather source, and the scenario loaded in it
 *   • the forecast timeline's version (bumped whenever the cache is rebuilt)
 *   • the current manual drivers (Manual Mode's projection persists them)
 *   • the building's site and massing
 *
 * When the key is unchanged the previously built report object is returned by
 * reference, so React's reference equality sees no change and the panel does not
 * re-render. `tick()` never calls into this file — the simulation loop carries no
 * prediction cost at all.
 */

import type { PredictionContext, PredictionReport, HorizonForecast, TwinProjection } from './types'
import { projectWalk, projectBaseline, clockLabel } from './projection'
import { assessConfidence } from './confidence'
import {
  buildInsights,
  buildPredictions,
  buildReasoning,
  describeCurrent,
  sourceLabel,
  summariseHorizon,
} from './insights'
import { replayInstantMs } from '../engine/liveForecast'

/** The model identity reported in the AI Status block. */
export const PREDICTION_MODEL = 'Engineering Prediction Engine v1'

/** The furthest the engine projects. Also the last horizon card. */
export const PREDICTION_HORIZON_HOURS = 12

/** The horizons the panel presents, hours ahead. */
export const PREDICTION_HORIZONS: readonly number[] = [1, 3, 6, 12]

/**
 * Clock quantisation for cache invalidation, simulated hours.
 *
 * A projection reaching one to twelve hours ahead does not meaningfully change
 * for a few simulated minutes of clock drift, so recomputing at every poll would
 * be pure waste. Half an hour is the coarsest bucket that still keeps the "Next
 * 1 Hour" card visibly live: at 1× playback (a simulated day in ~2 real minutes)
 * that is a recompute roughly every 2.5 s, and at 10× roughly four per second.
 * A scrub or a source change lands in a new bucket immediately, so the operator
 * never waits for an update.
 */
export const TIME_BUCKET_HOURS = 0.5

/** Manual driver quantisation — a slider nudge below this cannot flip a trend. */
const DRIVER_BUCKET = 100

function bucket(v: number, size: number): number {
  return Math.round(v / size)
}

/** Human label for each horizon card. */
function horizonLabel(hours: number): string {
  return hours === 1 ? 'Next 1 Hour' : `Next ${hours} Hours`
}

export class PredictionEngine {
  /** The last built report, returned by reference while the key is unchanged. */
  private report: PredictionReport | null = null
  private key = ''
  private revision = 0

  /**
   * Everything a projection depends on, as one comparable string. Anything that
   * would change the answer must appear here; anything that would not, must not.
   */
  private invalidationKey(ctx: PredictionContext): string {
    const w = ctx.weather
    const b = ctx.building
    return [
      bucket(ctx.clock.timeHours, TIME_BUCKET_HOURS),
      ctx.clock.date.getFullYear(),
      ctx.clock.date.getMonth(),
      ctx.clock.date.getDate(),
      ctx.weatherMode,
      // Carries the scenario id, or `forecast:<version>` — the Live Forecast
      // Engine bumps that version every time the timeline is rebuilt.
      ctx.timelineId,
      // Manual Mode projects the operator's sliders forward unchanged, so they
      // are part of the input. In the other modes the timeline already covers it.
      bucket(w.temperature, 1 / DRIVER_BUCKET),
      bucket(w.cloudCoverage, 1 / DRIVER_BUCKET),
      bucket(w.rainIntensity, 1 / DRIVER_BUCKET),
      bucket(w.windSpeed, 1 / DRIVER_BUCKET),
      bucket(w.humidity, 1 / DRIVER_BUCKET),
      // Site and massing move the sun and rescale the load model.
      b.latitude, b.longitude, b.timezone, b.orientation,
      b.width, b.depth, b.floorCount,
      ctx.pvModules.length,
      // The façade's measured openness seeds the projection's thermal/optical
      // response, and the blades keep moving under PBIF while the clock barely
      // advances — so it has to invalidate independently of the time bucket, or
      // the projected solar gain would freeze at whatever the blades were doing
      // when the bucket last rolled over.
      bucket(ctx.parameters.facadeOpenness, 1 / DRIVER_BUCKET),
    ].join('|')
  }

  /**
   * The current prediction report.
   *
   * Cached: an unchanged twin returns the identical object. Never called from
   * `Simulation.tick()`.
   */
  getReport(ctx: PredictionContext): PredictionReport {
    const key = this.invalidationKey(ctx)
    if (this.report && key === this.key) return this.report

    this.key = key
    this.report = this.build(ctx)
    return this.report
  }

  /** Force the next `getReport()` to recompute — used when a source is swapped. */
  invalidate(): void {
    this.key = ''
  }

  // -- Construction ----------------------------------------------------------
  private build(ctx: PredictionContext): PredictionReport {
    this.revision++

    const mode = ctx.weatherMode
    const status = ctx.forecastStatus
    const source = sourceLabel(mode, status.providerName)
    const ageMinutes = mode === 'forecast' ? ctx.forecastAgeMinutes : -1

    // Forecast Mode with an empty cache has no timeline to project. The Weather
    // Scenario Engine holds the weather in that case, so the honest report is
    // "holding", never an extrapolation dressed up as a forecast.
    const timelineMissing = mode === 'forecast' && ctx.timeline === null

    // With no timeline there is nothing to project FROM. A walk would silently
    // persist the held weather and every horizon would then be labelled with the
    // forecast source it did not come from — so the report carries no horizons
    // and no insights at all, and the panel says why. An absent prediction is
    // honest; an extrapolation wearing a forecast's label is not.
    const walk = timelineMissing ? [] : projectWalk(ctx, PREDICTION_HORIZON_HOURS)
    const baseline = projectBaseline(ctx)

    const horizons: HorizonForecast[] = []
    for (const hours of PREDICTION_HORIZONS) {
      const projection = walk.find((p) => p.hoursAhead === hours)
      if (!projection) continue
      // Confidence is judged over the interval actually traversed to reach this
      // horizon, not just its endpoint — a storm passing at +4 h must weigh on
      // the +6 h statement even if +6 h itself is calm.
      const window = walk.filter((p) => p.hoursAhead <= hours)
      const breakdown = assessConfidence(mode, hours, ageMinutes, window)

      horizons.push({
        hoursAhead: hours,
        label: horizonLabel(hours),
        projection,
        predictions: buildPredictions(ctx, projection, baseline, breakdown.grade, source),
        confidence: breakdown.grade,
        confidenceBreakdown: breakdown,
        summary: summariseHorizon(ctx, projection),
      })
    }

    // Insights speak for the whole window, so they carry the whole window's
    // confidence — the grade of the furthest horizon they can draw on.
    const windowConfidence = horizons[horizons.length - 1]?.confidence ?? 'Low'

    return {
      revision: this.revision,
      model: PREDICTION_MODEL,
      status: timelineMissing ? 'Holding' : 'Ready',
      statusReason: timelineMissing
        ? 'Forecast Mode is selected but no forecast is cached — the weather is held at its last value, so no projection can be made.'
        : `Projecting ${PREDICTION_HORIZON_HOURS} h ahead from ${source}.`,

      generatedAtHours: ctx.clock.timeHours,
      weatherSource: mode,
      sourceLabel: source,
      horizonHours: PREDICTION_HORIZON_HOURS,

      // The forecast instant being replayed right now — the same derivation the
      // Weather panel's Forecast Playback badge uses, read from the position the
      // Weather Scenario Engine already published.
      forecastTimestampMs: replayInstantMs(
        ctx.timeline,
        ctx.timelineActiveIndex,
        ctx.timelineSegmentProgress,
      ),
      utcOffsetSeconds: status.utcOffsetSeconds,
      timezoneAbbreviation: status.timezoneAbbreviation,
      forecastAgeMinutes: ageMinutes,

      current: describeCurrent(ctx, source),
      horizons,
      insights: buildInsights(ctx, walk, baseline, windowConfidence, source),
      reasoning: buildReasoning(ctx, walk, source),
      walk,
    }
  }
}

/** Re-exported so the panel can label a projected hour without its own format. */
export { clockLabel }
export type { TwinProjection }
