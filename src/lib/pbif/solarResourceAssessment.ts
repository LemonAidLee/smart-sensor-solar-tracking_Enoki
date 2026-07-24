import { CLOUD_TO_SOLAR_RESOURCE } from './thresholds'
import type { AssessedVariable } from './situationAssessment'

export type SolarResourceState = 'LOW' | 'MEDIUM' | 'HIGH'

/**
 * Estimate Solar Resource Assessment based on Cloud Cover.
 * Future versions may replace this with measured Solar Irradiance from a sensor.
 */
export function assessSolarResource(cloudCoverage: number): AssessedVariable<SolarResourceState> {
  let state: SolarResourceState = 'HIGH'
  
  if (cloudCoverage >= CLOUD_TO_SOLAR_RESOURCE.LOW_THRESHOLD) {
    state = 'LOW'
  } else if (cloudCoverage >= CLOUD_TO_SOLAR_RESOURCE.MEDIUM_THRESHOLD) {
    state = 'MEDIUM'
  }
  
  return { 
    state, 
    value: cloudCoverage, // We preserve the input value (could be irradiance later)
    display: state 
  }
}
