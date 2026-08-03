'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Activity,
  ChevronDown,
  Cpu,
  CircuitBoard,
  Gauge,
  Radio,
  Terminal,
  Thermometer,
  User,
  Wrench,
} from 'lucide-react'
import { useVecStore } from '@/lib/vec/store'
import { useEdtStore } from '@/lib/edt/store'
import type { ControllerKind, FirmwareState, LinkState } from '@/lib/vec/types'
import { BLADE_LABEL } from '@/lib/dt/bladeAngle'

const KINDS: { key: ControllerKind; label: string }[] = [
  { key: 'simulated', label: 'Virtual (Sim)' },
  { key: 'wokwi-mqtt', label: 'Wokwi (MQTT)' },
]

const STATE_TONE: Record<FirmwareState, string> = {
  PAUSED: 'text-white/60',
  STORM: 'text-red-400',
  RAIN: 'text-sky-400',
  OCCUPIED: 'text-amber-400',
  OVERHEAT: 'text-orange-400',
  TRACKING: 'text-emerald',
  OVERCAST: 'text-indigo-300',
  UNKNOWN: 'text-white/50',
}

function Dot({ on, color }: { on: boolean; color: string }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 rounded-full transition-all"
      style={{ background: on ? color : 'rgba(255,255,255,0.12)', boxShadow: on ? `0 0 8px ${color}` : 'none' }}
    />
  )
}

function Link({ label, state }: { label: string; state: LinkState }) {
  const tone = state === 'connected' ? '#00D084' : state === 'connecting' ? '#fbbf24' : '#64748b'
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-white/60">
      <Dot on={state !== 'disconnected'} color={tone} />
      {label}
    </span>
  )
}

/** Sparkline of the last servo angles (0–180°). */
function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <div className="h-8" />
  const w = 240
  const h = 32
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - (v / 180) * h}`)
    .join(' ')
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke="#38BDF8" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/**
 * The "Virtual Embedded Controller" dashboard. Panel 0 of the building is driven
 * by an actual ESP32 firmware (simulated in-process, or the live Wokwi board over
 * MQTT). Everything shown here is read from the {@link VirtualEmbeddedController}
 * interface — the UI has no idea which implementation is behind it.
 */
export function VECPanel() {
  const [open, setOpen] = useState(true)
  const kind = useVecStore((s) => s.kind)
  const status = useVecStore((s) => s.status)
  const sensors = useVecStore((s) => s.lastSensors)
  const act = useVecStore((s) => s.lastActuator)
  const telemetry = useVecStore((s) => s.telemetry)
  const serial = useVecStore((s) => s.serial)
  const overrides = useVecStore((s) => s.overrides)
  const setKind = useVecStore((s) => s.setKind)
  const setMotion = useVecStore((s) => s.setMotion)
  const setPauseSwitch = useVecStore((s) => s.setPauseSwitch)
  const openEdt = useEdtStore((s) => s.setOpen)

  const serialRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = serialRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [serial])

  const angle = act?.servoAngle ?? 90
  const state = act?.state ?? 'UNKNOWN'
  const ldrL = sensors ? Math.round((sensors.ldr.l1 + sensors.ldr.l2) / 2) : 0
  const ldrR = sensors ? Math.round((sensors.ldr.l3 + sensors.ldr.l4) / 2) : 0

  return (
    <div className="glass-strong relative w-[300px] max-w-[88vw] rounded-3xl p-4">
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

      {/* Header */}
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-lg bg-electric/20">
            <Cpu className="h-4 w-4 text-electric" />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-electric">Virtual Embedded Controller</p>
            <p className="text-xs font-medium text-white/70">{status?.firmware ?? 'ESP32-S3 · Enoki'}</p>
          </div>
        </div>
        <ChevronDown className={`h-4 w-4 text-white/40 transition-transform ${open ? '' : '-rotate-90'}`} />
      </button>

      {/* Panel-0 callout */}
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-electric/20 bg-electric/10 px-2.5 py-1.5">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-electric opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-electric" />
        </span>
        <p className="text-[10px] font-medium text-white/80">Panel&nbsp;0 is running on real ESP32 firmware</p>
      </div>

      {/* Open the deep engineering layer */}
      <button
        onClick={() => openEdt(true)}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-electric/30 bg-electric/10 py-2 text-[11px] font-semibold text-electric transition-colors hover:bg-electric/20"
      >
        <CircuitBoard className="h-4 w-4" /> Open Electronics Digital Twin
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {/* Controller selector */}
          <div className="flex gap-1 rounded-full bg-white/5 p-1">
            {KINDS.map((k) => (
              <button
                key={k.key}
                onClick={() => setKind(k.key)}
                className={`flex-1 rounded-full py-1.5 text-[10px] font-semibold transition-colors ${
                  kind === k.key ? 'bg-white/90 text-black' : 'text-white/55 hover:text-white'
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>

          {/* Status line */}
          <div className="flex items-center justify-between rounded-xl bg-white/[0.03] px-3 py-2">
            <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-white/80">
              <Radio className={`h-3.5 w-3.5 ${status?.online ? 'text-emerald' : 'text-white/40'}`} />
              {status?.online ? 'Online' : 'Offline'}
            </span>
            <div className="flex items-center gap-2.5">
              <Link label="WiFi" state={status?.wifi ?? 'disconnected'} />
              <Link label="MQTT" state={status?.mqtt ?? 'disconnected'} />
            </div>
          </div>

          {/* Decision + servo */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-white/[0.03] px-3 py-2">
              <p className="text-[9px] uppercase tracking-wider text-white/45">Decision</p>
              <p className={`font-mono text-sm font-bold ${STATE_TONE[state]}`}>{state}</p>
            </div>
            <div className="rounded-xl bg-white/[0.03] px-3 py-2">
              <p className="text-[9px] uppercase tracking-wider text-white/45">{BLADE_LABEL.current}</p>
              <p className="font-mono text-sm font-bold text-white">{angle}°</p>
            </div>
          </div>

          {/* LED + LCD */}
          <div className="flex items-center gap-4 rounded-xl bg-white/[0.03] px-3 py-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] text-white/60">
              <Dot on={!!act?.redLed} color="#ef4444" /> RED
            </span>
            <span className="inline-flex items-center gap-1.5 text-[10px] text-white/60">
              <Dot on={!!act?.greenLed} color="#00D084" /> GRN
            </span>
            <div className="ml-auto flex-1 rounded-md bg-[#0a1a12] px-2 py-1 font-mono text-[8px] leading-[1.35] text-emerald/90">
              {(act?.lcd ?? ['', '', '', '']).map((l, i) => (
                <div key={i} className="truncate">{l || ' '}</div>
              ))}
            </div>
          </div>

          {/* Sensor grid */}
          <div>
            <p className="mb-1 text-[9px] uppercase tracking-wider text-white/45">Virtual sensors</p>
            <div className="grid grid-cols-3 gap-1.5">
              <Sensor icon={Thermometer} label="Temp" value={sensors ? `${sensors.temperatureC.toFixed(1)}°` : '—'} />
              <Sensor icon={Activity} label="Humid" value={sensors ? `${Math.round(sensors.humidityPct)}%` : '—'} />
              <Sensor icon={Gauge} label="Wind" value={sensors ? `${sensors.windAdc}` : '—'} />
              <Sensor icon={Gauge} label="Rain" value={sensors ? `${sensors.rainAdc}` : '—'} />
              <Sensor icon={Activity} label="LDR·L" value={`${ldrL}`} />
              <Sensor icon={Activity} label="LDR·R" value={`${ldrR}`} />
            </div>
          </div>

          {/* Manual sensor toggles */}
          <div className="grid grid-cols-2 gap-2">
            <Toggle icon={User} label="Occupant (PIR)" on={overrides.motion} onClick={() => setMotion(!overrides.motion)} />
            <Toggle icon={Wrench} label="Maintenance" on={overrides.pauseSwitch} onClick={() => setPauseSwitch(!overrides.pauseSwitch)} />
          </div>

          {/* Servo history */}
          <div className="rounded-xl bg-white/[0.03] px-3 py-2">
            <p className="mb-0.5 text-[9px] uppercase tracking-wider text-white/45">Servo history</p>
            <Sparkline values={telemetry.map((t) => t.angle)} />
          </div>

          {/* Live serial monitor */}
          <div>
            <p className="mb-1 flex items-center gap-1 text-[9px] uppercase tracking-wider text-white/45">
              <Terminal className="h-3 w-3" /> Live serial monitor
            </p>
            <div
              ref={serialRef}
              className="h-28 overflow-y-auto rounded-lg bg-black/40 p-2 font-mono text-[9px] leading-relaxed text-emerald/80"
            >
              {serial.length === 0 && <span className="text-white/30">Booting…</span>}
              {serial.map((line, i) => (
                <div key={i} className="whitespace-pre-wrap break-all">{line}</div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Sensor({ icon: Icon, label, value }: { icon: typeof Thermometer; label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/[0.03] px-2 py-1.5">
      <p className="flex items-center gap-1 text-[8px] uppercase tracking-wider text-white/40">
        <Icon className="h-2.5 w-2.5" /> {label}
      </p>
      <p className="font-mono text-[12px] font-semibold text-white/90 tabular-nums">{value}</p>
    </div>
  )
}

function Toggle({
  icon: Icon,
  label,
  on,
  onClick,
}: {
  icon: typeof User
  label: string
  on: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 rounded-xl py-2 text-[10px] font-medium transition-colors ${
        on ? 'bg-emerald/25 text-emerald' : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white'
      }`}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  )
}
