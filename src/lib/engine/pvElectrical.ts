import type { PVModule } from './types'
import { SolarPhysicsEngine } from './solarPhysics'

/**
 * Electrical state for a single PV Module.
 * Contains the active power generation and hooks for future derating factors.
 */
export interface PVModuleElectricalState {
  moduleId: string
  currentPower: number
  ratedPower: number
  irradiance: number
  status: string
  // Future hooks
  temperatureFactor: number
  soilingFactor: number
  shadingFactor: number
}

/**
 * Intermediate architectural abstraction for wiring PV Modules into series strings.
 */
export interface PVString {
  id: string
  modules: string[]
  currentPower: number
}

/** Nameplate power of one LONGi LR5-72HBD 550M module at STC, W. */
export const PV_MODULE_RATED_POWER_W = 550

/** Standard Test Conditions irradiance the linear power model is anchored to, W/m². */
export const PV_STC_IRRADIANCE_WM2 = 1000

/**
 * DC power of ONE module for a given plane-of-array irradiance, W — the single
 * authority for the array's electrical response.
 *
 * A simplified linear STC model: output is proportional to irradiance, never
 * negative and never above the nameplate rating, with the derating hooks applied
 * afterwards. Exported as a pure function because the Prediction Engine projects
 * future generation through it; re-deriving the same curve there would put two
 * PV models in the codebase (guide §6, no duplicated calculations).
 */
export function moduleDcPowerW(
  irradianceWm2: number,
  ratedPowerW: number = PV_MODULE_RATED_POWER_W,
  temperatureFactor = 1,
  soilingFactor = 1,
  shadingFactor = 1,
): number {
  let power = (irradianceWm2 / PV_STC_IRRADIANCE_WM2) * ratedPowerW
  // Power is never negative and never exceeds rated capacity
  if (power < 0) power = 0
  if (power > ratedPowerW) power = ratedPowerW
  // Apply derating hooks
  return power * temperatureFactor * soilingFactor * shadingFactor
}

/**
 * Stage 7.2: Rooftop PV System (DC Array Electrical Model)
 *
 * An independent architectural subsystem responsible for all PV electrical
 * behaviour, stopping at the DC Array Output. It consumes irradiance directly
 * from the SolarPhysicsEngine and generates string and array electrical metrics.
 */
export class PVElectricalEngine {
  private moduleStates: Map<string, PVModuleElectricalState> = new Map()
  private strings: PVString[] = []
  
  private installedCapacityKW = 0
  private currentOutputKW = 0
  private averageModuleOutputW = 0
  private averageIrradianceW = 0
  private operatingModules = 0
  private utilization = 0
  
  constructor(modules: PVModule[]) {
    this.rebuild(modules)
  }
  
  public rebuild(modules: PVModule[]) {
    this.moduleStates.clear()
    this.strings = []
    
    // Initialize module electrical state
    for (const mod of modules) {
      this.moduleStates.set(mod.id, {
        moduleId: mod.id,
        currentPower: 0,
        ratedPower: PV_MODULE_RATED_POWER_W, // LONGi LR5-72HBD 550M
        irradiance: 0,
        status: 'Online',
        temperatureFactor: 1.0,
        soilingFactor: 1.0,
        shadingFactor: 1.0
      })
    }
    
    // Build strings. 
    // Engineering Assumption: 189 modules are wired into 9 strings of 21 modules each.
    const modulesPerString = 21
    let currentString: string[] = []
    let stringIndex = 1
    
    for (const mod of modules) {
      currentString.push(mod.id)
      if (currentString.length === modulesPerString) {
        this.strings.push({
          id: `String-${stringIndex}`,
          modules: currentString,
          currentPower: 0
        })
        currentString = []
        stringIndex++
      }
    }
    // Any remaining modules form the last string
    if (currentString.length > 0) {
      this.strings.push({
        id: `String-${stringIndex}`,
        modules: currentString,
        currentPower: 0
      })
    }
    
    // 189 modules * 550 W = 103,950 W = 103.95 kW DC
    // Note: The engineering report specifies ~104.02 kW DC, resulting in a minor 0.07 kW rounding difference.
    this.installedCapacityKW = (modules.length * 550) / 1000
  }
  
  public update(modules: PVModule[], solarPhysics: SolarPhysicsEngine) {
    let totalIrradiance = 0
    let totalPower = 0
    let activeModules = 0
    
    for (const mod of modules) {
      const state = this.moduleStates.get(mod.id)
      if (!state) continue
      
      const irradiance = solarPhysics.getModuleEffectiveIrradiance(mod.id)

      const power = moduleDcPowerW(
        irradiance,
        state.ratedPower,
        state.temperatureFactor,
        state.soilingFactor,
        state.shadingFactor,
      )

      state.irradiance = irradiance
      state.currentPower = power
      
      totalIrradiance += irradiance
      totalPower += power
      if (state.status === 'Online') activeModules++
    }
    
    // Aggregate DC power for strings
    for (const str of this.strings) {
      let stringPower = 0
      for (const mid of str.modules) {
        const s = this.moduleStates.get(mid)
        if (s) stringPower += s.currentPower
      }
      str.currentPower = stringPower
    }
    
    // Update Array-level DC metrics
    this.operatingModules = activeModules
    this.currentOutputKW = totalPower / 1000
    this.averageModuleOutputW = activeModules > 0 ? totalPower / activeModules : 0
    this.averageIrradianceW = modules.length > 0 ? totalIrradiance / modules.length : 0
    this.utilization = this.installedCapacityKW > 0 ? (this.currentOutputKW / this.installedCapacityKW) * 100 : 0
  }
  
  public getArrayMetrics() {
    return {
      installedCapacityKW: this.installedCapacityKW,
      currentOutputKW: this.currentOutputKW,
      averageModuleOutputW: this.averageModuleOutputW,
      averageIrradianceW: this.averageIrradianceW,
      operatingModules: this.operatingModules,
      utilization: this.utilization
    }
  }
}
