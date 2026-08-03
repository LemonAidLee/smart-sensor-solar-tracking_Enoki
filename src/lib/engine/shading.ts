/**
 * Shading / Solar-Exposure helpers — a cheap geometric model (no ray tracing).
 *
 * Solar exposure of a façade cell = how square-on the sun is to the façade
 * (dot product) × whether a neighbour building blocks the beam (ray-vs-AABB).
 */

import type { Aabb } from './building'
import { clamp, dot, type Vec3 } from './math'

/** cos of the incidence angle between the sun and an outward façade normal. */
export function incidenceCos(sunDir: Vec3, faceNormal: Vec3): number {
  return Math.max(0, dot(sunDir, faceNormal))
}

export interface OcclusionResult {
  occluded: boolean
  distance?: number
  blockerId?: string
}

/**
 * Does the beam from `origin` toward the sun pass through any neighbour box?
 * Slab method; returns occlusion result with distance and blocker ID if hit.
 */
export function neighborOcclusion(origin: Vec3, sunDir: Vec3, boxes: Aabb[]): OcclusionResult {
  if (sunDir.y <= 0.02) return { occluded: true } // sun on/below the horizon → shadowed
  for (const b of boxes) {
    const hitDist = rayHitsAabb(origin, sunDir, b)
    if (hitDist > 0) return { occluded: true, distance: hitDist, blockerId: b.id }
  }
  return { occluded: false }
}

function rayHitsAabb(o: Vec3, d: Vec3, b: Aabb): number {
  let tmin = 0
  let tmax = Infinity
  // X
  if (Math.abs(d.x) < 1e-6) {
    if (o.x < b.min.x || o.x > b.max.x) return -1
  } else {
    let t1 = (b.min.x - o.x) / d.x
    let t2 = (b.max.x - o.x) / d.x
    if (t1 > t2) [t1, t2] = [t2, t1]
    tmin = Math.max(tmin, t1)
    tmax = Math.min(tmax, t2)
    if (tmin > tmax) return -1
  }
  // Y
  if (Math.abs(d.y) < 1e-6) {
    if (o.y < b.min.y || o.y > b.max.y) return -1
  } else {
    let t1 = (b.min.y - o.y) / d.y
    let t2 = (b.max.y - o.y) / d.y
    if (t1 > t2) [t1, t2] = [t2, t1]
    tmin = Math.max(tmin, t1)
    tmax = Math.min(tmax, t2)
    if (tmin > tmax) return -1
  }
  // Z
  if (Math.abs(d.z) < 1e-6) {
    if (o.z < b.min.z || o.z > b.max.z) return -1
  } else {
    let t1 = (b.min.z - o.z) / d.z
    let t2 = (b.max.z - o.z) / d.z
    if (t1 > t2) [t1, t2] = [t2, t1]
    tmin = Math.max(tmin, t1)
    tmax = Math.min(tmax, t2)
    if (tmin > tmax) return -1
  }
  return tmax > 0.5 ? Math.max(0, tmin) : -1 // ignore self-hits right at the origin
}

/** Upper floors catch more sun (less ground reflection / horizon haze). */
export function verticalGradient(heightFraction: number): number {
  return clamp(0.62 + 0.38 * heightFraction)
}
