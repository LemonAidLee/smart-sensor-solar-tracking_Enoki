'use client'

import { useMemo, useRef } from 'react'
import { useVecStore } from '@/lib/vec/store'
import { useEdtStore } from '@/lib/edt/store'
import {
  CANVAS,
  COMPONENTS,
  COMPONENT_BY_ID,
  STAGE_MAP,
  WIRES,
  type ComponentMeta,
  type Health,
  type WireMeta,
} from '@/lib/edt/circuit'
import type { ActuatorPacket, VirtualSensorPacket, ExecutionTrace } from '@/lib/vec/types'

const HEALTH_COLOR: Record<Health, string> = {
  healthy: '#00D084',
  warn: '#fbbf24',
  fault: '#ef4444',
  active: '#38BDF8',
  idle: '#64748b',
}

const esp = COMPONENT_BY_ID.get('esp')!
const ESPC = { x: esp.x + esp.w / 2, y: esp.y + esp.h / 2 }

interface WireGeom {
  wire: WireMeta
  d: string
  midX: number
  midY: number
}

/** Bezier harness geometry from each component to its ESP pin slot. */
function useWireGeometry(): WireGeom[] {
  return useMemo(() => {
    const left = WIRES.filter((x) => center(COMPONENT_BY_ID.get(x.fromId)!).x < ESPC.x)
    const right = WIRES.filter((x) => center(COMPONENT_BY_ID.get(x.fromId)!).x >= ESPC.x)
    const slot = (arr: WireMeta[], side: 'L' | 'R') =>
      arr
        .slice()
        .sort((a, b) => center(COMPONENT_BY_ID.get(a.fromId)!).y - center(COMPONENT_BY_ID.get(b.fromId)!).y)
        .map((wire, i, all) => {
          const c = COMPONENT_BY_ID.get(wire.fromId)!
          const sx = clamp(ESPC.x, c.x, c.x + c.w)
          const sy = clamp(ESPC.y, c.y, c.y + c.h)
          const ex = side === 'L' ? esp.x : esp.x + esp.w
          const ey = esp.y + 18 + (i / Math.max(1, all.length - 1)) * (esp.h - 36)
          const mx = (sx + ex) / 2
          const d = `M ${sx} ${sy} C ${mx} ${sy}, ${mx} ${ey}, ${ex} ${ey}`
          return { wire, d, midX: mx, midY: (sy + ey) / 2 }
        })
    return [...slot(left, 'L'), ...slot(right, 'R')]
  }, [])
}

export function CircuitCanvas() {
  const sensors = useVecStore((s) => s.lastSensors)
  const outputs = useVecStore((s) => s.lastActuator)
  const trace = useVecStore((s) => s.trace)
  const history = useVecStore((s) => s.traceHistory)

  const view = useEdtStore((s) => s.view)
  const hoveredId = useEdtStore((s) => s.hoveredId)
  const selectedId = useEdtStore((s) => s.selectedId)
  const showDataFlow = useEdtStore((s) => s.showDataFlow)
  const showLegend = useEdtStore((s) => s.showLegend)
  const stageIndex = useEdtStore((s) => s.stageIndex)
  const replayIndex = useEdtStore((s) => s.replayIndex)
  const hover = useEdtStore((s) => s.hover)
  const select = useEdtStore((s) => s.select)
  const setView = useEdtStore((s) => s.setView)
  const zoomBy = useEdtStore((s) => s.zoomBy)

  const geom = useWireGeometry()
  const drag = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)

  // The trace currently under the playhead (live latest, or a replayed frame).
  const shown: ExecutionTrace | null = replayIndex != null ? history[replayIndex] ?? trace : trace
  const stage = shown?.stages[Math.min(stageIndex, (shown.stages.length ?? 1) - 1)]
  const highlight = stage ? STAGE_MAP[stage.id] : null
  const activeComps = new Set(highlight?.components ?? [])
  const activeWires = new Set(highlight?.wires ?? [])

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    zoomBy(e.deltaY < 0 ? 1.1 : 1 / 1.1)
  }
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as Element).getAttribute('data-bg') !== 'true') return
    drag.current = { x: e.clientX, y: e.clientY, panX: view.panX, panY: view.panY }
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    setView({ panX: drag.current.panX + (e.clientX - drag.current.x), panY: drag.current.panY + (e.clientY - drag.current.y) })
  }
  const onPointerUp = () => {
    drag.current = null
  }

  return (
    <svg
      viewBox={`0 0 ${CANVAS.w} ${CANVAS.h}`}
      className="h-full w-full touch-none select-none"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <style>{`
        @keyframes edt-flow { to { stroke-dashoffset: -24; } }
        .edt-flow { animation: edt-flow 0.9s linear infinite; }
        .edt-flow-rev { animation: edt-flow 0.9s linear infinite reverse; }
        .edt-flow-fast { animation-duration: 0.4s; }
      `}</style>

      <rect data-bg="true" x={0} y={0} width={CANVAS.w} height={CANVAS.h} fill="#0a0e16" />
      <g transform={`translate(${view.panX} ${view.panY}) scale(${view.zoom})`}>
        <rect data-bg="true" x={-2000} y={-2000} width={6000} height={6000} fill="url(#edt-grid)" />
        <defs>
          <pattern id="edt-grid" width="26" height="26" patternUnits="userSpaceOnUse">
            <path d="M 26 0 L 0 0 0 26" fill="none" stroke="#141b28" strokeWidth="1" />
          </pattern>
        </defs>

        {/* Wires */}
        <g fill="none" strokeLinecap="round">
          {geom.map(({ wire, d }) => {
            const active = activeWires.has(wire.id)
            const hot = hoveredId === wire.id
            const dim = wire.kind !== 'signal'
            return (
              <g key={wire.id} onPointerEnter={() => hover(wire.id)} onPointerLeave={() => hover(null)} style={{ cursor: 'pointer' }}>
                <path d={d} stroke={wire.color} strokeWidth={active || hot ? 4 : dim ? 1.2 : 2.4} opacity={active || hot ? 1 : 0.5} />
                {showDataFlow && (
                  <path
                    d={d}
                    stroke={active ? '#ffffff' : wire.color}
                    strokeWidth={active || hot ? 3 : 1.6}
                    strokeDasharray="2 10"
                    opacity={active ? 0.95 : 0.7}
                    className={`${wire.dir === 'out' ? 'edt-flow-rev' : 'edt-flow'} ${active ? 'edt-flow-fast' : ''}`}
                  />
                )}
              </g>
            )
          })}
        </g>

        {/* Components */}
        {COMPONENTS.map((c) => (
          <Part
            key={c.id}
            c={c}
            reading={c.live(sensors, outputs, trace)}
            active={activeComps.has(c.id)}
            hovered={hoveredId === c.id}
            selected={selectedId === c.id}
            showLegend={showLegend}
            sensors={sensors}
            outputs={outputs}
            onHover={hover}
            onSelect={select}
          />
        ))}
      </g>
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Component artwork (stylised but faithful to the Wokwi parts)
// ---------------------------------------------------------------------------
function Part({
  c,
  reading,
  active,
  hovered,
  selected,
  showLegend,
  sensors,
  outputs,
  onHover,
  onSelect,
}: {
  c: ComponentMeta
  reading: { value: string; unit?: string; health: Health }
  active: boolean
  hovered: boolean
  selected: boolean
  showLegend: boolean
  sensors: VirtualSensorPacket | null
  outputs: ActuatorPacket | null
  onHover: (id: string | null) => void
  onSelect: (id: string | null) => void
}) {
  const ring = HEALTH_COLOR[reading.health]
  const glow = active ? '#38BDF8' : hovered || selected ? '#ffffff' : 'transparent'
  return (
    <g
      transform={`translate(${c.x} ${c.y})`}
      onPointerEnter={() => onHover(c.id)}
      onPointerLeave={() => onHover(null)}
      onPointerDown={(e) => {
        e.stopPropagation()
        onSelect(c.id)
      }}
      style={{ cursor: 'pointer' }}
    >
      {(active || hovered || selected) && (
        <rect x={-6} y={-6} width={c.w + 12} height={c.h + 12} rx={10} fill="none" stroke={glow} strokeWidth={2} opacity={0.9}>
          {active && <animate attributeName="opacity" values="0.4;1;0.4" dur="1.1s" repeatCount="indefinite" />}
        </rect>
      )}
      <Art c={c} sensors={sensors} outputs={outputs} />

      {/* Health dot */}
      <circle cx={c.w - 6} cy={6} r={4} fill={ring}>
        {reading.health === 'fault' && <animate attributeName="opacity" values="1;0.2;1" dur="0.6s" repeatCount="indefinite" />}
      </circle>

      {/* Live value chip */}
      <g transform={`translate(0 ${c.h + 4})`}>
        <rect x={0} y={0} width={Math.max(46, c.name.length * 5.4)} height={15} rx={4} fill="#0d1420" stroke="#1f2a3a" />
        <text x={5} y={11} fontSize={9} fill="#cbd5e1" fontFamily="monospace">
          {reading.value}
          {reading.unit ? ` ${reading.unit}` : ''}
        </text>
      </g>

      {/* Legend badge */}
      {showLegend && (
        <g transform="translate(-10 -10)">
          <circle r={9} fill="#38BDF8" />
          <text textAnchor="middle" y={3.5} fontSize={11} fontWeight="700" fill="#031018">
            {c.no}
          </text>
        </g>
      )}
    </g>
  )
}

function Art({ c, sensors, outputs }: { c: ComponentMeta; sensors: VirtualSensorPacket | null; outputs: ActuatorPacket | null }) {
  switch (c.type) {
    case 'esp32':
      return (
        <g>
          <rect width={c.w} height={c.h} rx={8} fill="#0f172a" stroke="#334155" strokeWidth={1.5} />
          {Array.from({ length: 11 }).map((_, i) => (
            <g key={i}>
              <rect x={-3} y={16 + i * 19} width={5} height={8} rx={1} fill="#b8842a" />
              <rect x={c.w - 2} y={16 + i * 19} width={5} height={8} rx={1} fill="#b8842a" />
            </g>
          ))}
          <rect x={c.w / 2 - 16} y={6} width={32} height={16} rx={2} fill="#1e293b" stroke="#475569" />
          <path d={`M ${c.w / 2 - 10} 14 q 5 -6 10 0 q 5 -6 10 0`} fill="none" stroke="#38BDF8" strokeWidth={1.2} transform="translate(-5 0)" />
          <text x={c.w / 2} y={c.h / 2} textAnchor="middle" fontSize={11} fontWeight="700" fill="#e2e8f0" fontFamily="monospace">ESP32</text>
          <text x={c.w / 2} y={c.h / 2 + 13} textAnchor="middle" fontSize={8} fill="#64748b" fontFamily="monospace">S3</text>
          <rect x={c.w / 2 - 7} y={c.h - 12} width={14} height={8} rx={1} fill="#475569" />
        </g>
      )
    case 'dht22':
      return (
        <g>
          <rect width={c.w} height={c.h} rx={4} fill="#e5eef5" stroke="#94a3b8" />
          <rect x={5} y={5} width={c.w - 10} height={c.h - 26} rx={3} fill="#cbd8e2" />
          {Array.from({ length: 5 }).map((_, r) =>
            Array.from({ length: 4 }).map((_, col) => <circle key={`${r}-${col}`} cx={11 + col * 14} cy={12 + r * 11} r={2.2} fill="#8195a8" />),
          )}
          <text x={c.w / 2} y={c.h - 8} textAnchor="middle" fontSize={8} fontWeight="700" fill="#334155">DHT22</text>
        </g>
      )
    case 'pir':
      return (
        <g>
          <rect width={c.w} height={c.h} rx={4} fill="#0b7285" stroke="#0e8ba1" />
          <circle cx={c.w / 2} cy={c.h / 2} r={Math.min(c.w, c.h) / 2 - 8} fill="#f8fafc" stroke="#cbd5e1" />
          <circle cx={c.w / 2} cy={c.h / 2} r={Math.min(c.w, c.h) / 2 - 15} fill="none" stroke="#94a3b8" strokeWidth={1} />
          <text x={c.w / 2} y={c.h - 5} textAnchor="middle" fontSize={7} fill="#e0fbff">PIR</text>
        </g>
      )
    case 'pot':
      return (
        <g>
          <rect width={c.w} height={c.h} rx={4} fill="#1d4ed8" stroke="#3b82f6" />
          <circle cx={c.w / 2} cy={c.h / 2} r={16} fill="#dbeafe" stroke="#93c5fd" />
          <line x1={c.w / 2} y1={c.h / 2} x2={c.w / 2 + 12} y2={c.h / 2 - 8} stroke="#1e3a8a" strokeWidth={2.5} />
          <text x={c.w / 2} y={c.h - 4} textAnchor="middle" fontSize={7} fill="#dbeafe">POT</text>
        </g>
      )
    case 'ldr':
      return (
        <g>
          <rect width={c.w} height={c.h} rx={4} fill="#1e40af" stroke="#3b82f6" />
          <circle cx={20} cy={c.h / 2} r={13} fill="#fca5a5" stroke="#b91c1c" />
          <path d={`M 13 ${c.h / 2} q 7 -7 14 0 q -7 7 -14 0`} fill="none" stroke="#7f1d1d" strokeWidth={1.2} />
          <rect x={44} y={c.h / 2 - 9} width={16} height={16} rx={2} fill="#1d4ed8" stroke="#60a5fa" />
          {Array.from({ length: 4 }).map((_, i) => <circle key={i} cx={78 + i * 16} cy={c.h - 8} r={2.4} fill="#fde68a" />)}
          <text x={c.w - 6} y={16} textAnchor="end" fontSize={8} fontWeight="700" fill="#dbeafe">{c.name}</text>
        </g>
      )
    case 'lcd': {
      const lines = outputs?.lcd ?? ['', '', '', '']
      return (
        <g>
          <rect width={c.w} height={c.h} rx={5} fill="#0b3d0b" stroke="#166534" strokeWidth={2} />
          <rect x={10} y={10} width={c.w - 20} height={c.h - 20} rx={3} fill="#123f12" />
          {lines.slice(0, 4).map((ln, i) => (
            <text key={i} x={18} y={30 + i * 30} fontFamily="monospace" fontSize={15} fill="#7CFC7C" style={{ letterSpacing: '1.5px' }}>
              {(ln || '').slice(0, 20)}
            </text>
          ))}
        </g>
      )
    }
    case 'led': {
      const on = c.id === 'led_red' ? outputs?.redLed : outputs?.greenLed
      return (
        <g>
          <line x1={c.w / 2 - 4} y1={c.h} x2={c.w / 2 - 4} y2={c.h - 14} stroke="#94a3b8" strokeWidth={1.5} />
          <line x1={c.w / 2 + 4} y1={c.h} x2={c.w / 2 + 4} y2={c.h - 18} stroke="#94a3b8" strokeWidth={1.5} />
          {on && <circle cx={c.w / 2} cy={c.h / 2 - 4} r={16} fill={c.color} opacity={0.35} />}
          <circle cx={c.w / 2} cy={c.h / 2 - 4} r={9} fill={on ? c.color : '#334155'} stroke={c.color} strokeWidth={1.5} />
        </g>
      )
    }
    case 'servo': {
      const angle = outputs?.servoAngle ?? 90
      const cx = 34
      const cy = c.h / 2
      const rad = ((angle - 90) * Math.PI) / 180
      return (
        <g>
          <rect x={20} y={c.h / 2 - 26} width={64} height={52} rx={4} fill="#1e293b" stroke="#475569" />
          <rect x={80} y={c.h / 2 - 16} width={30} height={32} rx={3} fill="#334155" />
          <circle cx={cx} cy={cy} r={12} fill="#0f172a" stroke="#64748b" />
          <line x1={cx} y1={cy} x2={cx + Math.cos(rad) * 26} y2={cy + Math.sin(rad) * 26} stroke="#f97316" strokeWidth={4} strokeLinecap="round" />
          <circle cx={cx + Math.cos(rad) * 26} cy={cy + Math.sin(rad) * 26} r={4} fill="#f97316" />
          <text x={70} y={c.h / 2 + 4} textAnchor="middle" fontSize={9} fill="#e2e8f0" fontFamily="monospace">{angle}°</text>
        </g>
      )
    }
    case 'switch': {
      const on = sensors?.pauseSwitch
      return (
        <g>
          <rect width={c.w} height={c.h} rx={4} fill="#334155" stroke="#64748b" />
          <rect x={10} y={c.h / 2 - 14} width={c.w - 20} height={28} rx={14} fill="#0f172a" />
          <circle cx={on ? c.w - 22 : 22} cy={c.h / 2} r={11} fill={on ? '#fbbf24' : '#94a3b8'} />
          <text x={c.w / 2} y={c.h - 4} textAnchor="middle" fontSize={7} fill="#cbd5e1">SW</text>
        </g>
      )
    }
    default:
      return <rect width={c.w} height={c.h} rx={4} fill="#334155" />
  }
}

// ---------------------------------------------------------------------------
const center = (c: ComponentMeta) => ({ x: c.x + c.w / 2, y: c.y + c.h / 2 })
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)
