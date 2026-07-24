/**
 * Metrics Engine — each surface computes its own performance independently, then
 * the building aggregates them. Estimates only (AI will refine later).
 */

import type { BuildingMetrics, BuildingSurface, SunState, SurfaceMetrics, WeatherState } from './types'
import { clamp } from './math'

const SHGC = 0.45 // solar heat-gain coefficient of the glazing behind the skin

export function computeSurfaceMetrics(
  surface: BuildingSurface,
  weather: WeatherState | null,
  sun: SunState | null,
): SurfaceMetrics {
  const panels = surface.panels
  const n = panels.length || 1
  let exposure = 0
  let temp = 0
  let wind = 0
  let angle = 0
  let open = 0
  let shade = 0
  let power = 0
  let area = 0

  for (const p of panels) {
    exposure += p.solarExposure
    temp += p.surfaceTemperature
    wind += p.windLoad
    angle += p.rotationAngle
    open += p.openness
    shade += p.shading
    power += p.powerConsumption
    area += p.width * p.height
  }

  const avgExposure = exposure / n
  const avgOpen = open / n
  const avgShade = shade / n
  const sunI = sun ? clamp(sun.irradiance / 1000) : 0
  const ambient = weather?.temperature ?? 30

  const solarGainKW = avgExposure * avgOpen * area * SHGC
  const envelopeKW = Math.max(0, ambient - 24) * area * 0.012
  const coolingLoad = Math.round((solarGainKW + envelopeKW) * 10) / 10

  const averageDaylight = Math.round(clamp(avgOpen * (sun?.isDaytime ? 0.35 + 0.65 * sunI : 0.04)) * 100)
  const energySaving = Math.round(clamp((1 - avgOpen) * (0.3 + avgExposure)) * 100)

  const indoorProxy = ambient + avgExposure * avgOpen * 8
  const thermal = 1 - clamp((indoorProxy - 24) / 10)
  const daylightComfort = 1 - Math.abs(averageDaylight - 55) / 55
  const glare = 1 - clamp(avgExposure * avgOpen)
  const comfortScore = Math.round(clamp((thermal + daylightComfort + glare) / 3) * 100)

  // Thermal load actually reaching the glazing (beam × how open the blades are).
  const thermalExposure = clamp(avgExposure * avgOpen)

  return {
    surfaceId: surface.id,
    name: surface.name,
    averageSolarExposure: Math.round(avgExposure * 100) / 100,
    averageTemperature: Math.round((temp / n) * 10) / 10,
    averageWindLoad: Math.round((wind / n) * 100) / 100,
    averagePanelAngle: Math.round((angle / n) * 10) / 10,
    averageOpenness: Math.round(avgOpen * 100) / 100,
    averageShading: Math.round(avgShade * 100) / 100,
    thermalExposure: Math.round(thermalExposure * 100) / 100,
    powerUsage: Math.round(power * 10) / 10,
    averageDaylight,
    coolingLoad,
    energySaving,
    comfortScore,
    panelCount: panels.length,
  }
}

export function computeBuildingMetrics(
  surfaces: BuildingSurface[],
  weather: WeatherState | null,
  sun: SunState | null,
): BuildingMetrics {
  const per = surfaces.map((s) => computeSurfaceMetrics(s, weather, sun))

  let totalCooling = 0
  let totalPanels = 0
  let weightedSaving = 0
  let weightedComfort = 0
  let weightedAngle = 0
  let weightedTemp = 0
  let weightedExposure = 0
  let weightedOpenness = 0
  let weightedDaylight = 0
  let power = 0
  let moving = 0
  let fault = 0
  let healthy = 0

  per.forEach((m) => {
    const w = m.panelCount || 1
    totalCooling += m.coolingLoad
    totalPanels += m.panelCount
    weightedSaving += m.energySaving * w
    weightedComfort += m.comfortScore * w
    weightedAngle += m.averagePanelAngle * w
    weightedTemp += m.averageTemperature * w
    weightedExposure += m.averageSolarExposure * w
    weightedOpenness += m.averageOpenness * w
    weightedDaylight += m.averageDaylight * w
  })

  for (const s of surfaces) {
    for (const p of s.panels) {
      power += p.powerConsumption
      if (p.movementState !== 'idle' && p.movementState !== 'holding') moving++
      if (p.healthStatus === 'ok') healthy++
      else fault++
    }
  }

  const wsum = totalPanels || 1
  return {
    totalCoolingLoad: Math.round(totalCooling * 10) / 10,
    totalEnergySaving: Math.round(weightedSaving / wsum),
    averageComfort: Math.round(weightedComfort / wsum),
    averagePanelAngle: Math.round((weightedAngle / wsum) * 10) / 10,
    averageOpenness: Math.round((weightedOpenness / wsum) * 100) / 100,
    totalPowerConsumption: Math.round(power),
    averageFacadeTemperature: Math.round((weightedTemp / wsum) * 10) / 10,
    averageSolarExposure: Math.round((weightedExposure / wsum) * 100) / 100,
    averageDaylight: Math.round(weightedDaylight / wsum),
    totalPanels,
    movingPanels: moving,
    faultPanels: fault,
    healthyPanels: healthy,
    surfaceCount: surfaces.length,
    surfaces: per,
  }
}
