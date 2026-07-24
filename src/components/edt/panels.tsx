'use client'

import { X } from 'lucide-react'
import { useVecStore } from '@/lib/vec/store'
import { useEdtStore } from '@/lib/edt/store'
import { COMPONENT_BY_ID, WIRE_BY_ID, COMPONENTS } from '@/lib/edt/circuit'
import type { DebugStageId, FaultKind } from '@/lib/vec/types'

// ---------------------------------------------------------------------------
// Hover card — engineering tooltip for the hovered component or wire.
// ---------------------------------------------------------------------------
export function HoverCard() {
  const hoveredId = useEdtStore((s) => s.hoveredId)
  const sensors = useVecStore((s) => s.lastSensors)
  const outputs = useVecStore((s) => s.lastActuator)
  const trace = useVecStore((s) => s.trace)
  if (!hoveredId) return null

  const comp = COMPONENT_BY_ID.get(hoveredId)
  const wire = WIRE_BY_ID.get(hoveredId)
  // Freshness expressed as the sensor's sample period (no impure clock reads).
  const freshness = comp?.samplingHz ? `≤ ${Math.round(1000 / comp.samplingHz)} ms` : 'live'

  return (
    <div className="pointer-events-none absolute bottom-3 left-3 w-64 rounded-xl border border-white/10 bg-[#0b111c]/95 p-3 shadow-2xl backdrop-blur">
      {comp && (
        <>
          <div className="mb-1 flex items-center justify-between">
            <p className="text-[11px] font-bold text-white">{comp.name}</p>
            <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[8px] text-electric">{comp.gpio}</span>
          </div>
          <p className="mb-2 text-[10px] leading-snug text-white/55">{comp.purpose}</p>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono text-[9px]">
            <Row k="value" v={`${comp.live(sensors, outputs, trace).value}${comp.live(sensors, outputs, trace).unit ? ' ' + comp.live(sensors, outputs, trace).unit : ''}`} />
            <Row k="var" v={comp.firmwareVar} />
            <Row k="signal" v={comp.signalType} />
            {comp.samplingHz && <Row k="rate" v={`${comp.samplingHz} Hz`} />}
            <Row k="source" v={comp.source} />
            <Row k="updated" v={freshness} />
          </div>
        </>
      )}
      {wire && !comp && (
        <>
          <div className="mb-1 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: wire.color }} />
            <p className="text-[11px] font-bold text-white">{wire.label}</p>
          </div>
          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 font-mono text-[9px]">
            <Row k="gpio" v={wire.gpio} />
            <Row k="type" v={wire.signal} />
            <Row k="dir" v={wire.dir === 'in' ? 'sensor → ESP' : wire.dir === 'out' ? 'ESP → actuator' : 'bidirectional'} />
            <Row k="from" v={COMPONENT_BY_ID.get(wire.fromId)?.name ?? wire.fromId} />
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Component Inspector — the detailed click-through panel.
// ---------------------------------------------------------------------------
export function InspectorPanel() {
  const selectedId = useEdtStore((s) => s.selectedId)
  const select = useEdtStore((s) => s.select)
  const showEducation = useEdtStore((s) => s.showEducation)
  const sensors = useVecStore((s) => s.lastSensors)
  const outputs = useVecStore((s) => s.lastActuator)
  const trace = useVecStore((s) => s.trace)
  if (!selectedId) return null
  const c = COMPONENT_BY_ID.get(selectedId)
  if (!c) return null
  const reading = c.live(sensors, outputs, trace)

  return (
    <div className="flex h-full w-72 flex-col border-l border-white/10 bg-[#0b111c]">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div>
          <p className="text-[8px] uppercase tracking-[0.2em] text-electric">Component Inspector</p>
          <p className="text-sm font-bold text-white">{c.name}</p>
        </div>
        <button onClick={() => select(null)} className="rounded p-1 text-white/40 hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-3 text-[10px] text-white/70">
        <div className="flex items-center justify-between rounded-lg bg-white/[0.03] px-2.5 py-1.5">
          <span className="font-mono text-white/50">{c.gpio}</span>
          <span className="font-mono text-sm font-bold text-white">
            {reading.value}
            {reading.unit ? ` ${reading.unit}` : ''}
          </span>
        </div>
        <Field label="Purpose" body={c.purpose} />
        <Field label="How it works" body={c.howItWorks} />
        <Field label="Electrical" body={c.electrical} />
        <div className="grid grid-cols-2 gap-2">
          <Field label="Firmware variable" body={c.firmwareVar} mono />
          <Field label="Digital Twin source" body={c.source} />
        </div>
        <Field label="Related decision" body={c.relatedDecision} />
        <Field label="Related strategy" body={c.relatedStrategy} />
        <Field label="Building physics" body={c.relatedPhysics} />
        <div>
          <p className="mb-1 text-[8px] uppercase tracking-wider text-white/40">Algorithm dependency</p>
          <div className="flex flex-wrap items-center gap-1">
            {c.algorithmStage.map((s, i) => (
              <span key={s} className="flex items-center gap-1">
                <span className="rounded bg-electric/15 px-1.5 py-0.5 text-[9px] text-electric">{s}</span>
                {i < c.algorithmStage.length - 1 && <span className="text-white/30">→</span>}
              </span>
            ))}
          </div>
        </div>
        {(showEducation || c.equations.length > 0) && c.equations.length > 0 && (
          <div>
            <p className="mb-1 text-[8px] uppercase tracking-wider text-white/40">Equations</p>
            {c.equations.map((eq) => (
              <p key={eq} className="rounded bg-black/30 px-2 py-1 font-mono text-[10px] text-emerald/90">{eq}</p>
            ))}
          </div>
        )}
        <Field label="Engineering notes" body={c.notes} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Legend + Education panels
// ---------------------------------------------------------------------------
export function LegendPanel() {
  return (
    <div className="flex h-full w-64 flex-col border-r border-white/10 bg-[#0b111c]">
      <p className="border-b border-white/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-electric">Component Legend</p>
      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-2">
        {COMPONENTS.map((c) => (
          <div key={c.id} className="rounded-lg bg-white/[0.03] p-2">
            <div className="flex items-center gap-1.5">
              <span className="grid h-4 w-4 place-items-center rounded-full bg-electric text-[9px] font-bold text-black">{c.no}</span>
              <span className="text-[11px] font-semibold text-white">{c.name}</span>
            </div>
            <p className="mt-1 text-[9px] leading-snug text-white/55">{c.purpose}</p>
            <p className="mt-0.5 font-mono text-[8.5px] text-white/35">{c.firmwareVar} · {c.source}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export function EducationPanel() {
  return (
    <div className="flex h-full w-72 flex-col border-l border-white/10 bg-[#0b111c]">
      <p className="border-b border-white/10 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-amber-300">Engineering Education Mode</p>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2 text-[10px]">
        {COMPONENTS.map((c) => (
          <div key={c.id} className="rounded-lg bg-white/[0.03] p-2.5">
            <p className="text-[11px] font-bold text-white">{c.no}. {c.name}</p>
            <Teach k="What" v={c.purpose} />
            <Teach k="How" v={c.howItWorks} />
            <Teach k="Why PBIF needs it" v={`${c.source} → ${c.relatedDecision}`} />
            <Teach k="Electrical" v={c.electrical} />
            {c.equations.map((e) => (
              <p key={e} className="mt-1 rounded bg-black/30 px-2 py-1 font-mono text-[9px] text-emerald/90">{e}</p>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Fault injection
// ---------------------------------------------------------------------------
const FAULTS: { k: FaultKind; label: string }[] = [
  { k: 'dht-fail', label: 'DHT Sensor Fail' },
  { k: 'ldr-disconnect', label: 'LDR Disconnect' },
  { k: 'adc-noise', label: 'ADC Noise' },
  { k: 'servo-jam', label: 'Servo Jam' },
  { k: 'servo-wire-break', label: 'Servo Wire Break' },
  { k: 'wifi-loss', label: 'WiFi Loss' },
  { k: 'mqtt-loss', label: 'MQTT Loss' },
  { k: 'power-loss', label: 'Power Failure' },
]

export function FaultPanel() {
  const faults = useVecStore((s) => s.faults)
  const inject = useVecStore((s) => s.injectFault)
  const clear = useVecStore((s) => s.clearFault)
  const active = new Set(faults.map((f) => f.kind))
  return (
    <div className="border-t border-white/10 p-2">
      <p className="mb-1.5 px-1 text-[9px] uppercase tracking-wider text-white/40">Fault injection</p>
      <div className="grid grid-cols-4 gap-1">
        {FAULTS.map((f) => (
          <button
            key={f.k}
            onClick={() => (active.has(f.k) ? clear(f.k) : inject(f.k))}
            className={`rounded px-1.5 py-1 text-[8.5px] font-medium transition-colors ${
              active.has(f.k) ? 'bg-red-500/25 text-red-300' : 'bg-white/5 text-white/55 hover:bg-white/10'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {faults.length > 0 && (
        <div className="mt-1.5 space-y-1">
          {faults.map((f) => (
            <div key={f.kind} className="rounded-lg border border-red-500/20 bg-red-500/5 px-2 py-1 text-[9px]">
              <p className="font-semibold text-red-300">⚠ {f.kind}</p>
              <p className="text-white/50">detect: {f.detection}</p>
              <p className="text-emerald/70">respond: {f.response}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// End-to-end causality strip
// ---------------------------------------------------------------------------
const CAUSALITY = ['Weather', 'Sensor', 'GPIO', 'ESP32', 'Firmware', 'Decision', 'Strategy', 'PWM', 'Servo', 'Façade', 'Physics', 'Performance']
const STAGE_TO_NODE: Partial<Record<DebugStageId, number>> = {
  'read-dht': 1,
  'read-ldr': 1,
  'read-rain': 1,
  'read-wind': 1,
  'read-pir': 1,
  'read-switch': 2,
  'update-sensors': 1,
  'compute-env': 4,
  'evaluate-decision': 5,
  'building-objective': 5,
  'surface-strategy': 6,
  'panel-strategy': 6,
  'compute-servo': 6,
  'update-pwm': 7,
  'move-servo': 8,
  'update-lcd': 3,
  'publish-mqtt': 11,
  'loop-start': 3,
  'loop-complete': 3,
}

export function CausalityStrip({ stageId }: { stageId: DebugStageId | null }) {
  const node = stageId != null ? STAGE_TO_NODE[stageId] ?? 3 : -1
  return (
    <div className="flex items-center gap-0.5 overflow-x-auto border-t border-white/10 bg-[#0b111c] px-3 py-1.5 no-scrollbar">
      {CAUSALITY.map((n, i) => (
        <span key={n} className="flex items-center gap-0.5">
          <span
            className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[8.5px] font-semibold transition-colors ${
              i === node ? 'bg-electric text-black' : i < node ? 'bg-emerald/15 text-emerald/70' : 'bg-white/5 text-white/40'
            }`}
          >
            {n}
          </span>
          {i < CAUSALITY.length - 1 && <span className="text-white/20">›</span>}
        </span>
      ))}
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <>
      <span className="text-white/40">{k}</span>
      <span className="truncate text-right text-white/80">{v}</span>
    </>
  )
}
function Field({ label, body, mono }: { label: string; body: string; mono?: boolean }) {
  return (
    <div>
      <p className="mb-0.5 text-[8px] uppercase tracking-wider text-white/40">{label}</p>
      <p className={`leading-snug text-white/70 ${mono ? 'font-mono text-[9px]' : ''}`}>{body}</p>
    </div>
  )
}
function Teach({ k, v }: { k: string; v: string }) {
  return (
    <p className="mt-1 leading-snug text-white/60">
      <span className="font-semibold text-white/80">{k}: </span>
      {v}
    </p>
  )
}
