/**
 * Forecast Provider abstraction — Stage 7.8.
 *
 * The rest of the architecture depends ONLY on the `ForecastProvider` interface.
 * Swapping Open-Meteo for another service (or a recorded fixture) is a
 * constructor argument to `LiveForecastEngine` and touches nothing else — not
 * the Weather Scenario Engine, and certainly nothing downstream of it.
 *
 * A provider's single job is to return normalised `ForecastSample`s. It performs
 * no solar calculation, no sensor simulation, no PBIF and no façade logic; it
 * does not even know the simulation exists.
 */

import { clamp } from './math'

// ---------------------------------------------------------------------------
// Normalised forecast shape (provider-agnostic)
// ---------------------------------------------------------------------------

/**
 * One hourly forecast sample, already converted into the twin's own units — the
 * SAME five driver quantities a scenario keyframe carries, so the conversion
 * from "forecast" to "timeline" is a re-labelling rather than a second physics.
 */
export interface ForecastSample {
  /** Instant of the sample, epoch ms (UTC). */
  epochMs: number
  /** Hour of day at the forecast location, 0–23. */
  hourOfDay: number
  /** °C */
  temperature: number
  /** % relative humidity */
  humidity: number
  /** 0–1 */
  cloudCoverage: number
  /** 0–1, normalised from mm/h — see {@link RAIN_MM_PER_HOUR_FULL_INTENSITY}. */
  rainIntensity: number
  /** km/h */
  windSpeed: number
}

export interface ForecastBundle {
  providerId: string
  providerName: string
  latitude: number
  longitude: number
  /** The location's UTC offset in seconds, as reported by the provider. */
  utcOffsetSeconds: number
  /** IANA timezone of the site as reported by the provider, e.g. "Asia/Kuala_Lumpur". */
  timezone: string
  /** Local timezone abbreviation for display, e.g. "MYT". */
  timezoneAbbreviation: string
  /** Epoch ms at which this bundle was retrieved. */
  fetchedAt: number
  /** Hours of forecast the bundle actually contains. */
  horizonHours: number
  /** Chronological, one per hour. */
  samples: ForecastSample[]
}

export interface ForecastRequest {
  latitude: number
  longitude: number
  /** Requested horizon in hours. A provider may return fewer. */
  hours: number
}

export interface ForecastProvider {
  readonly id: string
  readonly name: string
  /** Rejects on network/parse failure — the caller decides what to do about it. */
  fetchForecast(request: ForecastRequest, signal?: AbortSignal): Promise<ForecastBundle>
}

// ---------------------------------------------------------------------------
// Unit normalisation
// ---------------------------------------------------------------------------

/**
 * Rainfall that maps to `rainIntensity = 1`. The twin's rain driver is a
 * normalised 0–1 intensity (it always has been — the manual slider is 0–100 %),
 * while meteorological services report mm per hour. 10 mm/h is the threshold for
 * "heavy rain" in the tropics, so it anchors the top of the scale.
 */
export const RAIN_MM_PER_HOUR_FULL_INTENSITY = 10

/** The horizon the twin caches and plays back. */
export const FORECAST_HORIZON_HOURS = 48

// ---------------------------------------------------------------------------
// Open-Meteo
// ---------------------------------------------------------------------------

const OPEN_METEO_ENDPOINT = 'https://api.open-meteo.com/v1/forecast'

/**
 * Exactly the five variables that become the twin's weather drivers — nothing
 * more. Pressure is deliberately NOT requested: `weather.ts` derives it from
 * humidity, cloud and rain, and fetching a value the simulation would ignore
 * would create a second, unused source of truth.
 */
const OPEN_METEO_HOURLY_VARIABLES = [
  'temperature_2m',
  'relative_humidity_2m',
  'cloud_cover',
  'precipitation',
  'wind_speed_10m',
] as const

interface OpenMeteoResponse {
  latitude: number
  longitude: number
  utc_offset_seconds: number
  timezone?: string
  timezone_abbreviation?: string
  hourly?: {
    time?: string[]
    temperature_2m?: (number | null)[]
    relative_humidity_2m?: (number | null)[]
    cloud_cover?: (number | null)[]
    precipitation?: (number | null)[]
    wind_speed_10m?: (number | null)[]
  }
}

/**
 * Local timezone abbreviations for the sites the twin ships with. Open-Meteo
 * reports the IANA zone accurately but abbreviates every one of them as a bare
 * UTC offset ("GMT+8"), which is correct yet reads as generic in a
 * demonstration. This table gives the customary local name for zones we know;
 * anything else falls back to the provider's own abbreviation, so no timezone is
 * ever labelled with a guess.
 */
const LOCAL_TIMEZONE_ABBREVIATION: Record<string, string> = {
  'Asia/Kuala_Lumpur': 'MYT',
  'Asia/Singapore': 'SGT',
  'Asia/Dubai': 'GST',
}

/** Number, or the fallback when the service reports a gap (`null`). */
function num(v: number | null | undefined, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback
}

export class OpenMeteoProvider implements ForecastProvider {
  readonly id = 'open-meteo'
  readonly name = 'Open-Meteo'

  async fetchForecast(request: ForecastRequest, signal?: AbortSignal): Promise<ForecastBundle> {
    // `timezone=auto` makes `hourly.time` local to the site, which is the clock
    // the twin runs on. Whole days are requested (rather than an hour count) so
    // the window is stable regardless of when in the hour the call is made; the
    // engine slices the horizon it needs from `samples`.
    const days = Math.max(1, Math.ceil(request.hours / 24) + 1)
    const url =
      `${OPEN_METEO_ENDPOINT}?latitude=${request.latitude.toFixed(4)}` +
      `&longitude=${request.longitude.toFixed(4)}` +
      `&hourly=${OPEN_METEO_HOURLY_VARIABLES.join(',')}` +
      `&wind_speed_unit=kmh&timezone=auto&forecast_days=${days}`

    const res = await fetch(url, { signal })
    if (!res.ok) throw new Error(`Open-Meteo responded ${res.status}`)

    const json = (await res.json()) as OpenMeteoResponse
    const hourly = json.hourly
    const times = hourly?.time
    if (!times || times.length === 0) throw new Error('Open-Meteo returned no hourly series')

    const offsetMs = (json.utc_offset_seconds ?? 0) * 1000
    const all: ForecastSample[] = times.map((t, i) => {
      // `t` is local wall-clock ("2026-08-01T14:00") with no offset. Reading it
      // as UTC and subtracting the site offset yields the true instant, with no
      // dependence on the *browser's* timezone.
      const epochMs = Date.parse(`${t}:00Z`) - offsetMs
      return {
        epochMs,
        hourOfDay: parseInt(t.slice(11, 13), 10),
        temperature: num(hourly?.temperature_2m?.[i], 0),
        humidity: clamp(num(hourly?.relative_humidity_2m?.[i], 0), 0, 100),
        cloudCoverage: clamp(num(hourly?.cloud_cover?.[i], 0) / 100),
        rainIntensity: clamp(num(hourly?.precipitation?.[i], 0) / RAIN_MM_PER_HOUR_FULL_INTENSITY),
        windSpeed: Math.max(0, num(hourly?.wind_speed_10m?.[i], 0)),
      }
    })

    // Whole days were requested for a stable window, but only the declared
    // horizon is kept — so the coverage the panel reports IS the coverage the
    // cache holds, with no discrepancy for the operator to reconcile. The window
    // opens at the hour currently in progress (its stamp is up to an hour old).
    const hourAgo = Date.now() - 3_600_000
    const first = all.findIndex((s) => s.epochMs >= hourAgo)
    const samples =
      first < 0
        ? all.slice(Math.max(0, all.length - request.hours)) // entirely in the past
        : all.slice(first, first + request.hours)

    return {
      providerId: this.id,
      providerName: this.name,
      latitude: json.latitude ?? request.latitude,
      longitude: json.longitude ?? request.longitude,
      utcOffsetSeconds: json.utc_offset_seconds ?? 0,
      // Reported alongside the series (response metadata, not an extra hourly
      // variable) — it is what lets the UI label times in the SITE's timezone
      // rather than the viewer's browser timezone.
      timezone: json.timezone ?? 'auto',
      timezoneAbbreviation:
        LOCAL_TIMEZONE_ABBREVIATION[json.timezone ?? ''] ?? json.timezone_abbreviation ?? 'local',
      fetchedAt: Date.now(),
      horizonHours: Math.min(request.hours, samples.length),
      samples,
    }
  }
}
