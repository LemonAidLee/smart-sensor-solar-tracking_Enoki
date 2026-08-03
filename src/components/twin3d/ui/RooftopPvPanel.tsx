'use client'

import { useState } from 'react'
import {
  Activity,
  BatteryCharging,
  Building2,
  Coins,
  Leaf,
  Plug,
  Sun,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useTwinStore } from '@/lib/engine/store'
import { getSimulation } from '@/lib/engine/simulation'
import {
  BATTERY_SPEC,
  GRID_SPEC,
  PV_INVERTER_SPEC,
  PV_MODULE_SPEC,
  type EquipmentSpec,
} from '@/lib/engine/pvEquipment'
import { DEFAULT_C_RATE } from '@/lib/engine/battery'

/**
 * RooftopPvPanel — the dedicated engineering panel for the Rooftop PV Plant and
 * the Building Energy Management System it feeds.
 *
 * ── Why this is its own top-level panel ──────────────────────────────────────
 * The building and the PV plant are independent engineering subsystems that
 * share a site. `pvArray` / `pvElectrical` / `pvInverter` / `buildingEnergy` are
 * siblings of the adaptive skin on `Simulation`, not children of it, and the PV
 * array is deliberately excluded from the Cyber-Physical Façade pipeline
 * (Stage 7.1.5). The UI mirrors that: Building describes the building, Rooftop
 * PV describes the plant and where its power goes.
 *
 * ── Specification vs telemetry ───────────────────────────────────────────────
 * Each subsystem section separates what was *specified* (manufacturer, model,
 * quantity, nameplate ratings — static, from the project report via
 * `pvEquipment.ts`) from what is *happening now* (power, efficiency, energy
 * flow — live, from `SimSnapshot`). This is how a commercial monitoring platform
 * presents a plant, and it keeps a fixed datasheet value from ever being
 * mistaken for a live reading.
 *
 * ── What this panel is not ───────────────────────────────────────────────────
 * It owns no logic. Every live value is read from the throttled snapshot the
 * engines already publish. Nothing here re-derives irradiance, power,
 * efficiency, clipping, demand or the energy balance — per guide §6 the
 * presentation layer displays what the engines computed and nothing more.
 *
 * ── Designed to grow ─────────────────────────────────────────────────────────
 * The panel is a vertical stack of `PvSection`s. Live subsystems and planned
 * ones (Battery, Grid, Financial, Carbon) use the SAME component; a planned
 * section differs only by `status="planned"`. Bringing a future stage online is
 * a content change inside one section, never another UI redesign.
 */

/** Subsystem accents. Amber = DC side, cyan = AC side, violet = building demand. */
const ACCENT = {
  dc: '#fbbf24',
  ac: '#22d3ee',
  load: '#a78bfa',
  battery: '#4ade80',
  grid: '#94a3b8',
  deficit: '#f87171',
  surplus: '#34d399',
  planned: '#64748b',
} as const

/** Inverter states that should read as an alarm rather than normal operation. */
const ALARM_STATES = new Set(['Clipping', 'Fault'])

export function RooftopPvBody() {
  const snap = useTwinStore((s) => s.snapshot)
  // Module count is a property of the generated array, not a metric — read it
  // straight off the engine (the same pattern the other engineering panels use).
  const totalModules = getSimulation().pvArray.getModules().length

  const clipping = snap.invOperatingState === 'Clipping'
  const alarm = ALARM_STATES.has(snap.invOperatingState)
  const bus = snap.energy.bus

  return (
    <div className="space-y-3">
      {/* ── PLANT SUMMARY ──────────────────────────────────────────────────── */}
      <PlantSummary
        state={snap.invOperatingState}
        acOutput={snap.invCurrentACOutput}
        dcOutput={snap.pvCurrentDCOutput}
        alarm={alarm}
      />

      {/* ── PV ARRAY ───────────────────────────────────────────────────────── */}
      <PvSection title="PV Array" icon={Sun} accent={ACCENT.dc}>
        <SpecBlock spec={PV_MODULE_SPEC} />
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <Metric label="Current DC Output" value={snap.pvCurrentDCOutput.toFixed(1)} unit="kW" accent={ACCENT.dc} />
          <Metric label="Installed (as built)" value={snap.pvInstalledCapacity.toFixed(2)} unit="kW" />
          <Metric label="Array Utilization" value={snap.pvUtilization.toFixed(1)} unit="%" className="col-span-2" />
          <div className="col-span-2 -mt-0.5">
            <Bar fraction={snap.pvUtilization / 100} accent={ACCENT.dc} />
          </div>
          <Metric label="Operating Modules" value={`${snap.pvOperatingModules}`} secondary={`/ ${totalModules}`} />
          <Metric label="Average Irradiance" value={`${snap.pvAverageIrradiance}`} unit="W/m²" />
        </div>
      </PvSection>

      {/* ── INVERTER ───────────────────────────────────────────────────────── */}
      <PvSection
        title="Inverter"
        icon={Zap}
        accent={ACCENT.ac}
        badge={clipping ? { label: 'Clipping', tone: 'alarm' } : undefined}
      >
        <SpecBlock spec={PV_INVERTER_SPEC} />
        <div className="mt-1.5 grid grid-cols-2 gap-1.5">
          <Metric
            label="Current AC Output"
            value={snap.invCurrentACOutput.toFixed(1)}
            unit="kW"
            accent={alarm ? ACCENT.deficit : ACCENT.ac}
          />
          <Metric label="Rated Capacity" value={snap.invRatedCapacityKW.toFixed(1)} unit="kW" />
          <Metric
            label="Efficiency"
            value={(snap.invEfficiency * 100).toFixed(1)}
            unit="%"
            accent={alarm ? ACCENT.deficit : undefined}
          />
          <Metric
            label="Operating State"
            value={snap.invOperatingState}
            accent={alarm ? ACCENT.deficit : undefined}
          />
          <Metric
            label="Clipping"
            value={clipping ? 'Active' : 'None'}
            secondary={clipping ? undefined : `${Math.max(0, snap.invRatedCapacityKW - snap.invCurrentACOutput).toFixed(1)} kW headroom`}
            accent={clipping ? ACCENT.deficit : undefined}
          />
          <Metric
            label="Conversion Loss"
            value={snap.invConversionLossKW.toFixed(1)}
            unit="kW"
            secondary="heat"
            accent={ACCENT.deficit}
          />
        </div>
      </PvSection>

      {/* ── BATTERY STORAGE (BESS) ─────────────────────────────────────────── */}
      <BatteryCard />

      {/* ── UTILITY GRID ───────────────────────────────────────────────────── */}
      <GridCard />

      {/* ── BUILDING ENERGY FLOW (BEMS) ────────────────────────────────────── */}
      <PvSection title="Building Energy Flow" icon={Building2} accent={ACCENT.load}>
        <EnergyFlow
          generation={bus.pvGenerationKW}
          load={bus.buildingLoadKW}
          pvToLoad={bus.pvToLoadKW}
          charge={bus.batteryChargeKW}
          discharge={bus.batteryDischargeKW}
          surplus={bus.surplusKW}
          gridImport={bus.requiredGridImportKW}
        />

        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <Metric label="Building Load" value={bus.buildingLoadKW.toFixed(1)} unit="kW" accent={ACCENT.load} />
          <Metric label="PV Generation" value={bus.pvGenerationKW.toFixed(1)} unit="kW" accent={ACCENT.ac} />
          <Metric
            label="Self Consumption"
            value={bus.selfConsumptionKW.toFixed(1)}
            unit="kW"
            secondary={`${Math.round(bus.selfConsumptionRatio * 100)}% of PV`}
          />
          <Metric label="Building Coverage" value={`${Math.round(bus.buildingCoverage * 100)}`} unit="%" />
          <Metric
            label="Battery Charge"
            value={bus.batteryChargeKW.toFixed(1)}
            unit="kW"
            accent={bus.batteryChargeKW > 0 ? ACCENT.battery : undefined}
          />
          <Metric
            label="Battery Discharge"
            value={bus.batteryDischargeKW.toFixed(1)}
            unit="kW"
            accent={bus.batteryDischargeKW > 0 ? ACCENT.battery : undefined}
          />
          <Metric
            label="Surplus Power"
            value={bus.surplusKW.toFixed(1)}
            unit="kW"
            accent={bus.surplusKW > 0 ? ACCENT.surplus : undefined}
          />
          <Metric
            label="Grid Import Req."
            value={bus.requiredGridImportKW.toFixed(1)}
            unit="kW"
            secondary="future"
            accent={bus.requiredGridImportKW > 0 ? ACCENT.deficit : undefined}
          />
        </div>

        <LoadBreakdown />
        <DailyEnergy />
      </PvSection>

      {/* ── RESERVED FOR FUTURE STAGES ─────────────────────────────────────── */}
      <PlannedSubsystems />
    </div>
  )
}

/* ── Plant summary strip ─────────────────────────────────────────────────── */
function PlantSummary({
  state,
  acOutput,
  dcOutput,
  alarm,
}: {
  state: string
  acOutput: number
  dcOutput: number
  alarm: boolean
}) {
  const color = alarm ? ACCENT.deficit : ACCENT.ac
  return (
    <div className="rounded-2xl border p-3" style={{ borderColor: `${color}33`, background: `${color}0d` }}>
      <div className="flex items-center justify-between">
        <p className="text-[9px] font-medium uppercase tracking-wider text-white/45">Plant AC Output</p>
        <span
          className="rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
          style={{ background: `${color}22`, color }}
        >
          {state}
        </span>
      </div>
      <p className="mt-0.5 font-mono text-2xl font-semibold tabular-nums" style={{ color }}>
        {acOutput.toFixed(1)}
        <span className="ml-1 text-[11px] font-normal text-white/45">kW AC</span>
      </p>
      <p className="mt-0.5 font-mono text-[10px] tabular-nums text-white/40">
        {dcOutput.toFixed(1)} kW DC from the array
      </p>
    </div>
  )
}

/* ── Battery Storage (BESS) ──────────────────────────────────────────────────
   State of charge, live power and the reason the battery is doing what it is
   doing. The reason line matters here: for the case-study building the PV plant
   never exceeds demand, so the battery legitimately spends most of the day
   parked at its reserve floor — and an unexplained idle reads as a fault. */
function BatteryCard() {
  const bat = useTwinStore((s) => s.snapshot.battery)
  const active = bat.state !== 'Idle'
  const accent = active ? ACCENT.battery : ACCENT.planned

  return (
    <PvSection
      title="Battery Storage"
      icon={BatteryCharging}
      accent={ACCENT.battery}
      badge={{ label: bat.state, tone: active ? 'muted' : 'muted' }}
    >
      <SpecBlock spec={BATTERY_SPEC} />

      {/* State of charge, with the reserve floor marked. */}
      <div className="mt-1.5 rounded-xl bg-white/[0.03] px-2.5 py-2">
        <div className="flex items-baseline justify-between">
          <span className="text-[9px] font-medium uppercase tracking-wider text-white/45">
            State of Charge
          </span>
          <span className="font-mono text-[13px] font-semibold tabular-nums" style={{ color: accent }}>
            {(bat.soc * 100).toFixed(1)}
            <span className="ml-0.5 text-[9px] text-white/50">%</span>
          </span>
        </div>
        <div className="relative mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{ width: `${bat.soc * 100}%`, background: accent }}
          />
          {/* Reserve floor marker — the battery will not discharge past this. */}
          <div
            className="absolute top-0 h-full w-px bg-white/60"
            style={{ left: `${bat.reserveFraction * 100}%` }}
            title={`${Math.round(bat.reserveFraction * 100)}% reserve floor`}
          />
        </div>
        <p className="mt-1.5 text-[9px] leading-snug text-white/45">{bat.reason}</p>
      </div>

      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <Metric label="Stored Energy" value={bat.storedKWh.toFixed(2)} unit="kWh" />
        <Metric label="Battery Capacity" value={bat.capacityKWh.toFixed(2)} unit="kWh" />
        <Metric
          label="Charge Rate"
          value={bat.chargeKW.toFixed(1)}
          unit="kW"
          accent={bat.chargeKW > 0 ? ACCENT.battery : undefined}
        />
        <Metric
          label="Discharge Rate"
          value={bat.dischargeKW.toFixed(1)}
          unit="kW"
          accent={bat.dischargeKW > 0 ? ACCENT.battery : undefined}
        />
        <Metric label="Operating State" value={bat.state} accent={active ? ACCENT.battery : undefined} />
        <Metric
          label="Reserve"
          value={`${Math.round(bat.reserveFraction * 100)}`}
          unit="%"
          secondary={`${bat.availableKWh.toFixed(1)} kWh usable`}
        />
      </div>

      {/* Parameters the report does not specify — labelled as assumptions so a
          derived value is never mistaken for a datasheet figure. */}
      <p className="mt-1.5 text-[8.5px] leading-snug text-white/25">
        Assumed: {DEFAULT_C_RATE}C power limit ({bat.maxPowerKW.toFixed(1)} kW) ·{' '}
        {(bat.roundTripEfficiency * 100).toFixed(1)}% round-trip · {Math.round(bat.reserveFraction * 100)}%
        reserve. The report specifies capacity only.
      </p>
    </PvSection>
  )
}

/* ── Utility Grid ────────────────────────────────────────────────────────────
   The balancing component at the end of the chain. It performs no routing of
   its own — import and export ARE the residual the bus computed after PV and
   the battery had their turn — so this card is a projection, not a second
   calculation. Export stays at exactly zero whenever there is no surplus, which
   is the expected weekday result for this building. */
function GridCard() {
  const grid = useTwinStore((s) => s.snapshot.grid)
  const daily = useTwinStore((s) => s.snapshot.daily)
  const active = grid.state !== 'Idle'
  const accent =
    grid.state === 'Importing' ? ACCENT.deficit : grid.state === 'Exporting' ? ACCENT.surplus : ACCENT.planned

  return (
    <PvSection
      title="Utility Grid"
      icon={Plug}
      accent={ACCENT.grid}
      badge={{ label: grid.state, tone: 'muted' }}
    >
      <SpecBlock spec={GRID_SPEC} />

      <div className="mt-1.5 grid grid-cols-2 gap-1.5">
        <Metric
          label="Grid Import"
          value={grid.importKW.toFixed(1)}
          unit="kW"
          accent={grid.importKW > 0 ? ACCENT.deficit : undefined}
        />
        <Metric
          label="Grid Export"
          value={grid.exportKW.toFixed(1)}
          unit="kW"
          accent={grid.exportKW > 0 ? ACCENT.surplus : undefined}
        />
        <Metric label="Grid State" value={grid.state} accent={active ? accent : undefined} className="col-span-2" />
        <Metric label="Daily Imported" value={daily.gridImportKWh.toFixed(1)} unit="kWh" />
        <Metric label="Daily Exported" value={daily.gridExportKWh.toFixed(1)} unit="kWh" />
        <Metric label="Peak Import" value={daily.peakImportKW.toFixed(1)} unit="kW" />
        <Metric label="Peak Export" value={daily.peakExportKW.toFixed(1)} unit="kW" />
      </div>

      <p className="mt-1.5 text-[9px] leading-snug text-white/45">{grid.reason}</p>
    </PvSection>
  )
}

/* ── Daily energy ledger ─────────────────────────────────────────────────────
   Every flow on the bus, integrated over simulated time and reset at simulated
   midnight. One authority for all six counters, so daily grid import here and
   in the Utility Grid card can never disagree. */
function DailyEnergy() {
  const [open, setOpen] = useState(false)
  const daily = useTwinStore((s) => s.snapshot.daily)

  const rows: [string, number, string][] = [
    ['PV Generation', daily.pvGenerationKWh, ACCENT.ac],
    ['Building Consumption', daily.buildingConsumptionKWh, ACCENT.load],
    ['Battery Charge', daily.batteryChargeKWh, ACCENT.battery],
    ['Battery Discharge', daily.batteryDischargeKWh, ACCENT.battery],
    ['Grid Import', daily.gridImportKWh, ACCENT.deficit],
    ['Grid Export', daily.gridExportKWh, ACCENT.surplus],
  ]

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-left transition-colors hover:bg-white/[0.03]"
      >
        <span className="text-[9px] uppercase tracking-wider text-white/40">
          Daily energy · day {daily.dayCount}
        </span>
        <span className="font-mono text-[9px] text-white/30">
          {open ? 'Hide' : `${daily.elapsedHours.toFixed(1)} h`}
        </span>
      </button>
      {open && (
        <div className="mt-1 space-y-0.5">
          {rows.map(([label, value, color]) => (
            <div key={label} className="flex items-baseline justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
                <span className="text-[9px] text-white/45">{label}</span>
              </span>
              <span className="font-mono text-[9px] tabular-nums text-white/60">
                {value.toFixed(1)} kWh
              </span>
            </div>
          ))}
          <p className="pt-0.5 text-[8.5px] leading-snug text-white/25">
            Integrated over simulated time; resets at simulated midnight.
          </p>
        </div>
      )}
    </div>
  )
}

/* ── Energy flow visualisation ───────────────────────────────────────────────
   Two proportional bars on ONE shared scale (the larger of generation and
   demand), so their lengths are directly comparable — the standard way a
   monitoring platform draws an instantaneous energy balance. Each bar is split
   by where the energy actually went, which is exactly the bus routing:

     PV Generation  →  direct to load │ into battery │ uncommitted surplus
     Building Load  ←  direct from PV │ from battery │ grid import required

   Deliberately static: the only motion is a CSS width transition. */
function EnergyFlow({
  generation,
  load,
  pvToLoad,
  charge,
  discharge,
  surplus,
  gridImport,
}: {
  generation: number
  load: number
  pvToLoad: number
  charge: number
  discharge: number
  surplus: number
  gridImport: number
}) {
  const scale = Math.max(generation, load, 0.001)
  const pct = (v: number) => `${(v / scale) * 100}%`

  return (
    <div className="rounded-xl bg-white/[0.03] p-2.5">
      {/* Where the generation went */}
      <FlowRow label="PV Generation" total={generation}>
        <span className="h-full" style={{ width: pct(pvToLoad), background: ACCENT.ac }} />
        <span className="h-full" style={{ width: pct(charge), background: ACCENT.battery }} />
        <span className="h-full" style={{ width: pct(surplus), background: ACCENT.surplus, opacity: 0.55 }} />
      </FlowRow>

      {/* Where the demand came from */}
      <FlowRow label="Building Load" total={load}>
        <span className="h-full" style={{ width: pct(pvToLoad), background: ACCENT.ac }} />
        <span className="h-full" style={{ width: pct(discharge), background: ACCENT.battery }} />
        <span className="h-full" style={{ width: pct(gridImport), background: ACCENT.deficit, opacity: 0.45 }} />
      </FlowRow>

      {/* Routing chain — the architecture in one line. */}
      <p className="mt-1.5 text-center font-mono text-[8.5px] tracking-wide text-white/25">
        PV → Building → Battery → Grid (future)
      </p>

      {/* Legend — names each colour exactly once, only when it carries power. */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/5 pt-1.5">
        <Key color={ACCENT.ac} label="PV direct" value={pvToLoad} />
        {charge > 0 && <Key color={ACCENT.battery} label="To battery" value={charge} />}
        {discharge > 0 && <Key color={ACCENT.battery} label="From battery" value={discharge} />}
        {surplus > 0 && <Key color={ACCENT.surplus} label="Surplus" value={surplus} />}
        {gridImport > 0 && <Key color={ACCENT.deficit} label="Grid required" value={gridImport} />}
      </div>
    </div>
  )
}

function FlowRow({ label, total, children }: { label: string; total: number; children: React.ReactNode }) {
  return (
    <div className="mb-1.5 last:mb-0">
      <div className="mb-0.5 flex items-baseline justify-between">
        <span className="text-[9px] uppercase tracking-wider text-white/40">{label}</span>
        <span className="font-mono text-[10px] font-semibold tabular-nums text-white/70">
          {total.toFixed(1)} kW
        </span>
      </div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06] [&>span]:transition-[width] [&>span]:duration-300">
        {children}
      </div>
    </div>
  )
}

function Key({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <span className="flex items-center gap-1">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      <span className="text-[8.5px] text-white/40">{label}</span>
      <span className="font-mono text-[8.5px] tabular-nums text-white/60">{value.toFixed(1)} kW</span>
    </span>
  )
}

/* ── Load breakdown ──────────────────────────────────────────────────────────
   Where the building's demand is actually going, by category. Collapsed by
   default so the section stays scannable (guide §10, progressive disclosure). */
function LoadBreakdown() {
  const [open, setOpen] = useState(false)
  const energy = useTwinStore((s) => s.snapshot.energy)

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg px-1 py-1 text-left transition-colors hover:bg-white/[0.03]"
      >
        <span className="text-[9px] uppercase tracking-wider text-white/40">Load breakdown</span>
        <span className="font-mono text-[9px] text-white/30">
          {open ? 'Hide' : `${energy.loadIntensityWm2.toFixed(1)} W/m²`}
        </span>
      </button>
      {open && (
        <div className="mt-1 space-y-1">
          {energy.categories.map((c) => (
            <div key={c.id} className="flex items-center gap-2">
              <span className="w-[86px] shrink-0 text-[9px] text-white/45">{c.label}</span>
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                <span
                  className="block h-full rounded-full transition-[width] duration-300"
                  style={{ width: `${c.share * 100}%`, background: ACCENT.load }}
                />
              </span>
              <span className="w-[52px] shrink-0 text-right font-mono text-[9px] tabular-nums text-white/60">
                {c.powerKW.toFixed(1)} kW
              </span>
            </div>
          ))}
          <p className="pt-0.5 text-[8.5px] leading-snug text-white/25">
            {energy.floorAreaM2.toLocaleString()} m² gross floor area ·{' '}
            {Math.round(energy.occupancy * 100)}% occupancy
          </p>
        </div>
      )}
    </div>
  )
}

/* ── Section shell ───────────────────────────────────────────────────────── */
function PvSection({
  title,
  icon: Icon,
  accent,
  badge,
  status = 'live',
  children,
}: {
  title: string
  icon: LucideIcon
  accent: string
  badge?: { label: string; tone: 'alarm' | 'muted' }
  status?: 'live' | 'planned'
  children?: React.ReactNode
}) {
  const planned = status === 'planned'
  return (
    <div
      className="rounded-2xl border p-2.5"
      style={{
        borderColor: planned ? 'rgba(255,255,255,0.06)' : `${accent}26`,
        background: planned ? 'rgba(255,255,255,0.015)' : 'rgba(255,255,255,0.02)',
      }}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <Icon className="h-3 w-3 shrink-0" style={{ color: planned ? ACCENT.planned : accent }} />
        <p
          className="text-[10px] font-medium uppercase tracking-wider"
          style={{ color: planned ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.5)' }}
        >
          {title}
        </p>
        {badge && (
          <span
            className="ml-auto rounded-full px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider"
            style={
              badge.tone === 'alarm'
                ? { background: 'rgba(248,113,113,0.18)', color: ACCENT.deficit }
                : { background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.35)' }
            }
          >
            {badge.label}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

/**
 * Static nameplate specification, visually distinct from live telemetry: no
 * mono-numeric emphasis, muted, with a "Specification" rule. A datasheet value
 * must never be mistakable for a reading.
 */
function SpecBlock({ spec }: { spec: EquipmentSpec }) {
  return (
    <div className="rounded-xl border border-white/5 bg-black/20 px-2.5 py-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[8px] font-semibold uppercase tracking-[0.14em] text-white/25">
          Specification
        </span>
        <span className="text-[9px] text-white/35">{spec.quantity}</span>
      </div>
      <p className="mt-0.5 text-[11px] font-semibold leading-tight text-white/80">{spec.manufacturer}</p>
      <p className="font-mono text-[10px] leading-tight text-white/50">{spec.model}</p>
      <div className="mt-1 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 border-t border-white/5 pt-1">
        {spec.rows.map(([k, v]) => (
          <div key={k} className="contents">
            <span className="text-[9px] text-white/35">{k}</span>
            <span className="text-right font-mono text-[9px] text-white/60">{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Reserved slots for the subsystems the roadmap will add. Shown — not hidden —
 * so the panel's final shape is legible now and adding a stage is a content
 * change inside an existing section rather than a layout change.
 */
const PLANNED: { title: string; icon: LucideIcon; note: string }[] = [
  { title: 'Net Metering', icon: Plug, note: 'Export credit scheme on top of the grid connection' },
  { title: 'Peak Shaving', icon: Activity, note: 'Demand-response dispatch on top of the battery' },
  { title: 'Financial Analysis', icon: Coins, note: 'Time-of-use tariffs, demand charges, payback' },
  { title: 'Carbon Reduction', icon: Leaf, note: 'Grid carbon factors and avoided emissions' },
]

function PlannedSubsystems() {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 rounded-xl px-1 py-1 text-left transition-colors hover:bg-white/[0.03]"
      >
        <Activity className="h-3 w-3 shrink-0 text-white/25" />
        <p className="text-[10px] font-medium uppercase tracking-wider text-white/30">Planned subsystems</p>
        <span className="ml-auto text-[9px] text-white/25">{open ? 'Hide' : `${PLANNED.length}`}</span>
      </button>
      {open && (
        <div className="mt-1.5 space-y-1.5">
          {PLANNED.map((p) => (
            <PvSection key={p.title} title={p.title} icon={p.icon} accent={ACCENT.planned} status="planned">
              <p className="text-[9px] leading-snug text-white/25">{p.note}</p>
            </PvSection>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Metric card — identical geometry and typography to the Environmental
 * Conditions panel's `Metric`, so the panel reads as native.
 */
function Metric({
  label,
  value,
  unit,
  secondary,
  accent,
  className,
}: {
  label: string
  value: string
  unit?: string
  secondary?: string
  accent?: string
  className?: string
}) {
  return (
    <div className={`rounded-xl bg-white/[0.03] px-2.5 py-1.5 ${className ?? ''}`}>
      <p className="text-[9px] font-medium uppercase tracking-wider text-white/45">{label}</p>
      <p className="font-mono text-[13px] font-semibold tabular-nums" style={{ color: accent ?? '#fff' }}>
        {value}
        {unit && <span className="ml-0.5 text-[9px] text-white/50">{unit}</span>}
        {secondary && <span className="ml-1 text-[9px] font-normal text-white/40">{secondary}</span>}
      </p>
    </div>
  )
}

/** Slim utilisation bar. */
function Bar({ fraction, accent }: { fraction: number; accent: string }) {
  const pct = Math.max(0, Math.min(1, fraction)) * 100
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${pct}%`, background: accent }}
      />
    </div>
  )
}
