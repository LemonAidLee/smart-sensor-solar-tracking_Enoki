'use client'

import { useState } from 'react'
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  FlaskConical,
  Info,
  Minus,
  Play,
  RotateCcw,
  TriangleAlert,
  type LucideIcon,
} from 'lucide-react'
import { useTwinStore } from '@/lib/engine/store'
import {
  CATEGORY_LABEL,
  WHATIF_SCENARIOS,
  type Confidence,
  type MetricComparison,
  type WhatIfResult,
  type WhatIfScenarioId,
} from '@/lib/prediction'

/**
 * AiWhatIfPanel — the AI What-If Analysis window.
 *
 * ── Layout, in the spec's order ──────────────────────────────────────────────
 *   Current Baseline → Scenario Selector → Run / Reset → Metric Comparison
 *   → AI Recommendation → Engineering Reasoning → Confidence
 *
 * ── Nothing runs until asked ─────────────────────────────────────────────────
 * Selecting a scenario does NOT execute it. The sandbox runs only on Run
 * Analysis, and the result is then cached until the operator runs another study
 * or resets. When the twin drifts away from the state the study was run against,
 * the panel says so rather than silently re-running — an analysis the operator
 * did not ask for is an analysis they cannot trust the timing of.
 *
 * ── This panel owns no logic ─────────────────────────────────────────────────
 * Every number, verdict, sentence and confidence grade is read from the
 * `WhatIfResult` the What-If Engine published. No comparison, threshold or
 * wording is derived here.
 */

const AI_ACCENT = '#e879f9'

const CONFIDENCE_COLOR: Record<Confidence, string> = {
  High: '#34d399',
  Medium: '#fbbf24',
  Low: '#f87171',
}

/** Judgement colours. Neutral stays grey — not every change is a score. */
const JUDGEMENT_COLOR: Record<MetricComparison['judgement'], string> = {
  better: '#34d399',
  worse: '#f87171',
  neutral: '#94a3b8',
}

export function AiWhatIfBody() {
  const result = useTwinStore((s) => s.whatIf)
  const stale = useTwinStore((s) => s.whatIfStale)
  const selected = useTwinStore((s) => s.whatIfScenarioId)
  const select = useTwinStore((s) => s.selectWhatIf)
  const run = useTwinStore((s) => s.runWhatIf)
  const reset = useTwinStore((s) => s.resetWhatIf)

  return (
    <div className="space-y-3">
      <CurrentBaseline />

      <ScenarioSelector selected={selected} onSelect={select} />

      <div className="flex gap-1.5">
        <button
          onClick={run}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[11px] font-semibold transition-colors"
          style={{ background: `${AI_ACCENT}22`, color: AI_ACCENT }}
        >
          <Play className="h-3 w-3" />
          Run Analysis
        </button>
        <button
          onClick={reset}
          disabled={!result}
          className="flex items-center justify-center gap-1.5 rounded-xl bg-white/[0.04] px-3 py-2 text-[11px] font-medium text-white/50 transition-colors hover:bg-white/[0.08] hover:text-white/80 disabled:opacity-30 disabled:hover:bg-white/[0.04]"
        >
          <RotateCcw className="h-3 w-3" />
          Reset
        </button>
      </div>

      {!result ? (
        <EmptyState />
      ) : (
        <>
          {stale && <StaleNotice at={result.generatedAtLabel} />}
          <StudyHeader result={result} />
          <ComparisonTable comparisons={result.comparisons} />
          <RecommendationCard result={result} />
          <ConfidenceCard result={result} />
        </>
      )}
    </div>
  )
}

/* ── Current baseline ────────────────────────────────────────────────────────
   The live operating point every study is measured against. Read from the same
   prediction report the AI Prediction panel shows, so the two can never quote
   different baselines. */
function CurrentBaseline() {
  const current = useTwinStore((s) => s.prediction.current)
  const source = useTwinStore((s) => s.prediction.sourceLabel)

  return (
    <div
      className="rounded-2xl border p-3"
      style={{ borderColor: `${AI_ACCENT}33`, background: `${AI_ACCENT}0d` }}
    >
      <p className="text-[9px] font-medium uppercase tracking-wider text-white/45">Current Baseline</p>
      <p className="mt-1 text-[13px] font-semibold leading-tight text-white/85">{current.headline}</p>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <Metric label="PV Output" value={current.pvAcKW.toFixed(1)} unit="kW" />
        <Metric label="Building Load" value={current.buildingLoadKW.toFixed(1)} unit="kW" />
        <Metric label="Grid Import" value={current.gridImportKW.toFixed(1)} unit="kW" />
        <Metric label="Battery SoC" value={`${Math.round(current.batterySoc * 100)}`} unit="%" />
      </div>
      <p className="mt-1.5 font-mono text-[8.5px] text-white/30">Drivers from {source}</p>
    </div>
  )
}

/* ── Scenario selector ───────────────────────────────────────────────────────
   Selecting never runs. The question is shown in full for the highlighted study
   so the operator knows exactly what they are about to ask. */
function ScenarioSelector({
  selected,
  onSelect,
}: {
  selected: WhatIfScenarioId
  onSelect: (id: WhatIfScenarioId) => void
}) {
  const active = WHATIF_SCENARIOS.find((s) => s.id === selected)

  return (
    <Section title="Scenario" icon={FlaskConical} accent={AI_ACCENT}>
      <div className="flex flex-wrap gap-1">
        {WHATIF_SCENARIOS.map((s) => {
          const on = s.id === selected
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className="rounded-lg px-2 py-1 text-[9px] font-medium transition-colors"
              style={
                on
                  ? { background: `${AI_ACCENT}26`, color: AI_ACCENT }
                  : { background: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.45)' }
              }
            >
              {s.label}
            </button>
          )
        })}
      </div>
      {active && (
        <div className="mt-2 rounded-xl bg-black/20 px-2.5 py-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[8px] font-semibold uppercase tracking-[0.14em] text-white/25">
              {CATEGORY_LABEL[active.category]}
            </span>
          </div>
          <p className="mt-0.5 text-[10px] leading-snug text-white/70">{active.question}</p>
        </div>
      )}
    </Section>
  )
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] px-3 py-4 text-center">
      <FlaskConical className="mx-auto h-4 w-4 text-white/20" />
      <p className="mt-1.5 text-[10px] leading-snug text-white/40">
        No analysis has been run. The sandbox executes only when you press Run Analysis — it never
        runs on its own, and never touches the live twin.
      </p>
    </div>
  )
}

function StaleNotice({ at }: { at: string }) {
  return (
    <div className="flex items-start gap-1.5 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-2.5 py-1.5">
      <TriangleAlert className="mt-[1px] h-3 w-3 shrink-0 text-amber-300" />
      <p className="text-[9px] leading-snug text-amber-100/70">
        The twin has moved on since this study was run at {at}. Run it again for the current state.
      </p>
    </div>
  )
}

/* ── What was actually changed ───────────────────────────────────────────────
   The modification and any assumption it forced are shown before the numbers,
   because a comparison is only meaningful once you know what was varied. */
function StudyHeader({ result }: { result: WhatIfResult }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">
          {result.label}
        </p>
        <span className="font-mono text-[8.5px] text-white/30">
          run {result.generatedAtLabel} · {result.horizonHours} h
        </span>
      </div>
      <p className="mt-1 text-[10px] leading-snug text-white/55">{result.question}</p>

      <div className="mt-1.5 rounded-xl bg-black/20 px-2.5 py-1.5">
        <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-white/25">
          Modification
        </p>
        <p className="mt-0.5 text-[9px] leading-snug text-white/50">{result.modification}</p>
      </div>

      {result.assumption && (
        <div className="mt-1 flex items-start gap-1.5 px-1">
          <Info className="mt-[2px] h-2.5 w-2.5 shrink-0 text-white/25" />
          <p className="text-[8.5px] leading-snug text-white/35">{result.assumption}</p>
        </div>
      )}
    </div>
  )
}

/* ── Baseline vs Sandbox ─────────────────────────────────────────────────────
   Unchanged rows are kept, not filtered: "this made no difference" is often the
   finding, and hiding it would imply an effect the physics did not produce. */
function ComparisonTable({ comparisons }: { comparisons: MetricComparison[] }) {
  return (
    <Section title="Baseline vs Sandbox" icon={Activity} accent="#22d3ee">
      <div className="mb-1 grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-x-2 border-b border-white/[0.06] pb-1">
        <span className="text-[8px] font-semibold uppercase tracking-[0.12em] text-white/25">Metric</span>
        <span className="text-right text-[8px] font-semibold uppercase tracking-[0.12em] text-white/25">Base</span>
        <span className="text-right text-[8px] font-semibold uppercase tracking-[0.12em] text-white/25">Sandbox</span>
        <span className="w-[46px] text-right text-[8px] font-semibold uppercase tracking-[0.12em] text-white/25">Δ</span>
      </div>
      <div className="space-y-0.5">
        {comparisons.map((c) => (
          <ComparisonRow key={c.id} c={c} />
        ))}
      </div>
    </Section>
  )
}

function ComparisonRow({ c }: { c: MetricComparison }) {
  const [open, setOpen] = useState(false)
  const digits = c.unit === '%' ? 0 : 1

  if (c.unavailable) {
    return (
      <div className="rounded-lg px-1 py-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[9px] text-white/35">{c.label}</span>
          <span className="text-[8.5px] font-medium uppercase tracking-wider text-white/25">
            Not modelled
          </span>
        </div>
        <p className="mt-0.5 text-[8px] leading-snug text-white/25">{c.unavailable}</p>
      </div>
    )
  }

  const color = JUDGEMENT_COLOR[c.judgement]

  return (
    <button
      onClick={() => setOpen((o) => !o)}
      className="w-full rounded-lg px-1 py-1 text-left transition-colors hover:bg-white/[0.03]"
    >
      <div className="grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-x-2">
        <span className="truncate text-[9px] text-white/55">{c.label}</span>
        <span className="text-right font-mono text-[9px] tabular-nums text-white/40">
          {c.baseline.toFixed(digits)}
        </span>
        <span className="text-right font-mono text-[9px] font-semibold tabular-nums" style={{ color }}>
          {c.sandbox.toFixed(digits)}
        </span>
        <span className="flex w-[46px] items-center justify-end gap-0.5">
          <TrendGlyph direction={c.direction} color={color} />
          <span className="font-mono text-[8.5px] tabular-nums" style={{ color }}>
            {c.direction === 'unchanged'
              ? '—'
              : c.deltaPercent !== null
                ? `${Math.abs(c.deltaPercent).toFixed(0)}%`
                : Math.abs(c.delta).toFixed(1)}
          </span>
        </span>
      </div>
      {open && (
        <p className="mt-0.5 font-mono text-[8px] leading-snug text-white/30">
          {c.basis} · {c.unit || 'dimensionless'} · {c.aggregation}
          {c.deltaPercent === null && c.direction !== 'unchanged' && ' · no baseline to compare against'}
        </p>
      )}
    </button>
  )
}

/* ── AI recommendation ───────────────────────────────────────────────────────
   The four-part chain the spec requires, rendered as four labelled parts rather
   than one paragraph — so the reasoning is legible as reasoning. */
function RecommendationCard({ result }: { result: WhatIfResult }) {
  const r = result.recommendation
  return (
    <Section title="AI Recommendation" icon={FlaskConical} accent={AI_ACCENT}>
      <p className="text-[11px] font-semibold leading-snug text-white/80">{r.headline}</p>

      <div className="mt-2 space-y-1.5">
        <Chain step="1" label="Observation" text={r.observation} />
        <Chain step="2" label="Evidence" text={r.evidence} />
        <Chain step="3" label="Reason" text={r.reason} />
        <Chain step="4" label="Expected Impact" text={r.impact} />
      </div>

      {r.limitation && (
        <div className="mt-2 flex items-start gap-1.5 rounded-xl border border-amber-400/20 bg-amber-400/[0.05] px-2.5 py-1.5">
          <TriangleAlert className="mt-[2px] h-2.5 w-2.5 shrink-0 text-amber-300/80" />
          <div>
            <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-amber-200/50">
              What this study cannot tell you
            </p>
            <p className="mt-0.5 text-[9px] leading-snug text-white/50">{r.limitation}</p>
          </div>
        </div>
      )}
    </Section>
  )
}

function Chain({ step, label, text }: { step: string; label: string; text: string }) {
  return (
    <div className="flex items-start gap-2">
      <span
        className="mt-[2px] grid h-4 w-4 shrink-0 place-items-center rounded-full font-mono text-[8px] font-bold"
        style={{ background: `${AI_ACCENT}1f`, color: AI_ACCENT }}
      >
        {step}
      </span>
      <div className="min-w-0">
        <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-white/30">{label}</p>
        <p className="mt-0.5 text-[9px] leading-snug text-white/55">{text}</p>
      </div>
    </div>
  )
}

/* ── Confidence ──────────────────────────────────────────────────────────── */
function ConfidenceCard({ result }: { result: WhatIfResult }) {
  const color = CONFIDENCE_COLOR[result.confidence]
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-wider text-white/50">Confidence</p>
        <span
          className="rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider"
          style={{ background: `${color}22`, color }}
        >
          {result.confidence}
        </span>
      </div>
      <p className="mt-1 text-[9px] leading-snug text-white/40">{result.confidenceReason}</p>
      <p className="mt-1.5 border-t border-white/[0.06] pt-1.5 font-mono text-[8px] leading-snug text-white/25">
        Both walks projected {result.horizonHours} h from {result.sourceLabel}. The sandbox differs from
        the baseline by one parameter only; every other input is identical.
      </p>
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

function TrendGlyph({ direction, color }: { direction: MetricComparison['direction']; color: string }) {
  if (direction === 'higher') return <ArrowUpRight className="h-2.5 w-2.5" style={{ color }} />
  if (direction === 'lower') return <ArrowDownRight className="h-2.5 w-2.5" style={{ color }} />
  return <Minus className="h-2.5 w-2.5 text-white/20" />
}

function Metric({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] px-2.5 py-1.5">
      <p className="text-[9px] font-medium uppercase tracking-wider text-white/45">{label}</p>
      <p className="font-mono text-[13px] font-semibold tabular-nums text-white">
        {value}
        {unit && <span className="ml-0.5 text-[9px] text-white/50">{unit}</span>}
      </p>
    </div>
  )
}
