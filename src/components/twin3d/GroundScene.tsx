'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getSimulation } from '@/lib/engine/simulation'
import { lerp } from '@/lib/engine/math'
import { getCityLayout } from '@/lib/engine/cityLayout'
import { useTwinStore } from '@/lib/engine/store'

/** Deterministic pseudo-random in [0,1). */
function rnd(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/**
 * Urban ground — replaces the single empty plane with a believable ground plane:
 *
 *   • a large base terrain (still the shadow catcher) that gets wet & reflective
 *     in the rain, exactly as before;
 *   • a paved civic plaza pad under the tower with a subtle inset border;
 *   • scattered landscape patches (planted greens / islands) around the district
 *     so the ground reads as blocks and pockets rather than one flat sheet.
 *
 * All static, instanced where it repeats, and lightweight — the roads themselves
 * live in `CityLife` alongside the traffic they carry.
 */
export function GroundScene() {
  const sim = getSimulation()
  const mat = useRef<THREE.MeshStandardMaterial>(null)
  const height = useTwinStore((s) => s.building.height)
  const layout = useMemo(() => getCityLayout(height), [height])

  // Landscape patches: a few green islands placed off the roads, deterministic.
  const patches = useMemo(() => {
    const arr: { x: number; z: number; w: number; d: number; rot: number }[] = []
    for (let i = 0; i < 14; i++) {
      const a = rnd(i * 3 + 1) * Math.PI * 2
      const r = 220 + rnd(i * 5 + 2) * 620
      const x = Math.cos(a) * r
      const z = Math.sin(a) * r * 0.8
      // Keep greens off the main road corridors.
      if (Math.abs(z - 200) < 30 || Math.abs(z + 200) < 26) continue
      arr.push({ x, z, w: 26 + rnd(i + 7) * 60, d: 26 + rnd(i + 9) * 60, rot: rnd(i + 11) * Math.PI })
    }
    return arr
  }, [])

  const greenMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#33403a', roughness: 0.95, metalness: 0.02 }),
    [],
  )

  useFrame(() => {
    if (mat.current) {
      const wet = sim.weather.groundWetness
      mat.current.roughness = lerp(0.95, 0.22, wet)
      mat.current.metalness = lerp(0.05, 0.4, wet)
    }
  })

  return (
    <>
      {/* Base terrain — the primary shadow catcher, wetness-responsive. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[3000, 3000]} />
        <meshStandardMaterial ref={mat} color="#1a1e24" roughness={0.92} metalness={0.06} />
      </mesh>

      {/* District ground blocks — a lighter concrete "developed" zone so the
          district doesn't float on empty terrain. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, -30]} receiveShadow>
        <planeGeometry args={[1900, 1500]} />
        <meshStandardMaterial color="#23272e" roughness={0.9} metalness={0.05} />
      </mesh>

      {/* Civic plaza pad filling the Zone 1 block (-240 to 240 X, -200 to 200 Z). */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.03, 0]} receiveShadow>
        <planeGeometry args={[460, 380]} />
        <meshStandardMaterial color="#2c333c" roughness={0.82} metalness={0.12} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} receiveShadow>
        <planeGeometry args={[420, 340]} />
        <meshStandardMaterial color="#333b45" roughness={0.78} metalness={0.14} />
      </mesh>

      {/* Landscape islands / pocket greens. */}
      {patches.map((p, i) => (
        <mesh
          key={i}
          rotation={[-Math.PI / 2, 0, p.rot]}
          position={[p.x, 0.02, p.z]}
          receiveShadow
          material={greenMat}
        >
          <planeGeometry args={[p.w, p.d]} />
        </mesh>
      ))}

      {/* A planting strip along the front avenue, tying the street trees together. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 180]} receiveShadow material={greenMat}>
        <planeGeometry args={[layout.roads[0].length, 10]} />
      </mesh>
    </>
  )
}
