'use client'

/**
 * Forecast Mode controls — Stage 7.8, traceability pass in Stage 7.8.1.
 *
 * Presentation layer only. It renders the Live Forecast Engine's status and
 * triggers refreshes; it never fetches, parses, caches or interpolates anything
 * itself, and it does not touch the weather. Every timestamp shown is the real
 * provenance of the data — the forecast's own issue time, coverage window and
 * the hour currently being replayed — so the twin can be checked directly
 * against Open-Meteo's published forecast.
 *
 * The timeline it shows is the SAME component Scenario Mode uses; only the rows'
 * provenance (and therefore the date line) differs.
 */

import { useMemo, useState } from 'react'
import { Crosshair, Play, RefreshCw } from 'lucide-react'
import { getSimulation } from '@/lib/engine/simulation'
import { useTwinStore } from '@/lib/engine/store'
import {
  chronologicalOrder,
  replayInstantMs,
  type ForecastConnection,
  type ForecastStatus,
} from '@/lib/engine/liveForecast'
import {
  formatCoverage,
  formatMinutes,
  formatSiteDate,
  formatSiteDay,
  formatSiteClock,
  formatSiteTime,
} from '@/lib/dt/forecastTime'
import { WeatherTimeline } from './WeatherScenarioPanel'

const CONNECTION: Record<ForecastConnection, { label: string; detail: string; color: string }> = {
  online: { label: 'Connected', detail: 'Live forecast', color: '#00D084' },
  cached: { label: 'Cached', detail: 'Using cached forecast', color: '#f59e0b' },
  offline: { label: 'Offline', detail: 'No forecast available', color: '#ef4444' },
}

export function ForecastControls() {
  const status = useTwinStore((s) => s.snapshot.forecast)
  const timelineStatus = useTwinStore((s) => s.snapshot.weatherSource)
  const refreshForecast = useTwinStore((s) => s.refreshForecast)
  const returnToNow = useTwinStore((s) => s.returnToNow)

  // Bumped on every "Now", so the timeline re-centres even when the clock lands
  // back inside the hour it was already showing.
  const [recentreKey, setRecentreKey] = useState(0)

  // The timeline is rebuilt only when a refresh lands, so it is memoised on the
  // engine's version counter rather than re-read on every 8 Hz snapshot poll.
  const timeline = useMemo(
    () => getSimulation().weatherScenario.getTimeline(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status.version],
  )

  // Read order: chronological by real forecast timestamp, not the hour-of-day
  // order the interpolator stores. Rebuilt only with the timeline itself.
  const order = useMemo(() => chronologicalOrder(timeline) ?? undefined, [timeline])

  const conn = CONNECTION[status.connection]
  const tz = status.timezoneAbbreviation
  const offset = status.utcOffsetSeconds

  // Which forecast hour the simulation is replaying right now. Derived from the
  // position the Weather Scenario Engine published — it drives nothing.
  const replayMs = replayInstantMs(timeline, timelineStatus.activeIndex, timelineStatus.segmentProgress)

  return (
    <div className="space-y-3.5">
      {/* Connection strip -------------------------------------------------- */}
      <div className="flex items-center justify-between rounded-[12px] border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
        <span className="inline-flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ background: conn.color, boxShadow: `0 0 10px ${conn.color}` }}
          />
          <span className="text-[11px] font-semibold" style={{ color: conn.color }}>
            {conn.label}
          </span>
          <span className="text-[10px] text-white/35">{conn.detail}</span>
        </span>
        <button
          onClick={refreshForecast}
          disabled={status.state === 'loading'}
          className="inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-widest text-white/60 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          <RefreshCw className={`h-3 w-3 ${status.state === 'loading' ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {status.connection !== 'online' && (
        <p className="-mt-2 text-[10px] leading-snug text-amber-400/70">
          {status.connection === 'offline'
            ? 'Forecast offline — no cached forecast for this site yet. The simulation continues on the last known weather.'
            : `Forecast offline — using cached forecast (${formatMinutes(status.cacheAgeMinutes)} old). The simulation is unaffected.`}
          {status.error ? <span className="block text-white/30">{status.error}</span> : null}
        </p>
      )}

      {/* Playback badge ----------------------------------------------------
          The headline proof that the twin is replaying a real forecast rather
          than generating synthetic weather. */}
      <div className="rounded-[14px] border border-emerald-400/20 bg-emerald-400/[0.06] px-3 py-2">
        <div className="mb-1 flex items-center justify-between leading-none">
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-white/50">Forecast Playback</p>
          <span className="inline-flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest text-emerald-400">
              <Play className="h-2.5 w-2.5 fill-emerald-400" />
              {replayMs != null ? 'Replaying' : 'Standby'}
            </span>
            {/* Scrub anywhere in the forecast, then come straight back to the
                hour happening right now — without switching weather source. */}
            <button
              onClick={() => {
                returnToNow()
                setRecentreKey((k) => k + 1)
              }}
              title="Return to the current forecast hour at the project site"
              className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-white/60 transition-colors hover:bg-emerald-400/15 hover:text-emerald-400"
            >
              <Crosshair className="h-2.5 w-2.5" />
              Now
            </button>
          </span>
        </div>
        {replayMs != null ? (
          <div className="flex items-baseline justify-between">
            <p className="font-mono text-[17px] font-semibold leading-[20px] text-emerald-400 tabular-nums drop-shadow-[0_0_10px_rgba(0,208,132,0.35)]">
              {formatSiteClock(replayMs, offset)}
              <span className="ml-1.5 text-[11px] font-medium text-white/50">{tz}</span>
            </p>
            <p className="text-[11px] font-medium leading-none text-white/70">{formatSiteDate(replayMs, offset)}</p>
          </div>
        ) : (
          <p className="text-[11px] leading-[20px] text-white/40">Waiting for forecast data</p>
        )}
        <p className="mt-0.5 text-[9px] uppercase leading-[11px] tracking-widest text-white/30">
          Current Forecast Timestamp
        </p>
      </div>

      {/* Forecast Data card ------------------------------------------------ */}
      <div>
        <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.15em] text-white/50">Forecast Data</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-[14px] border border-white/5 bg-white/[0.02] px-3 py-2.5">
          <Field label="Forecast Provider" value={status.providerName} />
          <Field label="Resolution" value={status.resolution} />
          <Field
            label="Location"
            value={status.locationName}
            secondary={`${status.latitude.toFixed(2)}°, ${status.longitude.toFixed(2)}° · ${status.timezone}`}
            className="col-span-2"
          />
          <Field
            label="Forecast Issued"
            value={formatSiteTime(status.lastUpdated, offset, tz)}
            secondary={status.lastUpdated ? formatSiteDate(status.lastUpdated, offset) : undefined}
          />
          <Field label="Forecast Horizon" value={`${status.horizonHours} Hours`} />
          <Field
            label="Forecast Coverage"
            value={formatCoverage(status.coverageStart, status.coverageEnd, offset, tz)}
            className="col-span-2"
          />
          <Field label="Last Updated" value={formatSiteTime(status.lastUpdated, offset, tz)} />
          <Field
            label="Last Checked"
            value={formatSiteTime(status.lastAttempt, offset, tz)}
            accent={status.connection === 'cached' ? '#f59e0b' : undefined}
          />
          <Field label="Cache Age" value={formatMinutes(status.cacheAgeMinutes)} />
          <Field label="Next Refresh" value={formatSiteTime(status.nextRefresh, offset, tz)} />
          <Field
            label="Data Quality"
            value={status.quality}
            secondary={`Freshness grade · ${status.sampleCount} hourly samples cached`}
            accent={qualityColor(status)}
            className="col-span-2"
          />
        </div>
      </div>

      {/* Hourly timeline --------------------------------------------------- */}
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-white/50">Hourly Forecast</p>
          <span className="font-mono text-[9px] tracking-widest text-white/30">
            {timeline?.length ?? 0} hours · 24 h playback
          </span>
        </div>
        {timeline && timeline.length > 0 ? (
          <>
            <WeatherTimeline
              timeline={timeline}
              activeIndex={timelineStatus.activeIndex}
              progress={timelineStatus.segmentProgress}
              order={order}
              maxHeightClass="max-h-[34vh]"
              scrollKey={recentreKey}
              renderDate={(k) => (k.sourceEpochMs != null ? formatSiteDay(k.sourceEpochMs, offset) : null)}
            />
            <p className="mt-1.5 text-[10px] leading-snug text-white/35">
              Simulation time is mapped to the downloaded Open-Meteo forecast. The simulation may progress faster than
              real time for demonstration purposes.
            </p>
          </>
        ) : (
          <div className="flex h-20 items-center justify-center rounded-[16px] border border-dashed border-white/10 bg-white/[0.01]">
            <p className="text-[10px] uppercase tracking-widest text-white/30">
              {status.state === 'loading' ? 'Fetching forecast…' : 'No forecast cached'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  secondary,
  accent,
  className = '',
}: {
  label: string
  value: string
  secondary?: string
  accent?: string
  className?: string
}) {
  return (
    <div className={className}>
      <p className="text-[9px] uppercase leading-[11px] tracking-widest text-white/40">{label}</p>
      <p className="text-[11px] font-medium leading-[14px]" style={{ color: accent ?? 'rgba(255,255,255,0.9)' }}>
        {value}
      </p>
      {secondary && <p className="font-mono text-[9px] leading-[11px] text-white/35">{secondary}</p>}
    </div>
  )
}

function qualityColor(status: ForecastStatus): string {
  if (status.quality === 'Excellent') return '#00D084'
  if (status.quality === 'Good') return '#22d3ee'
  if (status.quality === 'Fair') return '#f59e0b'
  return '#ef4444'
}
