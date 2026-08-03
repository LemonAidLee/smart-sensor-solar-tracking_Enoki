/**
 * Live Forecast Engine — Stage 7.8.
 *
 * Fetches a real forecast, caches it, and converts it into the SAME
 * `WeatherKeyframe[]` timeline that Scenario Mode already plays back. It then
 * hands that timeline to the Weather Scenario Engine, which remains the only
 * subsystem that produces the current weather.
 *
 * Responsibilities it deliberately does NOT have:
 *   • no solar calculations   • no sensor simulation   • no PBIF
 *   • no irradiance           • no façade logic        • no weather output
 *
 * It never touches `Simulation.weather`. The network is never touched from
 * `tick()` either: fetching is asynchronous and driven by an activation call, a
 * refresh timer, or the operator's Refresh button. The simulation reads only the
 * cached, already-converted timeline.
 */

import type { WeatherKeyframe, WeatherTimelineProvider } from './weatherScenario'
import {
  FORECAST_HORIZON_HOURS,
  type ForecastBundle,
  type ForecastProvider,
  type ForecastSample,
} from './forecastProvider'

const MS_PER_MINUTE = 60_000
const MS_PER_HOUR = 3_600_000
const HOURS_PER_DAY = 24

/** How often the cache is refreshed while Forecast Mode is active. */
export const FORECAST_REFRESH_MINUTES = 60

/** Freshness grades reported by the Forecast Data card. */
const QUALITY_GOOD_AFTER_MINUTES = FORECAST_REFRESH_MINUTES // ≤ 1 h → Excellent
const QUALITY_FAIR_AFTER_MINUTES = 6 * 60
const QUALITY_STALE_AFTER_MINUTES = 24 * 60

// v2 — bundles gained `timezoneAbbreviation`, so v1 entries are not reused.
const CACHE_STORAGE_KEY = 'solis.forecast.cache.v2'
/** A cached bundle is only reused if it is for (essentially) the same site. */
const CACHE_LOCATION_TOLERANCE_DEG = 0.05

export type ForecastConnection = 'online' | 'cached' | 'offline'
export type ForecastState = 'idle' | 'loading' | 'ready' | 'error'
export type ForecastQuality = 'Excellent' | 'Good' | 'Fair' | 'Stale' | 'Unavailable'

/** Everything the Weather panel's Forecast Data card renders. */
export interface ForecastStatus {
  providerName: string
  state: ForecastState
  connection: ForecastConnection
  locationName: string
  latitude: number
  longitude: number
  horizonHours: number
  resolution: string
  /** Epoch ms of the last SUCCESSFUL fetch, or null if none has ever landed. */
  lastUpdated: number | null
  /**
   * Epoch ms of the last refresh ATTEMPT, successful or not. It diverges from
   * `lastUpdated` exactly when the twin is running on a cached forecast, which
   * is the case the operator most needs to see.
   */
  lastAttempt: number | null
  /** First / last forecast hour held in the cache, epoch ms. */
  coverageStart: number | null
  coverageEnd: number | null
  /** Site timezone, for rendering every timestamp in the FORECAST's own clock. */
  utcOffsetSeconds: number
  timezone: string
  timezoneAbbreviation: string
  /** Epoch ms the next automatic refresh is due, or null when not running. */
  nextRefresh: number | null
  /** Minutes since `lastUpdated`; -1 when there is no cached forecast at all. */
  cacheAgeMinutes: number
  /** Hourly samples currently held in the cache. */
  sampleCount: number
  quality: ForecastQuality
  /** Human-readable reason the last attempt failed, or null. */
  error: string | null
  /** Bumped every time the playback timeline is rebuilt. */
  version: number
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

/**
 * The forecast cache. The simulation reads ONLY this — never the network.
 * It is mirrored into localStorage so a reload (or a session that starts
 * offline) still has a forecast to play back rather than nothing.
 */
export class ForecastCache {
  private bundle: ForecastBundle | null = null

  get(): ForecastBundle | null {
    return this.bundle
  }

  store(bundle: ForecastBundle): void {
    this.bundle = bundle
    if (typeof window === 'undefined') return
    try {
      window.localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(bundle))
    } catch {
      // Quota or private mode — the in-memory cache is still perfectly valid.
    }
  }

  /** Restore a persisted bundle, but only if it belongs to this site. */
  restore(latitude: number, longitude: number): ForecastBundle | null {
    if (typeof window === 'undefined') return null
    try {
      const raw = window.localStorage.getItem(CACHE_STORAGE_KEY)
      if (!raw) return null
      const parsed = JSON.parse(raw) as ForecastBundle
      if (!parsed?.samples?.length) return null
      if (
        Math.abs(parsed.latitude - latitude) > CACHE_LOCATION_TOLERANCE_DEG ||
        Math.abs(parsed.longitude - longitude) > CACHE_LOCATION_TOLERANCE_DEG
      ) {
        return null
      }
      this.bundle = parsed
      return parsed
    } catch {
      return null
    }
  }

  clear(): void {
    this.bundle = null
  }

  /** Minutes since the held bundle was fetched; -1 when the cache is empty. */
  ageMinutes(now = Date.now()): number {
    if (!this.bundle) return -1
    return Math.max(0, Math.floor((now - this.bundle.fetchedAt) / MS_PER_MINUTE))
  }
}

// ---------------------------------------------------------------------------
// Sample → keyframe conversion
// ---------------------------------------------------------------------------

/**
 * Condition thresholds used only to LABEL a forecast hour. They classify driver
 * values the provider already gave us — no weather is inferred or invented, and
 * nothing downstream reads these.
 */
const RAIN_LABEL_HEAVY = 0.35
const RAIN_LABEL_LIGHT = 0.05
const CLOUD_LABEL_OVERCAST = 0.75
const CLOUD_LABEL_PARTLY = 0.35

function describeConditions(sample: ForecastSample): { label: string; icon: string } {
  if (sample.rainIntensity >= RAIN_LABEL_HEAVY) return { label: 'Rain', icon: '🌧' }
  if (sample.rainIntensity > RAIN_LABEL_LIGHT) return { label: 'Showers', icon: '🌦' }
  if (sample.cloudCoverage >= CLOUD_LABEL_OVERCAST) return { label: 'Overcast', icon: '☁' }
  if (sample.cloudCoverage >= CLOUD_LABEL_PARTLY) return { label: 'Partly Cloudy', icon: '🌤' }
  return { label: 'Clear', icon: '☀' }
}

/**
 * The exact forecast instant the simulation is replaying right now, epoch ms —
 * or null for a timeline with no forecast provenance (i.e. a built-in scenario).
 *
 * Read-only derivation for the UI: the active keyframe's own forecast hour plus
 * the LINEAR progress through the segment (forecast segments are exactly one
 * hour). It reads the position the Weather Scenario Engine already published and
 * influences nothing — playback is untouched.
 */
export function replayInstantMs(
  timeline: readonly WeatherKeyframe[] | null,
  activeIndex: number,
  segmentProgress: number,
): number | null {
  const from = timeline?.[activeIndex]
  if (!from || from.sourceEpochMs == null) return null
  return from.sourceEpochMs + segmentProgress * MS_PER_HOUR
}

/**
 * Display order for a forecast timeline: keyframe indices sorted by their real
 * forecast timestamp.
 *
 * The timeline is STORED ascending by hour of day, because that is the contract
 * `segmentAt` interpolates against (it scans for `timeHours <= h` and wraps
 * cyclically at midnight). The 24 entries are a contiguous real-time window, but
 * that window rarely starts at 00:00 — so read in storage order the panel jumps
 * backwards a day at the fold (…2 Aug 16:00 → 1 Aug 17:00). Sorting by
 * `sourceEpochMs` rotates the *view* back into true chronological order without
 * touching playback, which keeps reading the array by hour of day exactly as
 * before.
 *
 * Returns null for a timeline with no forecast provenance (a built-in scenario),
 * where storage order is already the intended reading order.
 */
export function chronologicalOrder(timeline: readonly WeatherKeyframe[] | null): number[] | null {
  if (!timeline || timeline.length === 0) return null
  if (timeline.some((k) => k.sourceEpochMs == null)) return null
  return timeline
    .map((_, i) => i)
    .sort((a, b) => timeline[a].sourceEpochMs! - timeline[b].sourceEpochMs!)
}

function toKeyframe(sample: ForecastSample): WeatherKeyframe {
  const { label, icon } = describeConditions(sample)
  return {
    timeHours: sample.hourOfDay,
    label,
    icon,
    // Provenance: the real forecast hour this keyframe replays. Nothing in the
    // playback path reads it — it exists so the operator can check the twin
    // against Open-Meteo's published forecast.
    sourceEpochMs: sample.epochMs,
    temperature: sample.temperature,
    humidity: sample.humidity,
    cloudCoverage: sample.cloudCoverage,
    rainIntensity: sample.rainIntensity,
    windSpeed: sample.windSpeed,
  }
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class LiveForecastEngine implements WeatherTimelineProvider {
  private readonly provider: ForecastProvider
  private readonly cache: ForecastCache

  private latitude: number
  private longitude: number
  private locationName: string

  /** The 24 h playback window, rebuilt from the cache. Null until one exists. */
  private timeline: WeatherKeyframe[] | null = null
  private version = 0

  private state: ForecastState = 'idle'
  private lastError: string | null = null
  /** True once a fetch has failed since the last success — drives the amber state. */
  private lastAttemptFailed = false
  /** Epoch ms of the last refresh attempt, successful or not. */
  private lastAttemptAt: number | null = null
  private inFlight: Promise<void> | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  private nextRefreshAt: number | null = null
  private running = false

  constructor(
    provider: ForecastProvider,
    location: { latitude: number; longitude: number; locationName: string },
    cache: ForecastCache = new ForecastCache(),
  ) {
    this.provider = provider
    this.cache = cache
    this.latitude = location.latitude
    this.longitude = location.longitude
    this.locationName = location.locationName
  }

  // -- Lifecycle -------------------------------------------------------------
  /**
   * Called when Forecast Mode is selected. Restores any persisted cache
   * immediately (so the timeline exists even offline), then refreshes in the
   * background and schedules the hourly refresh. Never awaited by the caller —
   * the simulation must not wait on the network.
   */
  start(): void {
    if (this.running) return
    this.running = true

    if (!this.cache.get()) {
      const restored = this.cache.restore(this.latitude, this.longitude)
      if (restored) this.rebuildTimeline()
    }

    void this.refresh()
    if (typeof window !== 'undefined' && !this.timer) {
      this.timer = setInterval(() => void this.refresh(), FORECAST_REFRESH_MINUTES * MS_PER_MINUTE)
      this.nextRefreshAt = Date.now() + FORECAST_REFRESH_MINUTES * MS_PER_MINUTE
    }
  }

  /** Called when another weather source takes over. The cache is retained. */
  stop(): void {
    this.running = false
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    this.nextRefreshAt = null
  }

  isRunning(): boolean {
    return this.running
  }

  /**
   * Move the forecast to a new site. The cached bundle belongs to the old
   * coordinates, so it is dropped and (if active) re-fetched.
   */
  setLocation(latitude: number, longitude: number, locationName: string): void {
    const moved =
      Math.abs(latitude - this.latitude) > CACHE_LOCATION_TOLERANCE_DEG ||
      Math.abs(longitude - this.longitude) > CACHE_LOCATION_TOLERANCE_DEG
    this.latitude = latitude
    this.longitude = longitude
    this.locationName = locationName
    if (!moved) return
    this.cache.clear()
    this.timeline = null
    this.version++
    if (this.running) void this.refresh()
  }

  /**
   * Fetch a fresh forecast. Failures are absorbed: the cached timeline keeps
   * playing and the status turns amber (or red if nothing was ever cached).
   * Concurrent calls share the in-flight promise, so the Refresh button cannot
   * stack requests.
   */
  refresh(): Promise<void> {
    if (this.inFlight) return this.inFlight
    this.state = 'loading'

    this.inFlight = this.provider
      .fetchForecast({ latitude: this.latitude, longitude: this.longitude, hours: FORECAST_HORIZON_HOURS })
      .then((bundle) => {
        this.cache.store(bundle)
        this.rebuildTimeline()
        this.state = 'ready'
        this.lastError = null
        this.lastAttemptFailed = false
      })
      .catch((err: unknown) => {
        this.lastAttemptFailed = true
        this.lastError = err instanceof Error ? err.message : 'Forecast request failed'
        // The fetch failed, but the cache may still hold a usable bundle (a
        // persisted one, or the previous refresh's). Build the timeline from it
        // if we have not already, so a failure can never leave a populated cache
        // unplayable.
        if (!this.timeline && this.cache.get()) this.rebuildTimeline()
        // Offline is not an error state for the simulation — it keeps running on
        // whatever the cache holds. `state` only reports the network attempt.
        this.state = this.timeline ? 'ready' : 'error'
      })
      .finally(() => {
        this.inFlight = null
        this.lastAttemptAt = Date.now()
        if (this.running && this.timer) {
          this.nextRefreshAt = Date.now() + FORECAST_REFRESH_MINUTES * MS_PER_MINUTE
        }
      })

    return this.inFlight
  }

  // -- WeatherTimelineProvider ----------------------------------------------
  /**
   * The 24 h playback window, or null when nothing has ever been cached. The
   * Weather Scenario Engine holds the previous weather when this is null, so no
   * null weather can ever reach the simulation.
   */
  getTimeline(): readonly WeatherKeyframe[] | null {
    return this.timeline
  }

  /**
   * Convert the cached hourly bundle into one keyframe per hour of day.
   *
   * The simulation clock is an hour-of-day cursor, so the 48 h bundle is folded
   * into the 24 h window that starts at the hour containing "now": walking the
   * bundle chronologically from that point and keeping the FIRST sample seen for
   * each hour of day means every hour is filled by the forecast nearest in time.
   * The result is sorted ascending, which is exactly the timeline contract the
   * Weather Scenario Engine already interpolates for scenarios — so playback,
   * easing, midnight wrap and determinism are shared code, not a second path.
   */
  private rebuildTimeline(): void {
    const bundle = this.cache.get()
    if (!bundle || bundle.samples.length < 2) {
      this.timeline = null
      this.version++
      return
    }

    const now = Date.now()
    // The hour currently in progress (its stamp is up to an hour in the past).
    let start = bundle.samples.findIndex((s) => s.epochMs >= now - MS_PER_HOUR)
    if (start < 0) start = 0

    const byHour = new Map<number, ForecastSample>()
    for (let i = 0; i < bundle.samples.length && byHour.size < HOURS_PER_DAY; i++) {
      const s = bundle.samples[(start + i) % bundle.samples.length]
      if (!byHour.has(s.hourOfDay)) byHour.set(s.hourOfDay, s)
    }

    if (byHour.size < 2) {
      this.timeline = null
      this.version++
      return
    }

    this.timeline = [...byHour.keys()]
      .sort((a, b) => a - b)
      .map((h) => toKeyframe(byHour.get(h)!))
    this.version++
  }

  // -- Status ---------------------------------------------------------------
  /**
   * Live status for the Weather panel. A fresh object each call — it is read
   * once per snapshot (~8 Hz, off the simulation's hot path), and returning a
   * stable reference would hide cache-age changes from React.
   */
  getStatus(): ForecastStatus {
    const bundle = this.cache.get()
    const age = this.cache.ageMinutes()
    return {
      providerName: this.provider.name,
      state: this.state,
      connection: this.connection(age),
      locationName: this.locationName,
      latitude: this.latitude,
      longitude: this.longitude,
      horizonHours: bundle ? Math.min(FORECAST_HORIZON_HOURS, bundle.samples.length) : FORECAST_HORIZON_HOURS,
      resolution: 'Hourly',
      lastUpdated: bundle?.fetchedAt ?? null,
      lastAttempt: this.lastAttemptAt,
      coverageStart: bundle?.samples[0]?.epochMs ?? null,
      coverageEnd: bundle?.samples[bundle.samples.length - 1]?.epochMs ?? null,
      utcOffsetSeconds: bundle?.utcOffsetSeconds ?? 0,
      timezone: bundle?.timezone ?? '—',
      timezoneAbbreviation: bundle?.timezoneAbbreviation ?? 'local',
      nextRefresh: this.running ? this.nextRefreshAt : null,
      cacheAgeMinutes: age,
      sampleCount: bundle?.samples.length ?? 0,
      quality: this.quality(age),
      error: this.lastError,
      version: this.version,
    }
  }

  private connection(ageMinutes: number): ForecastConnection {
    if (!this.timeline) return 'offline'
    if (this.lastAttemptFailed) return 'cached'
    return ageMinutes >= 0 && ageMinutes <= FORECAST_REFRESH_MINUTES ? 'online' : 'cached'
  }

  /** Freshness grade — how recently the cached forecast was retrieved. */
  private quality(ageMinutes: number): ForecastQuality {
    if (!this.timeline || ageMinutes < 0) return 'Unavailable'
    if (ageMinutes <= QUALITY_GOOD_AFTER_MINUTES) return 'Excellent'
    if (ageMinutes <= QUALITY_FAIR_AFTER_MINUTES) return 'Good'
    if (ageMinutes <= QUALITY_STALE_AFTER_MINUTES) return 'Fair'
    return 'Stale'
  }

  // -- Read-only interface (Stage 8 AI will observe through these) -----------
  /** Every cached hourly sample, chronological. */
  getSamples(): readonly ForecastSample[] {
    return this.cache.get()?.samples ?? []
  }
  /** The forecast hour covering `atMs`, or null when the cache is empty. */
  getCurrentSample(atMs = Date.now()): ForecastSample | null {
    const samples = this.getSamples()
    if (samples.length === 0) return null
    let found: ForecastSample | null = null
    for (const s of samples) {
      if (s.epochMs <= atMs) found = s
      else break
    }
    return found ?? samples[0]
  }
  /** The next `count` forecast hours after `atMs`. */
  getUpcomingSamples(count = 6, atMs = Date.now()): ForecastSample[] {
    return this.getSamples()
      .filter((s) => s.epochMs > atMs)
      .slice(0, count)
  }
  /** Minutes since the cached forecast was retrieved; -1 when there is none. */
  getAgeMinutes(): number {
    return this.cache.ageMinutes()
  }
  /**
   * Forecast confidence, 0–1. Open-Meteo's free endpoint publishes no ensemble
   * spread or probability, so this is honestly `null` rather than a fabricated
   * number. A provider that does expose one can surface it here.
   */
  getConfidence(): number | null {
    return null
  }
}
