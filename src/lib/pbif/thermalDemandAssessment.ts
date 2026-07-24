import { TEMPERATURE_C } from './thresholds'
import type { AssessedVariable } from './situationAssessment'

export type ThermalDemandState = 'LOW' | 'NORMAL' | 'HIGH'

/**
 * Classify outdoor temperature into a simple engineering Thermal Demand state.
 */
export function assessThermalDemand(outdoorTemperature: number): AssessedVariable<ThermalDemandState> {
  let state: ThermalDemandState = 'LOW'
  
  if (outdoorTemperature >= TEMPERATURE_C.HIGH) {
    state = 'HIGH'
  } else if (outdoorTemperature >= TEMPERATURE_C.NORMAL) {
    state = 'NORMAL'
  }
  
  return { 
    state, 
    value: outdoorTemperature, 
    display: `${Math.round(outdoorTemperature)}°C` 
  }
}
