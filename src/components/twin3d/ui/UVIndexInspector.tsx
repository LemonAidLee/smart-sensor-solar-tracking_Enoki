'use client'

import { useTwinStore } from '@/lib/engine/store'

/**
 * UV Index Engineering Inspector — WHO / WMO Standard Pipeline.
 *
 * Shows the complete calculation chain from solar position through
 * ozone column and erythemal weighting to final UV Index, with every
 * intermediate value and its physical meaning explained.
 */
export function UVIndexInspector({ onClose }: { onClose: () => void }) {
  const snap = useTwinStore((s) => s.snapshot)
  const s = snap.sun

  // Compute UVI category for display
  const uviCategory = s.uvIndex < 3 ? 'Low' : s.uvIndex < 6 ? 'Moderate' : s.uvIndex < 8 ? 'High' : s.uvIndex < 11 ? 'Very High' : 'Extreme'
  const uviColor = s.uvIndex < 3 ? '#22c55e' : s.uvIndex < 6 ? '#eab308' : s.uvIndex < 8 ? '#f97316' : s.uvIndex < 11 ? '#ef4444' : '#a855f7'

  return (
    <div className="glass-strong fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="relative max-h-[85vh] w-[420px] max-w-[92vw] overflow-y-auto rounded-3xl border border-white/10 bg-[#0d1117]/95 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="absolute right-4 top-4 text-white/40 hover:text-white transition-colors text-lg font-light">✕</button>

        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-300/80 mb-1">Engineering Inspector</p>
        <h2 className="text-lg font-bold text-white mb-1">UV Index</h2>
        <p className="text-[11px] text-white/50 mb-4">WHO / WMO Global Solar UV Index Standard</p>

        {/* UV Scale */}
        <div className="mb-4 rounded-xl bg-white/[0.03] p-3">
          <p className="text-[9px] uppercase tracking-wider text-white/40 mb-2">WHO UV Index Scale</p>
          <UVScaleDiagram uvIndex={s.uvIndex} />
          <div className="mt-2 flex items-center justify-center gap-2">
            <span className="font-mono text-2xl font-bold tabular-nums" style={{ color: uviColor }}>{s.uvIndex}</span>
            <span className="text-sm font-semibold" style={{ color: uviColor }}>{uviCategory}</span>
          </div>
        </div>

        {/* UV Pathway diagram */}
        <div className="mb-4 rounded-xl bg-white/[0.03] p-3">
          <p className="text-[9px] uppercase tracking-wider text-white/40 mb-2">Atmospheric UV Filtering</p>
          <UVPathDiagram altitude={s.altitude} />
        </div>

        {/* Pipeline steps */}
        <div className="space-y-0.5">
          <PipelineStep
            label="Solar Altitude"
            value={`${s.altitude.toFixed(1)}°`}
            desc="Angle of the sun above the horizon. Higher altitude = shorter atmospheric path = more UV."
          />
          <Arrow />
          <PipelineStep
            label="Zenith Angle (θz)"
            value={`${s.zenithAngle.toFixed(1)}°`}
            desc="Angle from directly overhead. θz = 90° − altitude."
          />
          <Arrow />
          <PipelineStep
            label="Total Column Ozone"
            value={`${s.ozoneDU} DU`}
            desc="Dobson Units. Annual mean for equatorial Malaysia. Ozone absorbs UV-B radiation. WMO GAW Report No. 239 (2018)."
          />
          <Arrow />
          <PipelineStep
            label="Clear-Sky Erythemal UV (E_UV)"
            value={`${(s.uvErythemalClearSky * 1000).toFixed(2)} mW/m²`}
            desc="E_UV = 0.325 × cos(θz)^1.4 W/m². Erythemal (skin-burning) UV weighted by the CIE action spectrum. Calibrated from TEMIS climatology for equatorial latitudes."
          />
          <Arrow />
          <PipelineStep
            label="Cloud Modification Factor"
            value={`${s.uvCloudModificationFactor.toFixed(3)}`}
            desc={`CMF = 1 − 0.73 × C^3.4. Cloud cover = ${Math.round(snap.weather.cloudCoverage * 100)}%. Bodeker & McKenzie (1996).`}
          />
          <Arrow />
          <PipelineStep
            label="UV Index"
            value={`${s.uvIndex}`}
            desc={`UVI = k_er × E_UV × CMF, where k_er = 40 m²/W (WHO definition). Category: ${uviCategory}.`}
            highlight
            accent
            accentColor={uviColor}
          />
        </div>

        {/* WHO UV Index categories */}
        <div className="mt-3 rounded-lg bg-white/[0.03] p-3">
          <p className="text-[9px] uppercase tracking-wider text-white/40 mb-2">WHO Exposure Categories</p>
          <div className="grid grid-cols-5 gap-1 text-center text-[8px]">
            <div className="rounded px-1 py-1.5 bg-green-500/20 text-green-400">
              <p className="font-bold">1–2</p><p>Low</p>
            </div>
            <div className="rounded px-1 py-1.5 bg-yellow-500/20 text-yellow-400">
              <p className="font-bold">3–5</p><p>Moderate</p>
            </div>
            <div className="rounded px-1 py-1.5 bg-orange-500/20 text-orange-400">
              <p className="font-bold">6–7</p><p>High</p>
            </div>
            <div className="rounded px-1 py-1.5 bg-red-500/20 text-red-400">
              <p className="font-bold">8–10</p><p>Very High</p>
            </div>
            <div className="rounded px-1 py-1.5 bg-purple-500/20 text-purple-400">
              <p className="font-bold">11+</p><p>Extreme</p>
            </div>
          </div>
        </div>

        {/* Reference citations */}
        <div className="mt-4 border-t border-white/8 pt-3 text-[9px] leading-snug text-white/35">
          <p className="font-semibold text-white/50 mb-1">References</p>
          <p>
            WHO. &quot;Global Solar UV Index: A Practical Guide.&quot; WHO/SDE/OEH/02.2,
            World Health Organization, 2002.{' '}
            <a href="https://www.who.int/publications/i/item/9241590076" target="_blank" rel="noreferrer"
              className="text-white/45 underline decoration-white/20 underline-offset-2 hover:text-electric transition-colors">
              who.int
            </a>
          </p>
          <p className="mt-1">
            WMO. &quot;Scientific Assessment of Ozone Depletion: 2018.&quot; Global Atmosphere
            Watch Report No. 239, 2018. Total column ozone = 260 DU (equatorial Malaysia annual mean, Fig 3-4).
          </p>
          <p className="mt-1">
            Bodeker, G.E. &amp; McKenzie, R.L. &quot;An algorithm for inferring surface UV irradiance
            including cloud effects.&quot; <span className="italic">J. Applied Meteorology</span> 35, 1860–1877, 1996.
            Cloud modification factor CMF = 1 − 0.73 × C^3.4.
          </p>
          <p className="mt-1">
            TEMIS (Tropospheric Emission Monitoring Internet Service). UV Index climatology.{' '}
            <a href="https://www.temis.nl/uvradiation/UVindex.php" target="_blank" rel="noreferrer"
              className="text-white/45 underline decoration-white/20 underline-offset-2 hover:text-electric transition-colors">
              temis.nl
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}

/* ── Sub-components ──────────────────────────────────────────────────────── */

function PipelineStep({ label, value, desc, highlight, accent, accentColor }: {
  label: string; value: string; desc: string; highlight?: boolean; accent?: boolean; accentColor?: string
}) {
  return (
    <div className={`rounded-lg px-3 py-2 ${highlight ? 'bg-white/[0.06]' : 'bg-white/[0.02]'}`}>
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] font-medium text-white/60">{label}</p>
        <p className="font-mono text-sm font-semibold tabular-nums" style={{ color: accent ? (accentColor ?? '#fbbf24') : 'rgba(255,255,255,0.9)' }}>{value}</p>
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

/** WHO UV Index colour scale bar with current position indicator. */
function UVScaleDiagram({ uvIndex }: { uvIndex: number }) {
  const maxUV = 14
  const pct = Math.min(100, (uvIndex / maxUV) * 100)
  return (
    <div className="relative h-4 w-full rounded-full overflow-hidden">
      <div className="absolute inset-0 flex">
        <div className="flex-[2] bg-green-500/60" />
        <div className="flex-[3] bg-yellow-500/60" />
        <div className="flex-[2] bg-orange-500/60" />
        <div className="flex-[3] bg-red-500/60" />
        <div className="flex-[4] bg-purple-500/60" />
      </div>
      <div
        className="absolute top-0 h-full w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]"
        style={{ left: `${pct}%` }}
      />
    </div>
  )
}

/** SVG showing UV filtering through the atmosphere. */
function UVPathDiagram({ altitude }: { altitude: number }) {
  const w = 360
  const h = 110
  const groundY = 95

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      {/* Ozone layer */}
      <rect x={10} y={18} width={w - 20} height={14} rx={4} fill="rgba(168,85,247,0.12)" stroke="rgba(168,85,247,0.25)" strokeWidth={0.5} />
      <text x={w / 2} y={28} fontSize={7} fill="rgba(168,85,247,0.5)" textAnchor="middle">Ozone Layer (260 DU)</text>

      {/* Atmosphere */}
      <rect x={10} y={34} width={w - 20} height={55} rx={4} fill="rgba(30,58,95,0.15)" />
      <text x={w - 16} y={65} fontSize={7} fill="rgba(255,255,255,0.2)" textAnchor="end">Atmosphere</text>

      {/* UV rays */}
      {altitude > 0 && (
        <>
          {/* UV-A (longer, passes through) */}
          <line x1={100} y1={8} x2={w / 2 - 20} y2={groundY - 5} stroke="#a78bfa" strokeWidth={1.5} opacity={0.5} strokeDasharray="3 2" />
          <text x={85} y={8} fontSize={7} fill="#a78bfa" textAnchor="end">UV-A</text>

          {/* UV-B (partially absorbed by ozone) */}
          <line x1={180} y1={8} x2={w / 2} y2={groundY - 5} stroke="#f97316" strokeWidth={1.5} opacity={0.4} strokeDasharray="3 2" />
          <text x={182} y={8} fontSize={7} fill="#f97316" textAnchor="middle">UV-B</text>

          {/* UV-C (fully absorbed) */}
          <line x1={260} y1={8} x2={260} y2={30} stroke="#ef4444" strokeWidth={1.5} opacity={0.4} />
          <text x={262} y={8} fontSize={7} fill="#ef4444">UV-C</text>
          <text x={262} y={42} fontSize={6} fill="rgba(239,68,68,0.5)">blocked</text>
        </>
      )}

      {/* Ground */}
      <line x1={0} y1={groundY} x2={w} y2={groundY} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />

      {/* Building */}
      <rect x={w / 2 - 8} y={groundY - 12} width={16} height={12} rx={1} fill="#64748b" />
      <text x={w / 2} y={groundY + 10} fontSize={7} fill="rgba(255,255,255,0.4)" textAnchor="middle">Surface UV → UVI</text>
    </svg>
  )
}
