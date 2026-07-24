import type { SituationAssessment } from './situationAssessment'
import type { ThermalDemandState } from './thermalDemandAssessment'

export type OperationalObjective = 
  | 'Protect Structure' 
  | 'Protect Building Envelope' 
  | 'Reduce Cooling Load' 
  | 'Maintain Balanced Solar Performance'

/**
 * Determine the highest-level operational objective based on weather and thermal demand.
 * This sets the goal for the PBIF Decision.
 */
export function determineObjective(
  situation: SituationAssessment, 
  thermalDemand: ThermalDemandState
): OperationalObjective {
  
  // 1. Structural Safety always wins
  if (situation.wind.state === 'EXTREME' || situation.wind.state === 'HIGH') {
    return 'Protect Structure'
  }
  
  // 2. Weather Protection
  if (situation.rain.state === 'HEAVY' || situation.rain.state === 'MODERATE') {
    return 'Protect Building Envelope'
  }
  
  // 3. Thermal Demand (influences optimization strategy)
  if (thermalDemand === 'HIGH') {
    return 'Reduce Cooling Load'
  }
  
  // Default Objective
  return 'Maintain Balanced Solar Performance'
}
