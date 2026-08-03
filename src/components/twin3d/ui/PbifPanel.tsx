'use client'

import { ArrowDown } from 'lucide-react'
import { getSimulation } from '@/lib/engine/simulation'
import { useTwinStore } from '@/lib/engine/store'
import {
  PBIF_STATE_LABELS,
  STATE_LABELS,
  DYNAMIC_DEADBAND_DEG,
  type PbifState,
  type PbifPriority,
  type PbifEvaluation,
} from '@/lib/pbif'
import { solveForNormal, solarVector, transformSolarVector } from '@/lib/kinematics'
import { BLADE_LABEL, formatBladeAngle } from '@/lib/dt/bladeAngle'

/**
 * PbifPanel — the PBIF Decision & decision-flow visualization.
 *
 * Renders the full explainable chain for the current instant:
 *   Current Weather → Situation Assessment → PBIF Decision → Tracking Policy
 *   → Kinematics Solver → Target Blade Angle (Current Façade Behaviour)
 *
 * It shows WHY the decision was made (reason, priority, rule, confidence). All
 * data comes from the live PBIF evaluation computed in the engine each tick
 * (`sim.skin.getPbifEvaluation()`); this panel holds no decision logic of its own.
 * Subscribing to the throttled snapshot keeps it re-rendering as weather changes.
 */

/** Accent colour per operational state — carries the priority visually. */
const STATE_COLOR: Record<PbifState, string> = {
  NORMAL_TRACKING: '#34d399', // emerald — full solar optimisation
  ECONOMY_TRACKING: '#38bdf8', // sky — economised tracking
  WEATHER_PROTECTION: '#60a5fa', // blue — rain protection
  SAFE_MODE: '#f43f5e', // red — structural safety
}

const PRIORITY_COLOR: Record<PbifPriority, string> = {
  'Structural Safety': '#f43f5e',
  'Weather Protection': '#60a5fa',
  'Solar Availability': '#34d399',
  'Thermal Demand': '#fbbf24', // amber
}

/**
 * PbifDecisionBody — the PBIF Decision & decision-flow visualization, rendered
 * inside a FloatingWindow (which owns title/drag/collapse/close).
 */
export function PbifDecisionBody() {
  // Re-render on each snapshot poll; read the live evaluation from the engine.
  useTwinStore((s) => s.snapshot)
  const facadeControlMode = useTwinStore((s) => s.facadeControlMode)
  const evalResult = getSimulation().skin.getPbifEvaluation()

  if (facadeControlMode !== 'pbif') {
    return (
      <div className="flex h-24 items-center justify-center rounded-xl border border-white/5 bg-white/[0.02]">
        <p className="text-center text-[11px] leading-relaxed text-white/40">
          PBIF Decision unavailable <br />
          — {facadeControlMode === 'manual' ? 'Manual Control' : 'Kinematics Solver'} Active.
        </p>
      </div>
    )
  }

  if (!evalResult) return <p className="text-[11px] text-white/45">Awaiting first evaluation…</p>
  return <PbifBody evaluation={evalResult} />
}

function PbifBody({ evaluation }: { evaluation: PbifEvaluation }) {
  const { situation, thermalDemand, solarResource, objective, decision, policy } = evaluation
  const color = STATE_COLOR[decision.state]

  // Economy Tracking math for UI
  const snapshot = useTwinStore((s) => s.snapshot)
  const sim = getSimulation()
  const surface = sim.skin.getAllSurfaces()[0]
  let economyNode = null

  if (decision.state === 'ECONOMY_TRACKING' && snapshot && surface) {
    const worldSolar = solarVector(snapshot.sun.altitude, snapshot.sun.azimuth)
    const solar = transformSolarVector(worldSolar, snapshot.orientation)
    const intent = sim.skin.getTrackingIntent()
    
    // The panel's current physical angle (we use the average from the surface summary)
    const summary = snapshot.surfaces.find(s => s.id === surface.id)
    const currentAngle = summary?.averagePanelAngle ?? 90
    
    // Theoretical target
    const theoreticalTarget = solveForNormal(surface.normal, solar, currentAngle, intent).targetAngle
    const diff = Math.abs(theoreticalTarget - currentAngle)
    const deadband = DYNAMIC_DEADBAND_DEG[solarResource.state]
    const exceeds = diff > deadband

    economyNode = (
      <>
        <Connector />
        <FlowNode title="Economy Tracking (Dynamic Deadband)" tone="accent" color={color}>
          <div className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-[10px]">
            <span className="text-white/50">Tracking Deadband</span>
            <span className="font-mono text-white/80">{deadband.toFixed(1)}°</span>
            
            <span className="text-white/50">{BLADE_LABEL.current}</span>
            <span className="font-mono text-white/80">{formatBladeAngle(currentAngle)}</span>

            <span className="text-white/50">{BLADE_LABEL.target}</span>
            <span className="font-mono text-white/80">{formatBladeAngle(theoreticalTarget)}</span>
            
            <span className="mt-0.5 border-t border-white/10 pt-1 text-white/50">Angular Difference</span>
            <span className="mt-0.5 border-t border-white/10 pt-1 font-mono font-bold text-white">{diff.toFixed(1)}°</span>
          </div>
          <div className="mt-2 rounded bg-black/20 p-1.5 text-center">
            <span className="text-[9px] font-semibold tracking-wide text-white/70">
              {exceeds ? 'EXCEEDS DEADBAND → UPDATE TARGET BLADE ANGLE' : 'BELOW DEADBAND → HOLD POSITION'}
            </span>
          </div>
          <div className="mt-1.5 flex justify-end">
            <span className="text-[7.5px] uppercase tracking-widest text-white/30">
              Ref: ISA-18.2 / Hysteresis Control
            </span>
          </div>
        </FlowNode>
      </>
    )
  }

  return (
    <div className="space-y-2.5">
      {/* Headline decision */}
      <div className="rounded-2xl border p-3" style={{ borderColor: `${color}40`, background: `${color}12` }}>
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-medium uppercase tracking-wider text-white/50">Operational State</span>
          <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold" style={{ color, background: `${color}20` }}>
            {decision.confidence}% confidence
          </span>
        </div>
        <p className="mt-1 text-lg font-bold" style={{ color }}>
          {PBIF_STATE_LABELS[decision.state]}
        </p>
        <p className="text-[10px] font-medium" style={{ color: PRIORITY_COLOR[decision.priority] }}>
          Priority · {decision.priority}
        </p>
      </div>

      {/* ── Decision-flow visualization ─────────────────────────────────────── */}
      <FlowNode title="Current Weather" tone="neutral">
        <div className="grid grid-cols-4 gap-1">
          <Metric label="Wind" value={situation.wind.display} />
          <Metric label="Rain" value={situation.rain.display} />
          <Metric label="Cloud" value={`${Math.round(solarResource.value * 100)}%`} />
          <Metric label="Temp" value={thermalDemand.display} />
        </div>
      </FlowNode>

      <Connector />

      <FlowNode title="Situation Assessment" tone="neutral">
        <div className="grid grid-cols-2 gap-1">
          <StateChip label="Wind" value={STATE_LABELS[situation.wind.state]} />
          <StateChip label="Rain" value={STATE_LABELS[situation.rain.state]} />
        </div>
      </FlowNode>

      <Connector />

      <FlowNode title="Solar Resource Assessment" tone="neutral">
        <div className="grid grid-cols-1 gap-1">
          <StateChip label="Estimated Resource" value={solarResource.state} />
        </div>
      </FlowNode>

      <Connector />

      <FlowNode title="Thermal Demand Assessment" tone="neutral">
        <div className="grid grid-cols-1 gap-1">
          <StateChip label="Outdoor Temperature" value={thermalDemand.state} />
        </div>
      </FlowNode>

      <Connector />

      <FlowNode title="Operational Objective" tone="neutral">
        <p className="text-[11px] font-bold text-white/85">{objective}</p>
        <p className="mt-1 text-[9px] leading-relaxed text-white/50">
          The highest-level goal the building is trying to achieve right now.
        </p>
      </FlowNode>

      <Connector />

      <FlowNode title="PBIF Decision" tone="accent" color={color}>
        <p className="text-[11px] font-bold" style={{ color }}>
          {PBIF_STATE_LABELS[decision.state]}
        </p>
        <p className="mt-0.5 text-[9px] text-white/40">{decision.ruleTriggered}</p>
      </FlowNode>

      <Connector />

      <FlowNode title="Facade State" tone="neutral">
        <p className="text-[11px] font-bold text-white/85">{decision.facadeState}</p>
        <p className="mt-1 text-[9px] leading-relaxed text-white/50">
          {decision.reason}
        </p>
      </FlowNode>

      <Connector />

      <FlowNode title="Tracking Policy" tone="neutral">
        <p className="text-[11px] font-semibold text-white/85">{policy.label}</p>
        <p className="mt-0.5 text-[10px] leading-relaxed text-white/70">{policy.behaviour}</p>
      </FlowNode>

      {economyNode}

      <Connector />

      <FlowNode title={BLADE_LABEL.target} tone="muted">
        <p className="text-[9px] text-white/45">
          Computed via {decision.facadeState === 'TRACKING' ? 'Kinematics Solver' : 'Closed Geometry Solver'}. PBIF never outputs an angle.
        </p>
      </FlowNode>

      {/* ── Why this decision ───────────────────────────────────────────────── */}
      <div className="mt-1 rounded-xl border border-white/5 bg-white/[0.04] p-3">
        <p className="mb-1 text-[10px] font-semibold text-emerald-400">Why this decision?</p>
        <p className="text-[10px] leading-relaxed text-white/70">PBIF evaluated the situation and determined the operational priority.</p>
        <div className="mt-2 grid grid-cols-[70px_1fr] gap-y-1 text-[10px]">
          <span className="text-white/40">Priority</span>
          <span className="font-medium" style={{ color: PRIORITY_COLOR[decision.priority] }}>
            {decision.priority}
          </span>
          <span className="text-white/40">Rule</span>
          <span className="font-mono text-white/70">{decision.ruleTriggered}</span>
          <span className="text-white/40">Confidence</span>
          <span className="font-mono text-white/70">{decision.confidence}%</span>
        </div>
      </div>

      <p className="text-[8.5px] leading-relaxed text-white/30">
        PBIF v1 is deterministic rule-based decision making. Confidence is fixed at 100% by construction; a future
        predictive / AI engine will supply a real confidence source without changing this panel.
      </p>
    </div>
  )
}

/** One node in the decision-flow chain. */
function FlowNode({
  title,
  children,
  tone,
  color,
}: {
  title: string
  children: React.ReactNode
  tone: 'neutral' | 'accent' | 'muted'
  color?: string
}) {
  const border =
    tone === 'accent' && color ? `${color}40` : tone === 'muted' ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)'
  const bg = tone === 'accent' && color ? `${color}10` : 'rgba(255,255,255,0.02)'
  return (
    <div className="rounded-xl border p-2.5" style={{ borderColor: border, background: bg }}>
      <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-white/45">{title}</p>
      {children}
    </div>
  )
}

function Connector() {
  return (
    <div className="flex justify-center">
      <ArrowDown className="h-3 w-3 text-white/25" />
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/[0.03] px-1.5 py-1 text-center">
      <p className="text-[8px] uppercase tracking-wider text-white/40">{label}</p>
      <p className="mt-0.5 font-mono text-[10px] font-semibold text-white/80">{value}</p>
    </div>
  )
}

function StateChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/[0.03] px-1.5 py-1 text-center">
      <p className="text-[8px] uppercase tracking-wider text-white/40">{label}</p>
      <p className="mt-0.5 text-[9px] font-semibold text-emerald-300">{value}</p>
    </div>
  )
}
