/**
 * Minimal vector math for the pure simulation layer.
 *
 * The engine stays framework-free (no three.js) so it can be unit-tested and,
 * later, run headless for the sensor/ESP32/AI stages. The renderer converts
 * these plain vectors into THREE.Vector3 at the boundary.
 */

export interface Vec3 {
  x: number
  y: number
  z: number
}

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z })

export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z })
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s })
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
export const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z)

export function normalize(a: Vec3): Vec3 {
  const l = length(a) || 1
  return { x: a.x / l, y: a.y / l, z: a.z / l }
}

/** Rotate a vector about the world +Y axis by `angle` radians (CCW from above). */
export function rotateY(a: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return { x: a.x * c + a.z * s, y: a.y, z: -a.x * s + a.z * c }
}

export const clamp = (v: number, min = 0, max = 1): number => (v < min ? min : v > max ? max : v)
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}

export const deg2rad = (d: number): number => (d * Math.PI) / 180
export const rad2deg = (r: number): number => (r * 180) / Math.PI

/**
 * Convert a compass bearing (0=N, 90=E, 180=S, 270=W) + altitude into a world
 * unit vector, in a frame where +X = East, +Z = South, +Y = Up. Used for both
 * the sun direction and façade normals so they always agree.
 */
export function compassToWorld(bearingDeg: number, altitudeDeg = 0): Vec3 {
  const a = deg2rad(bearingDeg)
  const h = deg2rad(altitudeDeg)
  const cosH = Math.cos(h)
  return normalize({ x: Math.sin(a) * cosH, y: Math.sin(h), z: -Math.cos(a) * cosH })
}
