'use client'

import { useState } from 'react'
import { ArrowDown, BookOpen, ChevronDown, CloudSun, Info, Lightbulb, ShieldQuestion, Sun, Zap } from 'lucide-react'
import { useTwinStore } from '@/lib/engine/store'
import {
  BUILDING_LIGHTING,
  BUILDING_LIGHTING_REFERENCES,
  type BuildingLightingState,
  type LightingStatus,
} from '@/lib/engine/buildingLighting'

/**
 * BuildingLightingPanel — the dedicated engineering panel for the Building
 * Lighting Response Engine (Stage 7.10), the second Building Physics Layer
 * subsystem alongside Building Thermal Response.
 *
 * It renders the daylight-to-lighting chain top to bottom, exactly the order
 * `BuildingLightingEngine.update()` computes it:
 *
 *   Outdoor Illuminance → Envelope Transmission → Indoor Illuminance →
 *   Target Illuminance → Lighting Requirement → Lighting Electrical Demand
 *
 * ── What this panel is not ───────────────────────────────────────────────────
 * It owns no logic. Every value is read from `SimSnapshot.lighting`, the
 * object `BuildingLightingEngine` publishes once per environmental tick —
 * nothing here re-derives outdoor illuminance, envelope transmission, the
 * daylight-harvesting controller or the artificial-lighting conversion (guide
 * §6). The two "after transmission" figures in the chain and breakdown are the
 * ONE exception, and even those are plain arithmetic on two already-published
 * numbers (`outdoorLux × VISIBLE_TRANSMISSION`) — the same class of display-only
 * recomposition `RooftopPvPanel`'s `HvacBreakdownRow` already does, never a
 * second physics calculation. The "Engineering Model & Calculations" section
 * reads its constants and citations straight off `BUILDING_LIGHTING` /
 * `BUILDING_LIGHTING_REFERENCES` for the same reason — a constant changed in
 * the engine is reflected here with no UI edit required.
 */

/** Amber/yellow = daylight and light itself, blue = target/reference, green = savings. */
const ACCENT = {
  outdoor: '#38bdf8',
  transmitted: '#7dd3fc',
  indoor: '#fde047',
  target: '#a78bfa',
  requirement: '#fb923c',
  // Same accent `RooftopPvPanel.tsx` uses for Artificial Lighting, so the
  // figure reads as the same quantity across both panels.
  artificial: '#facc15',
  saving: '#34d399',
  neutral: '#94a3b8',
} as const

const STATUS_ACCENT: Record<LightingStatus, string> = {
  Unoccupied: ACCENT.neutral,
  'Fully Daylit': ACCENT.outdoor,
  'Daylight Harvesting': ACCENT.indoor,
  'Full Artificial': ACCENT.artificial,
}

export function BuildingLightingBody() {
  // Subscribe to the WHOLE snapshot, not `s.snapshot.lighting` directly — see
  // `BuildingThermalPanel.tsx`'s own note on why a top-level panel body needs
  // this even though `getState()` returns a stable, mutated-in-place reference.
  const snap = useTwinStore((s) => s.snapshot)
  const l = snap.lighting

  return (
    <div className="space-y-3">
      {/* ── BUILDING LIGHTING BALANCE ────────────────────────────────────────── */}
      <LightingBalanceCard state={l} />

      {/* ── LIGHTING CHAIN ───────────────────────────────────────────────────── */}
      <LightingChain state={l} />

      {/* ── LIGHTING STATE (Environmental / Lighting / System) ──────────────── */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-2.5">
        <div className="mb-1.5 flex items-center gap-1.5">
          <Lightbulb className="h-3 w-3 shrink-0" style={{ color: ACCENT.indoor }} />
          <p className="text-[10px] font-medium uppercase tracking-wider text-white/50">Lighting State</p>
        </div>

        <GroupLabel>Environmental</GroupLabel>
        <div className="grid grid-cols-2 gap-1.5">
          <Metric label="Outdoor Lux" value={Math.round(l.outdoorLux).toLocaleString()} unit="lux" accent={ACCENT.outdoor} />
          <Metric label="Cloud Factor" value={`${Math.round(snap.weather.cloudCoverage * 100)}`} unit="%" />
          <Metric label="Façade Openness" value={`${Math.round(l.facadeOpenness * 100)}`} unit="%" className="col-span-2" />
        </div>

        <GroupLabel>Lighting</GroupLabel>
        <div className="grid grid-cols-2 gap-1.5">
          <Metric label="Indoor Lux" value={Math.round(l.indoorLux).toLocaleString()} unit="lux" accent={ACCENT.indoor} />
          <Metric label="Target Lux" value={Math.round(l.targetLux).toLocaleString()} unit="lux" accent={ACCENT.target} />
          <Metric
            label="Lighting Level"
            value={`${Math.round(l.lightingLevel * 100)}`}
            unit="%"
            secondary="artificial"
            accent={ACCENT.artificial}
            title="Lagged daylight-harvesting control level — the fraction of the lighting requirement still met by artificial lighting."
          />
          <Metric label="Lighting Status" value={l.lightingStatus} accent={STATUS_ACCENT[l.lightingStatus]} />
        </div>

        <GroupLabel>System</GroupLabel>
        <div className="grid grid-cols-2 gap-1.5">
          <Metric
            label="Visible Transmission"
            value={`${Math.round(BUILDING_LIGHTING.VISIBLE_TRANSMISSION * 100)}`}
            unit="%"
          />
          <Metric
            label="Current Saving"
            value={l.lightingSavingsKW.toFixed(1)}
            unit="kW"
            secondary="vs. no harvesting"
            accent={ACCENT.saving}
          />
        </div>
        <p className="mt-1.5 text-[8.5px] leading-snug text-white/25">
          Outdoor/indoor illuminance and lighting savings are estimates from a fixed daylight-efficacy and rated-density
          model, not measured lux-meter or sub-metered readings.
        </p>
      </div>

      {/* ── ENGINEERING MODEL & CALCULATIONS (progressive disclosure) ───────── */}
      <EngineeringDetails state={l} />
    </div>
  )
}

/** Small uppercase group divider inside the Lighting State card. */
function GroupLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 mt-2.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-white/30 first:mt-0">{children}</p>
}

/**
 * The Building Lighting Balance summary — the single systems-level read:
 * daylight arrives, artificial lighting tops it up, electricity is what that
 * costs, and savings are what daylight avoided. Mirrors
 * `BuildingThermalPanel.tsx`'s `EnergyBalanceCard`.
 */
function LightingBalanceCard({ state }: { state: BuildingLightingState }) {
  const stable = state.lightingStatus === 'Fully Daylit' || state.lightingStatus === 'Unoccupied'
  return (
    <div
      className="rounded-2xl border p-3"
      style={{ borderColor: `${ACCENT.artificial}33`, background: `${ACCENT.artificial}0d` }}
    >
      <p className="mb-2 text-center text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">
        Building Lighting Balance
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        <BalanceRow icon={Sun} label="Indoor Daylight" value={`${Math.round(state.indoorLux).toLocaleString()} lux`} accent={ACCENT.indoor} />
        <BalanceRow icon={Lightbulb} label="Artificial Level" value={`${Math.round(state.lightingLevel * 100)}%`} accent={ACCENT.artificial} />
        <BalanceRow icon={Zap} label="Lighting Electricity" value={`${state.lightingElectricalKW.toFixed(1)} kW`} accent={ACCENT.requirement} />
        <BalanceRow
          icon={CloudSun}
          label="Lighting Savings"
          value={`${state.lightingSavingsKW.toFixed(1)} kW`}
          accent={ACCENT.saving}
          badge={stable ? '✓ Daylit' : state.lightingStatus}
        />
      </div>
      <p className="mt-2 text-center text-[8.5px] leading-snug text-white/30">
        Daylight arrives → artificial lighting tops it up → electricity is what that costs → savings are what daylight
        avoided.
      </p>
    </div>
  )
}

function BalanceRow({
  icon: Icon,
  label,
  value,
  accent,
  badge,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
  label: string
  value: string
  accent: string
  badge?: string
}) {
  return (
    <div className="rounded-xl bg-white/[0.04] px-2.5 py-2">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3 w-3 shrink-0" style={{ color: accent }} />
        <span className="text-[8.5px] uppercase tracking-wider text-white/45">{label}</span>
      </div>
      <p className="mt-0.5 font-mono text-[14px] font-semibold tabular-nums" style={{ color: accent }}>
        {value}
      </p>
      {badge && <p className="mt-0.5 text-[8.5px] font-medium text-white/40">{badge}</p>}
    </div>
  )
}

/**
 * The six-stage daylight-to-lighting chain, drawn as a vertical flow with a
 * connecting arrow between each stage — mirrors `BuildingThermalPanel.tsx`'s
 * `ThermalChain`. Lux-valued stages share one proportional bar scale; the
 * percent and kW stages render without one (comparing lux against either
 * would be meaningless), exactly as the thermal chain skips a bar for its
 * final °C stage.
 */
function LightingChain({ state }: { state: BuildingLightingState }) {
  const afterTransmission = state.outdoorLux * BUILDING_LIGHTING.VISIBLE_TRANSMISSION
  const stages: { label: string; value: number; display: string; unit: string; accent: string; note: string; kind: 'lux' | 'pct' | 'kw' }[] = [
    { label: 'Outdoor Illuminance', value: state.outdoorLux, display: Math.round(state.outdoorLux).toLocaleString(), unit: 'lux', accent: ACCENT.outdoor, note: 'Estimated from façade effective irradiance × luminous efficacy', kind: 'lux' },
    { label: 'After Envelope Transmission', value: afterTransmission, display: Math.round(afterTransmission).toLocaleString(), unit: 'lux', accent: ACCENT.transmitted, note: `${Math.round(BUILDING_LIGHTING.VISIBLE_TRANSMISSION * 100)}% visible transmittance survives the glazing`, kind: 'lux' },
    { label: 'Indoor Illuminance', value: state.indoorLux, display: Math.round(state.indoorLux).toLocaleString(), unit: 'lux', accent: ACCENT.indoor, note: 'Façade openness applied', kind: 'lux' },
    { label: 'Target Illuminance', value: state.targetLux, display: Math.round(state.targetLux).toLocaleString(), unit: 'lux', accent: ACCENT.target, note: 'EN 12464-1 office work-area target', kind: 'lux' },
    { label: 'Lighting Requirement', value: state.lightingLevel * 100, display: `${Math.round(state.lightingLevel * 100)}`, unit: '%', accent: ACCENT.requirement, note: 'Daylight-harvesting control level, lagged for smooth transitions', kind: 'pct' },
    { label: 'Lighting Electrical Demand', value: state.lightingElectricalKW, display: state.lightingElectricalKW.toFixed(1), unit: 'kW el', accent: ACCENT.artificial, note: 'Added to the Lighting category', kind: 'kw' },
  ]

  const maxLux = Math.max(0.001, ...stages.filter((s) => s.kind === 'lux').map((s) => s.value))

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5">
        <Sun className="h-3 w-3 shrink-0" style={{ color: ACCENT.indoor }} />
        <p className="text-[10px] font-medium uppercase tracking-wider text-white/50">Lighting Chain</p>
      </div>
      {stages.map((s, i) => (
        <div key={s.label}>
          <div className="rounded-xl bg-white/[0.03] px-2.5 py-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[9px] font-medium uppercase tracking-wider text-white/45">{s.label}</span>
              <span className="font-mono text-[12px] font-semibold tabular-nums" style={{ color: s.accent }}>
                {s.display}
                <span className="ml-0.5 text-[9px] text-white/50">{s.unit}</span>
              </span>
            </div>
            {s.kind === 'lux' && (
              <div className="relative mt-1 h-1 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full transition-[width] duration-300"
                  style={{ width: `${Math.min(100, (s.value / maxLux) * 100)}%`, background: s.accent }}
                />
              </div>
            )}
            <p className="mt-1 text-[8.5px] leading-snug text-white/30">{s.note}</p>
          </div>
          {i < stages.length - 1 && (
            <div className="flex justify-center py-0.5">
              <ArrowDown className="h-3 w-3 text-white/15" />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// =============================================================================
// Engineering Model & Calculations — collapsible, educational section
// =============================================================================

/** The guide's own six-stage pipeline framing, at the highest level. */
const PIPELINE_STAGES = [
  'Outdoor Illuminance',
  'Envelope Transmission',
  'Indoor Daylight',
  'Target Illuminance',
  'Lighting Requirement',
  'Lighting Electrical Demand',
] as const

/**
 * The equations as actually implemented in `buildingLighting.ts`. Formula text
 * is maintained by hand (there is no runtime formula-extraction from TS source)
 * but every row names the exact function it mirrors so a reviewer can verify
 * the two never drift apart.
 */
const EQUATIONS: { title: string; formula: string; explanation: string; source: string }[] = [
  {
    title: 'Outdoor Illuminance',
    formula: 'E_out = E_eff × k_lum',
    explanation:
      'Façade effective irradiance (the SAME normalised quantity facadeSolarGainKW consumes), denormalised to W/m² and converted through the daylight luminous efficacy.',
    source: 'outdoorIlluminanceLux()',
  },
  {
    title: 'Indoor Illuminance',
    formula: 'E_in = E_out × τ_vis × openness',
    explanation:
      'Outdoor illuminance filtered by the glazing’s visible transmittance, then by how open the adaptive façade blades currently are.',
    source: 'indoorIlluminanceLux()',
  },
  {
    title: 'Lighting Control Target (proportional)',
    formula: 'L_target = clamp(1 − E_in / E_target, 0, 1)\nL_target = max(L_target, L_min)  if L_target > 0',
    explanation:
      'Linear proportional daylight harvesting: fully daylit needs none, fully dark needs all of it. Floored at the control minimum once any artificial contribution is needed, to avoid chattering near zero.',
    source: 'lightingControlTarget()',
  },
  {
    title: 'Controller Response (exponential approach)',
    formula: 'α = 1 − exp(−Δt / τ)\nL ← L + α × (L_target − L)',
    explanation:
      'The commanded level chases its target smoothly rather than switching abruptly — stable for any Δt, and independent of frame rate because Δt is SIMULATED time.',
    source: 'BuildingLightingEngine.update()',
  },
  {
    title: 'Artificial Lighting Demand',
    formula: 'P_artificial = ρ_art × A_floor × occupancy × L',
    explanation:
      'The daylight-responsive circuit’s rated capacity, scaled by occupancy (reused from BuildingEnergyEngine, not re-derived) and by the controller’s commanded level.',
    source: 'BuildingLightingEngine.update()',
  },
  {
    title: 'Lighting Savings',
    formula: 'P_saved = ρ_art × A_floor × occupancy × (1 − L)',
    explanation:
      'What the daylight-responsive circuit would have drawn at full rated power with no daylight harvesting, minus what it actually draws now.',
    source: 'BuildingLightingEngine.update()',
  },
]

/** Constant rows — every VALUE is read from `BUILDING_LIGHTING`, never retyped. */
const CONSTANT_ROWS: {
  id: keyof typeof BUILDING_LIGHTING
  label: string
  format: (v: number) => string
  displayOnly?: boolean
}[] = [
  { id: 'TARGET_INDOOR_LUX', label: 'Target Indoor Illuminance', format: (v) => `${v.toLocaleString()} lux` },
  { id: 'VISIBLE_TRANSMISSION', label: 'Envelope Visible Transmission', format: (v) => `${Math.round(v * 100)}%` },
  { id: 'DAYLIGHT_LUMINOUS_EFFICACY_LM_PER_W', label: 'Daylight Luminous Efficacy', format: (v) => `${v} lm/W` },
  { id: 'ARTIFICIAL_LIGHTING_DENSITY_WM2', label: 'Daylight-Responsive Lighting Density', format: (v) => `${v} W/m²` },
  { id: 'LIGHTING_CONTROL_MIN', label: 'Lighting Control Minimum', format: (v) => `${Math.round(v * 100)}%` },
  { id: 'RESPONSE_TIME_SIM_SECONDS', label: 'Controller Response Time', format: (v) => `${v} sim. s` },
  { id: 'DAYLIT_STATUS_THRESHOLD', label: 'Fully Daylit Threshold', format: (v) => `≤${Math.round(v * 100)}%`, displayOnly: true },
  { id: 'FULL_ARTIFICIAL_STATUS_THRESHOLD', label: 'Full Artificial Threshold', format: (v) => `≥${Math.round(v * 100)}%`, displayOnly: true },
  { id: 'OCCUPIED_STATUS_THRESHOLD', label: 'Occupied Threshold', format: (v) => `${Math.round(v * 100)}%`, displayOnly: true },
]

/** Plain assumptions, so the model is never mistaken for measured lux-meter or sub-metered data. */
const ASSUMPTIONS = [
  'Outdoor and indoor illuminance are estimated from effective solar irradiance via a fixed daylight luminous efficacy — there is no simulated lux sensor.',
  'Visible transmission and the daylight-responsive lighting density are fixed constants, not measured per-glazing-unit or per-fixture values.',
  'The daylight-harvesting controller is a single building-mean first-order lag, not a per-zone photosensor network.',
  'Base Lighting (BuildingEnergyEngine) and Artificial Lighting (this engine) represent different circuits — non-daylight-responsive vs. daylight-responsive — sized so their sum matches the pre-Stage-7.10 total lighting peak at full occupancy with zero daylight.',
  'Lighting Savings are relative to a no-daylight-harvesting baseline (artificial lighting always at full rated power when occupied), not a measured historical baseline.',
]

function EngineeringDetails({ state }: { state: BuildingLightingState }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.02]">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.03]"
      >
        <BookOpen className="h-3.5 w-3.5 shrink-0 text-white/50" />
        <p className="text-[10px] font-medium uppercase tracking-wider text-white/70">
          Engineering Model &amp; Calculations
        </p>
        <ChevronDown className={`ml-auto h-3.5 w-3.5 text-white/40 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="space-y-3 border-t border-white/5 bg-black/20 p-3">
          {/* ── Pipeline overview ────────────────────────────────────────────── */}
          <SubSection title="Lighting Response Pipeline">
            <div className="space-y-0.5">
              {PIPELINE_STAGES.map((label, i) => (
                <div key={label}>
                  <div className="rounded-lg bg-white/[0.04] px-2.5 py-1 text-center text-[9.5px] font-medium text-white/70">
                    {label}
                  </div>
                  {i < PIPELINE_STAGES.length - 1 && (
                    <div className="flex justify-center py-0.5">
                      <ArrowDown className="h-2.5 w-2.5 text-white/15" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </SubSection>

          {/* ── Equations ────────────────────────────────────────────────────── */}
          <SubSection title="Engineering Equations">
            <div className="space-y-1.5">
              {EQUATIONS.map((eq) => (
                <div key={eq.title} className="rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-white/55">{eq.title}</p>
                    <p className="text-[8px] text-white/25">{eq.source}</p>
                  </div>
                  <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[10.5px] leading-snug text-emerald-300/90">
                    {eq.formula}
                  </pre>
                  <p className="mt-1 text-[9.5px] leading-snug text-white/50">{eq.explanation}</p>
                </div>
              ))}
            </div>
          </SubSection>

          {/* ── Constants ────────────────────────────────────────────────────── */}
          <SubSection title="Engineering Constants">
            <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded-lg bg-white/[0.03] p-2.5">
              {CONSTANT_ROWS.map((c) => (
                <div key={c.id} className="contents">
                  <span className="text-[10px] text-white/50">
                    {c.label}
                    {c.displayOnly && <span className="ml-1 text-[8px] text-white/25">(status only)</span>}
                  </span>
                  <span className="text-right font-mono text-[10px] text-white/85">{c.format(BUILDING_LIGHTING[c.id])}</span>
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-[8.5px] leading-snug text-white/25">
              Every value above is read live from <code className="text-white/35">BUILDING_LIGHTING</code> in{' '}
              <code className="text-white/35">buildingLighting.ts</code> — a constant changed in the engine updates
              here automatically.
            </p>
          </SubSection>

          {/* ── References ───────────────────────────────────────────────────── */}
          <SubSection title="Engineering References">
            <div className="space-y-1.5">
              {BUILDING_LIGHTING_REFERENCES.map((ref) => (
                <div key={ref.id} className="rounded-lg bg-white/[0.03] px-2.5 py-1.5">
                  <p className="text-[9.5px] font-semibold text-white/70">{ref.citation}</p>
                  <p className="mt-0.5 text-[9px] leading-snug text-white/45">{ref.appliesTo}</p>
                </div>
              ))}
            </div>
          </SubSection>

          {/* ── Live calculation breakdown ───────────────────────────────────── */}
          <SubSection title="Current Calculation Breakdown" defaultOpen>
            <LiveBreakdown state={state} />
          </SubSection>

          {/* ── Assumptions ──────────────────────────────────────────────────── */}
          <SubSection title="Engineering Assumptions">
            <ul className="space-y-1.5">
              {ASSUMPTIONS.map((a) => (
                <li key={a} className="flex items-start gap-1.5">
                  <ShieldQuestion className="mt-0.5 h-3 w-3 shrink-0 text-white/25" />
                  <span className="text-[9.5px] leading-snug text-white/55">{a}</span>
                </li>
              ))}
            </ul>
          </SubSection>
        </div>
      )}
    </div>
  )
}

/**
 * Shows the live chain "showing its work" — every number pulled straight from
 * `state` (or, for the two intermediate transmission/openness products, plain
 * arithmetic on two already-published numbers — see the module header).
 */
function LiveBreakdown({ state }: { state: BuildingLightingState }) {
  const afterTransmission = state.outdoorLux * BUILDING_LIGHTING.VISIBLE_TRANSMISSION
  return (
    <div className="space-y-0.5">
      <BreakdownCard label="Outdoor Illuminance" value={state.outdoorLux} unit="lux" accent={ACCENT.outdoor} decimals={0} />
      <Operator symbol="×" />
      <BreakdownCard
        label="Visible Transmission"
        value={BUILDING_LIGHTING.VISIBLE_TRANSMISSION}
        unit=""
        accent={ACCENT.neutral}
        decimals={2}
      />
      <Operator symbol="=" />
      <BreakdownCard label="After Transmission" value={afterTransmission} unit="lux" accent={ACCENT.transmitted} decimals={0} />
      <Operator symbol="×" />
      <BreakdownCard label="Façade Openness" value={state.facadeOpenness} unit="" accent={ACCENT.neutral} decimals={2} />
      <Operator symbol="=" />
      <BreakdownCard label="Indoor Illuminance" value={state.indoorLux} unit="lux" accent={ACCENT.indoor} decimals={0} />
      <Operator symbol="↓" />
      <BreakdownCard label="Target Illuminance" value={state.targetLux} unit="lux" accent={ACCENT.target} decimals={0} />
      <Operator symbol="↓" />
      <BreakdownCard label="Lighting Requirement" value={state.lightingLevel * 100} unit="%" accent={ACCENT.requirement} decimals={0} />
      <Operator symbol="↓" />
      <BreakdownCard label="Lighting Electrical Demand" value={state.lightingElectricalKW} unit="kW el" accent={ACCENT.artificial} />
      <Operator symbol="↓" />
      <BreakdownCard label="Lighting Savings" value={state.lightingSavingsKW} unit="kW" accent={ACCENT.saving} />
      <p className="pt-1 text-[8.5px] leading-snug text-white/25">
        Updates live with the simulation — every figure above is this tick&apos;s published{' '}
        <code className="text-white/35">SimSnapshot.lighting</code>, not a snapshot taken when the panel opened.
      </p>
    </div>
  )
}

function BreakdownCard({
  label,
  value,
  unit,
  accent,
  decimals = 1,
}: {
  label: string
  value: number
  unit: string
  accent: string
  decimals?: number
}) {
  return (
    <div className="rounded-lg bg-white/[0.04] px-2.5 py-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[9px] uppercase tracking-wider text-white/45">{label}</span>
        <span className="font-mono text-[11px] font-semibold tabular-nums" style={{ color: accent }}>
          {value.toFixed(decimals)}
          {unit && <span className="ml-0.5 text-[8.5px] text-white/45">{unit}</span>}
        </span>
      </div>
    </div>
  )
}

function Operator({ symbol }: { symbol: string }) {
  return <div className="flex justify-center py-0.5 font-mono text-[10px] text-white/25">{symbol}</div>
}

/** Small nested collapsible — matches `BuildingThermalPanel.tsx`'s `SubSection`. */
function SubSection({
  title,
  children,
  defaultOpen = false,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-black/20">
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

/** Metric card — identical geometry to `BuildingThermalPanel.tsx`'s `Metric`. */
function Metric({
  label,
  value,
  unit,
  secondary,
  accent,
  title,
  className,
}: {
  label: string
  value: string
  unit?: string
  secondary?: string
  accent?: string
  title?: string
  className?: string
}) {
  return (
    <div className={`rounded-xl bg-white/[0.03] px-2.5 py-1.5 ${className ?? ''}`} title={title}>
      <p className="flex items-center gap-1 text-[9px] font-medium uppercase tracking-wider text-white/45">
        {label}
        {title && <Info className="h-2.5 w-2.5 shrink-0 text-white/25" />}
      </p>
      <p className="font-mono text-[13px] font-semibold tabular-nums" style={{ color: accent ?? '#fff' }}>
        {value}
        {unit && <span className="ml-0.5 text-[9px] text-white/50">{unit}</span>}
        {secondary && <span className="ml-1 text-[9px] font-normal text-white/40">{secondary}</span>}
      </p>
    </div>
  )
}

