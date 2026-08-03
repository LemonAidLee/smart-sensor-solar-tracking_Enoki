import { ADC_TO_SOLAR_RESOURCE } from './thresholds'
import type { AssessedVariable } from './situationAssessment'

export type SolarResourceState = 'LOW' | 'MEDIUM' | 'HIGH'

/**
 * Estimate Solar Resource Assessment based on the simulated ESP32 ADC reading.
 */
export function assessSolarResource(solarADC: number): AssessedVariable<SolarResourceState> {
  let state: SolarResourceState = 'LOW'
  
  if (solarADC >= ADC_TO_SOLAR_RESOURCE.HIGH_THRESHOLD) {
    state = 'HIGH'
  } else if (solarADC >= ADC_TO_SOLAR_RESOURCE.MEDIUM_THRESHOLD) {
    state = 'MEDIUM'
  }
  
  return { 
    state, 
    value: solarADC,
    display: `${solarADC} (ADC)` 
  }
}
