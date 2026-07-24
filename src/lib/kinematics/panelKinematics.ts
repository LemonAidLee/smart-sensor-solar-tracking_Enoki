/**
 * PanelKinematics — the pure geometry engine for ONE panel.
 *
 * Given the panel's surface and a rotation angle it reports the panel's normal,
 * its incidence on the sun and its projected exposure. It contains NO decision
 * logic: it only answers "for this geometry, what happens?". PBIF (later) and the
 * RotationSolver (now) are the only callers that turn these facts into a choice.
 */
import { facadeSurface, panelNormal, type FacadeSurface } from './facadeSurface'
import { beamIncidenceDeg, projectedExposure } from './incidentAngle'
import type { SolarVector } from './solarVector'
import { dot, type Vec3 } from './vectorMath'

export class PanelKinematics {
  readonly surface: FacadeSurface

  constructor(surfaceNormal: Vec3) {
    this.surface = facadeSurface(surfaceNormal)
  }

  /** Panel outward normal at a rotation (deg). */
  normalAt(rotationDeg: number): Vec3 {
    return panelNormal(this.surface, rotationDeg)
  }

  /** Direct-beam interception fraction at a rotation, 0–1. */
  exposureAt(rotationDeg: number, solar: SolarVector): number {
    return projectedExposure(this.normalAt(rotationDeg), solar)
  }

  /** Beam incident angle on the blade plane (deg, 0–90) at a rotation. */
  incidenceAt(rotationDeg: number, solar: SolarVector): number {
    return beamIncidenceDeg(this.normalAt(rotationDeg), solar)
  }

  /** Whether this surface faces the sun at all (sun in front of the façade). */
  isSunlit(solar: SolarVector): boolean {
    return solar.aboveHorizon && dot(this.surface.normal, solar.toSun) > 0
  }

  /**
   * The greatest exposure this panel can EVER reach for the given sun. Because a
   * vertical-axis panel only controls azimuth, the vertical part of the sun is
   * uncontrollable, so the ceiling is cos(altitude): at a high sun the blade can
   * do little; on the horizon it can face the sun fully. An important physical
   * limit of vertical-axis kinematics.
   */
  maxExposure(solar: SolarVector): number {
    return solar.aboveHorizon ? Math.cos((solar.altitudeDeg * Math.PI) / 180) : 0
  }
}
