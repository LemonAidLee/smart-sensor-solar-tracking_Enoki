'use client'

import { useState } from 'react'
import { ArrowDown, BookOpen, ChevronDown, Flame, Info, ShieldQuestion, Sun, Thermometer, Wind, Zap } from 'lucide-react'
import { useTwinStore } from '@/lib/engine/store'
import {
  BUILDING_THERMAL,
  BUILDING_THERMAL_REFERENCES,
  type BuildingThermalState,
  type CoolingStatus,
} from '@/lib/engine/buildingThermal'

/**
 * BuildingThermalPanel — the dedicated engineering panel for the Building
 * Thermal Response Engine (Stage 7.9, extended in Stage 7.9.2 to the complete
 * thermal cycle), the bridge between the Adaptive Façade and the BEMS.
 *
 * It renders the complete cycle top to bottom, exactly the order
 * `BuildingThermalEngine.update()` computes it:
 *
 *   Solar Heat → Building Heat → Cooling Requirement → HVAC Response
 *     → Conditioned Indoor Environment
 *
 * ── What this panel is not ───────────────────────────────────────────────────
 * It owns no logic. Every value is read from `SimSnapshot.thermal`, the object
 * `BuildingThermalEngine` publishes once per environmental tick — nothing here
 * re-derives envelope transmission, thermal inertia, the cooling-plant COP
 * conversion or the HVAC setpoint droop (guide §6). The "Engineering Model &
 * Calculations" section reads its constants and citations straight off
 * `BUILDING_THERMAL` / `BUILDING_THERMAL_REFERENCES` for the same reason — a
 * constant changed in the engine is reflected here with no UI edit required.
 */

/** Orange = heat entering, cyan/blue = cooling removing it, green = comfort delivered. */
const ACCENT = {
  outdoor: '#fb923c',
  solar: '#f59e0b',
  envelope: '#f97316',
  convective: '#fbbf24',
  radiant: '#fb7185',
  indoor: '#ef4444',
  removed: '#22d3ee',
  electrical: '#38bdf8',
  comfort: '#34d399',
  neutral: '#94a3b8',
} as const

const STATUS_ACCENT: Record<CoolingStatus, string> = {
  Standby: ACCENT.neutral,
  Cooling: ACCENT.envelope,
  Recovering: ACCENT.removed,
  'Maintaining Setpoint': ACCENT.comfort,
}

export function BuildingThermalBody() {
  // Subscribe to the WHOLE snapshot, not `s.snapshot.thermal` directly.
  // `BuildingThermalEngine.getState()` returns the SAME mutated-in-place
  // object every tick (zero-allocation, by design — see `buildingThermal.ts`),
  // so a selector on the nested field is referentially stable across polls and
  // zustand's default `Object.is` check would never fire a re-render for THIS
  // top-level component (it has no parent already re-rendering it for other
  // reasons, unlike e.g. `BatteryCard` inside `RooftopPvBody`). `sim.snapshot()`
  // constructs a fresh top-level object every poll (`simulation.ts`), so
  // subscribing to it is what every other top-level panel body does
  // (`RooftopPvBody`, `WeatherPanelBody`, `PbifDecisionBody`) — matched here.
  const snap = useTwinStore((s) => s.snapshot)
  const t = snap.thermal

  const settling = t.thermalLag > BUILDING_THERMAL.COOLING_STATUS_SETTLED_BAND_KW
  const releasing = t.thermalLag < -BUILDING_THERMAL.COOLING_STATUS_SETTLED_BAND_KW
  const lagLabel = settling ? 'Loading thermal mass' : releasing ? 'Releasing stored heat' : 'Settled'

  return (
    <div className="space-y-3">
      {/* ── BUILDING ENERGY BALANCE ──────────────────────────────────────────── */}
      <EnergyBalanceCard state={t} />

      {/* ── THERMAL CHAIN ────────────────────────────────────────────────────── */}
      <ThermalChain state={t} />

      {/* ── THERMAL STATE (Environmental / HVAC / System) ───────────────────── */}
      <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-2.5">
        <div className="mb-1.5 flex items-center gap-1.5">
          <Thermometer className="h-3 w-3 shrink-0" style={{ color: ACCENT.indoor }} />
          <p className="text-[10px] font-medium uppercase tracking-wider text-white/50">Thermal State</p>
        </div>

        <GroupLabel>Environmental</GroupLabel>
        <div className="grid grid-cols-2 gap-1.5">
          <Metric label="Outdoor Temperature" value={t.outdoorTempC.toFixed(1)} unit="°C" accent={ACCENT.outdoor} />
          <Metric
            label="Free-Floating Indoor"
            value={t.indoorTemperatureProxy.toFixed(1)}
            unit="°C"
            secondary="est."
            accent={ACCENT.indoor}
            title="Estimated Free-Floating Indoor Temperature — the temperature indoor air would drift toward if the HVAC provided no cooling at all. Not what an occupant experiences; see Conditioned Indoor Temperature for that."
          />
          <Metric label="Façade Openness" value={`${Math.round(t.facadeOpenness * 100)}`} unit="%" className="col-span-2" />
        </div>

        <GroupLabel>HVAC</GroupLabel>
        <div className="grid grid-cols-2 gap-1.5">
          <Metric label="HVAC Setpoint" value={BUILDING_THERMAL.HVAC_SETPOINT_C.toFixed(1)} unit="°C" accent={ACCENT.comfort} />
          <Metric
            label="Conditioned Indoor"
            value={t.conditionedIndoorTemperatureC.toFixed(1)}
            unit="°C"
            secondary="occupied"
            accent={ACCENT.comfort}
            title="Estimated indoor air temperature AFTER HVAC conditioning — what an occupant actually experiences."
          />
          <Metric
            label="Cooling Status"
            value={t.coolingStatus}
            accent={STATUS_ACCENT[t.coolingStatus]}
            className="col-span-2"
          />
        </div>

        <GroupLabel>System</GroupLabel>
        <div className="grid grid-cols-2 gap-1.5">
          <Metric
            label="Thermal Lag"
            value={t.thermalLag >= 0 ? `+${t.thermalLag.toFixed(1)}` : t.thermalLag.toFixed(1)}
            unit="kW"
            secondary={lagLabel}
            accent={settling ? ACCENT.envelope : releasing ? ACCENT.removed : ACCENT.neutral}
          />
          <Metric
            label="Time Constant"
            value={`${Math.round(BUILDING_THERMAL.TIME_CONSTANT_SIM_SECONDS / 60)}`}
            unit="sim. min"
          />
        </div>
        <p className="mt-1.5 text-[8.5px] leading-snug text-white/25">
          Free-floating and conditioned temperatures are illustrative estimates, not fed into any electrical
          calculation.
        </p>
      </div>

      {/* ── ENGINEERING MODEL & CALCULATIONS (progressive disclosure) ───────── */}
      <EngineeringDetails state={t} />
    </div>
  )
}

/** Small uppercase group divider inside the Thermal State card. */
function GroupLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-1 mt-2.5 text-[8px] font-semibold uppercase tracking-[0.14em] text-white/30 first:mt-0">{children}</p>
}

/**
 * The Building Energy Balance summary — the single systems-level read: heat
 * enters, the HVAC removes it, electricity is what that removal costs, and the
 * result is the comfort an occupant experiences. Replaces the narrower
 * "Solar-Induced Cooling Load" strip with the full four-quantity story.
 */
function EnergyBalanceCard({ state }: { state: BuildingThermalState }) {
  const stable = state.coolingStatus === 'Maintaining Setpoint' || state.coolingStatus === 'Standby'
  return (
    <div
      className="rounded-2xl border p-3"
      style={{ borderColor: `${ACCENT.electrical}33`, background: `${ACCENT.electrical}0d` }}
    >
      <p className="mb-2 text-center text-[9px] font-semibold uppercase tracking-[0.18em] text-white/40">
        Building Energy Balance
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        <BalanceRow icon={Sun} label="Solar Heat Entering" value={`${state.indoorHeatGainKW.toFixed(1)} kW`} accent={ACCENT.solar} />
        <BalanceRow icon={Wind} label="HVAC Cooling Removed" value={`${state.coolingRequiredKW.toFixed(1)} kW`} accent={ACCENT.removed} />
        <BalanceRow icon={Zap} label="HVAC Electricity" value={`${state.coolingLoadKW.toFixed(1)} kW`} accent={ACCENT.electrical} />
        <BalanceRow
          icon={Thermometer}
          label="Indoor Comfort"
          value={`${state.conditionedIndoorTemperatureC.toFixed(1)}°C`}
          accent={ACCENT.comfort}
          badge={stable ? '✓ Stable' : state.coolingStatus}
        />
      </div>
      <p className="mt-2 text-center text-[8.5px] leading-snug text-white/30">
        Heat enters the building → the HVAC removes it → electricity is what that removal costs.
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
 * The seven-stage chain, drawn as a vertical flow with a connecting arrow
 * between each stage — mirrors the guide's own diagram (§13, expanded §5 in
 * Stage 7.9.2) so the panel and the spec read as the same picture. Only the
 * kW-valued stages contribute to the shared proportional bar scale; the final
 * °C stage renders without one (comparing kW and °C on one bar would be
 * meaningless).
 */
function ThermalChain({ state }: { state: BuildingThermalState }) {
  const stages: { label: string; value: string; unit: string; accent: string; note: string; kind: 'kw' | 'temp' }[] = [
    { label: 'Outdoor Temperature', value: state.outdoorTempC.toFixed(1), unit: '°C', accent: ACCENT.outdoor, note: 'Ambient dry-bulb', kind: 'temp' },
    { label: 'Façade Solar Gain', value: state.facadeSolarGainKW.toFixed(1), unit: 'kW th', accent: ACCENT.solar, note: 'Admitted through the skin to the glazing', kind: 'kw' },
    { label: 'Envelope Heat Gain', value: state.envelopeHeatGainKW.toFixed(1), unit: 'kW th', accent: ACCENT.envelope, note: `${Math.round(BUILDING_THERMAL.ENVELOPE_TRANSMISSION_EFFICIENCY * 100)}% crosses the assembly`, kind: 'kw' },
    { label: 'Indoor Heat Gain', value: state.indoorHeatGainKW.toFixed(1), unit: 'kW th', accent: ACCENT.indoor, note: 'After thermal-mass lag', kind: 'kw' },
    { label: 'Cooling Requirement (Thermal)', value: state.coolingRequiredKW.toFixed(1), unit: 'kW th', accent: ACCENT.removed, note: 'Heat the HVAC must remove', kind: 'kw' },
    { label: 'HVAC Electrical Demand', value: state.coolingLoadKW.toFixed(1), unit: 'kW el', accent: ACCENT.electrical, note: 'Electrical demand added to HVAC', kind: 'kw' },
    { label: 'Conditioned Indoor Temperature', value: state.conditionedIndoorTemperatureC.toFixed(1), unit: '°C', accent: ACCENT.comfort, note: 'What an occupant actually experiences', kind: 'temp' },
  ]

  const maxKW = Math.max(0.001, ...stages.filter((s) => s.kind === 'kw').map((s) => parseFloat(s.value)))

  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5">
        <Flame className="h-3 w-3 shrink-0" style={{ color: ACCENT.envelope }} />
        <p className="text-[10px] font-medium uppercase tracking-wider text-white/50">Thermal Chain</p>
      </div>
      {stages.map((s, i) => (
        <div key={s.label}>
          <div className="rounded-xl bg-white/[0.03] px-2.5 py-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[9px] font-medium uppercase tracking-wider text-white/45">{s.label}</span>
              <span className="font-mono text-[12px] font-semibold tabular-nums" style={{ color: s.accent }}>
                {s.value}
                <span className="ml-0.5 text-[9px] text-white/50">{s.unit}</span>
              </span>
            </div>
            {s.kind === 'kw' && (
              <div className="relative mt-1 h-1 w-full overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full transition-[width] duration-300"
                  style={{ width: `${Math.min(100, (parseFloat(s.value) / maxKW) * 100)}%`, background: s.accent }}
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

/** The Objective diagram's own five-stage framing — the complete cycle, at the highest level. */
const PIPELINE_STAGES = [
  'Solar Heat',
  'Building Heat',
  'Cooling Requirement',
  'HVAC Response',
  'Conditioned Indoor Environment',
] as const

/**
 * The equations as actually implemented in `buildingThermal.ts`. Formula text
 * is maintained by hand (there is no runtime formula-extraction from TS source)
 * but every row is cross-checked against, and names, the exact function or line
 * it mirrors so a reviewer can verify the two never drift apart.
 */
const EQUATIONS: { title: string; formula: string; explanation: string; source: string }[] = [
  {
    title: 'Envelope Heat Gain',
    formula: 'Q_env = Q_facade × η_env',
    explanation:
      'Façade solar gain crossing the full envelope assembly, net of frame/edge conduction and cavity re-radiation losses.',
    source: 'envelopeHeatGainKW()',
  },
  {
    title: 'Convective / Radiant Split',
    formula: 'f_conv = f_base + f_bonus × openness\nQ_conv = Q_env × f_conv\nQ_radiant,target = Q_env × (1 − f_conv)',
    explanation:
      'The convective share loads room air immediately; the radiant share is absorbed by thermal mass first. An open façade cavity ventilates faster, so the convective share rises with openness.',
    source: 'convectiveFraction()',
  },
  {
    title: 'Thermal Lag (exponential approach)',
    formula: 'α = 1 − exp(−Δt / τ)',
    explanation:
      'The fraction of the remaining gap the radiant release closes this tick — stable for any Δt, and independent of frame rate because Δt is SIMULATED time.',
    source: 'BuildingThermalEngine.update()',
  },
  {
    title: 'Radiant Release (integrated each tick)',
    formula: 'Q_release ← Q_release + α × (Q_radiant,target − Q_release)',
    explanation:
      'The thermal mass releases stored heat gradually toward its target rather than following it instantly — why a passing cloud does not instantly change the cooling load.',
    source: 'BuildingThermalEngine.update()',
  },
  {
    title: 'Indoor Heat Gain',
    formula: 'Q_indoor = Q_conv + Q_release',
    explanation: 'Immediate convective gain plus whatever the thermal mass is releasing right now.',
    source: 'BuildingThermalEngine.update()',
  },
  {
    title: 'Cooling Requirement',
    formula: 'Q_required = Q_indoor   (capacity assumed sufficient)',
    explanation:
      'The heat the HVAC must remove. Identical to indoor heat gain today; a future HVAC capacity limit would cap THIS term first, and everything downstream would inherit the cap automatically.',
    source: 'coolingRequiredKW',
  },
  {
    title: 'HVAC Electrical Demand',
    formula: 'Q_cooling = Q_required / COP',
    explanation:
      'Electrical power the cooling plant draws to reject the cooling requirement — the ONE value added to the BEMS HVAC category.',
    source: 'BuildingThermalEngine.update()',
  },
  {
    title: 'Conditioned Indoor Temperature',
    formula: 'T_conditioned = T_setpoint + Q_required × k_droop',
    explanation:
      'A small proportional-control droop, proportional to how hard the plant is working, keeps this a genuine estimate rather than a value pinned exactly to setpoint — even while capacity is assumed sufficient.',
    source: 'conditionedIndoorTemperatureC()',
  },
]

/** Constant rows — every VALUE is read from `BUILDING_THERMAL`, never retyped. */
const CONSTANT_ROWS: {
  id: keyof typeof BUILDING_THERMAL
  label: string
  format: (v: number) => string
  displayOnly?: boolean
}[] = [
  { id: 'ENVELOPE_TRANSMISSION_EFFICIENCY', label: 'Envelope Transmission Efficiency', format: (v) => `${Math.round(v * 100)}%` },
  { id: 'SOLAR_CONVECTIVE_FRACTION_BASE', label: 'Convective Fraction (base)', format: (v) => `${Math.round(v * 100)}%` },
  { id: 'OPENNESS_CONVECTIVE_BONUS', label: 'Convective Bonus (fully open)', format: (v) => `+${Math.round(v * 100)}%` },
  { id: 'TIME_CONSTANT_SIM_SECONDS', label: 'Thermal Time Constant', format: (v) => `${Math.round(v / 60)} simulated min` },
  { id: 'COOLING_PLANT_COP', label: 'Cooling Plant COP', format: (v) => v.toFixed(1) },
  { id: 'HVAC_SETPOINT_C', label: 'HVAC Setpoint', format: (v) => `${v.toFixed(1)} °C` },
  { id: 'HVAC_PROPORTIONAL_DROOP_C_PER_KW', label: 'Proportional Droop', format: (v) => `${v} °C/kW` },
  { id: 'COOLING_STATUS_STANDBY_KW', label: 'Standby Threshold', format: (v) => `${v} kW` },
  { id: 'COOLING_STATUS_SETTLED_BAND_KW', label: 'Settled Band', format: (v) => `±${v} kW` },
  { id: 'THERMAL_CAPACITANCE_KW_PER_C', label: 'Thermal Capacitance', format: (v) => `${v} kW/°C`, displayOnly: true },
  { id: 'IRRADIANCE_PROXY_COEFFICIENT_C_PER_WM2', label: 'Irradiance Proxy Coefficient', format: (v) => `${v} °C per W/m²`, displayOnly: true },
]

/** Section 8 — plain assumptions, so the model is never mistaken for a live simulation of the HVAC plant itself. */
const ASSUMPTIONS = [
  'Indoor temperature (both free-floating and conditioned) is estimated, not measured — there is no simulated indoor-air sensor.',
  'HVAC currently has sufficient cooling capacity: the cooling requirement is never capped, and the conditioned temperature reflects that.',
  'Internal gains from occupants and equipment remain handled entirely by BuildingEnergyEngine — this engine models the façade-driven thermal path only.',
  'Thermal mass uses a first-order (single time-constant) response, not a multi-node building simulation.',
  'Cooling plant COP is assumed constant, not a function of outdoor temperature or part-load ratio.',
  'Indoor comfort assumes the HVAC can always maintain setpoint — see the "Forward-Ready Architecture" note above `coolingRequiredKW` for how a future capacity limit would relax this.',
]

function EngineeringDetails({ state }: { state: BuildingThermalState }) {
  const [open, setOpen] = useState(false)
  const radiantFractionBase = 1 - BUILDING_THERMAL.SOLAR_CONVECTIVE_FRACTION_BASE

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
          <SubSection title="Thermal Response Pipeline">
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
                    {c.displayOnly && <span className="ml-1 text-[8px] text-white/25">(display only)</span>}
                  </span>
                  <span className="text-right font-mono text-[10px] text-white/85">{c.format(BUILDING_THERMAL[c.id])}</span>
                </div>
              ))}
              <div className="contents">
                <span className="text-[10px] text-white/50">
                  Radiant Fraction (base)
                  <span className="ml-1 text-[8px] text-white/25">derived: 1 − convective</span>
                </span>
                <span className="text-right font-mono text-[10px] text-white/85">{Math.round(radiantFractionBase * 100)}%</span>
              </div>
            </div>
            <p className="mt-1.5 text-[8.5px] leading-snug text-white/25">
              Every value above is read live from <code className="text-white/35">BUILDING_THERMAL</code> in{' '}
              <code className="text-white/35">buildingThermal.ts</code> — a constant changed in the engine updates
              here automatically.
            </p>
          </SubSection>

          {/* ── References ───────────────────────────────────────────────────── */}
          <SubSection title="Engineering References">
            <div className="space-y-1.5">
              {BUILDING_THERMAL_REFERENCES.map((ref) => (
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
 * `state`, nothing recomputed. Extended (Stage 7.9.2) past the cooling load to
 * the HVAC electrical demand and the conditioned indoor temperature, so the
 * breakdown ends where the occupant's comfort does, not where the electrical
 * accounting does.
 */
function LiveBreakdown({ state }: { state: BuildingThermalState }) {
  return (
    <div className="space-y-0.5">
      <BreakdownCard label="Façade Solar Gain" value={state.facadeSolarGainKW} unit="kW th" accent={ACCENT.solar} />
      <Operator symbol="×" />
      <BreakdownCard
        label="Envelope Efficiency"
        value={BUILDING_THERMAL.ENVELOPE_TRANSMISSION_EFFICIENCY}
        unit=""
        accent={ACCENT.neutral}
        decimals={2}
      />
      <Operator symbol="=" />
      <BreakdownCard label="Envelope Heat Gain" value={state.envelopeHeatGainKW} unit="kW th" accent={ACCENT.envelope} />
      <Operator symbol="↓" />
      <div className="grid grid-cols-2 gap-1.5">
        <BreakdownCard label="Convective Portion" value={state.convectiveKW} unit="kW th" accent={ACCENT.convective} compact />
        <BreakdownCard label="Radiant Portion" value={state.envelopeHeatGainKW - state.convectiveKW} unit="kW th" accent={ACCENT.radiant} compact />
      </div>
      <Operator symbol="↓" />
      <BreakdownCard label="Radiant Release" value={state.radiantReleaseKW} unit="kW th" accent={ACCENT.radiant} />
      <Operator symbol="↓" />
      <BreakdownCard label="Indoor Heat Gain" value={state.indoorHeatGainKW} unit="kW th" accent={ACCENT.indoor} />
      <Operator symbol="↓" />
      <BreakdownCard label="Cooling Requirement" value={state.coolingRequiredKW} unit="kW th" accent={ACCENT.removed} />
      <Operator symbol="↓" />
      <BreakdownCard label="HVAC Electrical Demand" value={state.coolingLoadKW} unit="kW el" accent={ACCENT.electrical} />
      <Operator symbol="↓" />
      <BreakdownCard label="Conditioned Indoor Temperature" value={state.conditionedIndoorTemperatureC} unit="°C" accent={ACCENT.comfort} />
      <p className="pt-1 text-[8.5px] leading-snug text-white/25">
        Updates live with the simulation — every figure above is this tick&apos;s published{' '}
        <code className="text-white/35">SimSnapshot.thermal</code>, not a snapshot taken when the panel opened.
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
  compact = false,
}: {
  label: string
  value: number
  unit: string
  accent: string
  decimals?: number
  compact?: boolean
}) {
  return (
    <div className={`rounded-lg bg-white/[0.04] px-2.5 ${compact ? 'py-1' : 'py-1.5'}`}>
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

/** Small nested collapsible — matches `CyberPhysicalPipeline.tsx`'s `SubSection`. */
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

/**
 * Metric card — identical geometry to the other engineering panels' `Metric`.
 * `title`, when given, renders as a native tooltip (the same lightweight
 * convention `RooftopPvPanel`'s reserve-floor marker already uses) plus a
 * small info glyph so the presence of an explanation is discoverable without
 * hovering first.
 */
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
