'use client'

import { useState } from 'react'
import {
  Cloud,
  CloudRain,
  Thermometer,
  Wind,
  ChevronDown,
  CornerDownRight,
  type LucideIcon,
} from 'lucide-react'
import type {
  EnvironmentalInfluence,
  InfluenceParameter,
  InfluenceStatus,
} from '@/lib/engine/environmentalInfluence'

/**
 * Environmental Influence cards — the *secondary* narrative of the Cyber-Physical
 * Pipeline.
 *
 * The primary story stays a single vertical spine:
 *
 *     Sun → Environment → Sensor → Embedded Controller → Servo → Adaptive Façade
 *
 * These cards are deliberately subordinate to it. They enter from the side on a
 * dashed rail, use smaller type, desaturated parameter colours, no output chip
 * and no animated flow connector — every visual weight cue that the primary
 * stages own is withheld here, so the eye follows the spine first and discovers
 * the influences second (guide §10, Progressive Disclosure).
 *
 * The component renders only what `src/lib/engine/environmentalInfluence.ts`
 * declares. It contains no mapping logic and asserts no coupling of its own.
 */

/** Desaturated parameter accents — deliberately quieter than the stage accents. */
const PARAM_COLOR: Record<InfluenceParameter, string> = {
  cloud: '#94a3b8', // slate — atmospheric
  temperature: '#fb923c', // muted orange — thermal
  rain: '#60a5fa', // blue — precipitation
  wind: '#5eead4', // teal — mechanical
}

const PARAM_ICON: Record<InfluenceParameter, LucideIcon> = {
  cloud: Cloud,
  temperature: Thermometer,
  rain: CloudRain,
  wind: Wind,
}

/** Visual weight per status — idle influences stay visible but recede. */
const STATUS_STYLE: Record<InfluenceStatus, { opacity: number; tint: string; edge: string }> = {
  idle: { opacity: 0.55, tint: '08', edge: '1f' },
  active: { opacity: 1, tint: '12', edge: '3d' },
  overriding: { opacity: 1, tint: '1c', edge: '66' },
}

/**
 * A side-entry group of influences feeding one pipeline stage. Renders nothing
 * when the stage has no influences — which is itself meaningful (the Sensor
 * stage has none, because nothing modifies a measurement).
 */
export function InfluenceRail({ influences }: { influences: EnvironmentalInfluence[] }) {
  if (influences.length === 0) return null
  return (
    <div className="mt-1.5 pl-1.5">
      <div className="border-l border-dashed border-white/15 pl-2">
        <p className="mb-1 flex items-center gap-1 text-[7.5px] font-semibold uppercase tracking-[0.14em] text-white/30">
          <CornerDownRight className="h-2.5 w-2.5" />
          Environmental influence
        </p>
        <div className="space-y-1">
          {influences.map((inf) => (
            <InfluenceCard key={inf.key} influence={inf} />
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * One influence: parameter, live value, what it is doing to this stage, and a
 * one-line explanation — with the full engineering detail behind a toggle.
 */
export function InfluenceCard({ influence }: { influence: EnvironmentalInfluence }) {
  const [open, setOpen] = useState(false)
  const color = PARAM_COLOR[influence.parameter]
  const Icon = PARAM_ICON[influence.parameter]
  const style = STATUS_STYLE[influence.status]

  return (
    <div
      className="overflow-hidden rounded-lg border transition-opacity"
      style={{
        borderColor: `${color}${style.edge}`,
        background: `${color}${style.tint}`,
        opacity: style.opacity,
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-2 py-1.5 text-left transition-colors hover:bg-white/[0.03]"
      >
        {/* Identity row — parameter, state, live value */}
        <div className="flex items-center gap-1.5">
          <Icon className="h-3 w-3 shrink-0" style={{ color }} />
          <span className="text-[9.5px] font-semibold text-white/75">{influence.label}</span>
          {influence.status === 'overriding' && (
            <span
              className="rounded px-1 py-[1px] text-[6.5px] font-bold tracking-wider"
              style={{ background: `${color}2e`, color }}
            >
              OVERRIDE
            </span>
          )}
          <span className="ml-auto shrink-0 font-mono text-[9.5px] font-semibold" style={{ color }}>
            {influence.display}
          </span>
          <ChevronDown
            className={`h-2.5 w-2.5 shrink-0 text-white/30 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
          />
        </div>

        {/* Live effect on THIS stage */}
        <p className="mt-0.5 text-[9px] leading-snug text-white/55">{influence.effect}</p>

        {/* Concise explanation — always visible (disclosure level 1) */}
        <p className="mt-0.5 text-[8.5px] italic leading-snug text-white/35">{influence.summary}</p>
      </button>

      {/* Engineering detail (disclosure level 2) */}
      {open && (
        <div className="space-y-1.5 border-t border-white/8 bg-black/25 px-2 py-1.5">
          {influence.state && (
            <p className="text-[8px] uppercase tracking-wider" style={{ color }}>
              Assessed state · {influence.state}
            </p>
          )}

          <p className="text-[9px] leading-relaxed text-white/60">{influence.detail.mechanism}</p>

          {/* Traceable path through the pipeline */}
          <div className="rounded bg-white/[0.03] px-1.5 py-1">
            {influence.detail.path.map((step, i) => (
              <p key={i} className="font-mono text-[8px] leading-relaxed text-white/45">
                {i > 0 && <span className="text-white/20">↳ </span>}
                {step}
              </p>
            ))}
          </div>

          {influence.detail.thresholds && (
            <div className="grid grid-cols-[1fr_auto] gap-x-2 gap-y-0.5">
              {influence.detail.thresholds.map(([k, v]) => (
                <div key={k} className="contents">
                  <span className="text-[8px] text-white/35">{k}</span>
                  <span className="text-right font-mono text-[8px] text-white/60">{v}</span>
                </div>
              ))}
            </div>
          )}

          {/* The mental-model guard — as important as the mechanism itself */}
          <div className="rounded border-l-2 px-1.5 py-1" style={{ borderColor: `${color}55`, background: '#ffffff06' }}>
            <p className="text-[7.5px] font-bold uppercase tracking-wider text-white/35">Does not affect</p>
            <p className="mt-0.5 text-[8.5px] leading-relaxed text-white/50">{influence.detail.doesNotAffect}</p>
          </div>

          {influence.detail.reference && (
            <p className="text-[7.5px] leading-relaxed text-white/25">Ref: {influence.detail.reference}</p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The legend that establishes the hierarchy before the user reads a single
 * stage: a solid spine is the signal path, a dashed side-entry is an influence.
 */
export function InfluenceLegend() {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-white/8 bg-white/[0.02] px-2 py-1.5">
      <span className="flex items-center gap-1.5">
        <span className="h-px w-4 bg-white/50" />
        <span className="text-[8px] uppercase tracking-wider text-white/45">Signal path</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-px w-4 border-t border-dashed border-white/35" />
        <span className="text-[8px] uppercase tracking-wider text-white/35">Environmental influence</span>
      </span>
    </div>
  )
}
