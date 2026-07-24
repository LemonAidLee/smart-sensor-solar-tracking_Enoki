'use client'

import { useTwinStore } from '@/lib/engine/store'
import { activeFacing, bearingToSvg } from '@/lib/engine/solarViz'

/**
 * SolarGeometryBody — teaches how the sun angles are defined and how they relate
 * to the building. Rendered inside a FloatingWindow (which owns title/drag/
 * collapse/close). It consolidates:
 *   • live Sun-Altitude arc (side elevation)
 *   • live Sun-Azimuth compass (top-down, N/E/S/W + building orientation + sun)
 *   • plain-language definitions of both measurements
 *   • the currently sun-facing surface
 * It updates continuously from the throttled simulation snapshot.
 */
export function SolarGeometryBody() {
  const snap = useTwinStore((s) => s.snapshot)
  const { azimuth, altitude, isDaytime } = snap.sun
  const orientation = snap.orientation
  const facing = activeFacing(azimuth, altitude, orientation)

  return (
    <div>
      {/* Time */}
      <Row label="Time" value={snap.clockLabel} />

          <Divider />

          {/* Altitude */}
          <div className="mb-1 flex items-baseline justify-between">
            <p className="text-[11px] font-medium text-white/70">Sun Altitude</p>
            <p className="font-mono text-lg font-semibold text-amber-300 tabular-nums">{altitude.toFixed(1)}°</p>
          </div>
          <p className="mb-2 text-[10px] italic text-white/40">Vertical angle from the local horizon.</p>
          <AltitudeArc altitude={altitude} />
          <p className="mt-1.5 text-[10px] leading-snug text-white/45">
            Measured upward from the local horizontal plane to the Sun.
          </p>

          <Divider />

          {/* Azimuth + compass */}
          <div className="mb-1 flex items-baseline justify-between">
            <p className="text-[11px] font-medium text-white/70">Sun Azimuth</p>
            <p className="font-mono text-lg font-semibold text-electric tabular-nums">{Math.round(azimuth)}°</p>
          </div>
          <p className="mb-2 text-[10px] italic text-white/40">Horizontal angle, clockwise from True North.</p>
          <AzimuthCompass azimuth={azimuth} facingColor={facing.color} />
          <p className="mt-1.5 text-[10px] leading-snug text-white/45">
            Measured clockwise from True North to the Sun&apos;s horizontal projection.
          </p>

          <Divider />

          {/* Active surface — building orientation itself is shown in the 3D scene's
              world compass overlay, not duplicated here. */}
          <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-white/50">Current Sun-Facing Surface</p>
          <div className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2">
            <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: facing.color, boxShadow: `0 0 10px ${facing.color}` }} />
            <span className="text-sm font-semibold text-white/85">{isDaytime ? facing.label : 'Night — no direct sun'}</span>
          </div>

          {/* Source attribution for the solar position model */}
          <div className="mt-3 border-t border-white/8 pt-2 text-[9px] leading-snug text-white/35">
            Solar position: NOAA Solar Calculator methodology (Meeus,{' '}
            <span className="italic">Astronomical Algorithms</span>, 1998).
            <br />
            <a
              href="https://gml.noaa.gov/grad/solcalc/"
              target="_blank"
              rel="noreferrer"
              className="text-white/45 underline decoration-white/20 underline-offset-2 transition-colors hover:text-electric"
            >
              gml.noaa.gov/grad/solcalc
            </a>
          </div>
    </div>
  )
}

/* -- side-elevation altitude arc ------------------------------------------- */
function AltitudeArc({ altitude }: { altitude: number }) {
  const ox = 52
  const oy = 96
  const rx = 150
  const ry = 80
  const a = (Math.max(-6, Math.min(90, altitude)) * Math.PI) / 180
  const sunX = ox + rx * Math.cos(a)
  const sunY = oy - ry * Math.sin(a)
  // small angle arc near the observer
  const ar = 32
  const arcEndX = ox + ar * Math.cos(a)
  const arcEndY = oy - ar * Math.sin(a)

  return (
    <svg viewBox="0 0 236 128" className="w-full">
      {/* horizon */}
      <line x1={16} y1={oy} x2={220} y2={oy} stroke="rgba(255,255,255,0.28)" strokeWidth={1} strokeDasharray="4 4" />
      <text x={222} y={oy + 3} fontSize={8} fill="rgba(255,255,255,0.4)">horizon</text>
      {/* sight line to the sun */}
      <line x1={ox} y1={oy} x2={sunX} y2={sunY} stroke="#fbbf24" strokeWidth={1.6} />
      {/* angle arc */}
      <path d={`M ${ox + ar} ${oy} A ${ar} ${ar} 0 0 0 ${arcEndX} ${arcEndY}`} fill="none" stroke="#fbbf24" strokeWidth={1.2} />
      <text x={ox + ar + 6} y={oy - 10} fontSize={11} fontWeight={600} fill="#fbbf24">
        {altitude.toFixed(1)}°
      </text>
      {/* sun */}
      <circle cx={sunX} cy={sunY} r={6} fill="#fbbf24" />
      <circle cx={sunX} cy={sunY} r={10} fill="#fbbf24" opacity={0.25} />
      {/* observer / building */}
      <rect x={ox - 5} y={oy - 12} width={10} height={12} rx={1} fill="#64748b" />
      <circle cx={ox} cy={oy} r={2.5} fill="#e2e8f0" />
      <text x={ox - 20} y={oy + 14} fontSize={8} fill="rgba(255,255,255,0.45)">observer</text>
    </svg>
  )
}

/* -- top-down azimuth compass ---------------------------------------------- */
function AzimuthCompass({ azimuth, facingColor }: { azimuth: number; facingColor: string }) {
  const cx = 80
  const cy = 80
  const r = 58
  const sun = bearingToSvg(azimuth)
  const sunX = cx + r * sun.x
  const sunY = cy + r * sun.y
  const arcR = 30
  const arcEndX = cx + arcR * sun.x
  const arcEndY = cy + arcR * sun.y
  // sweep the short way for < 180, long way otherwise (clockwise from north)
  const largeArc = ((azimuth % 360) + 360) % 360 > 180 ? 1 : 0

  return (
    <svg viewBox="0 0 160 160" className="mx-auto w-[150px]">
      <circle cx={cx} cy={cy} r={r} fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.15)" strokeWidth={1} />
      {/* cardinal ticks */}
      {[0, 90, 180, 270].map((b) => {
        const d = bearingToSvg(b)
        return <line key={b} x1={cx + (r - 6) * d.x} y1={cy + (r - 6) * d.y} x2={cx + r * d.x} y2={cy + r * d.y} stroke="rgba(255,255,255,0.35)" strokeWidth={1} />
      })}
      <text x={cx} y={16} fontSize={11} fontWeight={700} fill="#fff" textAnchor="middle">N</text>
      <text x={152} y={cy + 4} fontSize={11} fontWeight={600} fill="rgba(255,255,255,0.6)" textAnchor="middle">E</text>
      <text x={cx} y={156} fontSize={11} fontWeight={600} fill="rgba(255,255,255,0.6)" textAnchor="middle">S</text>
      <text x={8} y={cy + 4} fontSize={11} fontWeight={600} fill="rgba(255,255,255,0.6)" textAnchor="middle">W</text>

      {/* azimuth sweep from North */}
      <path d={`M ${cx} ${cy - arcR} A ${arcR} ${arcR} 0 ${largeArc} 1 ${arcEndX} ${arcEndY}`} fill="none" stroke={facingColor} strokeWidth={1.4} />
      {/* sun direction needle */}
      <line x1={cx} y1={cy} x2={sunX} y2={sunY} stroke="#fbbf24" strokeWidth={1.8} />
      <circle cx={sunX} cy={sunY} r={5} fill="#fbbf24" />
      <circle cx={sunX} cy={sunY} r={9} fill="#fbbf24" opacity={0.25} />
      <circle cx={cx} cy={cy} r={2.5} fill="#e2e8f0" />
    </svg>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <p className="text-[11px] font-medium text-white/70">{label}</p>
      <p className="font-mono text-base font-semibold text-white/85 tabular-nums">{value}</p>
    </div>
  )
}

function Divider() {
  return <div className="my-3 h-px bg-white/8" />
}
