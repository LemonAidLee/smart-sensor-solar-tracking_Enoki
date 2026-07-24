'use client'

import { useLayoutEffect, useRef } from 'react'
import * as THREE from 'three'
import type { Vec3 } from '@/lib/engine/math'

/**
 * Small helper for the STATIC (non-kinetic) parts of the building — curtain-wall
 * mullions and exterior façade frames. It draws a list of pre-computed transforms
 * as one InstancedMesh (one draw call). It never animates; kinetic blades live in
 * their own instancer.
 */
export function StaticInstances({
  geometry,
  matrices,
  color,
  metalness = 0.6,
  roughness = 0.4,
  castShadow = true,
  receiveShadow = true,
}: {
  geometry: THREE.BufferGeometry
  matrices: THREE.Matrix4[]
  color: string
  metalness?: number
  roughness?: number
  castShadow?: boolean
  receiveShadow?: boolean
}) {
  const ref = useRef<THREE.InstancedMesh>(null)

  useLayoutEffect(() => {
    const m = ref.current
    if (!m) return
    for (let i = 0; i < matrices.length; i++) m.setMatrixAt(i, matrices[i])
    m.instanceMatrix.needsUpdate = true
  }, [matrices])

  return (
    <instancedMesh
      key={matrices.length}
      ref={ref}
      args={[geometry, undefined as unknown as THREE.Material, Math.max(1, matrices.length)]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    >
      <meshStandardMaterial color={color} metalness={metalness} roughness={roughness} envMapIntensity={0.8} />
    </instancedMesh>
  )
}

/**
 * Build the transform for one framing bar, expressed in a surface's own basis
 * (right = along the wall, up = vertical, normal = outward). `du/dv/dn` are metre
 * offsets from the surface centre; `s` is the bar's [length, height, depth] scale.
 */
export function barMatrix(
  center: Vec3,
  right: Vec3,
  up: Vec3,
  normal: Vec3,
  du: number,
  dv: number,
  dn: number,
  s: [number, number, number],
): THREE.Matrix4 {
  const R = new THREE.Vector3(right.x, right.y, right.z)
  const U = new THREE.Vector3(up.x, up.y, up.z)
  const N = new THREE.Vector3(normal.x, normal.y, normal.z)
  const pos = new THREE.Vector3(
    center.x + right.x * du + up.x * dv + normal.x * dn,
    center.y + right.y * du + up.y * dv + normal.y * dn,
    center.z + right.z * du + up.z * dv + normal.z * dn,
  )
  const mat = new THREE.Matrix4().makeBasis(R, U, N)
  mat.setPosition(pos)
  mat.scale(new THREE.Vector3(s[0], s[1], s[2]))
  return mat
}

/** Columns / rows in a surface's panel grid (derived from its panels). */
export function surfaceGrid(panels: { row: number; column: number }[]): { cols: number; rows: number } {
  let cols = 0
  let rows = 0
  for (const p of panels) {
    if (p.column + 1 > cols) cols = p.column + 1
    if (p.row + 1 > rows) rows = p.row + 1
  }
  return { cols: Math.max(1, cols), rows: Math.max(1, rows) }
}
