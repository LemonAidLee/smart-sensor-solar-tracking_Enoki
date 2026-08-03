'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import {
  Sun,
  CircuitBoard,
  Cpu,
  Cog,
  Blinds,
  ChevronDown,
  ArrowDown,
  RefreshCw,
  type LucideIcon,
} from 'lucide-react'
import { useTwinStore } from '@/lib/engine/store'
import { getSimulation } from '@/lib/engine/simulation'
import type { FacadePanel } from '@/lib/engine/types'
import { servoState } from '@/lib/embedded'
import {
  describeEnvironmentalInfluences,
  influencesForStage,
} from '@/lib/engine/environmentalInfluence'
import { useModuleHighlightStore } from '@/lib/dt/moduleHighlightStore'
import { BLADE_LABEL, describeBladeMotion, formatBladeAngle } from '@/lib/dt/bladeAngle'
import { wrap360 } from '@/lib/kinematics'
import { SolarGeometryBody } from './SolarGeometry'
import { PbifDecisionBody } from './PbifPanel'
import { KinematicsBody } from './KinematicsInspector'
import { InfluenceLegend, InfluenceRail } from './EnvironmentalInfluence'

/**
 * CyberPhysicalPipeline — the engineering presentation reorganised around the
 * complete cyber-physical workflow instead of isolated subsystems.
 *
 * It answers TWO questions at once, and in this order of visual priority:
 *
 *   1. (primary)   How does sunlight eventually cause the façade to rotate?
 *   2. (secondary) How do weather and environmental conditions influence that?
 *
 * The first is told by one dominant vertical spine of five stages:
 *
 *   1 Environment  →  2 Sensor  →  3 Embedded Controller  →  4 Actuation  →  5 Adaptive Façade
 *
 * closing the loop back to the environment. Each stage shows a high-level
 * Inputs → Processing → Outputs summary in plain language; the output of one
 * stage is visibly the input of the next.
 *
 * The second is told by **Environmental Influences** — cloud, temperature, rain
 * and wind — which are NOT parallel pipelines. Each attaches, on a dashed side
 * rail, to the one stage it genuinely acts on (see
 * `src/lib/engine/environmentalInfluence.ts`, the single source of that mapping).
 * They are rendered with less visual weight than the spine by construction, so
 * the eye follows Sun → Façade first and discovers the influences second.
 *
 * Every existing engineering panel (Solar Geometry, PBIF decision, Kinematics
 * solver, the sensor chain and the irradiance/UV inspectors) is preserved —
 * folded into the matching stage's expandable "Engineering detail" section, so
 * beginners get the story and advanced users still reach the full mathematics.
 *
 * Rotation is named with the twin-wide vocabulary from `@/lib/dt/bladeAngle`:
 * exactly three quantities are ever on screen — Target Blade Angle (stage 3's
 * output), Servo Status (stage 4's plain-language movement) and Current Blade
 * Angle (stage 4's output, stage 5's input). World rotation, the servo
 * command/position and the PWM pulse are preserved verbatim behind stage 4's
 * "Advanced Servo Diagnostics".
 */

const STAGE_ACCENT = {
  environment: '#fbbf24', // amber — the outside world
  sensor: '#38bdf8', // sky — electrical sensing
  controller: '#a78bfa', // violet — the embedded brain
  actuation: '#f97316', // orange — the motor
  facade: '#34d399', // emerald — the physical skin
} as const

/** Pick the most-lit surface + its representative module so every stage tells the
 *  story of the SAME panel — the sunniest one, where the action is clearest. */
function useFocusModule() {
  const snap = useTwinStore((s) => s.snapshot)
  const sim = getSimulation()
  const summaries = snap.surfaces
  const focus = summaries.reduce(
    (best, s) => (s.averageSolarExposure > (best?.averageSolarExposure ?? -1) ? s : best),
    summaries[0],
  )
  const surface = focus ? sim.skin.getSurface(focus.id) : undefined
  const panel = surface?.panels[0]
  return { sim, snap, surface, panel, focus }
}

export function CyberPhysicalPipelineBody() {
  const { sim, snap, surface, panel } = useFocusModule()
  const sp = sim.solarPhysics
  const vs = sim.virtualSensor
  const id = panel?.id

  // ── Live pipeline values (all read from the single simulation source) ──────
  // Stage 1 — Environment
  const rawGHI = sp.getGlobalRawGHI()
  const cloudAtt = sp.getGlobalCloudAttenuation()
  const cosProj = id ? sp.getModuleCosineProjection(id) : 0
  const occFactor = id ? sp.getModuleOcclusionFactor(id) : 0
  const diffuse = id ? sp.getModuleDiffuseContribution(id) : 0
  const effIrr = id ? sp.getModuleEffectiveIrradiance(id) : 0
  const incAngle = id ? sp.getModuleIncidentAngle(id) : 0
  const blocker = id ? sp.getModuleBlocker(id) : null

  // Stage 2 — Sensor
  const lux = id ? vs.getModuleLux(id) : 0
  const res = id ? Math.round(vs.getModuleResistance(id)) : 0
  const volt = id ? vs.getModuleVoltage(id) : 0
  const adc = id ? vs.getModuleADC(id) : 0
  const fadc = id ? vs.getModuleFilteredADC(id) : 0

  // Stage 3 — Embedded Controller
  const pbif = sim.skin.getPbifEvaluation()

  // Stage 4 / 5 — Actuation + Façade. Only ever three rotation quantities are
  // shown — Current Blade Angle, Target Blade Angle, Servo Status — all named
  // and formatted by `@/lib/dt/bladeAngle`, never re-worded here.
  const current = panel?.rotationAngle ?? 0
  const target = panel?.targetRotation ?? 0
  const blade = describeBladeMotion(current, target)
  const facing = surface?.name ?? 'façade module'

  // ── Secondary narrative — each environmental parameter attached to the ONE
  //    stage it actually acts on. Declared once in the engine, never here. ────
  const influences = describeEnvironmentalInfluences({
    cloudCoverage: snap.weather.cloudCoverage,
    cloudAttenuation: cloudAtt,
    rawGHI,
    temperature: snap.weather.temperature,
    rainIntensity: snap.weather.rainIntensity,
    windSpeed: snap.weather.windSpeed,
    pbif,
  })

  return (
    <div className="space-y-0.5">
      <p className="mb-2 text-[10px] leading-relaxed text-white/45">
        The complete signal path for the <span className="text-white/70">sunniest module ({facing})</span>
        {panel && (
          <>
            {' '}— one real {panel.width.toFixed(2)} × {panel.height.toFixed(2)} m adaptive panel on storey{' '}
            {panel.floor + 1} of {snap.facade.storeys}, one of {snap.facade.totalPanels.toLocaleString()}
          </>
        )}
        . Follow it top to bottom to see how sunlight becomes movement. Weather conditions branch in from the side,
        each at the one stage it actually changes. Expand anything for the engineering behind it.
      </p>
      <InfluenceLegend />

      {/* ── STAGE 1 — ENVIRONMENT ─────────────────────────────────────────── */}
      <Stage
        n={1}
        title="Environment"
        subtitle="What is happening outside the building?"
        icon={Sun}
        accent={STAGE_ACCENT.environment}
        output={{ label: 'Effective irradiance', value: `${effIrr} W/m²` }}
        influences={<InfluenceRail influences={influencesForStage(influences, 'environment')} />}
        summary={
          <>
            {/* Only the sun and the sky belong to this stage. Temperature, rain
                and wind are not environmental *measurements* here — they are
                influences on the controller, and appear there instead. */}
            <IORow kind="in" text={`Sun ${snap.sun.altitude}° altitude · ${snap.sun.azimuth}° azimuth · ${snap.sun.isDaytime ? 'daytime' : 'night'}`} />
            <IORow kind="in" text={`Sky: clear-sky GHI ${Math.round(rawGHI)} W/m², attenuated by ${Math.round(snap.weather.cloudCoverage * 100)}% cloud cover`} />
            <IORow kind="proc" text={`Solar vector hits the panel at ${incAngle}° · projection cos θ = ${cosProj.toFixed(2)}`} />
            <IORow kind="proc" text={occFactor > 0 ? 'Clear line of sight to the sun' : blocker ? `Shadowed by neighbour ${blocker.id}` : 'No direct sun (occluded / night)'} />
            <IORow kind="out" text={`Effective irradiance reaching the glass: ${effIrr} W/m²`} />
          </>
        }
        detail={
          <>
            <DetailNote>
              Effective irradiance = clear-sky GHI × cloud × cos θ × line-of-sight, plus a diffuse-sky baseline:
            </DetailNote>
            <Calc rows={[
              ['Clear-sky GHI', `${Math.round(rawGHI)} W/m²`],
              ['× Cloud factor', `${cloudAtt.toFixed(2)}`],
              ['× cos θ (projection)', `${cosProj.toFixed(2)}`],
              ['× Line of sight', occFactor > 0 ? '1.0 (clear)' : '0.0 (blocked)'],
              ['+ Diffuse sky', `${diffuse} W/m²`],
              ['= Effective', `${effIrr} W/m²`],
            ]} />
            <SubSection title="Solar geometry (NOAA / Meeus)">
              <SolarGeometryBody />
            </SubSection>
          </>
        }
      />
      <Flow value={`${effIrr} W/m²`} accentFrom={STAGE_ACCENT.environment} accentTo={STAGE_ACCENT.sensor} />

      {/* ── STAGE 2 — SENSOR ──────────────────────────────────────────────── */}
      <Stage
        n={2}
        title="Sensor"
        subtitle="How does sunlight become electrical information?"
        icon={CircuitBoard}
        accent={STAGE_ACCENT.sensor}
        output={{ label: 'Filtered ADC', value: `${fadc}` }}
        summary={
          <>
            <IORow kind="in" text={`Effective irradiance ${effIrr} W/m²`} />
            <IORow kind="proc" text={`→ ${lux.toLocaleString()} lux → LDR ${res.toLocaleString()} Ω → ${volt.toFixed(2)} V → ADC ${adc}`} />
            <IORow kind="out" text={`Smoothed reading: ${fadc} / 4095 counts`} />
            <p className="mt-1 text-[9px] italic leading-snug text-white/40">
              The microcontroller never measures sunlight directly — only this electrical number.
            </p>
            {/* Deliberately the ONE stage with no influence rail: a measurement is
                not modified by weather, it simply reports what arrived. */}
            <p className="mt-1 rounded border border-dashed border-white/10 px-1.5 py-1 text-[8.5px] leading-snug text-white/35">
              No environmental influence enters here. The sensor cannot tell whether the light dropped because of
              cloud, a shadow or nightfall — it only converts whatever irradiance arrives.
            </p>
          </>
        }
        detail={
          <>
            <DetailNote>Photodiode → resistance → voltage divider → 12-bit ADC → digital low-pass filter:</DetailNote>
            <Calc rows={[
              ['Illuminance', `Eᵥ = 120 × ${effIrr} = ${lux.toLocaleString()} lux`],
              ['LDR resistance', `R = 500 / lux = ${res.toLocaleString()} Ω`],
              ['Voltage divider', `V = 3.3 × 10k / (R+10k) = ${volt.toFixed(3)} V`],
              ['ADC (12-bit)', `(V / 3.3) × 4095 = ${adc}`],
              ['Filtered ADC', `exp. smoothing (τ≈0.5s) → ${fadc}`],
            ]} />
            <p className="mt-2 text-[9px] leading-snug text-white/40">
              Reference: resistive voltage divider (TI app notes); CdS photoresistor power-law response; ESP32-S3 SAR ADC.
            </p>
          </>
        }
      />
      <Flow value={`ADC ${fadc}`} accentFrom={STAGE_ACCENT.sensor} accentTo={STAGE_ACCENT.controller} />

      {/* ── STAGE 3 — EMBEDDED CONTROLLER ─────────────────────────────────── */}
      <Stage
        n={3}
        title="Embedded Controller"
        subtitle="How does the controller decide what to do?"
        icon={Cpu}
        accent={STAGE_ACCENT.controller}
        output={{ label: BLADE_LABEL.target, value: formatBladeAngle(target) }}
        influences={<InfluenceRail influences={influencesForStage(influences, 'controller')} />}
        summary={
          <>
            <IORow kind="in" text={`Digital light reading ADC ${fadc} — everything it knows about the sun`} />
            <IORow kind="in" text="Plus environmental context: temperature, rain and wind (shown as influences below)" />
            <IORow kind="proc" text={pbif ? `Decision logic → ${pbifStateLabel(pbif.decision.state)}` : 'Awaiting first decision…'} />
            <IORow kind="proc" text={pbif ? `Tracking strategy: ${pbif.policy.label}` : '—'} />
            <IORow kind="out" text={`${BLADE_LABEL.target}: ${formatBladeAngle(target)} — sent to the servo`} />
            {/* WHY, not another number: the reason PBIF already computed. */}
            <Reason text={pbif?.decision.reason ?? pbif?.objective ?? 'Awaiting first decision…'} />
            <button
              onClick={() => useModuleHighlightStore.getState().requestOpenPanel()}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-violet-400/30 bg-violet-400/10 py-2 text-[11px] font-semibold text-violet-400 transition-colors hover:bg-violet-400/20"
            >
              <Cpu className="h-4 w-4" /> Inspect Live Controller
            </button>
          </>
        }
        detail={
          <>
            <DetailNote>
              PBIF is one component inside the controller: it turns the situation into an operational objective, then a
              tracking strategy, then a concrete Target Blade Angle. This is the only stage that combines several inputs — the
              light reading tells it where the sun is, while temperature, rain and wind are resolved against a strict
              priority hierarchy (Structural Safety › Weather Protection › Solar Availability › Thermal Demand), so a
              safety constraint can never be outvoted by an energy objective. Full breakdown:
            </DetailNote>
            <SubSection title="PBIF decision breakdown">
              <PbifDecisionBody />
            </SubSection>
          </>
        }
      />
      <Flow value={`${BLADE_LABEL.target} ${formatBladeAngle(target)}`} accentFrom={STAGE_ACCENT.controller} accentTo={STAGE_ACCENT.actuation} />

      {/* ── STAGE 4 — ACTUATION ───────────────────────────────────────────── */}
      <Stage
        n={4}
        title="Servo (Actuation)"
        subtitle="How does the command become movement?"
        icon={Cog}
        accent={STAGE_ACCENT.actuation}
        output={{ label: BLADE_LABEL.current, value: formatBladeAngle(current) }}
        influences={<InfluenceRail influences={influencesForStage(influences, 'actuation')} />}
        summary={
          <>
            <IORow kind="in" text={`${BLADE_LABEL.target} ${formatBladeAngle(target)} from the controller`} />
            {/* Servo Status in plain language — never the motor's internals. */}
            <IORow
              kind="proc"
              text={`${BLADE_LABEL.servoStatus}: ${blade.status}${blade.moving ? ` · ${blade.remaining} remaining` : ''}`}
            />
            <IORow kind="out" text={`${BLADE_LABEL.current}: ${formatBladeAngle(current)} — ${blade.currentStatus}`} />
            <TravelBar current={current} target={target} accent={STAGE_ACCENT.actuation} />
            <p className="mt-0.5 text-center font-mono text-[9px] text-white/40">{blade.progress}</p>
          </>
        }
        detail={
          <>
            <DetailNote>The kinematics solver chooses the target; the motor model eases toward it with inertia:</DetailNote>
            <Calc rows={[
              [BLADE_LABEL.current, formatBladeAngle(current)],
              [BLADE_LABEL.target, formatBladeAngle(target)],
              ['Remaining travel', blade.remaining],
              [BLADE_LABEL.servoStatus, blade.status],
            ]} />
            {/* Low-level actuator values are preserved, only demoted: the raw
                unbounded kinematic rotation, the folded 0–180° servo frame and
                the PWM pulse all live behind the standard diagnostics section. */}
            <SubSection title={BLADE_LABEL.advanced}>
              <ServoDiagnostics panel={panel} />
            </SubSection>
            <SubSection title="Kinematics solver (why this angle?)">
              <KinematicsBody />
            </SubSection>
          </>
        }
      />
      <Flow value={`${BLADE_LABEL.current} ${formatBladeAngle(current)}`} accentFrom={STAGE_ACCENT.actuation} accentTo={STAGE_ACCENT.facade} />

      {/* ── STAGE 5 — ADAPTIVE FAÇADE ─────────────────────────────────────── */}
      <Stage
        n={5}
        title="Adaptive Façade"
        subtitle="How does the building respond?"
        icon={Blinds}
        accent={STAGE_ACCENT.facade}
        output={{ label: 'New incident angle', value: `${incAngle}°` }}
        summary={
          <>
            <IORow kind="in" text={`${BLADE_LABEL.current} ${formatBladeAngle(current)}`} />
            <IORow kind="proc" text={`Panel normal turns → new incident angle ${incAngle}° to the sun`} />
            <IORow kind="out" text={`Updated effective irradiance ${effIrr} W/m² — fed back into the next cycle`} />
          </>
        }
        detail={
          <>
            <DetailNote>The moved blade changes the geometry the environment stage reads next tick — a closed loop:</DetailNote>
            <Calc rows={[
              [BLADE_LABEL.current, formatBladeAngle(current)],
              ['Openness', `${panel ? Math.round(panel.openness * 100) : 0}%`],
              ['Shading', `${panel ? Math.round(panel.shading * 100) : 0}%`],
              ['New incident angle', `${incAngle}°`],
              ['New effective irradiance', `${effIrr} W/m²`],
            ]} />
            <SubSection title="Live façade surfaces">
              {/* The same command reaches every module on every elevation — the
                  as-built grid this module belongs to. */}
              <p className="mb-1.5 text-[9px] leading-snug text-white/40">
                {snap.facade.totalPanels.toLocaleString()} adaptive modules ·{' '}
                {snap.facade.panelsPerFloor.toLocaleString()} per storey ({snap.facade.rowsPerFloor} rows ×{' '}
                {snap.facade.columnsPerRing} bays) · {snap.facade.facadeArea.toLocaleString()} m² across{' '}
                {snap.facade.surfaceCount} elevations
              </p>
              <div className="space-y-1">
                {snap.surfaces.map((s) => (
                  <div key={s.id} className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2 py-1 text-[10px]">
                    <span className="font-mono text-white/60">{s.id}</span>
                    <span className="text-white/70">{Math.round(s.averagePanelAngle)}° · ☀ {Math.round(s.averageSolarExposure * 100)}%</span>
                  </div>
                ))}
              </div>
            </SubSection>
          </>
        }
      />

      {/* ── FEEDBACK LOOP ─────────────────────────────────────────────────── */}
      <div className="mt-2 flex items-center justify-center gap-2 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2">
        <motion.span
          animate={{ rotate: 360 }}
          transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
          className="text-white/40"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </motion.span>
        <span className="text-[9px] leading-snug text-white/45">
          The new façade geometry feeds back into <span className="text-white/70">Environment</span> on the next
          simulation cycle — a continuous closed loop.
        </span>
      </div>
    </div>
  )
}

/* ── Stage card ─────────────────────────────────────────────────────────────
   High-level Inputs→Processing→Outputs always visible; engineering detail behind
   a progressive-disclosure toggle (detail is only mounted when expanded).

   `influences` is an optional side rail rendered AFTER the summary and BEFORE
   the output chip — the position mirrors the engineering reality: an influence
   modifies what happens inside the stage, so it must be visible before the
   stage's output value. Stages with no genuine influence (Sensor, Façade) simply
   omit it. */
function Stage({
  n,
  title,
  subtitle,
  icon: Icon,
  accent,
  output,
  summary,
  influences,
  detail,
}: {
  n: number
  title: string
  subtitle: string
  icon: LucideIcon
  accent: string
  output: { label: string; value: string }
  summary: React.ReactNode
  influences?: React.ReactNode
  detail: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="overflow-hidden rounded-2xl border" style={{ borderColor: `${accent}33`, background: `${accent}0d` }}>
      {/* Header */}
      <div className="flex items-center gap-2.5 px-3 pb-1.5 pt-2.5">
        <span
          className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-bold"
          style={{ background: `${accent}22`, color: accent }}
        >
          {n}
        </span>
        <Icon className="h-4 w-4 shrink-0" style={{ color: accent }} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-tight text-white/90">{title}</p>
          <p className="truncate text-[9px] text-white/45">{subtitle}</p>
        </div>
      </div>

      {/* High-level summary */}
      <div className="space-y-1 px-3 pb-2">
        {summary}
        {influences}
      </div>

      {/* Output chip */}
      <div className="mx-3 mb-2 flex items-center justify-between rounded-lg px-2.5 py-1.5" style={{ background: `${accent}18` }}>
        <span className="text-[9px] font-medium uppercase tracking-wider text-white/50">{output.label}</span>
        <span className="font-mono text-[12px] font-bold" style={{ color: accent }}>{output.value}</span>
      </div>

      {/* Progressive disclosure */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between border-t border-white/5 px-3 py-2 text-left text-[10px] font-medium text-white/50 transition-colors hover:bg-white/[0.03] hover:text-white/80"
      >
        <span>Engineering detail</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-white/5 bg-black/20 p-3">{detail}</div>}
    </div>
  )
}

/** Inputs / Processing / Outputs row with a coloured leading tag. */
function IORow({ kind, text }: { kind: 'in' | 'proc' | 'out'; text: string }) {
  const meta =
    kind === 'in'
      ? { label: 'IN', color: '#94a3b8' }
      : kind === 'proc'
        ? { label: 'PROC', color: '#64748b' }
        : { label: 'OUT', color: '#e2e8f0' }
  return (
    <div className="flex items-start gap-1.5">
      <span
        className="mt-[1px] shrink-0 rounded px-1 py-[1px] text-[7.5px] font-bold tracking-wider"
        style={{ background: `${meta.color}22`, color: meta.color }}
      >
        {meta.label}
      </span>
      <span className="text-[10px] leading-snug text-white/70">{text}</span>
    </div>
  )
}

/** Animated flow connector — the output value of one stage visibly entering the next. */
function Flow({ value, accentFrom, accentTo }: { value: string; accentFrom: string; accentTo: string }) {
  return (
    <div className="relative flex h-9 items-center justify-center">
      <div className="absolute h-full w-px" style={{ background: `linear-gradient(${accentFrom}, ${accentTo})`, opacity: 0.4 }} />
      <motion.span
        aria-hidden
        className="absolute h-1.5 w-1.5 rounded-full"
        style={{ background: accentTo, boxShadow: `0 0 6px ${accentTo}` }}
        animate={{ y: [-14, 14], opacity: [0, 1, 0] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      />
      <span className="relative z-10 flex items-center gap-1 rounded-full border border-white/10 bg-[#0a0e16] px-2 py-0.5 text-[9px] font-medium text-white/60">
        <ArrowDown className="h-2.5 w-2.5" style={{ color: accentTo }} />
        {value}
      </span>
    </div>
  )
}

/** Explains WHY a value is what it is — deliberately prose, never another angle. */
function Reason({ text }: { text: string }) {
  return (
    <div className="mt-1 rounded-lg border border-white/8 bg-white/[0.03] px-2 py-1.5">
      <p className="text-[8px] font-semibold uppercase tracking-wider text-white/40">Reason</p>
      <p className="mt-0.5 text-[10px] leading-snug text-white/70">{text}</p>
    </div>
  )
}

/**
 * Advanced Servo Diagnostics — the low-level actuator values, preserved in full
 * but only reachable on request. Derived by the engine's own `servoState()`, so
 * this is a view of existing state, not a second calculation of it.
 */
function ServoDiagnostics({ panel }: { panel?: FacadePanel }) {
  if (!panel) return <p className="text-[10px] text-white/40">No panel resolved.</p>
  const s = servoState(panel)
  return (
    <>
      <DetailNote>
        Building Kinematics works in unbounded world rotation (it may read −735° after a day of tracking); a real
        actuator cannot. These are the values the ESP32-S3 actually drives, folded into the servo&apos;s physical
        0–180° travel via the blade&apos;s own 180° symmetry.
      </DetailNote>
      <Calc rows={[
        ['World rotation · target', `${s.worldRotationTarget.toFixed(1)}°`],
        ['World rotation · current', `${s.worldRotationCurrent.toFixed(1)}°`],
        ['Servo command', `${Math.round(s.servoCommandAngle)}°`],
        ['Servo position', `${Math.round(s.servoPositionAngle)}°`],
        ['PWM output', `${s.pwmMicros} µs`],
      ]} />
    </>
  )
}

function DetailNote({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-[10px] leading-relaxed text-white/55">{children}</p>
}

/** Compact aligned calculation table (label → value). */
function Calc({ rows }: { rows: [string, string][] }) {
  return (
    <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded-lg bg-white/[0.03] p-2.5">
      {rows.map(([k, v], i) => (
        <div key={i} className="contents">
          <span className="text-[10px] text-white/45">{k}</span>
          <span className="text-right font-mono text-[10px] text-white/80">{v}</span>
        </div>
      ))}
    </div>
  )
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-white/10 bg-black/20">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-2.5 py-2 text-left text-[10px] font-semibold text-emerald-300 transition-colors hover:bg-white/5"
      >
        {title}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t border-white/10 p-2.5">{children}</div>}
    </div>
  )
}

/** Blade travel indicator: Current Blade Angle → Target Blade Angle, on the same
 *  wrapped 0–360° scale the numbers beside it are printed in. */
function TravelBar({ current, target, accent }: { current: number; target: number; accent: string }) {
  const c = wrap360(current) / 360
  const t = wrap360(target) / 360
  return (
    <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
      {/* target marker */}
      <div className="absolute top-[-2px] h-2.5 w-0.5 bg-white/60" style={{ left: `${t * 100}%` }} />
      {/* current fill */}
      <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${c * 100}%`, background: accent }} />
    </div>
  )
}

/** Plain-language label for a PBIF operational state (advanced term stays inside). */
function pbifStateLabel(state: string): string {
  switch (state) {
    case 'NORMAL_TRACKING':
      return 'Track the sun for best performance'
    case 'ECONOMY_TRACKING':
      return 'Track the sun economically'
    case 'WEATHER_PROTECTION':
      return 'Protect the façade from rain'
    case 'SAFE_MODE':
      return 'Safe mode — protect the structure'
    default:
      return state
  }
}
