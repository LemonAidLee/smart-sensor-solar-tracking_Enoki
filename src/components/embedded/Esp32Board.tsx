'use client'

import { motion } from 'framer-motion'
import type { PinGroup } from '@/lib/embedded'

export interface BoardPin {
  id: string
  /** Pin/channel label, e.g. "ADC0". */
  label: string
  /** What it's wired to, e.g. "LDR Upper". */
  sublabel: string
  group: PinGroup
  side: 'left' | 'right'
  /** Normalised 0–1 signal magnitude — quantized to trigger the activity pulse. */
  raw: number
}

const GROUP_COLOR: Record<PinGroup, string> = {
  analog: '#f59e0b',
  digital: '#38bdf8',
  pwm: '#a78bfa',
  i2c: '#34d399',
}

const GROUP_LABEL: Record<PinGroup, string> = {
  analog: 'Analog In',
  digital: 'Digital I/O',
  pwm: 'PWM',
  i2c: 'I²C',
}

const BOARD_W = 300
const BOARD_H = 230
const PCB_X = 78
const PCB_W = BOARD_W - PCB_X * 2
const PCB_Y = 14
const PCB_H = BOARD_H - 28

/**
 * Esp32Board — a compact, subdued ESP32-S3 illustration. Pins are colour-coded
 * by signal type (Analog / Digital / PWM / I²C) and each carries a small dot
 * that briefly pulses when its underlying reading crosses into a new
 * "quantised bucket" (see `pulseKey` below) — a deliberately subtle activity
 * indicator, not a constant blink.
 */
export function Esp32Board({ pins }: { pins: BoardPin[] }) {
  const left = pins.filter((p) => p.side === 'left')
  const right = pins.filter((p) => p.side === 'right')

  return (
    <svg viewBox={`0 0 ${BOARD_W} ${BOARD_H}`} className="w-full" style={{ maxHeight: 230 }}>
      {/* PCB */}
      <rect x={PCB_X} y={PCB_Y} width={PCB_W} height={PCB_H} rx={6} fill="#161b22" stroke="#2b3340" strokeWidth={1} />
      {/* RF shield can */}
      <rect x={PCB_X + 10} y={PCB_Y + 10} width={54} height={40} rx={2} fill="#2a313c" stroke="#3a4451" />
      {[0, 1, 2, 3].map((i) => (
        <line key={i} x1={PCB_X + 12} y1={PCB_Y + 16 + i * 9} x2={PCB_X + 60} y2={PCB_Y + 16 + i * 9} stroke="#20262f" strokeWidth={1} />
      ))}
      {/* Silkscreen label */}
      <text x={PCB_X + PCB_W / 2} y={PCB_Y + PCB_H / 2 - 2} textAnchor="middle" fontSize={16} fontWeight="bold" fontFamily="sans-serif" fill="#f8fafc" letterSpacing="0.05em">
        ESP32-S3
      </text>
      <text x={PCB_X + PCB_W / 2} y={PCB_Y + PCB_H / 2 + 16} textAnchor="middle" fontSize={8} fontWeight="500" fontFamily="sans-serif" fill="#94a3b8">
        Facade Module · Upper Centre
      </text>
      {/* USB-C connector */}
      <rect x={PCB_X + PCB_W / 2 - 12} y={PCB_Y + PCB_H - 2} width={24} height={8} rx={2} fill="#2b3340" />

      {left.map((p, i) => (
        <PinRow key={p.id} pin={p} index={i} count={left.length} side="left" />
      ))}
      {right.map((p, i) => (
        <PinRow key={p.id} pin={p} index={i} count={right.length} side="right" />
      ))}

      {/* Legend */}
      <Legend />
    </svg>
  )
}

function PinRow({ pin, index, count, side }: { pin: BoardPin; index: number; count: number; side: 'left' | 'right' }) {
  const y = PCB_Y + ((index + 0.5) / count) * PCB_H
  const color = GROUP_COLOR[pin.group]
  const edgeX = side === 'left' ? PCB_X : PCB_X + PCB_W
  const outerX = side === 'left' ? PCB_X - 22 : PCB_X + PCB_W + 22
  const textX = side === 'left' ? outerX - 4 : outerX + 4
  const anchor = side === 'left' ? 'end' : 'start'
  // Quantise the raw signal into coarse buckets so the pulse fires only on a
  // meaningful change, not every render — the "brief, subtle" activity blip.
  const bucket = Math.round(pin.raw * 12)

  return (
    <g>
      <line x1={edgeX} y1={y} x2={outerX} y2={y} stroke={color} strokeWidth={1.5} opacity={0.55} />
      <motion.circle
        key={bucket}
        cx={outerX}
        cy={y}
        r={3}
        fill={color}
        initial={{ opacity: 0.5, scale: 1 }}
        animate={{ opacity: [0.5, 1, 0.65], scale: [1, 1.6, 1] }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
      />
      <text x={textX} y={y - 3} textAnchor={anchor} fontSize={9} fontWeight="bold" fontFamily="monospace" fill={color}>
        {pin.label}
      </text>
      <text x={textX} y={y + 7} textAnchor={anchor} fontSize={8} fill="#94a3b8" fontWeight="500">
        {pin.sublabel}
      </text>
    </g>
  )
}

function Legend() {
  const groups: PinGroup[] = ['analog', 'digital', 'pwm', 'i2c']
  return (
    <g transform={`translate(${BOARD_W / 2 - 90}, ${BOARD_H - 8})`}>
      {groups.map((g, i) => (
        <g key={g} transform={`translate(${i * 48}, 0)`}>
          <circle cx={0} cy={0} r={2.5} fill={GROUP_COLOR[g]} />
          <text x={5} y={3} fontSize={8} fill="#94a3b8" fontWeight="500">
            {GROUP_LABEL[g]}
          </text>
        </g>
      ))}
    </g>
  )
}
