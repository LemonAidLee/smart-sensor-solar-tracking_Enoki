'use client'

import { useMemo, useRef, useLayoutEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useTwinStore } from '@/lib/engine/store'
import { getSimulation } from '@/lib/engine/simulation'

const MODULE_W = 1.134
const MODULE_H = 2.278
const MODULE_THICKNESS = 0.035
const TILT_DEG = 0

/**
 * Stage 7.0: Rooftop PV System (Geometry & Visual Integration)
 * 
 * An independent architectural subsystem representing the 104.02 kW DC rooftop array
 * (189 LONGi 550 W bifacial modules). This subsystem is responsible ONLY for geometry 
 * and scene graph integration.
 * 
 * It is explicitly isolated from the Solar Physics, Virtual Sensor, and PBIF subsystems.
 * Electrical generation logic will be introduced in future stages.
 */
export function RoofSolarArray() {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const color = useMemo(() => new THREE.Color(), [])
  
  // Retrieve the static building engineering constants
  const { width, depth, height } = useTwinStore((s) => s.building)
  
  const { matrices, count } = useMemo(() => {
    const mats: THREE.Matrix4[] = []
    
    const pitchX = 1.15 // 1.134m module + 16mm clamp gap
    const pitchZ = 2.5  // allows for inter-row shading clearance and maintenance

    // Central HVAC plant footprint (width * 0.42, depth * 0.42)
    // + 1.0 m maintenance clearance zone
    const plantClearX = (width * 0.42) / 2 + 1.0
    const plantClearZ = (depth * 0.42) / 2 + 1.0
    
    // We target 189 panels. 
    // Through geometric layout, starting slightly inwards (-16.0 to +14.0 in Z)
    // gives exactly 190 available slots. We drop 1 panel at the corner for 
    // the "roof access hatch" to reach exactly 189.
    const startX = -11.0
    const endX = 11.0
    const startZ = -16.0
    const endZ = 14.0

    const validPoints = []
    
    // Procedural layout generator
    for (let z = startZ; z <= endZ + 0.1; z += pitchZ) {
      for (let x = startX; x <= endX + 0.1; x += pitchX) {
        // Skip central plant area
        if (Math.abs(x) < plantClearX && Math.abs(z) < plantClearZ) {
          continue
        }
        validPoints.push({ x, z })
      }
    }
    
    // Take exactly 189 panels (leaves 1 gap for maintenance/roof access hatch)
    const selected = validPoints.slice(0, 189)
    
    const dummy = new THREE.Object3D()
    const tiltRad = THREE.MathUtils.degToRad(TILT_DEG)
    
    // The roof sits at `height`. We elevate the modules slightly so they don't z-fight with the roof.
    const rackingHeight = height + 0.05
    
    for (const pt of selected) {
      // The box's Y-axis is its long dimension. To lay it flat, rotate -90 deg around X.
      // Then apply the 15 degree tilt so it faces the sun.
      dummy.rotation.set(0, 0, 0)
      dummy.rotateX(-Math.PI / 2 + tiltRad)
      
      // Calculate the center position of the tilted box
      // The bottom edge is at pt.z + (MODULE_H / 2) * cos(tilt)
      // We want to pivot it so the lowest edge rests near rackingHeight
      const dy = (MODULE_H / 2) * Math.sin(tiltRad)
      dummy.position.set(pt.x, rackingHeight + dy, pt.z)
      
      dummy.updateMatrix()
      mats.push(dummy.matrix.clone())
    }
    
    return { matrices: mats, count: mats.length }
  }, [width, depth, height])

  // Generate procedural PV cell texture
  const panelTexture = useMemo(() => {
    if (typeof document === 'undefined') return null
    const canvas = document.createElement('canvas')
    canvas.width = 512
    canvas.height = 1024
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    
    // Base silicon color (brighter blue)
    ctx.fillStyle = '#2563eb' // Brighter blue
    ctx.fillRect(0, 0, 512, 1024)
    
    // Cell boundaries (silver/white grid)
    ctx.strokeStyle = '#e2e8f0'
    ctx.lineWidth = 4
    
    const cols = 6
    const rows = 12
    
    ctx.beginPath()
    for (let c = 0; c <= cols; c++) {
      const x = (c / cols) * 512
      ctx.moveTo(x, 0)
      ctx.lineTo(x, 1024)
    }
    for (let r = 0; r <= rows; r++) {
      const y = (r / rows) * 1024
      ctx.moveTo(0, y)
      ctx.lineTo(512, y)
    }
    ctx.stroke()

    // Busbars (thinner silver lines running vertically through each cell)
    ctx.strokeStyle = '#cbd5e1' // Lighter, more prominent busbars
    ctx.lineWidth = 2 // Thicker for better visibility
    ctx.beginPath()
    for (let c = 0; c < cols; c++) {
      const cellW = 512 / cols
      const startX = c * cellW
      // 5 busbars per cell
      for (let b = 1; b <= 5; b++) {
        const bx = startX + (b / 6) * cellW
        ctx.moveTo(bx, 0)
        ctx.lineTo(bx, 1024)
      }
    }
    ctx.stroke()

    const texture = new THREE.CanvasTexture(canvas)
    texture.anisotropy = 16
    return texture
  }, [])

  // Apply instance matrices statically
  useLayoutEffect(() => {
    if (!meshRef.current) return
    for (let i = 0; i < count; i++) {
      meshRef.current.setMatrixAt(i, matrices[i])
    }
    meshRef.current.instanceMatrix.needsUpdate = true
  }, [matrices, count])

  // Stage 7.11 — irradiance only actually changes on the ~20 Hz environmental
  // tier (see `solarPhysics.ts`), but this ran every render frame regardless,
  // re-writing and re-uploading all 189 instance colours for no visual change
  // most frames. Float64 so it compares exactly against `irradiance` (a JS
  // double) — see `FacadeLayer.tsx`'s identical note on Float32 truncation.
  // A `useRef`, not `useMemo` — mutated every frame inside `useFrame`.
  const irradianceCache = useRef(new Float64Array(0))
  useLayoutEffect(() => {
    irradianceCache.current = new Float64Array(count).fill(NaN)
  }, [count])

  // Update instance colors dynamically based on irradiance
  useFrame(() => {
    if (!meshRef.current) return
    const sim = getSimulation()
    const modules = sim.pvArray.getModules()
    let dirty = false

    for (let i = 0; i < count; i++) {
      const pv = modules[i]
      if (!pv) continue

      const irradiance = sim.solarPhysics.getModuleEffectiveIrradiance(pv.id)
      if (irradiance === irradianceCache.current[i]) continue
      irradianceCache.current[i] = irradiance
      dirty = true

      // Base tint based on irradiance (0-1200 W/m2 mapped to 0.4 - 1.0 brightness)
      const factor = 0.4 + 0.6 * Math.min(irradiance / 1200, 1.0)
      color.setRGB(factor, factor, factor)

      meshRef.current.setColorAt(i, color)
    }

    if (dirty && meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true
    }
  })
  return (
    <>
    <instancedMesh
      ref={meshRef}
      args={[undefined as unknown as THREE.BufferGeometry, undefined as unknown as THREE.Material[], count]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[MODULE_W, MODULE_H, MODULE_THICKNESS]} />
      {/* Materials for the 6 faces: Right, Left, Top, Bottom, Front (+Z), Back (-Z) */}
      <meshPhysicalMaterial attach="material-0" color="#475569" metalness={0.8} roughness={0.4} />
      <meshPhysicalMaterial attach="material-1" color="#475569" metalness={0.8} roughness={0.4} />
      <meshPhysicalMaterial attach="material-2" color="#475569" metalness={0.8} roughness={0.4} />
      <meshPhysicalMaterial attach="material-3" color="#475569" metalness={0.8} roughness={0.4} />
      <meshPhysicalMaterial 
        attach="material-4" 
        color="#ffffff" 
        map={panelTexture}
        metalness={0.4} 
        roughness={0.1} 
        clearcoat={1.0} 
        clearcoatRoughness={0.05} 
      />
      <meshPhysicalMaterial attach="material-5" color="#cbd5e1" metalness={0.1} roughness={0.8} />
    </instancedMesh>
    
    {/* 80kW AC Inverter Cabinet */}
    <mesh 
      position={[0, height + 1.2 / 2, (depth * 0.42) / 2 + 0.8]} 
      castShadow 
      receiveShadow
    >
      <boxGeometry args={[1.0, 1.2, 0.4]} />
      <meshStandardMaterial color="#94a3b8" metalness={0.6} roughness={0.5} />
    </mesh>
    </>
  )
}
