'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getSimulation } from '@/lib/engine/simulation'

const COUNT = 1600
const AREA = 500
const TOP = 320

/** Deterministic pseudo-random in [0,1) — pure, safe to call during render. */
function rnd(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

/** GPU points rain — density (opacity) and slant track the Weather/Wind engines. */
export function RainFX() {
  const sim = getSimulation()
  const points = useRef<THREE.Points>(null)
  const mat = useRef<THREE.PointsMaterial>(null)

  const positions = useMemo(() => {
    const arr = new Float32Array(COUNT * 3)
    for (let i = 0; i < COUNT; i++) {
      arr[i * 3] = (rnd(i + 1) - 0.5) * AREA
      arr[i * 3 + 1] = rnd(i + 100) * TOP
      arr[i * 3 + 2] = (rnd(i + 200) - 0.5) * AREA
    }
    return arr
  }, [])

  useFrame((_, dt) => {
    const intensity = sim.weather.rainIntensity
    if (mat.current) {
      mat.current.opacity = intensity * 0.6
      mat.current.visible = intensity > 0.02
    }
    if (!points.current || intensity <= 0.02) return
    const geo = points.current.geometry
    const pos = geo.attributes.position as THREE.BufferAttribute
    const arr = pos.array as Float32Array
    const fall = 220 * dt
    const slant = sim.weather.windStrength * 120 * dt
    for (let i = 0; i < COUNT; i++) {
      arr[i * 3 + 1] -= fall
      arr[i * 3] += slant
      if (arr[i * 3 + 1] < 0) {
        arr[i * 3 + 1] = TOP
        arr[i * 3] = (Math.random() - 0.5) * AREA
        arr[i * 3 + 2] = (Math.random() - 0.5) * AREA
      }
    }
    pos.needsUpdate = true
  })

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        ref={mat}
        color="#a9c3e0"
        size={0.9}
        sizeAttenuation
        transparent
        opacity={0}
        depthWrite={false}
        fog={false}
      />
    </points>
  )
}
