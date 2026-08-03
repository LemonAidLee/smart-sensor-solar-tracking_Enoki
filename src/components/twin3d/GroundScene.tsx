'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getSimulation } from '@/lib/engine/simulation'
import { lerp } from '@/lib/engine/math'
import { getCityLayout } from '@/lib/engine/cityLayout'
import { useTwinStore } from '@/lib/engine/store'

/**
 * Urban ground — redesigns the site into a focused, single block layout:
 *
 *   road -> green verge -> sidewalk -> SOLIS building -> parking -> landscaping
 *
 * All static and lightweight.
 */
export function GroundScene() {
  const sim = getSimulation()
  const mat = useRef<THREE.MeshStandardMaterial>(null)
  
  // Materials
  const vergeMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3a423d', roughness: 0.95, metalness: 0.02 }), [])
  const sidewalkMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#787c82', roughness: 0.8, metalness: 0.05 }), [])
  const parkingMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#16181b', roughness: 0.9, metalness: 0.1 }), [])

  useFrame(() => {
    if (mat.current) {
      const wet = sim.weather.groundWetness
      mat.current.roughness = lerp(0.95, 0.22, wet)
      mat.current.metalness = lerp(0.05, 0.4, wet)
    }
  })

  return (
    <>
      {/* Base terrain / Shadow catcher */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[800, 800]} />
        <meshStandardMaterial ref={mat} color="#1a1e24" roughness={0.92} metalness={0.06} />
      </mesh>

      {/* District background block (under the neighbours) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#23272e" roughness={0.9} metalness={0.05} />
      </mesh>

      {/* Green Verge (Outlines the block inside the roads) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow material={vergeMat}>
        <planeGeometry args={[220, 220]} />
      </mesh>

      {/* Sidewalk */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} receiveShadow material={sidewalkMat}>
        <planeGeometry args={[180, 180]} />
      </mesh>

      {/* Landscape padding around building */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} receiveShadow material={vergeMat}>
        <planeGeometry args={[160, 160]} />
      </mesh>

      {/* Plaza / Entry Hardscape (Front +Z) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 30]} receiveShadow material={sidewalkMat}>
        <planeGeometry args={[120, 100]} />
      </mesh>

      {/* Parking Area (Rear -Z) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, -50]} receiveShadow material={parkingMat}>
        <planeGeometry args={[100, 60]} />
      </mesh>

      {/* Parking Line Markings */}
      <group position={[0, 0.06, -50]}>
        {Array.from({ length: 11 }).map((_, i) => (
          <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[-40 + i * 8, 0, 0]} material={sidewalkMat}>
            <planeGeometry args={[0.3, 16]} />
          </mesh>
        ))}
      </group>
    </>
  )
}
