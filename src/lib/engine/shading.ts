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

/**
 * Does the beam from `origin` toward the sun pass through any neighbour box?
 * Slab method; returns 1 if occluded, 0 if the sky is clear along the ray.
 */
export function neighborOcclusion(origin: Vec3, sunDir: Vec3, boxes: Aabb[]): number {
  if (sunDir.y <= 0.02) return 1 // sun on/below the horizon → shadowed
  for (const b of boxes) {
    if (rayHitsAabb(origin, sunDir, b)) return 1
  }
  return 0
}

function rayHitsAabb(o: Vec3, d: Vec3, b: Aabb): boolean {
  let tmin = 0
  let tmax = Infinity
  // X
  if (Math.abs(d.x) < 1e-6) {
    if (o.x < b.min.x || o.x > b.max.x) return false
  } else {
    let t1 = (b.min.x - o.x) / d.x
    let t2 = (b.max.x - o.x) / d.x
    if (t1 > t2) [t1, t2] = [t2, t1]
    tmin = Math.max(tmin, t1)
    tmax = Math.min(tmax, t2)
    if (tmin > tmax) return false
  }
  // Y
  if (Math.abs(d.y) < 1e-6) {
    if (o.y < b.min.y || o.y > b.max.y) return false
  } else {
    let t1 = (b.min.y - o.y) / d.y
    let t2 = (b.max.y - o.y) / d.y
    if (t1 > t2) [t1, t2] = [t2, t1]
    tmin = Math.max(tmin, t1)
    tmax = Math.min(tmax, t2)
    if (tmin > tmax) return false
  }
  // Z
  if (Math.abs(d.z) < 1e-6) {
    if (o.z < b.min.z || o.z > b.max.z) return false
  } else {
    let t1 = (b.min.z - o.z) / d.z
    let t2 = (b.max.z - o.z) / d.z
    if (t1 > t2) [t1, t2] = [t2, t1]
    tmin = Math.max(tmin, t1)
    tmax = Math.min(tmax, t2)
    if (tmin > tmax) return false
  }
  return tmax > 0.5 // ignore self-hits right at the origin
}

/** Upper floors catch more sun (less ground reflection / horizon haze). */
export function verticalGradient(heightFraction: number): number {
  return clamp(0.62 + 0.38 * heightFraction)
}
