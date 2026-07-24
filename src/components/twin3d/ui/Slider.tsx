'use client'

import { useId } from 'react'

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  display?: string
  accent?: string
  onChange: (v: number) => void
  onScrubStart?: () => void
  onScrubEnd?: () => void
}

/** Compact engineering slider with a gradient fill underlay + emerald thumb. */
export function Slider({
  label,
  value,
  min,
  max,
  step,
  display,
  accent = '#00D084',
  onChange,
  onScrubStart,
  onScrubEnd,
}: SliderProps) {
  const id = useId()
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div>
      {label && (
        <div className="mb-1.5 flex items-baseline justify-between">
          <label htmlFor={id} className="text-[10px] font-medium uppercase tracking-[0.15em] text-white/50">
            {label}
          </label>
          <span className="font-mono text-[11px] font-semibold tabular-nums" style={{ color: accent, textShadow: `0 0 8px ${accent}66` }}>
            {display ?? value}
          </span>
        </div>
      )}
      <div className="relative flex items-center h-4">
        <div className="pointer-events-none absolute inset-x-0 h-[2px] rounded-full bg-white/10" />
        <div
          className="pointer-events-none absolute h-[2px] rounded-full"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${accent}, ${accent}dd)`, boxShadow: `0 0 10px ${accent}88` }}
        />
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          onPointerDown={onScrubStart}
          onPointerUp={onScrubEnd}
          onPointerCancel={onScrubEnd}
          className="wx-range relative z-10"
        />
      </div>
    </div>
  )
}
