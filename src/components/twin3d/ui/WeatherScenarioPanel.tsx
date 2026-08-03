'use client'

/**
 * Weather Source controls — Stage 7.7.
 *
 * Presentation layer only. It selects the source and the scenario, then renders
 * the timeline the Weather Scenario Engine already owns. It performs no
 * interpolation, no scheduling and no weather logic: the active period and the
 * progress bar are read straight from `snapshot.weatherSource`, which the engine
 * computes each environmental tick.
 */

import { useEffect, useRef } from 'react'
import { Sparkles } from 'lucide-react'
import { useTwinStore } from '@/lib/engine/store'
import {
  WEATHER_SCENARIOS,
  getWeatherScenario,
  type WeatherKeyframe,
  type WeatherSourceMode,
} from '@/lib/engine/weatherScenario'

const SOURCES: { key: WeatherSourceMode; label: string; hint: string }[] = [
  { key: 'manual', label: 'Manual', hint: 'Weather is set by hand with the sliders.' },
  { key: 'scenario', label: 'Scenario', hint: 'A predefined timeline evolves the weather with simulated time.' },
  { key: 'forecast', label: 'Forecast', hint: 'Real hourly forecast data, cached and played back on the simulation clock.' },
]

/** Radio group at the top of the Weather tab. */
export function WeatherSourceSelector() {
  const source = useTwinStore((s) => s.weatherSource)
  const setWeatherSource = useTwinStore((s) => s.setWeatherSource)

  return (
    <div>
      <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.15em] text-white/50">Weather Source</p>
      <div className="grid grid-cols-3 gap-1.5">
        {SOURCES.map((o) => {
          const active = source === o.key
          return (
            <button
              key={o.key}
              onClick={() => setWeatherSource(o.key)}
              title={o.hint}
              className={`relative rounded-lg border py-2 text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                active
                  ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400 shadow-[inset_0_0_15px_rgba(0,208,132,0.1)]'
                  : 'border-white/5 bg-white/[0.02] text-white/40 hover:border-white/20 hover:text-white/80'
              }`}
            >
              {o.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Scenario picker + the deterministic timeline of the selected scenario. */
export function WeatherScenarioControls() {
  const scenarioId = useTwinStore((s) => s.weatherScenarioId)
  const setWeatherScenario = useTwinStore((s) => s.setWeatherScenario)
  const status = useTwinStore((s) => s.snapshot.weatherSource)

  const scenario = getWeatherScenario(scenarioId) ?? WEATHER_SCENARIOS[0]

  return (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.15em] text-white/50">Scenario</p>
        <div className="grid grid-cols-2 gap-1.5">
          {WEATHER_SCENARIOS.map((sc) => {
            const active = sc.id === scenario.id
            return (
              <button
                key={sc.id}
                onClick={() => setWeatherScenario(sc.id)}
                title={sc.description}
                className={`flex items-center gap-1.5 rounded-lg border px-2 py-2 text-left text-[10px] font-semibold tracking-wide transition-colors ${
                  active
                    ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400 shadow-[inset_0_0_15px_rgba(0,208,132,0.1)]'
                    : 'border-white/5 bg-white/[0.02] text-white/45 hover:border-white/20 hover:text-white/80'
                }`}
              >
                <span className="text-[12px] leading-none">{sc.icon}</span>
                <span className="truncate">{sc.name}</span>
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-[10px] leading-snug text-white/35">{scenario.description}</p>
      </div>

      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-white/50">Timeline</p>
          <span className="font-mono text-[9px] tracking-widest text-white/30">
            {scenario.timeline.length} periods · 24 h loop
          </span>
        </div>
        <WeatherTimeline
          timeline={scenario.timeline}
          activeIndex={status.activeIndex}
          progress={status.segmentProgress}
        />
      </div>
    </div>
  )
}

/**
 * The one timeline view, shared by Scenario Mode and Forecast Mode — the rows
 * are `WeatherKeyframe`s either way, so neither source needs its own component.
 */
export function WeatherTimeline({
  timeline,
  activeIndex,
  progress,
  renderDate,
  order,
  maxHeightClass = 'max-h-[38vh]',
  scrollKey = 0,
}: {
  timeline: readonly WeatherKeyframe[]
  activeIndex: number
  progress: number
  /**
   * Optional date line above each row's time. Forecast Mode supplies one so the
   * day boundary is visible; built-in scenarios have no calendar date and pass
   * nothing.
   */
  renderDate?: (keyframe: WeatherKeyframe) => string | null
  /**
   * Order the rows are READ in, as indices into `timeline`. Forecast Mode passes
   * chronological order — the timeline is stored by hour of day for the
   * interpolator, which is not the order a reader expects. Omitted (scenarios)
   * means storage order.
   */
  order?: readonly number[]
  /**
   * Scroll-viewport cap. Forecast Mode carries far more content above the
   * timeline than Scenario Mode, so it asks for a shorter viewport to keep the
   * whole panel inside its window.
   */
  maxHeightClass?: string
  /**
   * Changing this re-runs the auto-scroll even if the active row did not move —
   * used by "Now", which may land back inside the hour it was already on.
   */
  scrollKey?: number
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLDivElement>(null)
  const rows = order ?? timeline.map((_, i) => i)

  // The timeline scrolls itself with simulated time — the operator never has to
  // chase the active period while the clock runs at 5× or 10×.
  //
  // The offset MUST be measured against the scroll container, not with
  // `offsetTop`: that is relative to the nearest *positioned* ancestor, which is
  // the whole panel, not this list. It therefore included every section stacked
  // above the timeline, overshot the maximum scroll on every hour, and pinned
  // the list to the bottom. Rects are relative to the viewport, so the
  // difference between them is the true distance inside the container whatever
  // the positioning context.
  useEffect(() => {
    const container = scrollRef.current
    const el = activeRef.current
    if (!container || !el) return
    const containerRect = container.getBoundingClientRect()
    const elRect = el.getBoundingClientRect()
    const offsetInContainer = elRect.top - containerRect.top + container.scrollTop
    const centred = offsetInContainer - (container.clientHeight - elRect.height) / 2
    container.scrollTo({ top: Math.max(0, centred), behavior: 'smooth' })
  }, [activeIndex, scrollKey])

  return (
    <div ref={scrollRef} className={`${maxHeightClass} space-y-0.5 overflow-y-auto pr-1 no-scrollbar`}>
      {rows.map((index, position) => {
        const k = timeline[index]
        const active = index === activeIndex
        return (
          <div key={k.timeHours} ref={active ? activeRef : undefined}>
            <div
              className={`rounded-[12px] border px-2.5 py-1.5 transition-colors ${
                active
                  ? 'border-emerald-400/30 bg-emerald-400/[0.07]'
                  : 'border-white/5 bg-white/[0.02]'
              }`}
            >
              <div className="flex items-baseline justify-between leading-none">
                <span className="flex items-baseline gap-1.5">
                  {renderDate?.(k) && (
                    <span className={`text-[9px] font-semibold uppercase tracking-widest ${active ? 'text-emerald-400/70' : 'text-white/30'}`}>
                      {renderDate(k)}
                    </span>
                  )}
                  <span className={`font-mono text-[11px] font-semibold ${active ? 'text-emerald-400' : 'text-white/55'}`}>
                    {formatHour(k.timeHours)}
                  </span>
                </span>
                <span className={`text-[10px] font-medium ${active ? 'text-white/90' : 'text-white/45'}`}>
                  {k.icon && <span className="mr-1">{k.icon}</span>}
                  {k.label}
                </span>
              </div>

              <div className="mt-1 grid grid-cols-5 gap-1 text-center">
                <KeyValue label="Temp" value={`${Math.round(k.temperature)}°`} accent="#f97316" dim={!active} />
                <KeyValue label="Hum" value={`${Math.round(k.humidity)}%`} accent="#38BDF8" dim={!active} />
                <KeyValue label="Cloud" value={`${Math.round(k.cloudCoverage * 100)}%`} accent="#94a3b8" dim={!active} />
                <KeyValue label="Rain" value={`${Math.round(k.rainIntensity * 100)}%`} accent="#60a5fa" dim={!active} />
                <KeyValue label="Wind" value={`${Math.round(k.windSpeed)}`} accent="#22d3ee" dim={!active} />
              </div>

              {active && (
                <div className="mt-1.5 h-[2px] w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-emerald-400"
                    style={{ width: `${Math.round(progress * 100)}%`, boxShadow: '0 0 10px rgba(0,208,132,0.6)' }}
                  />
                </div>
              )}
            </div>

            {position < rows.length - 1 && (
              <div className="flex justify-center">
                <span className={`text-[8px] leading-[10px] ${active ? 'text-emerald-400/60' : 'text-white/15'}`}>↓</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function KeyValue({ label, value, accent, dim }: { label: string; value: string; accent: string; dim: boolean }) {
  return (
    <div>
      <p className="text-[8px] uppercase leading-[10px] tracking-widest text-white/30">{label}</p>
      <p className="font-mono text-[10px] font-semibold leading-[12px] tabular-nums" style={{ color: dim ? 'rgba(255,255,255,0.45)' : accent }}>
        {value}
      </p>
    </div>
  )
}

/** Compact banner shown where the sliders would be, explaining who owns them. */
export function ScenarioOwnershipNotice() {
  return (
    <div className="flex items-start gap-2 rounded-[14px] border border-emerald-400/15 bg-emerald-400/[0.04] px-2.5 py-2">
      <Sparkles className="mt-[1px] h-3 w-3 shrink-0 text-emerald-400/70" />
      <p className="text-[10px] leading-snug text-white/50">
        The Weather Scenario Engine owns the conditions while a scenario is active — it evolves them with simulated
        time, so playback speed, pause and scrubbing all apply. Switch to <span className="text-white/80">Manual</span>{' '}
        to edit the sliders.
      </p>
    </div>
  )
}

function formatHour(hours: number): string {
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}
