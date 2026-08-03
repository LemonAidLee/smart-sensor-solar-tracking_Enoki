/**
 * Building helpers — neighbour placement + bounding boxes for the shading tests.
 *
 * (Surface generation now lives in the Geometry Engine; the Adaptive Skin Engine
 * is fully geometry-agnostic and no longer references compass façades.)
 */

import type { NeighborBuilding } from './types'
import { compassToWorld, type Vec3, v3 } from './math'

export interface Aabb {
  id?: string
  min: Vec3
  max: Vec3
}

/** World position of a neighbour's centre from its bearing + distance. */
export function neighborPosition(n: NeighborBuilding): Vec3 {
  const dir = compassToWorld(n.bearing, 0)
  return { x: dir.x * n.distance, y: 0, z: dir.z * n.distance }
}

/** Axis-aligned box for a neighbour (good enough for cheap shadow tests). */
export function neighborAabb(n: NeighborBuilding): Aabb {
  const p = neighborPosition(n)
  return {
    id: n.id,
    min: v3(p.x - n.width / 2, 0, p.z - n.depth / 2),
    max: v3(p.x + n.width / 2, n.height, p.z + n.depth / 2),
  }
}
