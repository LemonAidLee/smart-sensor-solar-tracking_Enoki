/**
 * Weather Scenario Engine — Stage 7.7, extended in Stage 7.8.
 *
 * The ONLY authority that produces the current weather whenever the operator is
 * not driving it by hand. It owns the scenario catalogue and, more generally,
 * the playback of a `WeatherKeyframe[]` timeline across simulated time.
 *
 * It does not care where a timeline came from. Scenario Mode plays a built-in
 * scenario; Forecast Mode plays a timeline the {@link WeatherTimelineProvider}
 * (the Live Forecast Engine) built from real forecast data. Identical
 * interpolation, identical determinism, identical downstream consumers.
 *
 * Responsibilities it deliberately does NOT have:
 *   • no PBIF decisions          • no solar calculations
 *   • no network access          • no provider or cache knowledge
 *   • no changes to SolarPhysicsEngine, VirtualSensorEngine or the skin
 *
 * It emits the five *driver* fields only (temperature, humidity, cloud, rain,
 * wind speed). Every dependent field — visibility, pressure, gust strength,
 * ground wetness, UV — stays owned by `weather.ts`, exactly as in Manual Mode.
 * Only the SOURCE of the drivers changes; nothing downstream is aware of it.
 *
 * Determinism: sampling is a pure function of the hour of day. No RNG, no
 * accumulated state, no frame-rate dependence — so 1×, 5× and 10× playback all
 * traverse the identical curve, pausing freezes it, and scrubbing the timeline
 * jumps straight to the correct weather. Running a scenario twice is identical.
 */

import { clamp, lerp } from './math'
import type { WeatherState } from './types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The environmental drivers a scenario owns. Everything else is derived. */
export type WeatherDrivers = Pick<
  WeatherState,
  'temperature' | 'humidity' | 'cloudCoverage' | 'rainIntensity' | 'windSpeed'
>

/** One point on a timeline; values are exact AT `timeHours`. */
export interface WeatherKeyframe extends WeatherDrivers {
  /** Hour of day, 0–24. Strictly increasing within a timeline. */
  timeHours: number
  /** Short label for the period this keyframe opens. */
  label: string
  /** Optional glyph for the period (forecast hours carry one). */
  icon?: string
  /**
   * For a keyframe derived from real forecast data: the instant of the forecast
   * hour it came from, epoch ms. Provenance only — playback is driven purely by
   * `timeHours`, and built-in scenarios leave this undefined.
   */
  sourceEpochMs?: number
}

/**
 * Anything that can supply a playback timeline built from outside this module —
 * today the Live Forecast Engine. Keeping the contract this small is what lets
 * the forecast provider, its cache and its network code stay entirely out of the
 * Weather Scenario Engine.
 */
export interface WeatherTimelineProvider {
  /** The current timeline, or null when none is available yet. */
  getTimeline(): readonly WeatherKeyframe[] | null
}

export interface WeatherScenario {
  id: string
  name: string
  /** Single glyph used by the selector — presentation only. */
  icon: string
  description: string
  /** Ordered by `timeHours`. Read-only: scenarios are never mutated at runtime. */
  timeline: readonly WeatherKeyframe[]
}

/**
 * Weather source: the operator's sliders, a built-in scenario, or the real
 * hourly forecast supplied by the Live Forecast Engine.
 */
export type WeatherSourceMode = 'manual' | 'scenario' | 'forecast'

/** Timeline position for the UI. Indices address the ACTIVE timeline. */
export interface WeatherTimelineStatus {
  mode: WeatherSourceMode
  scenarioId: string
  /** Index of the keyframe the timeline is currently travelling FROM. */
  activeIndex: number
  /** Index of the keyframe it is travelling TO (wraps past midnight). */
  nextIndex: number
  /** 0–1 progress through the active segment. */
  segmentProgress: number
  /** True when the active source has no timeline to play (offline, no cache). */
  timelineMissing: boolean
}

// ---------------------------------------------------------------------------
// Scenario catalogue
// ---------------------------------------------------------------------------

/**
 * Deterministic day profiles for the Kuala Lumpur case study. Each timeline is a
 * complete day: the last keyframe interpolates back around midnight into the
 * first, so the weather is continuous at every hour with no discontinuity.
 *
 * Driver ranges deliberately stay inside the Manual Mode slider envelopes
 * (temperature 16–44 °C, humidity 20–100 %, wind 0–60 km/h) so switching source
 * never lands the simulation outside a state the operator could have dialled in.
 */
export const WEATHER_SCENARIOS: readonly WeatherScenario[] = [
  {
    id: 'sunny',
    name: 'Sunny Day',
    icon: '☀',
    description: 'Cool morning, peak noon irradiance, hot afternoon, clear sunset.',
    timeline: [
      { timeHours: 7, label: 'Cool Morning', temperature: 26, humidity: 80, cloudCoverage: 0.1, rainIntensity: 0, windSpeed: 6 },
      { timeHours: 9, label: 'Clear Sky', temperature: 29, humidity: 70, cloudCoverage: 0.08, rainIntensity: 0, windSpeed: 8 },
      { timeHours: 12, label: 'Peak Solar', temperature: 33, humidity: 60, cloudCoverage: 0.05, rainIntensity: 0, windSpeed: 10 },
      { timeHours: 15, label: 'Hot Afternoon', temperature: 35, humidity: 55, cloudCoverage: 0.1, rainIntensity: 0, windSpeed: 12 },
      { timeHours: 18, label: 'Golden Hour', temperature: 31, humidity: 66, cloudCoverage: 0.12, rainIntensity: 0, windSpeed: 9 },
      { timeHours: 20, label: 'Cooling Evening', temperature: 28, humidity: 76, cloudCoverage: 0.15, rainIntensity: 0, windSpeed: 6 },
    ],
  },
  {
    id: 'partly-cloudy',
    name: 'Partly Cloudy',
    icon: '🌤',
    description: 'Cloud builds through the morning then decays — variable irradiance all day.',
    timeline: [
      { timeHours: 7, label: 'Hazy Start', temperature: 26, humidity: 82, cloudCoverage: 0.25, rainIntensity: 0, windSpeed: 7 },
      { timeHours: 10, label: 'Cloud Building', temperature: 28, humidity: 76, cloudCoverage: 0.55, rainIntensity: 0, windSpeed: 10 },
      { timeHours: 12, label: 'Broken Cover', temperature: 30, humidity: 70, cloudCoverage: 0.4, rainIntensity: 0, windSpeed: 12 },
      { timeHours: 14, label: 'Cloud Peak', temperature: 29, humidity: 74, cloudCoverage: 0.78, rainIntensity: 0, windSpeed: 13 },
      { timeHours: 17, label: 'Clearing', temperature: 30, humidity: 70, cloudCoverage: 0.35, rainIntensity: 0, windSpeed: 10 },
      { timeHours: 20, label: 'Clear Evening', temperature: 27, humidity: 80, cloudCoverage: 0.2, rainIntensity: 0, windSpeed: 7 },
    ],
  },
  {
    id: 'tropical-mixed',
    name: 'Tropical Mixed',
    icon: '🌥',
    description: 'The recommended demonstration: sunny morning, cloud buildup, a short thunderstorm with heavy rain, rapid clearing, late sunshine.',
    timeline: [
      { timeHours: 7, label: 'Sunny Morning', temperature: 27, humidity: 80, cloudCoverage: 0.1, rainIntensity: 0, windSpeed: 6 },
      { timeHours: 10, label: 'Cloud Buildup', temperature: 31, humidity: 72, cloudCoverage: 0.45, rainIntensity: 0, windSpeed: 9 },
      { timeHours: 13, label: 'Storm Cell', temperature: 29, humidity: 86, cloudCoverage: 0.85, rainIntensity: 0.25, windSpeed: 26 },
      { timeHours: 14, label: 'Heavy Rain', temperature: 26, humidity: 96, cloudCoverage: 0.95, rainIntensity: 0.85, windSpeed: 34 },
      { timeHours: 15.5, label: 'Rapid Clearing', temperature: 27, humidity: 88, cloudCoverage: 0.45, rainIntensity: 0.12, windSpeed: 16 },
      { timeHours: 17, label: 'Afternoon Sunshine', temperature: 30, humidity: 75, cloudCoverage: 0.15, rainIntensity: 0, windSpeed: 9 },
      { timeHours: 20, label: 'Calm Evening', temperature: 27, humidity: 82, cloudCoverage: 0.2, rainIntensity: 0, windSpeed: 6 },
    ],
  },
  {
    id: 'rainy',
    name: 'Rainy Day',
    icon: '🌧',
    description: 'Overcast and cool with steady rain — sustained low irradiance.',
    timeline: [
      { timeHours: 7, label: 'Overcast Dawn', temperature: 25, humidity: 92, cloudCoverage: 0.9, rainIntensity: 0.2, windSpeed: 8 },
      { timeHours: 10, label: 'Steady Rain', temperature: 25, humidity: 95, cloudCoverage: 0.95, rainIntensity: 0.55, windSpeed: 12 },
      { timeHours: 13, label: 'Persistent Rain', temperature: 24, humidity: 97, cloudCoverage: 0.98, rainIntensity: 0.65, windSpeed: 14 },
      { timeHours: 16, label: 'Easing Rain', temperature: 25, humidity: 94, cloudCoverage: 0.9, rainIntensity: 0.35, windSpeed: 11 },
      { timeHours: 20, label: 'Damp Evening', temperature: 24, humidity: 93, cloudCoverage: 0.85, rainIntensity: 0.15, windSpeed: 8 },
    ],
  },
  {
    id: 'thunderstorm',
    name: 'Thunderstorm',
    icon: '⛈',
    description: 'Rapid cloud growth, strong wind and heavy rain collapse irradiance — then the storm passes.',
    timeline: [
      { timeHours: 7, label: 'Still Morning', temperature: 28, humidity: 78, cloudCoverage: 0.2, rainIntensity: 0, windSpeed: 5 },
      { timeHours: 11, label: 'Rapid Cloud Growth', temperature: 31, humidity: 80, cloudCoverage: 0.6, rainIntensity: 0, windSpeed: 12 },
      { timeHours: 13, label: 'Squall Front', temperature: 28, humidity: 88, cloudCoverage: 0.95, rainIntensity: 0.35, windSpeed: 38 },
      { timeHours: 14, label: 'Storm Peak', temperature: 24, humidity: 98, cloudCoverage: 1, rainIntensity: 1, windSpeed: 52 },
      { timeHours: 15, label: 'Storm Passing', temperature: 25, humidity: 95, cloudCoverage: 0.8, rainIntensity: 0.45, windSpeed: 28 },
      { timeHours: 17, label: 'Clearing Skies', temperature: 27, humidity: 86, cloudCoverage: 0.4, rainIntensity: 0.05, windSpeed: 14 },
      { timeHours: 20, label: 'Settled Evening', temperature: 26, humidity: 84, cloudCoverage: 0.25, rainIntensity: 0, windSpeed: 8 },
    ],
  },
  {
    id: 'heat-wave',
    name: 'Heat Wave',
    icon: '🔥',
    description: 'Very high temperature under a near-clear sky — strong irradiance and heavy cooling demand.',
    timeline: [
      { timeHours: 7, label: 'Warm Dawn', temperature: 30, humidity: 60, cloudCoverage: 0.05, rainIntensity: 0, windSpeed: 4 },
      { timeHours: 10, label: 'Rising Heat', temperature: 35, humidity: 48, cloudCoverage: 0.03, rainIntensity: 0, windSpeed: 6 },
      { timeHours: 13, label: 'Extreme Heat', temperature: 39, humidity: 38, cloudCoverage: 0.02, rainIntensity: 0, windSpeed: 7 },
      { timeHours: 16, label: 'Peak Cooling Load', temperature: 40, humidity: 35, cloudCoverage: 0.05, rainIntensity: 0, windSpeed: 8 },
      { timeHours: 19, label: 'Slow Cooling', temperature: 36, humidity: 45, cloudCoverage: 0.08, rainIntensity: 0, windSpeed: 6 },
      { timeHours: 22, label: 'Warm Night', temperature: 33, humidity: 55, cloudCoverage: 0.1, rainIntensity: 0, windSpeed: 5 },
    ],
  },
  {
    id: 'windy',
    name: 'Windy Day',
    icon: '🌬',
    description: 'Stable sun with high wind and no rain — built to demonstrate wind influence on PBIF.',
    timeline: [
      { timeHours: 7, label: 'Breezy Morning', temperature: 27, humidity: 74, cloudCoverage: 0.15, rainIntensity: 0, windSpeed: 22 },
      { timeHours: 10, label: 'Strengthening', temperature: 29, humidity: 68, cloudCoverage: 0.2, rainIntensity: 0, windSpeed: 34 },
      { timeHours: 13, label: 'Peak Gusts', temperature: 30, humidity: 62, cloudCoverage: 0.15, rainIntensity: 0, windSpeed: 46 },
      { timeHours: 16, label: 'Sustained Wind', temperature: 30, humidity: 64, cloudCoverage: 0.18, rainIntensity: 0, windSpeed: 42 },
      { timeHours: 19, label: 'Easing Breeze', temperature: 28, humidity: 70, cloudCoverage: 0.2, rainIntensity: 0, windSpeed: 28 },
      { timeHours: 21, label: 'Calm Night', temperature: 27, humidity: 76, cloudCoverage: 0.15, rainIntensity: 0, windSpeed: 16 },
    ],
  },
]

/** The scenario pre-selected for demonstrations (see the spec's recommendation). */
export const DEFAULT_WEATHER_SCENARIO_ID = 'tropical-mixed'

export function getWeatherScenario(id: string): WeatherScenario | undefined {
  return WEATHER_SCENARIOS.find((s) => s.id === id)
}

// ---------------------------------------------------------------------------
// Interpolation
// ---------------------------------------------------------------------------

/** Which segment of a timeline `hours` falls in, and how far through it. */
interface Segment {
  from: number
  to: number
  /** Linear 0–1 position within the segment. */
  t: number
}

/**
 * Locate the segment containing `hours`. The timeline is cyclic over 24 h: the
 * final keyframe interpolates around midnight back into the first, so hours
 * before the opening keyframe (e.g. 03:00 on a timeline starting at 07:00) sit
 * on that wrapping tail rather than snapping to an endpoint.
 */
function segmentAt(timeline: readonly WeatherKeyframe[], hours: number): Segment {
  let from = timeline.length - 1
  for (let i = 0; i < timeline.length; i++) {
    if (timeline[i].timeHours <= hours) from = i
    else break
  }
  const to = (from + 1) % timeline.length

  let span = timeline[to].timeHours - timeline[from].timeHours
  if (span <= 0) span += 24 // wraps past midnight
  let elapsed = hours - timeline[from].timeHours
  if (elapsed < 0) elapsed += 24

  return { from, to, t: span > 0 ? clamp(elapsed / span) : 0 }
}

/** Smoothstep easing — the weather never jumps, and never kinks at a keyframe. */
function ease(t: number): number {
  return t * t * (3 - 2 * t)
}

/** Zero-allocation blend — the hot path writes into a reusable buffer. */
function blendInto(out: WeatherDrivers, a: WeatherKeyframe, b: WeatherKeyframe, t: number): WeatherDrivers {
  out.temperature = lerp(a.temperature, b.temperature, t)
  out.humidity = lerp(a.humidity, b.humidity, t)
  out.cloudCoverage = lerp(a.cloudCoverage, b.cloudCoverage, t)
  out.rainIntensity = lerp(a.rainIntensity, b.rainIntensity, t)
  out.windSpeed = lerp(a.windSpeed, b.windSpeed, t)
  return out
}

function emptyDrivers(): WeatherDrivers {
  return { temperature: 0, humidity: 0, cloudCoverage: 0, rainIntensity: 0, windSpeed: 0 }
}

/**
 * Pure deterministic sample of ANY timeline at an hour of day — the one piece of
 * interpolation in the system, shared by scenarios and the live forecast alike.
 * Exported so the Stage 8 AI layer can evaluate a timeline without a running
 * engine. Allocates, so it is for queries — never for the playback path.
 */
export function sampleTimeline(timeline: readonly WeatherKeyframe[], hours: number): WeatherDrivers {
  const h = ((hours % 24) + 24) % 24
  const seg = segmentAt(timeline, h)
  return blendInto(emptyDrivers(), timeline[seg.from], timeline[seg.to], ease(seg.t))
}

/** Convenience wrapper for a built-in scenario. */
export function sampleWeatherScenario(scenario: WeatherScenario, hours: number): WeatherDrivers {
  return sampleTimeline(scenario.timeline, hours)
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class WeatherScenarioEngine {
  private mode: WeatherSourceMode = 'forecast'
  private scenario: WeatherScenario =
    getWeatherScenario(DEFAULT_WEATHER_SCENARIO_ID) ?? WEATHER_SCENARIOS[0]
  /** Supplies the Forecast Mode timeline. Injected by the Simulation. */
  private forecastProvider: WeatherTimelineProvider | null = null
  /** Timeline position; a fresh object per read so React subscriptions fire. */
  private readonly position = { activeIndex: 0, nextIndex: 0, segmentProgress: 0, timelineMissing: false }
  /** Last emitted drivers, retained so the AI layer can read "previous". */
  private readonly current: WeatherDrivers = emptyDrivers()
  private readonly previous: WeatherDrivers = emptyDrivers()

  constructor() {
    this.position.nextIndex = 1 % this.scenario.timeline.length
    blendInto(this.current, this.scenario.timeline[0], this.scenario.timeline[0], 0)
    Object.assign(this.previous, this.current)
  }

  // -- Control ---------------------------------------------------------------
  /**
   * Connect the timeline source used by Forecast Mode. The engine only ever
   * asks it for keyframes — it knows nothing of providers, caches or networks.
   */
  connectForecast(provider: WeatherTimelineProvider): void {
    this.forecastProvider = provider
  }

  setMode(mode: WeatherSourceMode): void {
    // Forecast Mode cannot be entered without a connected timeline source.
    if (mode === 'forecast' && !this.forecastProvider) return
    this.mode = mode
  }

  setScenario(id: string): void {
    const next = getWeatherScenario(id)
    if (!next) return
    this.scenario = next
  }

  /** True while the engine — not the operator — owns the weather drivers. */
  isActive(): boolean {
    return this.mode !== 'manual'
  }

  /**
   * The timeline currently being played back, or null when the active source
   * has none yet (Forecast Mode before the first fetch, with nothing cached).
   */
  getTimeline(): readonly WeatherKeyframe[] | null {
    if (this.mode === 'forecast') return this.forecastProvider?.getTimeline() ?? null
    return this.scenario.timeline
  }

  /**
   * Advance the active timeline to a simulated hour of day and return the
   * drivers to apply, or `null` when nothing should be written — Manual Mode, or
   * Forecast Mode with no timeline available. Returning null holds the weather
   * exactly where it was, so no null weather can ever reach the simulation.
   *
   * Progression follows simulated time only, so playback speed, pausing and
   * timeline scrubbing are all handled without any special-casing here. The
   * returned object is reused between calls — the playback path allocates
   * nothing.
   */
  update(timeHours: number): WeatherDrivers | null {
    if (!this.isActive()) return null

    const timeline = this.getTimeline()
    if (!timeline || timeline.length === 0) {
      this.position.timelineMissing = true
      return null
    }
    this.position.timelineMissing = false

    const h = ((timeHours % 24) + 24) % 24
    const seg = segmentAt(timeline, h)
    this.position.activeIndex = seg.from
    this.position.nextIndex = seg.to
    this.position.segmentProgress = seg.t

    Object.assign(this.previous, this.current)
    return blendInto(this.current, timeline[seg.from], timeline[seg.to], ease(seg.t))
  }

  // -- Read-only interface (Stage 8 AI will observe through these) -----------
  getMode(): WeatherSourceMode {
    return this.mode
  }
  getScenario(): WeatherScenario {
    return this.scenario
  }
  getScenarioId(): string {
    return this.scenario.id
  }
  /**
   * Timeline position for the UI. A fresh object each call (once per snapshot,
   * ~8 Hz) so React's reference equality sees the change and re-renders.
   */
  getStatus(): WeatherTimelineStatus {
    return {
      mode: this.mode,
      scenarioId: this.scenario.id,
      activeIndex: this.position.activeIndex,
      nextIndex: this.position.nextIndex,
      segmentProgress: this.position.segmentProgress,
      timelineMissing: this.position.timelineMissing,
    }
  }
  /** Weather as of the most recent update. */
  getCurrent(): Readonly<WeatherDrivers> {
    return this.current
  }
  /** Weather as of the update before it. */
  getPrevious(): Readonly<WeatherDrivers> {
    return this.previous
  }
  /** The keyframe the active timeline is travelling from / to. */
  getActiveKeyframe(): WeatherKeyframe | null {
    return this.getTimeline()?.[this.position.activeIndex] ?? null
  }
  getNextKeyframe(): WeatherKeyframe | null {
    return this.getTimeline()?.[this.position.nextIndex] ?? null
  }
  /** The next `count` scheduled keyframes, in chronological order. */
  getUpcomingKeyframes(count = 3): WeatherKeyframe[] {
    const t = this.getTimeline()
    if (!t || t.length === 0) return []
    const out: WeatherKeyframe[] = []
    for (let i = 1; i <= Math.min(count, t.length); i++) {
      out.push(t[(this.position.nextIndex + i - 1) % t.length])
    }
    return out
  }
  /**
   * Deterministic look-ahead: what the ACTIVE timeline schedules `hoursAhead`
   * from `fromHours`. (Named `forecast()` before Stage 7.8 — renamed so it is
   * never confused with the Live Forecast Engine's real forecast data.)
   */
  getScheduledWeather(fromHours: number, hoursAhead: number): WeatherDrivers | null {
    const t = this.getTimeline()
    return t ? sampleTimeline(t, fromHours + hoursAhead) : null
  }
}
