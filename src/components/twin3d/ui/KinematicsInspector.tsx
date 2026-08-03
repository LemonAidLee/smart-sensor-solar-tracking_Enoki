'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { getSimulation } from '@/lib/engine/simulation'
import { useTwinStore, getActiveDemonstrationSurface } from '@/lib/engine/store'
import {
  PanelKinematics,
  solarVector,
  solve,
  wrap360,
  type Vec3,
} from '@/lib/kinematics'
import { activeFacing } from '@/lib/engine/solarViz'
import { BLADE_LABEL, describeBladeMotion, formatBladeAngle } from '@/lib/dt/bladeAngle'

/**
 * KinematicsBody — the engineering "why did it rotate?" panel, rendered inside a
 * FloatingWindow (which owns title/drag/collapse/close).
 *
 * For one selected façade surface it shows the pure-geometry chain the
 * RotationSolver used: solar vector → panel normal → incident angle → projected
 * exposure → Target Blade Angle, plus the A–E candidate comparison. Reads the live
 * simulation each render; no decision logic of its own.
 *
 * Rotation is presented with the twin-wide vocabulary from `@/lib/dt/bladeAngle`
 * (Current Blade Angle · Target Blade Angle · Servo Status) — this panel used to
 * call the solver's output "Commanded Rotation", a third name for the same
 * number.
 */
export function KinematicsBody() {
  const snap = useTwinStore((s) => s.snapshot)
  const debugId = useTwinStore((s) => s.debugSurfaceId)
  const setDebugSurface = useTwinStore((s) => s.setDebugSurface)
  const trackingIntent = useTwinStore((s) => s.trackingIntent)

  const sim = getSimulation()
  const summaries = snap.surfaces
  const surface = getActiveDemonstrationSurface(sim, debugId)

  if (!surface) return <p className="text-[11px] text-white/45">No surface data.</p>

  return (
    <InspectorBody
      surfaceName={surface.name}
      normal={surface.normal}
      currentAngle={surface.panels[0]?.rotationAngle ?? 0}
      altitude={snap.sun.altitude}
      azimuth={snap.sun.azimuth}
      orientation={snap.orientation}
      intent={trackingIntent}
      summaries={summaries.map((s) => ({ id: s.id, active: s.id === debugId }))}
      onPick={setDebugSurface}
    />
  )
}

function InspectorBody({
  surfaceName,
  normal,
  currentAngle,
  altitude,
  azimuth,
  orientation,
  intent,
  summaries,
  onPick,
}: {
  surfaceName: string
  normal: Vec3
  currentAngle: number
  altitude: number
  azimuth: number
  orientation: number
  intent: 'shade' | 'daylight'
  summaries: { id: string; active: boolean }[]
  onPick: (id: string | null) => void
}) {
  const solar = solarVector(altitude, azimuth)
  const pk = new PanelKinematics(normal)
  const sol = solve(pk, solar, currentAngle, intent)
  const facing = activeFacing(azimuth, altitude, orientation)

  const curNormal = pk.normalAt(currentAngle)
  const curExposure = pk.exposureAt(currentAngle, solar)
  const curIncidence = pk.incidenceAt(currentAngle, solar)
  const blade = describeBladeMotion(currentAngle, sol.targetAngle)

  return (
    <div className="space-y-3">
      {/* surface selector */}
      <div className="flex flex-wrap gap-1">
        <Chip label="Auto" active={!summaries.some((s) => s.active)} onClick={() => onPick(null)} />
        {summaries.map((s) => (
          <Chip key={s.id} label={s.id} active={s.active} onClick={() => onPick(s.id)} />
        ))}
      </div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-medium text-white/70">{surfaceName}</span>
        <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold" style={{ color: facing.color, background: `${facing.color}18` }}>
          {facing.label}
        </span>
      </div>

      <Divider />

      <h3 className="text-xs font-semibold text-emerald-400">Vector Legend</h3>
      <div className="grid grid-cols-[12px_1fr_1fr] gap-x-2 gap-y-1.5 text-[10px] items-center mb-1">
        <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
        <span className="text-white/80 font-medium">Solar Vector</span>
        <span className="text-white/40 text-right">World Space</span>
        
        <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
        <span className="text-white/80 font-medium">Panel Normal</span>
        <span className="text-white/40 text-right">Building Space</span>
        
        <div className="w-2.5 h-2.5 rounded-full bg-sky-400" />
        <span className="text-white/80 font-medium">Surface Normal</span>
        <span className="text-white/40 text-right">Building Space</span>
        
        <div className="w-2.5 h-2.5 rounded-full bg-white" />
        <span className="text-white/80 font-medium">Rotation Axis</span>
        <span className="text-white/40 text-right">Building Space</span>

        <div className="w-2.5 h-2.5 rounded-full bg-slate-500" />
        <span className="text-white/80 font-medium">Ground Sun</span>
        <span className="text-white/40 text-right">World Space</span>
      </div>

      <Divider />

      {/* Vector Math Pipelines */}
      <h3 className="text-xs font-semibold text-emerald-400">Math Pipelines</h3>
      
      <Accordion title="Solar Vector (ŝ)">
        <PipelineBlock 
          def="The normalized direction pointing exactly toward the sun."
          system="World Coordinates"
          inputs={['Solar Azimuth: ' + Math.round(azimuth) + '°', 'Solar Altitude: ' + altitude.toFixed(1) + '°']}
          equation="[sin(az)*cos(alt), sin(alt), cos(az)*cos(alt)]"
          result={`(${solar.toSun.x.toFixed(2)}, ${solar.toSun.y.toFixed(2)}, ${solar.toSun.z.toFixed(2)})`}
        />
      </Accordion>

      <Accordion title={`Panel Normal (n̂) at ${formatBladeAngle(currentAngle)}`}>
        <PipelineBlock 
          def="The perpendicular vector of the rotated panel face."
          system="Building Local Coordinates"
          inputs={['Surface Normal', 'Rotation Angle', 'Vertical Axis [0,1,0]']}
          equation="Rodrigues' Rotation Formula"
          result={`(${curNormal.x.toFixed(2)}, ${curNormal.y.toFixed(2)}, ${curNormal.z.toFixed(2)})`}
        />
      </Accordion>

      <Accordion title="Incident Angle (θ)">
        <PipelineBlock 
          def="The angle between the panel normal and the solar vector."
          system="Scalar (Degrees)"
          inputs={['Panel Normal (n̂)', 'Solar Vector (ŝ)']}
          equation="acos(n̂ · ŝ)"
          result={`${curIncidence.toFixed(1)}°`}
        />
      </Accordion>

      <Accordion title="Projected Exposure">
        <PipelineBlock 
          def="The percentage of direct solar radiation intercepted by the panel."
          system="Scalar (Percentage)"
          inputs={['Incident Angle (θ)']}
          equation="cos(θ)"
          result={`${(curExposure * 100).toFixed(0)}%`}
        />
        <div className="mt-2 relative h-2 overflow-hidden rounded-full bg-white/10">
          <div className="absolute inset-y-0 w-px bg-white/50" style={{ left: `${sol.maxExposure * 100}%` }} />
          <div className="h-full rounded-full bg-gradient-to-r from-amber-400 to-emerald" style={{ width: `${curExposure * 100}%` }} />
        </div>
        <p className="mt-1 text-[9px] text-white/40">Ceiling limit (cos(alt)) = {(sol.maxExposure * 100).toFixed(0)}% due to vertical rotation axis constraint.</p>
      </Accordion>

      <Divider />

      <h3 className="text-xs font-semibold text-emerald-400">Effective Irradiance Pipeline</h3>

      <Accordion title="Attenuated GHI">
        <PipelineBlock 
          def="Global Horizontal Irradiance adjusted for local weather conditions."
          system="W/m²"
          inputs={['Raw GHI (Clear Sky)', 'Cloud Attenuation Factor']}
          equation="GHI_raw × Cloud_Factor"
          result="Available in Telemetry"
        />
      </Accordion>

      <Accordion title="Direct Radiation">
        <PipelineBlock 
          def="The direct solar beam energy intercepted by the panel."
          system="W/m²"
          inputs={['Attenuated GHI', 'Cosine Projection', 'Occlusion Factor']}
          equation="Attenuated_GHI × cos(θ) × Occlusion"
          result="Calculated per panel"
        />
      </Accordion>

      <Accordion title="Effective Irradiance">
        <PipelineBlock 
          def="Total solar energy reaching the adaptive facade module."
          system="W/m²"
          inputs={['Direct Radiation', 'Diffuse Sky Contribution']}
          equation="Direct_Radiation + Diffuse_Sky"
          result="Passed to Virtual Sensor"
        />
      </Accordion>

      <Divider />

      <h3 className="text-xs font-semibold text-cyan-400">Virtual Sensor Pipeline</h3>

      <Accordion title="Illuminance Estimation">
        <PipelineBlock 
          def="Converts physical solar irradiance into estimated illuminance (lux)."
          system="Lux"
          inputs={['Effective Irradiance (W/m²)']}
          equation="Irradiance × 120"
          result="See Telemetry"
        />
      </Accordion>

      <Accordion title="LDR Response">
        <PipelineBlock 
          def="Simulates Light Dependent Resistor (LDR) curve."
          system="Ohms (Ω)"
          inputs={['Illuminance (Lux)']}
          equation="500 / Lux (capped at 10MΩ)"
          result="See Telemetry"
        />
      </Accordion>

      <Accordion title="Voltage Divider & ADC">
        <PipelineBlock 
          def="Converts LDR resistance into a digital 12-bit ADC reading."
          system="12-bit ADC (0-4095)"
          inputs={['LDR Resistance', 'Pull-down (10kΩ)', 'Vcc (3.3V)']}
          equation="(10k / (R_ldr + 10k)) × 4095"
          result="See Telemetry"
        />
      </Accordion>

      <Accordion title="Digital Filter">
        <PipelineBlock 
          def="Applies a discrete low-pass exponential smoothing filter."
          system="12-bit ADC (Filtered)"
          inputs={['Raw ADC', 'Previous Filtered ADC', 'Alpha (dt / 0.5s)']}
          equation="Prev + (Raw - Prev) × Alpha"
          result="Consumed by PBIF"
        />
      </Accordion>

      <Divider />

      <h3 className="text-xs font-semibold text-emerald-400">Solver Decision</h3>
      
      <div className="rounded-xl bg-white/[0.04] p-3 border border-white/5">
        {/* One name for this quantity, everywhere — see `@/lib/dt/bladeAngle`. */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-medium text-white/70">{BLADE_LABEL.target}</span>
          <span className="font-mono text-base font-bold text-emerald-400">{formatBladeAngle(sol.targetAngle)}</span>
        </div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[11px] font-medium text-white/70">{BLADE_LABEL.current}</span>
          <span className="font-mono text-[13px] font-semibold text-white/80">{formatBladeAngle(currentAngle)}</span>
        </div>
        <div className="mb-2 flex items-center justify-between border-b border-white/5 pb-2">
          <span className="text-[11px] font-medium text-white/70">{BLADE_LABEL.servoStatus}</span>
          <span className="text-[11px] font-semibold text-white/80">
            {blade.moving ? `${blade.status} · ${blade.remaining} left` : blade.status}
          </span>
        </div>
        <p className="text-[10px] text-white/70 mb-2 leading-relaxed">
          The panel rotates to <span className="text-emerald-300 font-medium">maximize interception of incoming solar radiation</span> by aligning its surface normal with the projected solar vector.
        </p>
        <p className="text-[10px] text-white/50 mb-1">
          <span className="text-white/70 font-medium">Why this angle?</span> {sol.reason}
        </p>
        <p className="text-[10px] text-white/50">
          <span className="text-white/70 font-medium">Kinematic Logic:</span> The solver evaluates 180° symmetry (front/back faces are identical) and chooses the shortest rotational path from the current position to minimize actuation energy.
        </p>
      </div>

      <Accordion title="Candidate Strategies">
        <div className="space-y-3">
          {sol.candidates.map((c) => (
            <div key={c.key} className="text-[10px] bg-white/5 rounded p-2">
              <div className="flex justify-between items-center mb-1">
                <span className="font-bold text-emerald-400">{c.key}: {c.name}</span>
                <span className="font-mono text-white/80">{Math.round(wrap360(c.targetAngle))}° · {(c.exposure * 100).toFixed(0)}%</span>
              </div>
              <p className="text-white/50 mb-1"><span className="text-white/70">Goal:</span> {c.name === 'Edge-on' ? 'Minimize solar interception (shade).' : 'Maximize solar interception.'}</p>
              <p className="text-white/50 mb-1"><span className="text-white/70">Equation:</span> {c.name === 'Edge-on' ? 'atan2(ŝ_x, ŝ_z) + 90°' : 'atan2(ŝ_x, ŝ_z)'}</p>
              <p className="text-white/50"><span className="text-white/70">Selection:</span> {c.targetAngle === sol.targetAngle ? 'Chosen (Optimal path/exposure).' : 'Discarded (Suboptimal or longer travel path).'}</p>
            </div>
          ))}
        </div>
      </Accordion>

      <Divider />

      <h3 className="text-xs font-semibold text-emerald-400">Engineering References</h3>
      <Accordion title="Mathematical Sources">
        <ul className="text-[10px] text-white/60 space-y-2 list-disc pl-3 mt-1">
          <li><span className="text-white/80 font-medium">Solar Vector (ŝ):</span> NOAA Solar Calculator math model (Meeus astronomical algorithms).</li>
          <li><span className="text-white/80 font-medium">Panel Normal (n̂):</span> Rodrigues&apos; Rotation Formula for axis-angle 3D rotation.</li>
          <li><span className="text-white/80 font-medium">Incident Angle (θ):</span> Dot Product `acos(n̂ · ŝ)` (Vector Mathematics).</li>
          <li><span className="text-white/80 font-medium">Projected Exposure:</span> Cosine law of illumination / Lambert&apos;s Cosine Law.</li>
          <li><span className="text-white/80 font-medium">Coordinate Transformations:</span> Standard Computer Graphics matrix multiplication (World ↔ Local Building space).</li>
        </ul>
      </Accordion>
      
      <div className="h-4" />
    </div>
  )
}

function PipelineBlock({ def, system, inputs, equation, result }: { def: string, system: string, inputs: string[], equation: string, result: string }) {
  return (
    <div className="bg-white/[0.03] rounded p-2.5 text-[10px] space-y-2 border border-white/5">
      <p className="text-white/80 leading-snug">{def}</p>
      <div className="grid grid-cols-[80px_1fr] gap-1">
        <span className="text-white/40">System</span>
        <span className="text-emerald-400/90 font-medium">{system}</span>
        
        <span className="text-white/40">Inputs</span>
        <span className="text-white/70">{inputs.join('  ↓  ')}</span>
        
        <span className="text-white/40">Equation</span>
        <span className="font-mono text-white/60 bg-white/5 px-1 rounded w-fit">{equation}</span>
        
        <span className="text-white/40 pt-1">Result</span>
        <span className="font-mono text-emerald-400 font-bold pt-1">{result}</span>
      </div>
    </div>
  )
}

function Accordion({ title, children }: { title: string, children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="border border-white/10 rounded-lg overflow-hidden bg-black/20">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-2.5 text-[11px] font-medium text-white/80 hover:bg-white/5 transition-colors">
        {title}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="p-2.5 pt-0 border-t border-white/10">{children}</div>}
    </div>
  )
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-1.5 py-0.5 font-mono text-[9px] transition-colors ${
        active ? 'bg-emerald/25 text-emerald' : 'bg-white/5 text-white/50 hover:text-white'
      }`}
    >
      {label}
    </button>
  )
}

function Divider() {
  return <div className="my-1.5 h-px bg-white/5" />
}
