'use client'

import { useMemo } from 'react'
import type * as THREE from 'three'
import { Edges } from '@react-three/drei'
import { usePlatformStore } from '@/lib/dt/platformStore'
import { useTwinStore } from '@/lib/engine/store'
import { neighborPosition } from '@/lib/engine/building'
import { getCityWindowMaterial } from '@/lib/engine/cityWindowMaterial'
import type { NeighborBuilding as NeighborType } from '@/lib/engine/types'

function NeighborMesh({ neighbor, material }: { neighbor: NeighborType; material: THREE.Material }) {
  const p = neighborPosition(neighbor)
  const layer = usePlatformStore((s) => s.layer)
  return (
    <mesh castShadow receiveShadow position={[p.x, neighbor.height / 2, p.z]} material={material}>
      <boxGeometry args={[neighbor.width, neighbor.height, neighbor.depth]} />
      <Edges color="#00d084" visible={layer !== 'BUILDING'} scale={1.001} />
    </mesh>
  )
}

/**
 * Surrounding buildings. These are functional, not decorative: they cast real
 * shadows and are tested by the shading engine for façade occlusion — their
 * geometry, positions and dimensions come straight from the simulation and are
 * untouched here.
 *
 * Visually they now share the city's procedural window-illumination material
 * (see `cityWindowMaterial`), so the closest neighbours light up at night with
 * the same believable occupancy pattern as the wider district — one shared
 * shader, no extra draw-call cost, no change to their shadow/occlusion role.
 */
export function NeighborsMesh() {
  const neighbors = useTwinStore((s) => s.neighbors)
  const material = useMemo(() => getCityWindowMaterial(), [])

  return (
    <group>
      {neighbors.map((n) => (
        <NeighborMesh key={n.id} neighbor={n} material={material} />
      ))}
    </group>
  )
}
