'use client'

import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getSimulation } from '@/lib/engine/simulation'
import { activeFacing } from '@/lib/engine/solarViz'

/**
 * ActiveSurfaceHighlight — a purely visual glow over the building surface that is
 * currently receiving the most sun (or the roof when the sun is high). It reads
 * live per-surface solar exposure from the engine and lights a translucent
 * additive plane just outside that surface's glazing, so the lit façade glows
 * through the kinetic fins as the sun tracks morning → midday → afternoon.
 *
 * This is visualisation ONLY — no PBIF optimisation, no façade geometry changes.
 * Mounted only in Weather Validation Mode.
 */

export function ActiveSurfaceHighlight() {
  const sim = getSimulation()
  const ref = useRef<THREE.Mesh>(null)

  const R = useMemo(() => new THREE.Vector3(), [])
  const U = useMemo(() => new THREE.Vector3(), [])
  const N = useMemo(() => new THREE.Vector3(), [])
  const P = useMemo(() => new THREE.Vector3(), [])
  const S = useMemo(() => new THREE.Vector3(), [])
  const basis = useMemo(() => new THREE.Matrix4(), [])
  const quat = useMemo(() => new THREE.Quaternion(), [])

  useFrame(() => {
    const mesh = ref.current
    if (!mesh) return
    const sun = sim.sun
    const surfaces = sim.skin.getAllSurfaces()
    if (!sun.isDaytime || surfaces.length === 0) {
      mesh.visible = false
      return
    }

    const facing = activeFacing(sun.azimuth, sun.altitude, sim.building.orientation)
    ;(mesh.material as THREE.MeshBasicMaterial).color.set(facing.color)

    if (facing.facing === 'ROOF') {
      const b = sim.building
      R.set(1, 0, 0)
      U.set(0, 0, -1)
      N.set(0, 1, 0)
      P.set(0, b.height + 0.3, 0)
      S.set(b.width * 0.98, b.depth * 0.98, 1)
    } else {
      // The most-lit vertical surface (highest average solar exposure).
      let best = surfaces[0]
      let bestExp = -Infinity
      for (const s of surfaces) {
        let e = 0
        for (const p of s.panels) e += p.solarExposure
        e /= s.panels.length || 1
        if (e > bestExp) {
          bestExp = e
          best = s
        }
      }
      R.set(best.right.x, best.right.y, best.right.z)
      U.set(best.up.x, best.up.y, best.up.z)
      N.set(best.normal.x, best.normal.y, best.normal.z)
      // Sit just outside the glazing (surface centre is at the standoff plane).
      const standoff = sim.building.facadeDepth + 0.15
      const d = -standoff + 0.12
      P.set(best.center.x + N.x * d, best.center.y + N.y * d, best.center.z + N.z * d)
      S.set(best.width * 0.98, best.height * 0.98, 1)
    }

    basis.makeBasis(R, U, N)
    quat.setFromRotationMatrix(basis)
    mesh.position.copy(P)
    mesh.quaternion.copy(quat)
    mesh.scale.copy(S)
    mesh.visible = true
  })

  return (
    <group>
      <mesh ref={ref} renderOrder={3}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          transparent
          opacity={0.18}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}
