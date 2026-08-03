'use client'

import { useState } from 'react'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BatteryCharging,
  Building2,
  Cloud,
  Minus,
  Plug,
  Sparkles,
  Sun,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useTwinStore } from '@/lib/engine/store'
import { formatMinutes, formatSiteStamp } from '@/lib/dt/forecastTime'
import type {
  Confidence,
  HorizonForecast,
  Insight,
  Prediction,
  PredictionDomain,
  PredictionReport,
} from '@/lib/prediction'

/**
 * AiPredictionPanel — the AI Prediction Layer's engineering window.
 *
 * ── What it shows, in the spec's order ───────────────────────────────────────
 *   Current Situation → Next 1 / 3 / 6 / 12 Hours → Key Engineering Insights
 *   → Reasoning (Forecast ↓ Solar ↓ Energy ↓ Prediction) → AI Status
 *
 * ── Explainability is the layout, not a footnote ─────────────────────────────
 * Every prediction row expands into its own `Evidence → Data Source` pair. The
 * operator can therefore follow any statement back to the values that produced
 * it without leaving the panel, which is the difference between an advisor and
 * an oracle. Confidence sits beside each horizon with the reason it is graded
 * that way, so a Low grade says what would raise it.
 *
 * ── This panel owns no logic ─────────────────────────────────────────────────
 * Every sentence, number, trend and confidence grade is read from the
 * `PredictionReport` the Prediction Engine published. Nothing is derived here —
 * no projection, no threshold, no wording. It is a renderer, and the AI it
 * renders is an observer: PBIF still makes every façade decision.
 */

/** Domain accents, aligned with the subsystem colours used elsewhere. */
const ACCENT: Record<PredictionDomain, string> = {
  environment: '#38bdf8',
  solar: '#fbbf24',
  pv: '#fb923c',
  building: '#a78bfa',
  battery: '#4ade80',
  grid: '#94a3b8',
}

const DOMAIN_ICON: Record<PredictionDomain, LucideIcon> = {
  environment: Cloud,
  solar: Sun,
  pv: Zap,
  building: Building2,
  battery: BatteryCharging,
  grid: Plug,
}

/** The AI's own accent — distinct from every subsystem it observes. */
const AI_ACCENT = '#e879f9'

const CONFIDENCE_COLOR: Record<Confidence, string> = {
  High: '#34d399',
  Medium: '#fbbf24',
  Low: '#f87171',
}

const SEVERITY_COLOR: Record<Insight['severity'], string> = {
  alert: '#f87171',
  notice: '#fbbf24',
  info: '#94a3b8',
}

export function AiPredictionBody() {
  const report = useTwinStore((s) => s.prediction)

  return (
    <div className="space-y-3">
      <CurrentSituationCard report={report} />

      {report.status === 'Holding' ? (
        <HoldingNotice reason={report.statusReason} />
      ) : (
        report.horizons.map((h) => <HorizonCard key={h.hoursAhead} horizon={h} />)
      )}

      <InsightsCard insights={report.insights} />
      <ReasoningCard report={report} />
      <AiStatusCard report={report} />

      <Assumptions />
    </div>
  )
}

/* ── Current situation ───────────────────────────────────────────────────────
   Where the twin is right now, in the AI's own words, above the live values the
   summary quotes — so the narration can be checked against the numbers at a
   glance. */
function CurrentSituationCard({ report }: { report: PredictionReport }) {
  const c = report.current
  return (
    <div
      className="rounded-2xl border p-3"
      style={{ borderColor: `${AI_ACCENT}33`, background: `${AI_ACCENT}0d` }}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] font-medium uppercase tracking-wider text-white/45">Current Situation</p>
        <span
          className="rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wider"
          style={{
            background: report.status === 'Ready' ? 'rgba(52,211,153,0.18)' : 'rgba(251,191,36,0.18)',
            color: report.status === 'Ready' ? CONFIDENCE_COLOR.High : CONFIDENCE_COLOR.Medium,
          }}
        >
          {report.status}
        </span>
      </div>

      <p className="mt-1 text-[13px] font-semibold leading-tight text-white/85">{c.headline}</p>
      <p className="mt-1.5 text-[10px] leading-relaxed text-white/55">{c.summary}</p>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <Metric label="Irradiance" value={`${Math.round(c.ghi)}`} unit="W/m²" accent={ACCENT.solar} />
        <Metric label="PV Output" value={c.pvAcKW.toFixed(1)} unit="kW" accent={ACCENT.pv} />
        <Metric label="Building Load" value={c.buildingLoadKW.toFixed(1)} unit="kW" accent={ACCENT.building} />
        <Metric
          label="Grid Import"
          value={c.gridImportKW.toFixed(1)}
          unit="kW"
          accent={c.gridImportKW > 0 ? '#f87171' : undefined}
        />
      </div>
    </div>
  )
}

/* ── Holding ─────────────────────────────────────────────────────────────────
   Forecast Mode with nothing cached. The engine deliberately projects nothing
   rather than extrapolating, and the panel says exactly that — an absent
   prediction is more honest than an invented one. */
function HoldingNotice({ reason }: { reason: string }) {
  return (
    <div className="rounded-2xl border border-amber-400/25 bg-amber-400/[0.06] p-3">
      <div className="flex items-center gap-1.5">
        <Activity className="h-3 w-3 shrink-0 text-amber-300" />
        <p className="text-[10px] font-medium uppercase tracking-wider text-amber-200/70">
          Prediction Held
        </p>
      </div>
      <p className="mt-1 text-[10px] leading-relaxed text-white/55">{reason}</p>
    </div>
  )
}

/* ── One horizon ─────────────────────────────────────────────────────────────
   Headline summary and confidence always visible; the eleven predicted
   quantities behind them one click away (progressive disclosure — the panel
   stays scannable while remaining complete). */
function HorizonCard({ horizon }: { horizon: HorizonForecast }) {
  const [open, setOpen] = useState(horizon.hoursAhead === 1)
  const p = horizon.projection

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-2.5">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start justify-between gap-2 text-left"
      >
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">
              {horizon.label}
            </p>
            <span className="font-mono text-[9px] tabular-nums text-white/30">{p.clockLabel}</span>
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-white/60">{horizon.summary}</p>
        </div>
        <ConfidenceChip confidence={horizon.confidence} />
      </button>

      {/* Confidence is only useful with the reason it is graded that way. */}
      <p className="mt-1.5 text-[8.5px] leading-snug text-white/30">
        {horizon.confidenceBreakdown.reason}
      </p>

      <button
        onClick={() => setOpen((o) => !o)}
        className="mt-1.5 flex w-full items-center justify-between rounded-lg px-1 py-1 text-left transition-colors hover:bg-white/[0.03]"
      >
        <span className="text-[9px] uppercase tracking-wider text-white/35">
          {open ? 'Hide predictions' : `${horizon.predictions.length} predictions`}
        </span>
        <span className="font-mono text-[9px] text-white/25">{open ? '—' : '+'}</span>
      </button>

      {open && (
        <div className="mt-1 space-y-1">
          {horizon.predictions.map((pred) => (
            <PredictionRow key={pred.id} prediction={pred} />
          ))}
        </div>
      )}
    </div>
  )
}

/* ── One prediction, with its explainability chain ───────────────────────────
   Prediction → Evidence → Data Source. The chain is the requirement, so it is
   the structure of the row rather than a tooltip. */
function PredictionRow({ prediction }: { prediction: Prediction }) {
  const [open, setOpen] = useState(false)
  const accent = ACCENT[prediction.domain]
  const Icon = DOMAIN_ICON[prediction.domain]
  const delta = prediction.value - prediction.currentValue

  return (
    <div className="rounded-xl bg-white/[0.03] px-2.5 py-1.5">
      <button onClick={() => setOpen((o) => !o)} className="w-full text-left">
        <div className="flex items-center gap-1.5">
          <Icon className="h-2.5 w-2.5 shrink-0" style={{ color: accent }} />
          <span className="text-[9px] font-medium uppercase tracking-wider text-white/45">
            {prediction.metric}
          </span>
          <span className="ml-auto flex items-center gap-1">
            <TrendGlyph trend={prediction.trend} />
            <span className="font-mono text-[11px] font-semibold tabular-nums" style={{ color: accent }}>
              {formatValue(prediction.value)}
              <span className="ml-0.5 text-[8px] font-normal text-white/45">{prediction.unit}</span>
            </span>
          </span>
        </div>
        <p className="mt-0.5 text-[10px] leading-snug text-white/65">{prediction.statement}</p>
        <p className="mt-0.5 font-mono text-[8.5px] tabular-nums text-white/30">
          now {formatValue(prediction.currentValue)} {prediction.unit} · {delta >= 0 ? '+' : ''}
          {formatValue(delta)} {prediction.unit}
        </p>
      </button>

      {open && (
        <div className="mt-1.5 space-y-1 border-t border-white/[0.06] pt-1.5">
          <Trace label="Evidence" text={prediction.evidence} />
          <Trace label="Data Source" text={prediction.source} mono />
          <Trace label="Confidence" text={prediction.confidence} mono />
        </div>
      )}
    </div>
  )
}

function Trace({ label, text, mono }: { label: string; text: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-white/25">{label}</p>
      <p className={`text-[9px] leading-snug text-white/50 ${mono ? 'font-mono' : ''}`}>{text}</p>
    </div>
  )
}

/* ── Key engineering insights ─────────────────────────────────────────────── */
function InsightsCard({ insights }: { insights: Insight[] }) {
  if (insights.length === 0) return null
  return (
    <Section title="Key Engineering Insights" icon={Sparkles} accent={AI_ACCENT}>
      <div className="space-y-1.5">
        {insights.map((i) => (
          <InsightRow key={i.id} insight={i} />
        ))}
      </div>
    </Section>
  )
}

function InsightRow({ insight }: { insight: Insight }) {
  const [open, setOpen] = useState(false)
  const color = SEVERITY_COLOR[insight.severity]

  return (
    <div className="rounded-xl bg-white/[0.03] px-2.5 py-1.5">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-1.5 text-left">
        <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
        <span className="min-w-0 flex-1 text-[10px] leading-snug text-white/65">{insight.text}</span>
      </button>
      {open && (
        <div className="mt-1.5 space-y-1 border-t border-white/[0.06] pt-1.5 pl-3">
          <Trace label="Evidence" text={insight.evidence} />
          <Trace label="Data Source" text={insight.source} mono />
        </div>
      )}
    </div>
  )
}

/* ── Reasoning chain ─────────────────────────────────────────────────────────
   Forecast ↓ Solar ↓ Energy ↓ Prediction, each stage quoting what it
   contributed. Read top to bottom this is the derivation of the whole report. */
function ReasoningCard({ report }: { report: PredictionReport }) {
  return (
    <Section title="Reasoning" icon={Activity} accent="#22d3ee">
      <div className="space-y-0">
        {report.reasoning.map((stage, i) => (
          <div key={stage.id}>
            <div className="flex items-start gap-2">
              <span
                className="mt-[3px] grid h-4 w-4 shrink-0 place-items-center rounded-full font-mono text-[8px] font-bold"
                style={{ background: 'rgba(34,211,238,0.15)', color: '#22d3ee' }}
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/55">
                  {stage.label}
                </p>
                <p className="mt-0.5 text-[9px] leading-snug text-white/45">{stage.detail}</p>
              </div>
            </div>
            {i < report.reasoning.length - 1 && (
              <div className="ml-2 h-2.5 w-px bg-gradient-to-b from-cyan-400/40 to-transparent" />
            )}
          </div>
        ))}
      </div>
    </Section>
  )
}

/* ── AI status ───────────────────────────────────────────────────────────── */
function AiStatusCard({ report }: { report: PredictionReport }) {
  const stamp =
    report.forecastTimestampMs != null
      ? formatSiteStamp(report.forecastTimestampMs, report.utcOffsetSeconds, report.timezoneAbbreviation)
      : '— (no forecast provenance in this mode)'

  const rows: [string, string][] = [
    ['AI Model', report.model],
    ['Status', report.status],
    ['Forecast Source', report.sourceLabel],
    ['Prediction Horizon', `${report.horizonHours} Hours`],
    ['Forecast Timestamp', stamp],
    ['Forecast Age', report.forecastAgeMinutes >= 0 ? formatMinutes(report.forecastAgeMinutes) : '—'],
    ['Revision', `#${report.revision}`],
  ]

  return (
    <Section title="AI Status" icon={Sparkles} accent={AI_ACCENT}>
      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <span className="text-[9px] text-white/35">{k}</span>
            <span className="text-right font-mono text-[9px] leading-snug text-white/60">{v}</span>
          </div>
        ))}
      </div>
    </Section>
  )
}

/* ── Assumptions ─────────────────────────────────────────────────────────────
   Stated, never hidden: a projection that quietly simplifies is a projection
   that cannot be audited. */
function Assumptions() {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 rounded-xl px-1 py-1 text-left transition-colors hover:bg-white/[0.03]"
      >
        <Activity className="h-3 w-3 shrink-0 text-white/25" />
        <p className="text-[10px] font-medium uppercase tracking-wider text-white/30">
          Projection assumptions
        </p>
        <span className="ml-auto text-[9px] text-white/25">{open ? 'Hide' : '3'}</span>
      </button>
      {open && (
        <ul className="mt-1.5 space-y-1.5 px-1">
          {[
            'The façade is described by its fixed elevations, not its blade angles — predicting blade angles would mean predicting PBIF, and PBIF is the controller.',
            'Neighbour occlusion is not ray-cast forward; the projected sky is unobstructed. The case-study site declares no neighbours.',
            'The HVAC thermal lag uses its equilibrium value — a 15 simulated-minute time constant is negligible over a 1–12 hour horizon.',
          ].map((t) => (
            <li key={t} className="flex gap-1.5">
              <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-white/20" />
              <span className="text-[9px] leading-snug text-white/35">{t}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ── Shared shells ───────────────────────────────────────────────────────── */
function Section({
  title,
  icon: Icon,
  accent,
  children,
}: {
  title: string
  icon: LucideIcon
  accent: string
  children: React.ReactNode
}) {
  return (
    <div
      className="rounded-2xl border p-2.5"
      style={{ borderColor: `${accent}26`, background: 'rgba(255,255,255,0.02)' }}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <Icon className="h-3 w-3 shrink-0" style={{ color: accent }} />
        <p className="text-[10px] font-medium uppercase tracking-wider text-white/50">{title}</p>
      </div>
      {children}
    </div>
  )
}

function ConfidenceChip({ confidence }: { confidence: Confidence }) {
  const color = CONFIDENCE_COLOR[confidence]
  return (
    <span
      className="shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider"
      style={{ background: `${color}22`, color }}
    >
      {confidence}
    </span>
  )
}

function TrendGlyph({ trend }: { trend: Prediction['trend'] }) {
  if (trend === 'rising') return <ArrowUpRight className="h-2.5 w-2.5 text-emerald-300/70" />
  if (trend === 'falling') return <ArrowDownRight className="h-2.5 w-2.5 text-rose-300/70" />
  return <Minus className="h-2.5 w-2.5 text-white/25" />
}

/** Identical geometry to the other engineering panels' `Metric`. */
function Metric({
  label,
  value,
  unit,
  accent,
}: {
  label: string
  value: string
  unit?: string
  accent?: string
}) {
  return (
    <div className="rounded-xl bg-white/[0.03] px-2.5 py-1.5">
      <p className="text-[9px] font-medium uppercase tracking-wider text-white/45">{label}</p>
      <p className="font-mono text-[13px] font-semibold tabular-nums" style={{ color: accent ?? '#fff' }}>
        {value}
        {unit && <span className="ml-0.5 text-[9px] text-white/50">{unit}</span>}
      </p>
    </div>
  )
}

/** One decimal for powers and temperatures, none for large or integral units. */
function formatValue(v: number): string {
  return Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)
}
