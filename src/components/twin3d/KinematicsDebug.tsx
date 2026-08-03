'use client'

import { useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getSimulation } from '@/lib/engine/simulation'
import { useTwinStore, getActiveDemonstrationModule } from '@/lib/engine/store'
import { facadeSurface, panelNormal, normalize as knorm, type Vec3 } from '@/lib/kinematics'

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

/**
 * Debug-vector length as a fraction of building height, so the arrows stay
 * legible on a 5-storey office and on a tower alike (they previously assumed a
 * ~120 m building and would have overshot a 19 m one by 3×).
 */
const VECTOR_LENGTH_RATIO = 0.35
const MIN_VECTOR_LENGTH = 3 // m — scaled closer to panel dimensions
const toV = (v: Vec3) => new THREE.Vector3(v.x, v.y, v.z)

function createEngineeringArrow(color: number) {
  const group = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.2, toneMapped: false })
  
  const shaftGeo = new THREE.CylinderGeometry(0.015, 0.015, 1, 8)
  shaftGeo.rotateX(Math.PI / 2)
  shaftGeo.translate(0, 0, 0.5)
  const shaft = new THREE.Mesh(shaftGeo, mat)
  
  const headGeo = new THREE.ConeGeometry(0.06, 0.2, 12)
  headGeo.rotateX(Math.PI / 2)
  headGeo.translate(0, 0, 0.1)
  const head = new THREE.Mesh(headGeo, mat)
  
  group.add(shaft)
  group.add(head)
  
  const axis = new THREE.Vector3(0, 0, 1)
  const q = new THREE.Quaternion()
  
  return Object.assign(group, {
    setDirection(dir: THREE.Vector3) {
      q.setFromUnitVectors(axis, dir)
      group.quaternion.copy(q)
    },
    setLength(length: number, headLength: number = 0.2, headWidth: number = 0.06) {
      shaft.scale.set(1, 1, Math.max(0.0001, length - headLength))
      head.position.z = length - headLength
      head.scale.set(headWidth / 0.06, headWidth / 0.06, headLength / 0.2)
    }
  })
}

export function KinematicsDebug() {
  const sim = getSimulation()
  const debugId = useTwinStore((s) => s.debugSurfaceId)
  const solarSelectedModuleId = useTwinStore((s) => s.solarSelectedModuleId)
  const buildingHeight = useTwinStore((s) => s.building.height)
  const L = Math.max(MIN_VECTOR_LENGTH, buildingHeight * VECTOR_LENGTH_RATIO)
  const group = useRef<THREE.Group>(null)

  const sunRef = useRef<THREE.Group>(null)
  const normalRef = useRef<THREE.Group>(null)
  const panelRef = useRef<THREE.Group>(null)
  const axisRef = useRef<THREE.Group>(null)
  const shadowRef = useRef<THREE.Group>(null)

  const [labels, setLabels] = useState({
    sun: { dir: '(0,0,0)', mag: '1.0' },
    normal: { dir: '(0,0,0)', mag: '1.0' },
    panel: { dir: '(0,0,0)', mag: '1.0' },
    axis: { dir: '(0,1,0)', mag: '1.0' },
    shadow: { dir: '(0,0,0)', mag: '1.0' },
    isDay: true,
  })

  const arrows = useMemo(() => {
    return {
      sun: createEngineeringArrow(0xfbbf24),     // Warm Yellow
      normal: createEngineeringArrow(0x06b6d4),  // Cyan
      panel: createEngineeringArrow(0x10b981),   // Emerald
      axis: createEngineeringArrow(0xffffff),    // White
      shadow: createEngineeringArrow(0xffffff),  // Ground Sun (White)
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
    
    const activeModule = getActiveDemonstrationModule(sim, debugId, solarSelectedModuleId)
    if (!activeModule) return

    const fs = facadeSurface(activeModule.normal)
    const cur = activeModule.rotationAngle
    const pn = panelNormal(fs, cur)
    
    const origin = toV({
      x: activeModule.worldPosition.x + activeModule.normal.x * 2,
      y: activeModule.worldPosition.y + activeModule.normal.y * 2,
      z: activeModule.worldPosition.z + activeModule.normal.z * 2,
    })

    type EngArrow = ReturnType<typeof createEngineeringArrow>
    const place = (a: EngArrow, dir: Vec3, len = L, offset = new THREE.Vector3()) => {
      a.position.copy(origin).add(offset)
      a.setDirection(toV(dir).normalize())
      a.setLength(len, len * 0.15, len * 0.08)
    }
    
    const placeTip = (ref: React.RefObject<THREE.Group | null>, dir: Vec3, len: number, offset = new THREE.Vector3(), labelOffset = 0.3) => {
      if (ref.current) {
        // Add labelOffset so labels float cleanly away from arrowheads
        ref.current.position.copy(origin).add(offset).add(toV(dir).normalize().multiplyScalar(len + labelOffset))
      }
    }

    // Very slight spatial offsets to prevent origin z-fighting
    const offNormal = new THREE.Vector3(0, 0.02, 0)
    const offPanel = new THREE.Vector3(0, -0.02, 0)
    const offAxis = new THREE.Vector3(0, 0, 0)
    const offSun = new THREE.Vector3(-0.02, 0, 0)
    const offShadow = new THREE.Vector3(0.02, 0, 0)

    // Stagger lengths heavily so arrows and labels don't bunch up in depth
    const L_AXIS = L * 0.6
    const L_NORMAL = L * 0.8
    const L_PANEL = L * 1.15
    const L_SHADOW = L * 0.9
    const L_SUN = L * 1.4

    // Always visible vectors (independent of sun)
    place(arrows.normal, activeModule.normal, L_NORMAL, offNormal)
    place(arrows.panel, pn, L_PANEL, offPanel)
    place(arrows.axis, { x: 0, y: 1, z: 0 }, L_AXIS, offAxis)
    
    // Stagger label offsets so the text boxes don't overlap in screen space
    placeTip(normalRef, activeModule.normal, L_NORMAL, offNormal, 0.4)
    placeTip(panelRef, pn, L_PANEL, offPanel, 0.8)
    placeTip(axisRef, { x: 0, y: 1, z: 0 }, L_AXIS, offAxis, 0.5)

    let shadow: Vec3 | null = null

    if (sun.isDaytime) {
      // getSunVector() now correctly returns the sun direction in Building Local Space 
      // (the same space this group and the module coordinates are in).
      const sunDir = sim.solarPhysics.getSunVector()
      shadow = knorm({ x: -sunDir.x, y: 0, z: -sunDir.z })

      place(arrows.sun, sunDir, L_SUN, offSun)
      place(arrows.shadow, shadow, L_SHADOW, offShadow)
      placeTip(sunRef, sunDir, L_SUN, offSun, 1.2)
      placeTip(shadowRef, shadow, L_SHADOW, offShadow, 0.6)

      // Validate that the math is fully synchronized
      if (process.env.NODE_ENV === 'development') {
        const mag = Math.hypot(sunDir.x, sunDir.y, sunDir.z)
        if (Math.abs(mag - 1.0) > 0.01) console.warn('[KinematicsDebug] Solar vector not normalized!', mag)
      }

      if (sunRef.current) sunRef.current.visible = true
      if (shadowRef.current) shadowRef.current.visible = true
    } else {
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
        normal: { dir: fmt(activeModule.normal), mag: '1.0' },
        panel: { dir: fmt(pn), mag: '1.0' },
        axis: { dir: '(0.00, 1.00, 0.00)', mag: '1.0' },
        ...(sun.isDaytime && shadow ? {
          sun: { dir: fmt(sim.solarPhysics.getSunVector()), mag: '1.0 (Unit Vector)' },
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
          <Html center zIndexRange={[0, 0]} className="pointer-events-none -translate-y-12 translate-x-4">
            <div className="bg-[#0a0a0a]/80 backdrop-blur-md border border-amber-400/40 px-2 py-1.5 rounded-md text-white font-mono text-[9px] whitespace-nowrap leading-tight shadow-lg">
              <div className="text-amber-400 font-bold mb-0.5">Solar Vector (ŝ)</div>
              <div className="text-white/80">{labels.sun.dir}</div>
              <div className="text-white/50">mag: {labels.sun.mag}</div>
            </div>
          </Html>
        )}
      </group>

      <group ref={normalRef}>
        <Html center zIndexRange={[0, 0]} className="pointer-events-none -translate-y-20">
          <div className="bg-[#0a0a0a]/80 backdrop-blur-md border border-cyan-400/40 px-2 py-1.5 rounded-md text-white font-mono text-[9px] whitespace-nowrap leading-tight shadow-lg">
            <div className="text-cyan-400 font-bold mb-0.5">Surface Normal</div>
            <div className="text-white/80">{labels.normal.dir}</div>
            <div className="text-white/50">mag: {labels.normal.mag}</div>
          </div>
        </Html>
      </group>

      <group ref={panelRef}>
        <Html center zIndexRange={[0, 0]} className="pointer-events-none -translate-y-4">
          <div className="bg-[#0a0a0a]/80 backdrop-blur-md border border-emerald-400/40 px-2 py-1.5 rounded-md text-white font-mono text-[9px] whitespace-nowrap leading-tight shadow-lg">
            <div className="text-emerald-400 font-bold mb-0.5">Panel Normal (n̂)</div>
            <div className="text-white/80">{labels.panel.dir}</div>
            <div className="text-white/50">mag: {labels.panel.mag}</div>
          </div>
        </Html>
      </group>

      <group ref={axisRef}>
        <Html center zIndexRange={[0, 0]} className="pointer-events-none translate-y-12">
          <div className="bg-[#0a0a0a]/80 backdrop-blur-md border border-white/40 px-2 py-1.5 rounded-md text-white font-mono text-[9px] whitespace-nowrap leading-tight shadow-lg">
            <div className="text-white font-bold mb-0.5">Rotation Axis</div>
            <div className="text-white/80">{labels.axis.dir}</div>
            <div className="text-white/50">mag: {labels.axis.mag}</div>
          </div>
        </Html>
      </group>
      
      <group ref={shadowRef} visible={labels.isDay}>
        {labels.isDay && (
          <Html center zIndexRange={[0, 0]} className="pointer-events-none translate-y-20">
            <div className="bg-[#0a0a0a]/80 backdrop-blur-md border border-white/40 px-2 py-1.5 rounded-md text-white font-mono text-[9px] whitespace-nowrap leading-tight shadow-lg">
              <div className="text-white font-bold mb-0.5">Ground Sun</div>
              <div className="text-white/80">{labels.shadow.dir}</div>
              <div className="text-white/50">mag: {labels.shadow.mag}</div>
            </div>
          </Html>
        )}
      </group>
    </group>
  )
}
