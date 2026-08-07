'use client'

import { useMemo, useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { getSimulation } from '@/lib/engine/simulation'
import { useTwinStore, getActiveDemonstrationSurface, getActiveDemonstrationModule } from '@/lib/engine/store'
import { BLADE_LABEL, describeBladeMotion, formatBladeAngle } from '@/lib/dt/bladeAngle'
import { rateHz } from '@/lib/engine/scheduler'

const RAY_LENGTH = 150

/** Ray colours — module constants, never re-allocated in the frame loop. */
const COLOR_CLEAR = new THREE.Color(0x22c55e) // green — clear line of sight
const COLOR_BLOCKED = new THREE.Color(0xef4444) // red — occluded by a neighbour

/**
 * Initial ray-buffer capacity, in modules. One elevation of the reference
 * building is 33 × 15 = 495 modules; starting here means the common case never
 * reallocates at all. The buffers still grow automatically for larger geometry.
 */
const INITIAL_RAY_CAPACITY = 512

export function OcclusionDebug() {
  const sim = getSimulation()
  const solarSelectedModuleId = useTwinStore((s) => s.solarSelectedModuleId)
  const debugSurfaceId = useTwinStore((s) => s.debugSurfaceId)

  // HTML Telemetry State
  const [telemetry, setTelemetry] = useState<{
    id: string;
    worldPosition: [number, number, number];
    cloudAttenuation: string;
    rawGHI: number;
    incAngle: number;
    cosProj: string;
    occFactor: string;
    diffuse: number;
    irradiance: number;
    lux: number;
    ldr: string;
    voltage: string;
    adc: number;
    filteredADC: number;
    bladeCurrent: string;
    bladeTarget: string;
    bladeStatus: string;
    blockerId: string;
    distance: string;
  } | null>(null)

  // Create a geometry for LineSegments
  const lineGeo = useMemo(() => new THREE.BufferGeometry(), [])
  const lineMat = useMemo(() => new THREE.LineBasicMaterial({ vertexColors: true, depthTest: true, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending }), [])

  const meshRef = useRef<THREE.LineSegments>(null)

  /**
   * Persistent ray buffers. Previously two Float32Arrays plus two
   * BufferAttributes were allocated EVERY frame — ~24 kB/frame of garbage at the
   * reference building's 495-module elevation. They are now allocated once,
   * written in place, and only reallocated if a larger façade needs more room.
   * `setDrawRange` hides the unused tail, so a partially-filled buffer draws
   * exactly the rays that exist.
   */
  const rays = useRef({ capacity: 0, positions: new Float32Array(0), colors: new Float32Array(0) })

  // Stage 7.11 — `setTelemetry` was firing on EVERY rendered frame (up to
  // 120 Hz), each call replacing a 17-field object and re-rendering the
  // 17-row `<Html>` panel below — the single largest contributor to React
  // commit volume found while profiling. The underlying readings only change
  // on the ~20 Hz environmental tier anyway, so 15 Hz here is imperceptible
  // (guide: "reduce update frequency only where visually imperceptible") while
  // cutting this component's render cost by roughly 8×. Reuses the same
  // `RateLimiter` every other tiered subsystem in the twin already uses.
  const telemetryTier = useRef(rateHz(15))

  const ensureRayCapacity = (modules: number) => {
    const r = rays.current
    if (r.capacity >= modules) return
    const capacity = Math.max(INITIAL_RAY_CAPACITY, modules * 2) // headroom → amortised growth
    r.capacity = capacity
    r.positions = new Float32Array(capacity * 2 * 3)
    r.colors = new Float32Array(capacity * 2 * 3)
    lineGeo.setAttribute('position', new THREE.BufferAttribute(r.positions, 3))
    lineGeo.setAttribute('color', new THREE.BufferAttribute(r.colors, 3))
  }

  // Allocate up front so the geometry always has valid attributes, even on the
  // very first frame before any rays have been written.
  useEffect(() => {
    ensureRayCapacity(INITIAL_RAY_CAPACITY)
    lineGeo.setDrawRange(0, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineGeo])

  useFrame((_state, dt) => {
    if (!meshRef.current) return

    // The "nothing selected / nighttime" fast paths stay unthrottled below —
    // they're cheap visibility toggles and should react immediately. Only the
    // telemetry + ray recompute (the expensive, 17-field-object-per-frame
    // part) is gated to the tier.
    const tierDue = telemetryTier.current.tick(dt) > 0

    if (!sim.sun.isDaytime) {
      meshRef.current.visible = false
      setTelemetry(null)
      return
    }
    
    const activeSurface = getActiveDemonstrationSurface(sim, debugSurfaceId)

    if (!activeSurface) {
      meshRef.current.visible = false
      setTelemetry(null)
      return
    }
    
    const panels = activeSurface.panels
    let targetPanels = panels
    
    if (!solarSelectedModuleId) {
      meshRef.current.visible = false
      setTelemetry(null)
      return
    }
    const selectedPanel = getActiveDemonstrationModule(sim, debugSurfaceId, solarSelectedModuleId)
    if (!selectedPanel) {
      meshRef.current.visible = false
      setTelemetry(null)
      return
    }
    targetPanels = [selectedPanel]

    // Reuse last tick's telemetry + rays until the tier is next due — a
    // selected panel's readings move at the ~20 Hz environmental tier at
    // most, so redoing this every render frame bought nothing.
    if (!tierDue) return

    // Compute telemetry
    const rawGHI = Math.round(sim.solarPhysics.getGlobalRawGHI())
    const cloudAttenuation = sim.solarPhysics.getGlobalCloudAttenuation()
    const incAngle = sim.solarPhysics.getModuleIncidentAngle(selectedPanel.id)
    const cosProj = sim.solarPhysics.getModuleCosineProjection(selectedPanel.id)
    const occFactor = sim.solarPhysics.getModuleOcclusionFactor(selectedPanel.id)
    const diffuse = sim.solarPhysics.getModuleDiffuseContribution(selectedPanel.id)
    const irradiance = sim.solarPhysics.getModuleEffectiveIrradiance(selectedPanel.id)
    const lux = sim.virtualSensor.getModuleLux(selectedPanel.id)
    const res = sim.virtualSensor.getModuleResistance(selectedPanel.id)
    const voltage = sim.virtualSensor.getModuleVoltage(selectedPanel.id)
    const adc = sim.virtualSensor.getModuleADC(selectedPanel.id)
    const filteredADC = sim.virtualSensor.getModuleFilteredADC(selectedPanel.id)
    
    // The two canonical rotation figures, named exactly as everywhere else in
    // the twin (`@/lib/dt/bladeAngle`). The old single "Target Motor Angle" row
    // was in fact the panel's CURRENT rotation, which is what made it confusing.
    const blade = describeBladeMotion(selectedPanel.rotationAngle, selectedPanel.targetRotation)
    const blocker = sim.solarPhysics.getModuleBlocker(selectedPanel.id)
    
    setTelemetry({
      id: selectedPanel.id,
      worldPosition: [selectedPanel.worldPosition.x, selectedPanel.worldPosition.y, selectedPanel.worldPosition.z],
      cloudAttenuation: cloudAttenuation.toFixed(2),
      rawGHI,
      incAngle,
      cosProj: (cosProj * 100).toFixed(0),
      occFactor: occFactor.toFixed(2),
      diffuse,
      irradiance,
      lux,
      ldr: res > 1000 ? (res / 1000).toFixed(1) + ' MΩ' : res.toFixed(1) + ' kΩ',
      voltage: voltage.toFixed(2) + ' V',
      adc,
      filteredADC,
      bladeCurrent: formatBladeAngle(selectedPanel.rotationAngle),
      bladeTarget: formatBladeAngle(selectedPanel.targetRotation),
      bladeStatus: blade.moving ? `${blade.status} · ${blade.remaining} left` : blade.status,
      blockerId: blocker?.id ?? 'None',
      distance: blocker ? blocker.distance.toFixed(1) + 'm' : '-'
    })
    
    const numPanels = targetPanels.length
    if (numPanels === 0) {
      meshRef.current.visible = false
      return
    }
    
    // Reuse the persistent buffers; grow only when a larger façade needs it.
    ensureRayCapacity(numPanels)
    const { positions, colors } = rays.current

    const sunDir = sim.solarPhysics.getSunVector()

    // Validate that the math is fully synchronized
    if (process.env.NODE_ENV === 'development') {
      const mag = Math.hypot(sunDir.x, sunDir.y, sunDir.z)
      if (Math.abs(mag - 1.0) > 0.01) console.warn('[OcclusionDebug] Solar vector not normalized!', mag)
    }
    
    let activeLines = 0

    for (let i = 0; i < numPanels; i++) {
      const p = targetPanels[i]
      const occ = sim.solarPhysics.getModuleOcclusionFactor(p.id)

      const isClear = occ > 0.5
      const color = isClear ? COLOR_CLEAR : COLOR_BLOCKED

      const startIdx = activeLines * 6
      
      // Start vertex (panel world position)
      positions[startIdx] = p.worldPosition.x
      positions[startIdx + 1] = p.worldPosition.y
      positions[startIdx + 2] = p.worldPosition.z
      
      colors[startIdx] = color.r
      colors[startIdx + 1] = color.g
      colors[startIdx + 2] = color.b
      
      // End vertex (towards sun)
      positions[startIdx + 3] = p.worldPosition.x + sunDir.x * RAY_LENGTH
      positions[startIdx + 4] = p.worldPosition.y + sunDir.y * RAY_LENGTH
      positions[startIdx + 5] = p.worldPosition.z + sunDir.z * RAY_LENGTH
      
      colors[startIdx + 3] = color.r
      colors[startIdx + 4] = color.g
      colors[startIdx + 5] = color.b
      
      activeLines++
    }
    
    // Flag the reused buffers as dirty and draw only the rays actually written.
    lineGeo.getAttribute('position').needsUpdate = true
    lineGeo.getAttribute('color').needsUpdate = true
    lineGeo.setDrawRange(0, activeLines * 2)

    // Update bounding sphere so it doesn't get frustum culled randomly
    lineGeo.computeBoundingSphere()

    meshRef.current.visible = true
  })
  
  return (
    <>
      <lineSegments ref={meshRef} geometry={lineGeo} material={lineMat} renderOrder={999} visible={false} />
      {!solarSelectedModuleId && (
        <Html center position={[0, -2, 0]}>
          <div className="glass pointer-events-none rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-white shadow-xl">
            Click a module on the active analytical façade to inspect.
          </div>
        </Html>
      )}
      {telemetry && (
        <Html zIndexRange={[100, 90]} position={telemetry.worldPosition} className="pointer-events-none">
          <div className="glass w-64 translate-x-12 -translate-y-24 rounded-xl border border-electric/30 p-4 shadow-2xl backdrop-blur-md">
            <h3 className="mb-3 text-xs font-bold uppercase tracking-widest text-electric">Solar Telemetry</h3>
            <div className="flex flex-col gap-1.5 text-[10px] font-medium text-white/80">
              <div className="flex justify-between border-b border-white/5 pb-1"><span>Module</span> <span className="text-white">{telemetry.id}</span></div>
              <div className="flex justify-between border-b border-white/5 pb-1"><span>Weather (Cloud Factor)</span> <span className="text-white">{telemetry.cloudAttenuation}</span></div>
              <div className="flex justify-between border-b border-white/5 pb-1"><span>Raw GHI</span> <span className="text-white">{telemetry.rawGHI} W/m²</span></div>
              <div className="flex justify-between border-b border-white/5 pb-1"><span>Incident Angle</span> <span className="text-white">{telemetry.incAngle}°</span></div>
              <div className="flex justify-between border-b border-white/5 pb-1"><span>Cosine Projection</span> <span className="text-white">{telemetry.cosProj}%</span></div>
              <div className="flex justify-between border-b border-white/5 pb-1"><span>Occlusion Factor</span> <span className="text-white">{telemetry.occFactor}</span></div>
              <div className="flex justify-between border-b border-white/5 pb-1"><span>Diffuse Sky</span> <span className="text-white">{telemetry.diffuse} W/m²</span></div>
              <div className="flex justify-between border-b border-white/5 pb-1 font-bold text-amber-400"><span>Effective Irradiance</span> <span>{telemetry.irradiance} W/m²</span></div>
              <div className="flex justify-between border-b border-white/5 pb-1 text-teal-400"><span>Estimated Lux</span> <span>{telemetry.lux}</span></div>
              <div className="flex justify-between border-b border-white/5 pb-1 text-teal-400"><span>LDR Resistance</span> <span>{telemetry.ldr}</span></div>
              <div className="flex justify-between border-b border-white/5 pb-1 text-teal-400"><span>Output Voltage</span> <span>{telemetry.voltage}</span></div>
              <div className="flex justify-between border-b border-white/5 pb-1 text-teal-400"><span>ADC Reading</span> <span>{telemetry.adc} / 4095</span></div>
              <div className="flex justify-between border-b border-white/5 pb-1 font-bold text-cyan-400"><span>Filtered ADC</span> <span>{telemetry.filteredADC} / 4095</span></div>
              <div className="flex justify-between border-b border-white/5 pb-1"><span>{BLADE_LABEL.target}</span> <span className="text-white">{telemetry.bladeTarget}</span></div>
              <div className="flex justify-between border-b border-white/5 pb-1"><span>{BLADE_LABEL.current}</span> <span className="text-white">{telemetry.bladeCurrent}</span></div>
              <div className="flex justify-between border-b border-white/5 pb-1"><span>{BLADE_LABEL.servoStatus}</span> <span className="text-white">{telemetry.bladeStatus}</span></div>
              <div className="flex justify-between pt-1 text-red-400"><span>Blocker</span> <span>{telemetry.blockerId}</span></div>
              {telemetry.blockerId !== 'None' && <div className="flex justify-between text-red-400/80"><span>Distance</span> <span>{telemetry.distance}</span></div>}
            </div>
          </div>
        </Html>
      )}
    </>
  )
}
