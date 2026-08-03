'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useTwinStore } from '@/lib/engine/store'
import { getSimulation } from '@/lib/engine/simulation'
import { footprintPolygon } from '@/lib/engine/geometry'
import { deg2rad, smoothstep } from '@/lib/engine/math'
import { getWindowTexture } from '@/lib/engine/windowTexture'
import type { GlassType } from '@/lib/engine/types'
import { StaticInstances, barMatrix, surfaceGrid } from './StaticInstances'

const GLASS_COLOR: Record<GlassType, string> = {
  clear: '#8fb6c9',
  tinted: '#3f5a6b',
  'low-e': '#5f8497',
  reflective: '#9fb2bd',
}

const MULLION_GEOM = new THREE.BoxGeometry(1, 1, 1)

/** Mullion face width as a fraction of the bay pitch (≈70 mm on a 1.2 m module). */
const MULLION_WIDTH_RATIO = 0.06

/**
 * CurtainWall — the FIRST skin (inner). The permanent building envelope: the
 * extruded sealed glazing plus an aluminium mullion/transom grid that divides it
 * into window bays. It is completely static — it never rotates and never moves.
 *
 * The glass solid is extruded from the SAME footprint polygon the Geometry Engine
 * wraps with surfaces, so every shape (box, triangle, hexagon, cylinder, L-shape)
 * stays correct. The mullions are placed from each surface's own basis and pulled
 * back to the glass plane, leaving the engine's `facadeDepth` air-gap in front for
 * the kinetic skin.
 */
export function CurtainWall() {
  const building = useTwinStore((s) => s.building)
  const { shape, width, depth, height, orientation, glassType, facadeDepth } = building

  const winTex = useMemo(() => {
    const t = getWindowTexture().clone()
    t.repeat.set(width / 15, height / 15)
    t.needsUpdate = true
    return t
  }, [width, height])

  const glassMatRef = useRef<THREE.MeshPhysicalMaterial>(null)

  useFrame(() => {
    const s = getSimulation().sun
    const nightFactor = 1 - smoothstep(-2, 12, s.altitude)
    if (glassMatRef.current) glassMatRef.current.emissiveIntensity = nightFactor * 0.4
  })

  const geom = useMemo(() => {
    const poly = footprintPolygon(shape, width, depth)
    const s = new THREE.Shape()
    poly.forEach((p, i) => (i === 0 ? s.moveTo(p.x, p.z) : s.lineTo(p.x, p.z)))
    s.closePath()
    const g = new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: false })
    g.rotateX(Math.PI / 2)
    g.computeBoundingBox()
    g.translate(0, -(g.boundingBox?.min.y ?? 0), 0)
    return g
  }, [shape, width, depth, height])

  // Mullion + transom grid, world-space, sat just proud of the glass plane.
  const mullions = useMemo(() => {
    const mats: THREE.Matrix4[] = []
    const barDepth = 0.4
    // Pull back from the surface (which sits at the standoff plane) onto the glass.
    const dnGlass = -(facadeDepth + 0.15) + 0.06
    for (const s of getSimulation().skin.getAllSurfaces()) {
      const { cols, rows } = surfaceGrid(s.panels)
      // Mullion face width scales with the bay pitch, so a 1.2 m curtain-wall
      // module reads as a real ~70 mm profile rather than the chunky bar that
      // suited the old 4.2 m bays. Bounded to stay renderable at any grid.
      const barW = Math.min(0.22, Math.max(0.05, (s.width / cols) * MULLION_WIDTH_RATIO))
      for (let c = 0; c <= cols; c++) {
        const du = (c / cols - 0.5) * s.width
        mats.push(barMatrix(s.center, s.right, s.up, s.normal, du, 0, dnGlass, [barW, s.height, barDepth]))
      }
      for (let r = 0; r <= rows; r++) {
        const dv = (r / rows - 0.5) * s.height
        mats.push(barMatrix(s.center, s.right, s.up, s.normal, 0, dv, dnGlass, [s.width, barW, barDepth]))
      }
    }
    return mats
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [building])

  // Rooftop plant, proportioned to the building rather than to absolute metres —
  // a 5-storey office gets a low plant enclosure, not a tower's mechanical floor.
  const plantHeight = Math.max(1.6, height * 0.12)
  const mastHeight = Math.max(3, height * 0.3)
  const roofY = height + plantHeight / 2
  const mastY = roofY + plantHeight / 2 + mastHeight / 2

  return (
    <>
      {/* Sealed glazing envelope (static, inherits rotation from BuildingMesh) */}
      <group>
        <mesh geometry={geom} castShadow receiveShadow>
          <meshPhysicalMaterial
            ref={glassMatRef}
            color={GLASS_COLOR[glassType]}
            metalness={0.2}
            roughness={0.05}
            envMapIntensity={1.2}
            transmission={0.9}
            opacity={1}
            transparent
            ior={1.5}
            thickness={0.5}
            clearcoat={1.0}
            clearcoatRoughness={0.1}
            emissive="#ffffff"
            emissiveMap={winTex}
            emissiveIntensity={0}
          />
        </mesh>
        {/* Rooftop plant (part of the building core) */}
        <mesh castShadow position={[0, roofY, 0]}>
          <boxGeometry args={[width * 0.42, plantHeight, depth * 0.42]} />
          <meshStandardMaterial color="#2a2f38" metalness={0.4} roughness={0.6} />
        </mesh>
        <mesh position={[0, mastY, 0]}>
          <cylinderGeometry args={[0.2, 0.2, mastHeight, 8]} />
          <meshStandardMaterial color="#4a4f57" />
        </mesh>
      </group>

      {/* Aluminium mullion / transom grid (static) */}
      <StaticInstances geometry={MULLION_GEOM} matrices={mullions} color="#1a1d24" metalness={0.8} roughness={0.5} />
    </>
  )
}
