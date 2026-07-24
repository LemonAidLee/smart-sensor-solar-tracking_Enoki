'use client'

import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getSimulation } from '@/lib/engine/simulation'
import { useTwinStore } from '@/lib/engine/store'
import { solarVector, facadeSurface, panelNormal, normalize as knorm, type Vec3 } from '@/lib/kinematics'

/**
 * KinematicsDebug — 3D visual debugger for the selected façade panel's geometry.
 * Draws, anchored on the surface, the vectors the RotationSolver reasons about:
 *   • Solar vector (toward sun)      — amber
 *   • Surface normal (fixed façade)  — cyan
 *   • Panel normal (live rotation)   — emerald
 *   • Rotation axis (vertical)       — white
 *   • Projected shadow direction     — slate
 * Visualisation only. Mounted in Weather Validation Mode.
 */
import { Html } from '@react-three/drei'
import { transformSolarVector } from '@/lib/kinematics/solarVector'

const L = 16
const toV = (v: Vec3) => new THREE.Vector3(v.x, v.y, v.z)
const avgExposure = (panels: { solarExposure: number }[]) =>
  panels.reduce((a, p) => a + p.solarExposure, 0) / (panels.length || 1)

export function KinematicsDebug() {
  const sim = getSimulation()
  const debugId = useTwinStore((s) => s.debugSurfaceId)
  const group = useRef<THREE.Group>(null)

  const sunRef = useRef<THREE.Group>(null)
  const normalRef = useRef<THREE.Group>(null)
  const panelRef = useRef<THREE.Group>(null)
  const axisRef = useRef<THREE.Group>(null)
  const shadowRef = useRef<THREE.Group>(null)

  const textRefs = useRef({
    sun: { dir: '', mag: '' },
    normal: { dir: '', mag: '' },
    panel: { dir: '', mag: '' },
    axis: { dir: '', mag: '' },
    shadow: { dir: '', mag: '' },
  })

  const [labels, setLabels] = useState({
    sun: { dir: '(0,0,0)', mag: '1.0' },
    normal: { dir: '(0,0,0)', mag: '1.0' },
    panel: { dir: '(0,0,0)', mag: '1.0' },
    axis: { dir: '(0,1,0)', mag: '1.0' },
    shadow: { dir: '(0,0,0)', mag: '1.0' },
    isDay: true,
  })

  const arrows = useMemo(() => {
    const mk = (color: number) => {
      const a = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), L, color, L * 0.2, L * 0.11)
      return a
    }
    return {
      sun: mk(0xfbbf24),
      normal: mk(0x38bdf8),
      panel: mk(0x34d399),
      axis: mk(0xffffff),
      shadow: mk(0x64748b),
    }
  }, [])

  // We use a throttle for React state to prevent useFrame from killing performance with setState
  const lastUpdate = useRef(0)

  useFrame((state) => {
    const g = group.current
    if (!g) return
    const surfaces = sim.skin.getAllSurfaces()
    const sun = sim.sun
    if (!surfaces.length) {
      g.visible = false
      return
    }
    
    const surface =
      (debugId && sim.skin.getSurface(debugId)) ||
      surfaces.reduce((b, s) => (avgExposure(s.panels) > avgExposure(b.panels) ? s : b), surfaces[0])

    const fs = facadeSurface(surface.normal)
    const cur = surface.panels[0]?.rotationAngle ?? 0
    const pn = panelNormal(fs, cur)
    
    const origin = toV({
      x: surface.center.x + surface.normal.x * 3,
      y: surface.center.y + surface.normal.y * 3,
      z: surface.center.z + surface.normal.z * 3,
    })

    const place = (a: THREE.ArrowHelper, dir: Vec3, len = L) => {
      a.position.copy(origin)
      a.setDirection(toV(dir).normalize())
      a.setLength(len, len * 0.2, len * 0.11)
    }
    
    const placeTip = (ref: React.RefObject<THREE.Group | null>, dir: Vec3, len: number) => {
      if (ref.current) {
        ref.current.position.copy(origin).add(toV(dir).normalize().multiplyScalar(len + 1))
      }
    }

    // Always visible vectors (independent of sun)
    place(arrows.normal, surface.normal, L * 0.8)
    place(arrows.panel, pn, L * 0.9)
    place(arrows.axis, { x: 0, y: 1, z: 0 }, L * 0.7)
    
    placeTip(normalRef, surface.normal, L * 0.8)
    placeTip(panelRef, pn, L * 0.9)
    placeTip(axisRef, { x: 0, y: 1, z: 0 }, L * 0.7)

    // Conditionally visible sun-dependent vectors
    let localSv: any = null
    let shadow: any = null

    if (sun.isDaytime) {
      const worldSv = solarVector(sun.altitude, sun.azimuth)
      localSv = transformSolarVector(worldSv, sim.building.orientation)
      shadow = knorm({ x: -localSv.toSun.x, y: 0, z: -localSv.toSun.z })

      place(arrows.sun, localSv.toSun)
      place(arrows.shadow, shadow, L * 0.7)
      placeTip(sunRef, localSv.toSun, L)
      placeTip(shadowRef, shadow, L * 0.7)

      arrows.sun.visible = true
      arrows.shadow.visible = true
      if (sunRef.current) sunRef.current.visible = true
      if (shadowRef.current) shadowRef.current.visible = true
    } else {
      arrows.sun.visible = false
      arrows.shadow.visible = false
      if (sunRef.current) sunRef.current.visible = false
      if (shadowRef.current) shadowRef.current.visible = false
    }
    
    g.visible = true

    // Update labels via state (throttled to 10 FPS)
    const now = state.clock.getElapsedTime()
    if (now - lastUpdate.current > 0.1) {
      lastUpdate.current = now
      const fmt = (v: Vec3) => `(${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)})`
      setLabels((prev) => ({
        ...prev,
        isDay: sun.isDaytime,
        normal: { dir: fmt(surface.normal), mag: '1.0' },
        panel: { dir: fmt(pn), mag: '1.0' },
        axis: { dir: '(0.00, 1.00, 0.00)', mag: '1.0' },
        ...(sun.isDaytime && localSv && shadow ? {
          sun: { dir: fmt(localSv.toSun), mag: '1.0 (Unit Vector)' },
          shadow: { dir: fmt(shadow), mag: '1.0' },
        } : {})
      }))
    }
  })

  // These vectors are in Local Space and inherit world orientation natively from BuildingMesh
  return (
    <group ref={group}>
      <primitive object={arrows.sun} visible={labels.isDay} />
      <primitive object={arrows.normal} />
      <primitive object={arrows.panel} />
      <primitive object={arrows.axis} />
      <primitive object={arrows.shadow} visible={labels.isDay} />

      <group ref={sunRef} visible={labels.isDay}>
        {labels.isDay && (
          <Html center className="pointer-events-none">
            <div className="bg-black/60 backdrop-blur-sm border border-amber-400/30 px-1.5 py-1 rounded text-white font-mono text-[9px] whitespace-nowrap leading-tight">
              <div className="text-amber-400 font-bold mb-0.5">Solar Vector (ŝ)</div>
              <div className="text-white/70">{labels.sun.dir}</div>
              <div className="text-white/40">mag: {labels.sun.mag}</div>
            </div>
          </Html>
        )}
      </group>

      <group ref={normalRef}>
        <Html center className="pointer-events-none">
          <div className="bg-black/60 backdrop-blur-sm border border-sky-400/30 px-1.5 py-1 rounded text-white font-mono text-[9px] whitespace-nowrap leading-tight">
            <div className="text-sky-400 font-bold mb-0.5">Surface Normal</div>
            <div className="text-white/70">{labels.normal.dir}</div>
            <div className="text-white/40">mag: {labels.normal.mag}</div>
          </div>
        </Html>
      </group>

      <group ref={panelRef}>
        <Html center className="pointer-events-none">
          <div className="bg-black/60 backdrop-blur-sm border border-emerald-400/30 px-1.5 py-1 rounded text-white font-mono text-[9px] whitespace-nowrap leading-tight">
            <div className="text-emerald-400 font-bold mb-0.5">Panel Normal (n̂)</div>
            <div className="text-white/70">{labels.panel.dir}</div>
            <div className="text-white/40">mag: {labels.panel.mag}</div>
          </div>
        </Html>
      </group>

      <group ref={axisRef}>
        <Html center className="pointer-events-none">
          <div className="bg-black/60 backdrop-blur-sm border border-white/30 px-1.5 py-1 rounded text-white font-mono text-[9px] whitespace-nowrap leading-tight">
            <div className="text-white font-bold mb-0.5">Rotation Axis</div>
            <div className="text-white/70">{labels.axis.dir}</div>
            <div className="text-white/40">mag: {labels.axis.mag}</div>
          </div>
        </Html>
      </group>
      
      <group ref={shadowRef} visible={labels.isDay}>
        {labels.isDay && (
          <Html center className="pointer-events-none">
            <div className="bg-black/60 backdrop-blur-sm border border-slate-400/30 px-1.5 py-1 rounded text-white font-mono text-[9px] whitespace-nowrap leading-tight">
              <div className="text-slate-400 font-bold mb-0.5">Ground Sun</div>
              <div className="text-white/70">{labels.shadow.dir}</div>
              <div className="text-white/40">mag: {labels.shadow.mag}</div>
            </div>
          </Html>
        )}
      </group>
    </group>
  )
}
