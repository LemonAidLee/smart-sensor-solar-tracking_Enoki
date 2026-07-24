/**
 * SolarVector — turn a solar altitude/azimuth into the 3D vectors the geometry
 * engine works with. All downstream maths uses these vectors; there are no
 * angle-based special cases.
 *
 * Azimuth is degrees clockwise from TRUE NORTH (0=N, 90=E, 180=S, 270=W),
 * altitude is degrees above the horizon — exactly what the twin's NOAA solar
 * model outputs. In the world frame (+X=E, +Y=Up, +Z=S):
 *
 *   toSun = ( sin(az)·cos(alt),  sin(alt),  −cos(az)·cos(alt) )
 *
 * which is identical to the twin's `compassToWorld`, so the kinematics agree
 * with the rendered sun exactly.
 */
import { deg2rad, negate, normalize, rotateY, type Vec3 } from './vectorMath'

export interface SolarVector {
  /** Unit vector pointing FROM the site TOWARD the sun. */
  toSun: Vec3
  /** Unit vector of the incoming sunlight (direction photons travel) = −toSun. */
  incident: Vec3
  /** Horizontal (azimuthal) projection of `toSun`, re-normalised (XZ plane). */
  horizontal: Vec3
  altitudeDeg: number
  azimuthDeg: number
  aboveHorizon: boolean
}

export function solarVector(altitudeDeg: number, azimuthDeg: number): SolarVector {
  const alt = deg2rad(altitudeDeg)
  const az = deg2rad(azimuthDeg)
  const cosAlt = Math.cos(alt)
  const toSun: Vec3 = {
    x: Math.sin(az) * cosAlt,
    y: Math.sin(alt),
    z: -Math.cos(az) * cosAlt,
  }
  return {
    toSun,
    incident: negate(toSun),
    horizontal: normalize({ x: toSun.x, y: 0, z: toSun.z }),
    altitudeDeg,
    azimuthDeg,
    aboveHorizon: alt > 0,
  }
}

/**
 * Transforms a world-space SolarVector into a building's Local Coordinate System.
 * 
 * If the building is rotated clockwise by `headingDeg` in the world, the sun 
 * effectively rotates counter-clockwise by `headingDeg` relative to the building.
 */
export function transformSolarVector(world: SolarVector, headingDeg: number): SolarVector {
  if (headingDeg === 0) return world

  // Inverse rotation: positive deg2rad is counter-clockwise.
  const invRot = deg2rad(headingDeg)
  
  const localToSun = rotateY(world.toSun, invRot)
  const localHorizontal = rotateY(world.horizontal, invRot)
  
  // Local azimuth: if building faces 90 (East) and sun is at 90 (East), 
  // local azimuth should be 0 (Front/North).
  const localAzimuthDeg = ((world.azimuthDeg - headingDeg) % 360 + 360) % 360

  return {
    toSun: localToSun,
    incident: negate(localToSun),
    horizontal: localHorizontal,
    altitudeDeg: world.altitudeDeg,
    azimuthDeg: localAzimuthDeg,
    aboveHorizon: world.aboveHorizon,
  }
}
