'use client'

import { useState } from 'react'
import {
  Activity,
  AlertTriangle,
  BatteryCharging,
  Brain,
  Building2,
  Cloud,
  Cog,
  Cpu,
  ListChecks,
  PanelsTopLeft,
  Plug,
  PlugZap,
  Radio,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Sparkles,
  Sun,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useTwinStore } from '@/lib/engine/store'
import { clockLabel } from '@/lib/prediction'
import type {
  Anomaly,
  DetectableCondition,
  FaultDetectionReport,
  HealthStatus,
  SubsystemHealth,
} from '@/lib/ai/faultDetection'
import type { SubsystemId } from '@/lib/knowledge/types'

/**
 * AiFddPanel — the AI Fault Detection & Diagnosis Engine's engineering window
 * (Stage 8.5).
 *
 * ── What it shows, in the spec's order ───────────────────────────────────────
 *   Overall System Health → Subsystem Health → AI Diagnosis → Engineering
 *   Evidence → Detected Anomalies → AI Capability (Example Detectable
 *   Conditions, clearly not-current-faults) → AI Status.
 *
 * ── This panel owns no logic ─────────────────────────────────────────────────
 * Every score, reason, evidence value and anomaly is read from the
 * `FaultDetectionReport` the FDD Engine published. Nothing is derived here.
 * The engine is a MONITOR, not a controller — it detects, it never actuates.
 */

const STATUS_COLOR: Record<HealthStatus, string> = {
  Healthy: '#34d399',
  Warning: '#fbbf24',
  Critical: '#f87171',
}

const STATUS_ICON: Record<HealthStatus, LucideIcon> = {
  Healthy: ShieldCheck,
  Warning: ShieldAlert,
  Critical: ShieldX,
}

const SUBSYSTEM_ICON: Record<SubsystemId, LucideIcon> = {
  Weather: Cloud,
  SolarPhysics: Sun,
  VirtualSensors: Radio,
  EmbeddedController: Cpu,
  PBIF: Brain,
  ServoKinematics: Cog,
  AdaptiveFacade: PanelsTopLeft,
  RooftopPV: Zap,
  PVElectrical: Zap,
  PVInverter: PlugZap,
  BuildingEnergy: Building2,
  Battery: BatteryCharging,
  UtilityGrid: Plug,
  AIPrediction: Sparkles,
  AIWhatIf: Sparkles,
  CyberPhysicalPipeline: Activity,
}

/** The FDD's own accent — distinct from every subsystem it monitors. */
const AI_ACCENT = '#e879f9'

export function AiFddBody() {
  const report = useTwinStore((s) => s.faultDetection)

  return (
    <div className="space-y-3">
      <OverallHealthCard report={report} />
      <SubsystemChecklist subsystems={report.subsystems} />
      <DiagnosisCard report={report} />
      <EvidenceCard evidence={report.evidence} />
      <AnomaliesCard anomalies={report.anomalies} />
      <DetectableConditionsSection conditions={report.detectableConditions} />
      <AiStatusCard report={report} />
    </div>
  )
}

/* ── Overall system health ───────────────────────────────────────────────── */
function OverallHealthCard({ report }: { report: FaultDetectionReport }) {
  const color = STATUS_COLOR[report.overallStatus]
  const Icon = STATUS_ICON[report.overallStatus]

  return (
    <div className="rounded-2xl border p-3" style={{ borderColor: `${color}33`, background: `${color}0d` }}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[9px] font-medium uppercase tracking-wider text-white/45">Overall System Health</p>
        <StatusChip status={report.overallStatus} />
      </div>

      <div className="mt-1.5 flex items-center gap-2">
        <Icon className="h-6 w-6 shrink-0" style={{ color }} />
        <div className="flex items-baseline gap-1">
          <p className="font-mono text-[28px] font-bold leading-none tabular-nums" style={{ color }}>
            {report.overallHealthScore}
          </p>
          <p className="text-[12px] text-white/35">/ 100</p>
        </div>
      </div>

      <p className="mt-1.5 text-[10px] leading-relaxed text-white/55">{report.diagnosis}</p>
    </div>
  )
}

/* ── Subsystem checklist ─────────────────────────────────────────────────── */
function SubsystemChecklist({ subsystems }: { subsystems: SubsystemHealth[] }) {
  return (
    <Section title="Subsystem Health" icon={ListChecks} accent="#22d3ee">
      <div className="space-y-1">
        {subsystems.map((s) => (
          <SubsystemRow key={s.subsystem} health={s} />
        ))}
      </div>
    </Section>
  )
}

function SubsystemRow({ health }: { health: SubsystemHealth }) {
  const [open, setOpen] = useState(false)
  const color = STATUS_COLOR[health.status]
  const Icon = SUBSYSTEM_ICON[health.subsystem]

  return (
    <div className="rounded-xl bg-white/[0.03] px-2.5 py-1.5">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-1.5 text-left">
        <Icon className="h-3 w-3 shrink-0 text-white/40" />
        <span className="min-w-0 flex-1 truncate text-[10px] font-medium text-white/70">{health.label}</span>
        <span className="font-mono text-[9px] font-semibold tabular-nums" style={{ color }}>
          {health.healthScore}
        </span>
        <StatusChip status={health.status} />
      </button>

      {open && (
        <div className="mt-1.5 space-y-1 border-t border-white/[0.06] pt-1.5">
          <Trace label="Reason" text={health.reason} />
          <div className="space-y-0.5">
            {Object.entries(health.evidence).map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-2">
                <span className="text-[8.5px] text-white/30">{k}</span>
                <span className="font-mono text-[8.5px] text-white/50">{v}</span>
              </div>
            ))}
          </div>
          <Trace label="Confidence" text={`${health.confidence}%`} mono />
        </div>
      )}
    </div>
  )
}

/* ── AI diagnosis ────────────────────────────────────────────────────────── */
function DiagnosisCard({ report }: { report: FaultDetectionReport }) {
  return (
    <Section title="AI Diagnosis" icon={Brain} accent={AI_ACCENT}>
      <p className="text-[11px] italic leading-relaxed text-white/70">&ldquo;{report.diagnosis}&rdquo;</p>
    </Section>
  )
}

/* ── Engineering evidence ────────────────────────────────────────────────── */
function EvidenceCard({ evidence }: { evidence: string[] }) {
  if (evidence.length === 0) return null
  return (
    <Section title="Engineering Evidence" icon={Activity} accent="#22d3ee">
      <ul className="space-y-1">
        {evidence.map((e) => (
          <li key={e} className="flex gap-1.5">
            <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-emerald-400/60" />
            <span className="text-[10px] leading-snug text-white/60">{e}</span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

/* ── Detected anomalies ──────────────────────────────────────────────────── */
function AnomaliesCard({ anomalies }: { anomalies: Anomaly[] }) {
  return (
    <Section title="Detected Anomalies" icon={AlertTriangle} accent={anomalies.length ? '#f87171' : '#34d399'}>
      {anomalies.length === 0 ? (
        <div className="flex items-center gap-1.5">
          <ShieldCheck className="h-3 w-3 shrink-0 text-emerald-400/70" />
          <span className="text-[10px] text-white/55">None — no abnormal conditions detected.</span>
        </div>
      ) : (
        <div className="space-y-1.5">
          {anomalies.map((a) => (
            <AnomalyRow key={a.id} anomaly={a} />
          ))}
        </div>
      )}
    </Section>
  )
}

function AnomalyRow({ anomaly }: { anomaly: Anomaly }) {
  const [open, setOpen] = useState(true)
  const color = STATUS_COLOR[anomaly.severity]

  return (
    <div className="rounded-xl bg-white/[0.03] px-2.5 py-1.5">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-1.5 text-left">
        <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
        <span className="min-w-0 flex-1 text-[10px] leading-snug text-white/70">{anomaly.observation}</span>
        <StatusChip status={anomaly.severity} />
      </button>

      {open && (
        <div className="mt-1.5 space-y-1 border-t border-white/[0.06] pt-1.5 pl-3">
          <Trace
            label="Evidence"
            text={Object.entries(anomaly.evidence)
              .map(([k, v]) => `${k}: ${v}`)
              .join(' · ')}
          />
          <Trace label="Engineering Reasoning" text={anomaly.reasoning} />
          <Trace label="Conclusion" text={anomaly.conclusion} />
          <Trace label="Confidence" text={`${anomaly.confidence}%`} mono />
          <Trace label="Recommendation" text={anomaly.recommendation} />
        </div>
      )}
    </div>
  )
}

/* ── AI capability — future detection, never live faults ────────────────── */
function DetectableConditionsSection({ conditions }: { conditions: DetectableCondition[] }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 rounded-xl px-1 py-1 text-left transition-colors hover:bg-white/[0.03]"
      >
        <ListChecks className="h-3 w-3 shrink-0 text-white/25" />
        <p className="text-[10px] font-medium uppercase tracking-wider text-white/30">
          Example Detectable Conditions
        </p>
        <span className="ml-auto text-[9px] text-white/25">{open ? 'Hide' : conditions.length}</span>
      </button>

      {open && (
        <div className="mt-1.5 space-y-1.5 px-1">
          <p className="text-[9px] italic leading-snug text-amber-200/50">
            Potential detectable conditions this engine is architected to catch — NOT current faults.
          </p>
          {conditions.map((c) => (
            <div key={c.id} className="flex gap-1.5">
              <span className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-white/20" />
              <div className="min-w-0">
                <p className="text-[9.5px] font-semibold text-white/45">{c.label}</p>
                <p className="text-[9px] leading-snug text-white/30">{c.description}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── AI status ───────────────────────────────────────────────────────────── */
function AiStatusCard({ report }: { report: FaultDetectionReport }) {
  const rows: [string, string][] = [
    ['AI Model', report.model],
    ['Overall Status', report.overallStatus],
    ['Generated At', clockLabel(report.generatedAtHours)],
    ['Monitored Subsystems', `${report.subsystems.length}`],
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

function Trace({ label, text, mono }: { label: string; text: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-white/25">{label}</p>
      <p className={`text-[9px] leading-snug text-white/50 ${mono ? 'font-mono' : ''}`}>{text}</p>
    </div>
  )
}

function StatusChip({ status }: { status: HealthStatus }) {
  const color = STATUS_COLOR[status]
  return (
    <span
      className="shrink-0 rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider"
      style={{ background: `${color}22`, color }}
    >
      {status}
    </span>
  )
}
