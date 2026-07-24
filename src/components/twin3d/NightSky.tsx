'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getSimulation } from '@/lib/engine/simulation'
import { smoothstep, clamp } from '@/lib/engine/math'
import { prefersReducedMotion } from '@/lib/engine/reducedMotion'

/**
 * NightSky — stars + moon, purely additive and visible only after dark.
 *
 * A cheap star field (one GPU points buffer on a large shell) plus a soft moon
 * disc. Both fade in as the sun drops below the horizon and fade out again at
 * dawn, and dim under cloud cover — so they read as part of the same day–night
 * cycle the rest of the scene already follows, without adding any lights or
 * touching the existing sun/sky rig.
 */

const STAR_COUNT = 650
const SHELL = 1500

/** Deterministic pseudo-random in [0,1). */
function rnd(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

export function NightSky() {
  const sim = getSimulation()
  const stars = useRef<THREE.Points>(null)
  const starMat = useRef<THREE.PointsMaterial>(null)
  const moon = useRef<THREE.Mesh>(null)
  const moonMat = useRef<THREE.MeshBasicMaterial>(null)
  const halo = useRef<THREE.Mesh>(null)
  const haloMat = useRef<THREE.MeshBasicMaterial>(null)

  const positions = useMemo(() => {
    const arr = new Float32Array(STAR_COUNT * 3)
    for (let i = 0; i < STAR_COUNT; i++) {
      // Upper-hemisphere shell, biased away from the horizon.
      const theta = rnd(i + 1) * Math.PI * 2
      const phi = Math.acos(0.08 + rnd(i + 50) * 0.9) // 0 = zenith
      const r = SHELL
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      arr[i * 3 + 1] = r * Math.cos(phi)
      arr[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta)
    }
    return arr
  }, [])

  const wasVisible = useRef(true)
  useFrame((state) => {
    const s = sim.sun
    const w = sim.weather
    // Night strength, damped by cloud cover (clouds hide the stars).
    const night = (1 - smoothstep(-8, 4, s.altitude)) * (1 - clamp(w.cloudCoverage) * 0.85)
    const moonNightGate = 1 - smoothstep(-6, 6, s.altitude)

    // Daytime early-out: with nothing visible there is no per-frame star/moon work
    // to do. Hide once, then skip entirely until dusk.
    if (night < 0.02 && moonNightGate < 0.02) {
      if (wasVisible.current) {
        if (starMat.current) starMat.current.visible = false
        if (moon.current) moon.current.visible = false
        if (halo.current) halo.current.visible = false
        wasVisible.current = false
      }
      return
    }
    wasVisible.current = true
    const reduced = prefersReducedMotion()

    if (starMat.current) {
      starMat.current.opacity = night * 0.9
      starMat.current.visible = night > 0.02
      // Very slow twinkle without per-star work — a subtle global shimmer.
      starMat.current.size = reduced ? 1.5 : 1.5 + Math.sin(state.clock.elapsedTime * 0.6) * 0.15
    }
    if (stars.current && !reduced) stars.current.rotation.y = state.clock.elapsedTime * 0.002

    // Moon rides roughly opposite the sun's azimuth, low-to-mid in the sky.
    const moonNight = (1 - smoothstep(-6, 6, s.altitude)) * (1 - clamp(w.cloudCoverage) * 0.7)
    const az = s.azimuth * (Math.PI / 180) + Math.PI
    const mx = Math.sin(az) * 1200
    const mz = Math.cos(az) * 1200
    const my = 520
    if (moon.current) {
      moon.current.position.set(mx, my, mz)
      moon.current.visible = moonNight > 0.02
    }
    if (moonMat.current) moonMat.current.opacity = moonNight
    if (halo.current) {
      halo.current.position.set(mx, my, mz)
      halo.current.visible = moonNight > 0.02
    }
    if (haloMat.current) haloMat.current.opacity = moonNight * 0.35
  })

  return (
    <group>
      <points ref={stars} renderOrder={-9}>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        </bufferGeometry>
        <pointsMaterial
          ref={starMat}
          color="#dfe6ff"
          size={1.5}
          sizeAttenuation={false}
          transparent
          opacity={0}
          depthWrite={false}
          fog={false}
          toneMapped={false}
        />
      </points>

      {/* Moon disc + soft halo */}
      <mesh ref={moon} renderOrder={-8}>
        <sphereGeometry args={[34, 24, 24]} />
        <meshBasicMaterial ref={moonMat} color="#eaf0ff" transparent opacity={0} depthWrite={false} fog={false} toneMapped={false} />
      </mesh>
      <mesh ref={halo} renderOrder={-9}>
        <sphereGeometry args={[70, 20, 20]} />
        <meshBasicMaterial
          ref={haloMat}
          color="#bcd0ff"
          transparent
          opacity={0}
          depthWrite={false}
          fog={false}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}
