/**
 * VectorMath — minimal, self-contained 3D vector algebra for the façade
 * kinematics engine.
 *
 * Deliberately has ZERO project dependencies so the kinematics package is a
 * pure, portable geometry library: the future PBIF / decision layer (or an
 * offline study, or a unit test) can import it without pulling in the twin.
 *
 * WORLD FRAME (right-handed):  +X = East,  +Y = Up,  +Z = South
 *   → North = −Z, West = −X. This matches the twin's `compassToWorld`.
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
export const negate = (a: Vec3): Vec3 => ({ x: -a.x, y: -a.y, z: -a.z })
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z
export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
})
export const length = (a: Vec3): number => Math.hypot(a.x, a.y, a.z)

export function normalize(a: Vec3): Vec3 {
  const l = length(a)
  return l < 1e-12 ? { x: 0, y: 0, z: 0 } : { x: a.x / l, y: a.y / l, z: a.z / l }
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)
export const deg2rad = (d: number): number => (d * Math.PI) / 180
export const rad2deg = (r: number): number => (r * 180) / Math.PI

/** Rotate a vector about the world +Y axis by `angle` radians (CCW seen from above). */
export function rotateY(a: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return { x: a.x * c + a.z * s, y: a.y, z: -a.x * s + a.z * c }
}

/** Unsigned angle between two vectors, degrees [0, 180]. */
export function angleBetweenDeg(a: Vec3, b: Vec3): number {
  const na = normalize(a)
  const nb = normalize(b)
  return rad2deg(Math.acos(clamp(dot(na, nb), -1, 1)))
}

/** Horizontal (XZ-plane) component of a vector, re-normalised. Y is dropped. */
export function horizontal(a: Vec3): Vec3 {
  return normalize({ x: a.x, y: 0, z: a.z })
}

/**
 * Bearing parameter of a horizontal vector under the `rotateY` convention:
 * `angleAboutY(rotateY(v, θ)) === angleAboutY(v) + θ`. Used to solve rotations
 * analytically instead of searching.
 */
export function angleAboutY(a: Vec3): number {
  return Math.atan2(a.x, a.z)
}

/** Wrap an angle to (−180, 180] degrees. */
export function wrap180(deg: number): number {
  let d = ((deg + 180) % 360 + 360) % 360 - 180
  if (d <= -180) d += 360
  return d
}

/** Wrap an angle to [0, 360) degrees. */
export function wrap360(deg: number): number {
  return ((deg % 360) + 360) % 360
}

/**
 * The value congruent to `base` (mod `period`) that is CLOSEST to `current`,
 * returned as a CONTINUOUS number near `current` (no 359→0 wrap). This is how the
 * solver exploits the panel's full 360° freedom to take the shortest rotational
 * path and avoid unnecessary reversals.
 */
export function nearestCongruent(current: number, base: number, period: number): number {
  return base + Math.round((current - base) / period) * period
}
