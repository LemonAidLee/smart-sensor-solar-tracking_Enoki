"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import dynamic from "next/dynamic"
import {
  motion,
  AnimatePresence,
  animate,
  useReducedMotion,
} from "framer-motion"
import {
  Thermometer, Droplets, CloudRain, Wind, Sun, Gauge, Zap, Waves,
  Sparkles, Radio, Database, ExternalLink, type LucideIcon,
} from "lucide-react"
import { SectionWrapper } from "@/components/layout/SectionWrapper"
import { GlassCard } from "@/components/ui/GlassCard"
import { cn } from "@/lib/utils"
import {
  weatherData, METRICS, TAB_ORDER, kpisForMonth, baseInsights, monthAdvisory,
  type MetricKey,
} from "@/data/klWeather"

/* Charts are lazy-loaded (Recharts kept out of the initial bundle) --------- */
const WeatherCharts = dynamic(
  () => import("./weather/WeatherCharts").then((m) => m.WeatherCharts),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-500">
          <div className="h-6 w-6 rounded-full border-2 border-emerald/30 border-t-emerald animate-spin" />
          <span className="text-xs uppercase tracking-widest">Rendering chart…</span>
        </div>
      </div>
    ),
  }
)

/* Animated count-up number ------------------------------------------------- */
function CountUp({
  value, decimals = 1, className,
}: { value: number; decimals?: number; className?: string }) {
  const [display, setDisplay] = useState(value)
  const prev = useRef(value)
  const reduced = useReducedMotion()

  useEffect(() => {
    if (reduced) {
      setDisplay(value)
      prev.current = value
      return
    }
    const controls = animate(prev.current, value, {
      duration: 0.9,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(v),
    })
    prev.current = value
    return () => controls.stop()
  }, [value, reduced])

  return <span className={className}>{display.toFixed(decimals)}</span>
}

/* KPI card ------------------------------------------------------------------ */
interface KpiDef {
  label: string
  icon: LucideIcon
  color: string
  unit: string
  decimals: number
  value: number
  delta: number
}

function KpiCard({ kpi, index }: { kpi: KpiDef; index: number }) {
  const Icon = kpi.icon
  const up = kpi.delta > 0
  const flat = kpi.delta === 0
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay: 0.08 * index, ease: [0.22, 1, 0.36, 1] }}
    >
      <GlassCard innerClassName="p-4 md:p-5 flex flex-col gap-3 h-full">
        <div className="flex items-center justify-between">
          <span className="text-[10px] md:text-xs text-gray-400 uppercase tracking-widest">
            {kpi.label}
          </span>
          <span
            className="grid place-items-center h-8 w-8 rounded-xl border border-white/10"
            style={{ backgroundColor: `${kpi.color}1a`, color: kpi.color }}
          >
            <Icon className="h-4 w-4" />
          </span>
        </div>
        <div className="flex items-end gap-1.5">
          <CountUp
            value={kpi.value}
            decimals={kpi.decimals}
            className="text-3xl md:text-4xl font-mono font-bold text-white tracking-tight tabular-nums"
          />
          <span className="text-xs md:text-sm font-mono text-gray-500 mb-1.5">{kpi.unit}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-mono",
              flat ? "text-gray-400 bg-white/5"
                : up ? "text-rose-300 bg-rose-500/10" : "text-emerald bg-emerald/10"
            )}
          >
            {flat ? "±0" : `${up ? "▲" : "▼"} ${Math.abs(kpi.delta).toFixed(kpi.decimals)}`}
          </span>
          <span className="text-[10px] text-gray-500">vs annual avg</span>
        </div>
      </GlassCard>
    </motion.div>
  )
}

/* Insight icon map --------------------------------------------------------- */
const INSIGHT_ICONS: Record<string, LucideIcon> = {
  sun: Sun, "cloud-rain": CloudRain, wind: Wind, gauge: Gauge, zap: Zap,
}

/* Floating ambient particles ----------------------------------------------- */
function Particles() {
  const dots = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        id: i,
        left: `${(i * 61) % 100}%`,
        top: `${(i * 37 + 8) % 100}%`,
        size: 2 + (i % 3),
        duration: 7 + (i % 5) * 1.6,
        delay: (i % 6) * 0.7,
      })),
    []
  )
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {dots.map((d) => (
        <motion.span
          key={d.id}
          className="absolute rounded-full bg-emerald/40"
          style={{ left: d.left, top: d.top, width: d.size, height: d.size }}
          animate={{ y: [0, -26, 0], opacity: [0, 0.8, 0] }}
          transition={{ duration: d.duration, delay: d.delay, repeat: Infinity, ease: "easeInOut" }}
        />
      ))}
    </div>
  )
}

const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

const DATASET_URL = "https://www.kaggle.com/datasets/shahmirvarqha/weather-data-malaysia"

/* Section ------------------------------------------------------------------ */
export function WeatherIntelligenceSection() {
  const [activeMetric, setActiveMetric] = useState<MetricKey>("temperature")
  const [month, setMonth] = useState(7) // default: July — ties to the live date

  const meta = weatherData.meta
  const monthly = weatherData.monthly

  const kpis = useMemo(() => kpisForMonth(month), [month])
  const insights = useMemo(() => baseInsights(), [])
  const advisory = useMemo(() => monthAdvisory(month), [month])

  const kpiCards: KpiDef[] = useMemo(
    () => [
      { label: "Avg Temperature", icon: Thermometer, color: "#fb7185", unit: "°C", decimals: 1, value: kpis.temperature.value, delta: kpis.temperature.delta },
      { label: "Avg Humidity", icon: Droplets, color: "#38BDF8", unit: "%", decimals: 0, value: kpis.humidity.value, delta: kpis.humidity.delta },
      { label: "Avg Rainfall", icon: CloudRain, color: "#60a5fa", unit: "mm/h", decimals: 2, value: kpis.rainfall.value, delta: kpis.rainfall.delta },
      { label: "Avg Wind Speed", icon: Wind, color: "#94a3b8", unit: "m/s", decimals: 1, value: kpis.windSpeed.value, delta: kpis.windSpeed.delta },
    ],
    [kpis]
  )

  const fillPct = ((month - 1) / 11) * 100

  return (
    <SectionWrapper id="weather" className="relative bg-transparent overflow-hidden">
      {/* Animated glowing grid */}
      <div className="absolute inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:44px_44px] [mask-image:radial-gradient(ellipse_60%_55%_at_50%_45%,black_35%,transparent_100%)]" />
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_25%_30%,rgba(0,208,132,0.07),transparent_55%),radial-gradient(circle_at_80%_70%,rgba(56,189,248,0.06),transparent_55%)] animate-aurora" />
      <Particles />

      <div className="relative z-10">
        {/* Live badge */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="flex justify-center lg:justify-start mb-8"
        >
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald/25 bg-emerald/10 px-3.5 py-1.5 text-xs font-mono text-emerald backdrop-blur-xl">
            <Radio className="h-3.5 w-3.5 animate-pulse" />
            Live Kuala Lumpur Dataset
            <span className="text-emerald/50">·</span>
            <span className="text-emerald/70">{meta.records.toLocaleString()} readings</span>
          </span>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 lg:gap-10 items-stretch">
          {/* LEFT — 40% */}
          <div className="lg:col-span-2 flex flex-col">
            <motion.h2
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              className="text-4xl md:text-5xl lg:text-6xl font-sans tracking-tighter text-white leading-[1.05]"
            >
              Weather <span className="text-gradient-primary">Intelligence</span>
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="mt-5 text-gray-400 leading-relaxed max-w-md"
            >
              Real Kuala Lumpur weather data continuously powers our AI façade, allowing it to
              anticipate solar heat, rainfall, humidity, and wind conditions before making
              intelligent shading decisions.
            </motion.p>

            <div className="mt-8 grid grid-cols-2 gap-3 md:gap-4">
              {kpiCards.map((kpi, i) => (
                <KpiCard key={kpi.label} kpi={kpi} index={i} />
              ))}
            </div>

            <div className="mt-4 flex items-center gap-2 text-[11px] text-gray-500 font-mono">
              <Sparkles className="h-3.5 w-3.5 text-emerald/70" />
              Showing <span className="text-gray-300">{MONTHS_FULL[month - 1]}</span> climatology
              · {meta.yearStart}–{meta.yearEnd}
            </div>
          </div>

          {/* RIGHT — 60% */}
          <div className="lg:col-span-3">
            <GlassCard innerClassName="p-5 md:p-6 flex flex-col gap-5 h-full">
              {/* Tabs */}
              <div className="flex flex-wrap items-center gap-1.5">
                {TAB_ORDER.map((key) => {
                  const active = key === activeMetric
                  return (
                    <button
                      key={key}
                      onClick={() => setActiveMetric(key)}
                      className={cn(
                        "relative rounded-full px-3.5 py-1.5 text-xs md:text-sm font-medium transition-colors duration-300",
                        active ? "text-white" : "text-gray-400 hover:text-gray-200"
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="wx-tab-pill"
                          className="absolute inset-0 rounded-full border border-white/10"
                          style={{ backgroundColor: `${METRICS[key].color}22` }}
                          transition={{ type: "spring", stiffness: 380, damping: 32 }}
                        />
                      )}
                      <span className="relative z-10 flex items-center gap-1.5">
                        <span
                          className="h-1.5 w-1.5 rounded-full"
                          style={{ backgroundColor: METRICS[key].color }}
                        />
                        {METRICS[key].tab}
                      </span>
                    </button>
                  )
                })}
              </div>

              {/* Chart header */}
              <div className="flex items-end justify-between">
                <div>
                  <div className="text-xs text-gray-400 uppercase tracking-widest">
                    {METRICS[activeMetric].label}
                  </div>
                  <div className="text-[11px] text-gray-500 font-mono mt-0.5">
                    Monthly mean · Kuala Lumpur
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className="h-2 w-2 rounded-full animate-pulse"
                    style={{ backgroundColor: METRICS[activeMetric].color }}
                  />
                  <span
                    className="text-xs font-mono"
                    style={{ color: METRICS[activeMetric].color }}
                  >
                    {MONTHS_FULL[month - 1]}
                  </span>
                </div>
              </div>

              {/* Chart */}
              <div className="h-[240px] md:h-[280px] w-full">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeMetric}
                    initial={{ opacity: 0, x: 18 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -18 }}
                    transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full w-full"
                  >
                    <WeatherCharts metric={activeMetric} data={monthly} selectedMonth={month} />
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* AI advisory — adapts to selected month */}
              <div className="rounded-2xl border border-emerald/20 bg-gradient-to-r from-emerald/10 via-emerald/5 to-transparent p-4">
                <div className="flex items-start gap-3">
                  <span className="grid place-items-center h-9 w-9 shrink-0 rounded-xl bg-emerald/15 text-emerald border border-emerald/25">
                    <Gauge className="h-4.5 w-4.5" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-widest text-emerald/80 mb-1">
                      AI Façade Response · {advisory.monthName}
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed">
                      With <span className="text-white font-mono">{advisory.solar}</span> W/m² mean
                      irradiance and <span className="text-white font-mono">{advisory.humidity}%</span>{" "}
                      humidity, the AI adopts <span className="text-emerald">{advisory.posture}</span> —
                      tracking tilt <span className="text-white font-mono">~{advisory.tilt}°</span>,
                      shading response <span className="text-white font-mono">{advisory.shade}%</span>.
                    </p>
                  </div>
                </div>
              </div>

              {/* Static engineering insights */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {insights.slice(0, 4).map((ins, i) => {
                  const Icon = INSIGHT_ICONS[ins.icon] ?? Sparkles
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 14 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: "-40px" }}
                      transition={{ duration: 0.5, delay: 0.06 * i }}
                      className="flex items-start gap-2.5 rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5 hover:bg-white/[0.06] hover:border-white/10 transition-colors duration-300"
                    >
                      <Icon className="h-4 w-4 mt-0.5 shrink-0 text-electric" />
                      <span className="text-[12px] leading-snug text-gray-400">{ins.text}</span>
                    </motion.div>
                  )
                })}
              </div>
            </GlassCard>
          </div>
        </div>

        {/* BOTTOM ROW — timeline slider */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="mt-8"
        >
          <GlassCard innerClassName="p-5 md:p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-gray-400">
                <Waves className="h-4 w-4 text-emerald" />
                Annual Timeline
              </div>
              <div className="text-xs font-mono text-gray-500">
                Drag to scrub Jan → Dec · KPIs, chart & insights update live
              </div>
            </div>

            {/* Slider track */}
            <div className="relative py-2">
              <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-white/8" />
              <div
                className="absolute left-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-gradient-to-r from-emerald to-electric"
                style={{ width: `${fillPct}%` }}
              />
              <input
                type="range"
                min={1}
                max={12}
                step={1}
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                aria-label="Select month"
                className="wx-range relative z-10"
              />
            </div>

            {/* Month labels */}
            <div className="mt-3 grid grid-cols-12 gap-0.5">
              {monthly.map((m) => {
                const active = m.month === month
                return (
                  <button
                    key={m.month}
                    onClick={() => setMonth(m.month)}
                    className={cn(
                      "text-center text-[10px] md:text-[11px] font-mono py-1 rounded-md transition-colors duration-300",
                      active ? "text-white font-semibold" : "text-gray-500 hover:text-gray-300"
                    )}
                  >
                    {m.name}
                  </button>
                )
              })}
            </div>
          </GlassCard>
        </motion.div>

        {/* Dataset attribution */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center text-[11px] text-gray-500"
        >
          <Database className="h-3.5 w-3.5 text-gray-500" />
          <span>Data source: Malaysia Weather Data · {meta.yearStart}–{meta.yearEnd} · Kuala Lumpur</span>
          <span className="text-gray-600">·</span>
          <span>
            Credit to{" "}
            <a
              href={DATASET_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-gray-400 hover:text-emerald transition-colors duration-300 underline decoration-white/20 underline-offset-2"
            >
              Shahmir Varqha on Kaggle
              <ExternalLink className="h-3 w-3" />
            </a>
          </span>
        </motion.div>
      </div>
    </SectionWrapper>
  )
}