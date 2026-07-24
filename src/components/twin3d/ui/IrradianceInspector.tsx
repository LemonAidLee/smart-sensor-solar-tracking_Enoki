'use client'

import { useState } from 'react'
import { useTwinStore } from '@/lib/engine/store'

/**
 * Irradiance Engineering Inspector — ASHRAE Clear Sky Pipeline.
 *
 * Shows the complete calculation chain from solar position through
 * atmospheric attenuation to final GHI, with every intermediate value
 * and its physical meaning explained.
 */
export function IrradianceInspector({ onClose }: { onClose: () => void }) {
  const snap = useTwinStore((s) => s.snapshot)
  const s = snap.sun

  return (
    <div className="glass-strong fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative max-h-[85vh] w-[420px] max-w-[92vw] overflow-y-auto rounded-3xl border border-white/10 bg-[#0d1117]/95 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button onClick={onClose} className="absolute right-4 top-4 text-white/40 hover:text-white transition-colors text-lg font-light">✕</button>

        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-300/80 mb-1">Engineering Inspector</p>
        <h2 className="text-lg font-bold text-white mb-1">Global Horizontal Irradiance</h2>
        <p className="text-[11px] text-white/50 mb-4">ASHRAE Clear Sky Model (τb, τd formulation)</p>

        {/* Pipeline diagram */}
        <div className="mb-4 rounded-xl bg-white/[0.03] p-3">
          <p className="text-[9px] uppercase tracking-wider text-white/40 mb-2">Calculation Pipeline</p>
          <AtmosphereDiagram altitude={s.altitude} />
        </div>

        {/* Step-by-step values */}
        <div className="space-y-0.5">
          <PipelineStep
            label="Solar Altitude"
            value={`${s.altitude.toFixed(1)}°`}
            desc="Angle of the sun above the local horizon."
          />
          <Arrow />
          <PipelineStep
            label="Zenith Angle"
            value={`${s.zenithAngle.toFixed(1)}°`}
            desc="Angle from directly overhead. θz = 90° − altitude."
          />
          <Arrow />
          <PipelineStep
            label="Air Mass (m)"
            value={`${s.airMass}`}
            desc="Relative atmospheric path length. m = 1/(sin h + 0.50572·(h+6.08)⁻¹·⁶⁴). Kasten & Young (1989)."
          />
          <Arrow />
          <PipelineStep
            label="Extraterrestrial Irradiance (E₀)"
            value={`${s.extraterrestrialIrradiance} W/m²`}
            desc="Solar constant (1361 W/m²) corrected for Earth–Sun distance variation. Spencer (1971)."
          />
          <Arrow />
          <div className="flex gap-2">
            <div className="flex-1">
              <PipelineStep
                label="τb (beam optical depth)"
                value={`${s.tauB.toFixed(3)}`}
                desc="Monthly beam turbidity for KL."
              />
            </div>
            <div className="flex-1">
              <PipelineStep
                label="τd (diffuse optical depth)"
                value={`${s.tauD.toFixed(3)}`}
                desc="Monthly diffuse turbidity for KL."
              />
            </div>
          </div>
          <Arrow />
          <div className="flex gap-2">
            <div className="flex-1">
              <PipelineStep
                label="DNI (clear sky)"
                value={`${s.dniClearSky} W/m²`}
                desc="E₀ × exp(−τb × m^ab)"
              />
            </div>
            <div className="flex-1">
              <PipelineStep
                label="DHI (clear sky)"
                value={`${s.dhiClearSky} W/m²`}
                desc="E₀ × exp(−τd × m^ad)"
              />
            </div>
          </div>
          <Arrow />
          <PipelineStep
            label="GHI (clear sky)"
            value={`${s.ghiClearSky} W/m²`}
            desc="DNI × sin(altitude) + DHI. Total irradiance on a horizontal surface before cloud correction."
            highlight
          />
          <Arrow />
          <PipelineStep
            label="Cloud Modification Factor"
            value={`${s.cloudModificationFactor.toFixed(3)}`}
            desc={`CMF = 1 − C × 0.75. Cloud coverage = ${Math.round(snap.weather.cloudCoverage * 100)}%.`}
          />
          <Arrow />
          <PipelineStep
            label="GHI (final)"
            value={`${s.irradiance} W/m²`}
            desc="GHI_clear × CMF. The irradiance reaching the building."
            highlight
            accent
          />
        </div>

        {/* Reference citation */}
        <div className="mt-4 border-t border-white/8 pt-3 text-[9px] leading-snug text-white/35">
          <p className="font-semibold text-white/50 mb-1">References</p>
          <p>
            ASHRAE. <span className="italic">Handbook — Fundamentals</span>, Chapter 14
            &quot;Climatic Design Information&quot;, 2021 edition. τb/τd values for WMOID 486470
            (Kuala Lumpur International Airport).
          </p>
          <p className="mt-1">
            Kasten, F. &amp; Young, A.T. &quot;Revised optical air mass tables and approximation
            formula.&quot; <span className="italic">Applied Optics</span> 28(22), 4735–4738, 1989.
          </p>
          <p className="mt-1">
            Spencer, J.W. &quot;Fourier series representation of the position of the sun.&quot;{' '}
            <span className="italic">Search</span> 2(5), 172, 1971.
          </p>
          <p className="mt-1">
            Kopp, G. &amp; Lean, J.L. &quot;A new, lower value of total solar irradiance.&quot;{' '}
            <span className="italic">Geophys. Res. Lett.</span> 38, L01706, 2011. Solar constant = 1361 W/m².
          </p>
        </div>
      </div>
    </div>
  )
}

/* ── Sub-components ──────────────────────────────────────────────────────── */

function PipelineStep({ label, value, desc, highlight, accent }: {
  label: string; value: string; desc: string; highlight?: boolean; accent?: boolean
}) {
  return (
    <div className={`rounded-lg px-3 py-2 ${highlight ? 'bg-white/[0.06]' : 'bg-white/[0.02]'}`}>
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] font-medium text-white/60">{label}</p>
        <p className={`font-mono text-sm font-semibold tabular-nums ${accent ? 'text-amber-300' : 'text-white/90'}`}>{value}</p>
      </div>
      <p className="mt-0.5 text-[9px] leading-snug text-white/35">{desc}</p>
    </div>
  )
}

function Arrow() {
  return (
    <div className="flex justify-center py-0.5">
      <span className="text-[10px] text-white/25">↓</span>
    </div>
  )
}

/** SVG diagram showing the sun, atmosphere layers, and ground. */
function AtmosphereDiagram({ altitude }: { altitude: number }) {
  const w = 360
  const h = 120
  const groundY = 100
  const sunAngle = Math.max(0, Math.min(90, altitude))
  const sunRad = (sunAngle * Math.PI) / 180
  const sunX = 40 + (w - 80) * (1 - sunAngle / 90) * 0.5
  const sunY = groundY - 70 * Math.sin(sunRad)
  const buildingX = w / 2
  const buildingBase = groundY

  return (
    <svg viewBox={`0 0 ${w} ${h + 10}`} className="w-full">
      {/* Atmosphere gradient band */}
      <defs>
        <linearGradient id="atmo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e3a5f" stopOpacity={0.3} />
          <stop offset="100%" stopColor="#1e3a5f" stopOpacity={0.05} />
        </linearGradient>
      </defs>
      <rect x={0} y={10} width={w} height={groundY - 10} fill="url(#atmo)" rx={6} />
      <text x={w - 8} y={24} fontSize={7} fill="rgba(255,255,255,0.3)" textAnchor="end">Atmosphere</text>

      {/* Cloud layer */}
      <line x1={20} y1={45} x2={w - 20} y2={45} stroke="rgba(148,163,184,0.25)" strokeWidth={1} strokeDasharray="6 4" />
      <text x={w - 8} y={42} fontSize={7} fill="rgba(148,163,184,0.35)" textAnchor="end">Cloud layer</text>

      {/* Sun ray path */}
      {altitude > 0 && (
        <>
          <line x1={sunX} y1={sunY} x2={buildingX} y2={buildingBase - 14} stroke="#fbbf24" strokeWidth={1.5} strokeDasharray="4 3" opacity={0.7} />
          {/* Sun disc */}
          <circle cx={sunX} cy={sunY} r={8} fill="#fbbf24" />
          <circle cx={sunX} cy={sunY} r={13} fill="#fbbf24" opacity={0.15} />
          <text x={sunX} y={sunY - 16} fontSize={7} fill="#fbbf24" textAnchor="middle">Sun ({altitude.toFixed(0)}°)</text>
        </>
      )}

      {/* Ground */}
      <line x1={0} y1={groundY} x2={w} y2={groundY} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
      <text x={w - 8} y={groundY + 10} fontSize={7} fill="rgba(255,255,255,0.3)" textAnchor="end">Ground</text>

      {/* Building */}
      <rect x={buildingX - 8} y={buildingBase - 14} width={16} height={14} rx={1} fill="#64748b" />
      <text x={buildingX} y={buildingBase + 10} fontSize={7} fill="rgba(255,255,255,0.4)" textAnchor="middle">Building</text>
    </svg>
  )
}
