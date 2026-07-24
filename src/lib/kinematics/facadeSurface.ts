/**
 * FacadeSurface — the geometry of one building surface and the panels mounted on
 * it. A vertical façade panel rotates about its OWN vertical axis, so its normal
 * sweeps a horizontal circle. The surface therefore fully defines a panel's
 * kinematics from a single outward normal.
 *
 * Works for North, East, South, West and any arbitrary building orientation: the
 * surface normal is the only input, so nothing here assumes an east-facing
 * building. Rotating the building later simply rotates the normals.
 */
import { cross, deg2rad, normalize, rotateY, type Vec3, v3 } from './vectorMath'

export interface FacadeSurface {
  /** Outward surface normal (world, horizontal for a vertical wall). */
  normal: Vec3
  /** Vertical rotation axis of every panel on this surface (world +Y). */
  rotationAxis: Vec3
  /** In-plane horizontal axis (along the wall), = axis × normal. */
  right: Vec3
  /** In-plane vertical axis (= world up). */
  up: Vec3
}

const UP = v3(0, 1, 0)

export function facadeSurface(normal: Vec3): FacadeSurface {
  const n = normalize(normal)
  return {
    normal: n,
    rotationAxis: UP,
    right: normalize(cross(UP, n)),
    up: UP,
  }
}

/**
 * Outward normal of a panel rotated `rotationDeg` about its vertical axis.
 *
 * SIGN CONVENTION (matches the renderer's −Y hinge, `FacadeLayer.tsx`):
 *   panelNormal(θ) = rotateY(surfaceNormal, −θ)
 *   • θ = 0°   → broad face flush with the façade (normal = surface normal)
 *   • θ = 90°  → edge-on to the façade (normal ⟂ surface normal, in-plane)
 * A flat panel is symmetric, so θ and θ+180° give the SAME plane (opposite face).
 */
export function panelNormal(surface: FacadeSurface, rotationDeg: number): Vec3 {
  return rotateY(surface.normal, -deg2rad(rotationDeg))
}
