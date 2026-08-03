import type { BuildingSurface, NeighborBuilding, SunState, PVModule } from './types'
import { neighborAabb } from './building'
import { clamp, dot, rad2deg, type Vec3 } from './math'
import { neighborOcclusion, verticalGradient } from './shading'

/**
 * Diffuse sky contribution as a fraction of the attenuated global horizontal
 * irradiance. A surface always sees this much even with no direct beam.
 */
export const DIFFUSE_SKY_FRACTION = 0.15

/** Attenuated GHI — clear-sky global horizontal after the cloud modification. */
export function attenuatedGHI(sun: SunState): number {
  return sun.ghiClearSky * sun.cloudModificationFactor
}

/**
 * Effective irradiance on a plane, W/m² — the single authority for the surface
 * irradiance model, shared by the façade blades, the rooftop PV modules and the
 * Prediction Engine's forward projection.
 *
 * Direct beam requires daylight, a clear line of sight and the cosine projection
 * of the plane against the sun; the diffuse baseline is always present.
 *
 * @param ghi           Attenuated global horizontal irradiance, W/m².
 * @param cosProjection cos of the incidence angle, 0–1.
 * @param visibility    1 = unobstructed, 0 = fully occluded/shaded.
 */
export function planeIrradiance(
  ghi: number,
  cosProjection: number,
  visibility: number,
  isDaytime: boolean,
): number {
  const diffuseSky = ghi * DIFFUSE_SKY_FRACTION
  const direct = isDaytime ? ghi * cosProjection * visibility : 0
  return Math.round(direct + diffuseSky)
}

/**
 * Solar Physics Engine
 *
 * The single source of truth for all solar calculations, occlusion, and irradiance.
 * It encapsulates ray-casting and simulation neighbours so that the rest of the application
 * (PBIF, Adaptive Skin, Inspectors) simply consumes the resulting physics data.
 */
export class SolarPhysicsEngine {
  // Global environmental state
  private rawGHI: number = 0
  private cloudAttenuation: number = 0
  private sunVector: Vec3 = { x: 0, y: 1, z: 0 }

  // Per-module engineering quantities
  private moduleIncidentAngle = new Map<string, number>()
  private moduleCosineProjection = new Map<string, number>()
  private moduleOcclusion = new Map<string, number>()
  private moduleDiffuseSky = new Map<string, number>()
  private moduleEffectiveIrradiance = new Map<string, number>()
  private moduleBlocker = new Map<string, { id: string, distance: number }>()

  /**
   * Called on the environmental tier to re-evaluate solar physics for the building.
   */
  update(surfaces: BuildingSurface[], pvModules: PVModule[], sun: SunState, neighbors: NeighborBuilding[]): void {
    this.sunVector = sun.worldDir
    this.rawGHI = sun.ghiClearSky
    this.cloudAttenuation = sun.cloudModificationFactor

    // Attenuated GHI based on weather
    const ghi = attenuatedGHI(sun)


    const boxes = neighbors.map(neighborAabb)

    for (const s of surfaces) {
      for (const p of s.panels) {
        // Incident Angle & Cosine Projection
        const cosProj = clamp(dot(sun.worldDir, p.normal), 0, 1)
        const incidentAngleDeg = Math.round(rad2deg(Math.acos(cosProj)))

        // Neighbour Occlusion (Direct solar ray)
        const occResult = sun.isDaytime ? neighborOcclusion(p.worldPosition, sun.worldDir, boxes) : { occluded: true }
        const occlusionFactor = occResult.occluded ? 0.0 : 1.0

        // Diffuse Sky Contribution — a constant fraction of the attenuated GHI
        const diffuseSky = ghi * DIFFUSE_SKY_FRACTION

        // Effective Solar Irradiance
        // Direct irradiance requires daylight, clear line of sight, and panel projection
        const effectiveIrradiance = planeIrradiance(ghi, cosProj, occlusionFactor, sun.isDaytime)

        // Store intermediate and final quantities
        this.moduleIncidentAngle.set(p.id, incidentAngleDeg)
        this.moduleCosineProjection.set(p.id, cosProj)
        this.moduleOcclusion.set(p.id, occlusionFactor)
        this.moduleDiffuseSky.set(p.id, Math.round(diffuseSky))
        this.moduleEffectiveIrradiance.set(p.id, effectiveIrradiance)
        
        if (occResult.occluded && occResult.blockerId) {
          this.moduleBlocker.set(p.id, { id: occResult.blockerId, distance: occResult.distance ?? 0 })
        } else {
          this.moduleBlocker.delete(p.id)
        }
      }
    }
    
    // Rooftop PV Array processing
    // Uses the same solar model and maps as the Adaptive Façade
    for (const pv of pvModules) {
      // Incident Angle & Cosine Projection
      const cosProj = clamp(dot(sun.worldDir, pv.normal), 0, 1)
      const incidentAngleDeg = Math.round(rad2deg(Math.acos(cosProj)))

      // Future Shading Factor (e.g. self-shading, neighbor shading, cloud shading)
      // Stage 2 prepares the architecture but leaves it at 1.0 for now.
      const futureShadingFactor = 1.0
      
      // Future Bifacial Gain (rear irradiance)
      // Stage 2 only calculates front incident irradiance.

      // Effective Solar Irradiance (Front) — same diffuse baseline for the roof
      const diffuseSky = ghi * DIFFUSE_SKY_FRACTION
      const effectiveIrradiance = planeIrradiance(ghi, cosProj, futureShadingFactor, sun.isDaytime)

      this.moduleIncidentAngle.set(pv.id, incidentAngleDeg)
      this.moduleCosineProjection.set(pv.id, cosProj)
      this.moduleOcclusion.set(pv.id, futureShadingFactor) // Store shading factor as occlusion
      this.moduleDiffuseSky.set(pv.id, Math.round(diffuseSky))
      this.moduleEffectiveIrradiance.set(pv.id, effectiveIrradiance)
      this.moduleBlocker.delete(pv.id)
    }
  }

  // --- Public API ---

  getGlobalRawGHI(): number { return this.rawGHI }
  getGlobalCloudAttenuation(): number { return this.cloudAttenuation }
  getModuleIncidentAngle(moduleId: string): number { return this.moduleIncidentAngle.get(moduleId) ?? 0 }
  getModuleCosineProjection(moduleId: string): number { return this.moduleCosineProjection.get(moduleId) ?? 0 }
  getModuleOcclusionFactor(moduleId: string): number { return this.moduleOcclusion.get(moduleId) ?? 0 }
  getModuleDiffuseContribution(moduleId: string): number { return this.moduleDiffuseSky.get(moduleId) ?? 0 }
  getModuleEffectiveIrradiance(moduleId: string): number { return this.moduleEffectiveIrradiance.get(moduleId) ?? 0 }
  getModuleBlocker(moduleId: string): { id: string, distance: number } | null { return this.moduleBlocker.get(moduleId) ?? null }
  getSunVector(): Vec3 { return this.sunVector }
}
