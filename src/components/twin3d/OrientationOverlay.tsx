'use client'

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getSimulation } from '@/lib/engine/simulation'
import { useTwinStore } from '@/lib/engine/store'

/**
 * OrientationOverlay — a permanent, WORLD-FIXED compass around the building.
 *
 * It anchors the scene to the fixed world coordinate system (True North = −Z,
 * East = +X, South = +Z, West = −X — the `compassToWorld` convention), completely
 * independent of the building. The building's orientation offset (currently 0°)
 * is applied to the massing elsewhere; this overlay is the immovable reference the
 * façades — and all future PBIF calculations — are measured against.
 *
 * • Fixed relative to the world (not parented to, and never rotated by, the camera
 *   or the building orientation).
 * • Cardinal labels billboard toward the camera for legibility and draw on top
 *   (depthTest off) so they never obstruct or get hidden by the building.
 * • A live amber marker rides the ring at the Sun's current azimuth, so the link
 *   Sun → orientation → illuminated façade is immediately obvious.
 */

const CARDINALS = [
  { key: 'N', color: '#cbd5e1', x: 0, z: -1 },
  { key: 'E', color: '#f59e0b', x: 1, z: 0 },
  { key: 'S', color: '#f43f5e', x: 0, z: 1 },
  { key: 'W', color: '#38bdf8', x: -1, z: 0 },
] as const

function makeLabelTexture(text: string, color: string): THREE.CanvasTexture {
  const s = 128
  const c = document.createElement('canvas')
  c.width = c.height = s
  const ctx = c.getContext('2d')!
  ctx.font = 'bold 92px ui-sans-serif, system-ui, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = color
  ctx.fillText(text, s / 2, s / 2 + 4)
  const tex = new THREE.CanvasTexture(c)
  tex.anisotropy = 4
  tex.needsUpdate = true
  return tex
}

export function OrientationOverlay() {
  const building = useTwinStore((s) => s.building)
  const radius = Math.max(building.width, building.depth) * 0.5 + 22
  const sunRef = useRef<THREE.Group>(null)

  const textures = useMemo(() => CARDINALS.map((c) => makeLabelTexture(c.key, c.color)), [])
  useEffect(() => () => textures.forEach((t) => t.dispose()), [textures])

  // The Sun-azimuth marker rides the ring (azimuth is clockwise from +… −Z north).
  useFrame(() => {
    const g = sunRef.current
    if (!g) return
    const sun = getSimulation().sun
    const a = (sun.azimuth * Math.PI) / 180
    g.position.set(Math.sin(a) * radius, 0.9, -Math.cos(a) * radius)
    g.visible = sun.isDaytime
  })

  return (
    <group>
      {/* Ground compass ring */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.25, 0]}>
        <ringGeometry args={[radius - 0.7, radius + 0.7, 96]} />
        <meshBasicMaterial color="#5eead4" transparent opacity={0.22} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>

      {CARDINALS.map((c, i) => (
        <group key={c.key} position={[c.x * radius, 0, c.z * radius]}>
          {/* ground disc tick */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.3, 0]}>
            <circleGeometry args={[2.6, 24]} />
            <meshBasicMaterial color={c.color} transparent opacity={0.5} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
          {/* short post */}
          <mesh position={[0, 7, 0]}>
            <cylinderGeometry args={[0.25, 0.25, 14, 8]} />
            <meshBasicMaterial color={c.color} transparent opacity={0.45} />
          </mesh>
          {/* billboard cardinal label (draws on top, never obstructs) */}
          <sprite position={[0, 17, 0]} scale={[9, 9, 1]}>
            <spriteMaterial map={textures[i]} transparent depthTest={false} depthWrite={false} />
          </sprite>
        </group>
      ))}

      {/* Live Sun-azimuth marker on the ring */}
      <group ref={sunRef}>
        <mesh>
          <sphereGeometry args={[2.2, 16, 16]} />
          <meshBasicMaterial color="#fbbf24" toneMapped={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[3.6, 16, 16]} />
          <meshBasicMaterial color="#fbbf24" transparent opacity={0.25} toneMapped={false} depthWrite={false} />
        </mesh>
      </group>

      {/* Building Forward indicator */}
      <group rotation={[0, -THREE.MathUtils.degToRad(building.orientation), 0]}>
        <group position={[0, 0.4, -radius + 4]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[1.5, 4, 16]} />
            <meshBasicMaterial color="#34d399" />
          </mesh>
          <mesh position={[0, 0, radius / 2 - 4]} rotation={[-Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.5, 0.5, radius - 8, 8]} />
            <meshBasicMaterial color="#34d399" transparent opacity={0.3} />
          </mesh>
        </group>
      </group>
    </group>
  )
}
