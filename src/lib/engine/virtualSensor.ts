import type { BuildingSurface } from './types'
import type { SolarPhysicsEngine } from './solarPhysics'

/**
 * Virtual Sensor Engine
 * 
 * Simulates the physical hardware sensing chain from Effective Irradiance down to a
 * filtered 12-bit ADC reading. This decouples the PBIF logic from the environmental
 * physics models.
 * 
 * Electrical Model:
 *  - LDR resistance decreases non-linearly with light (R = 500 / lux)
 *  - Voltage Divider with a 10 kΩ pull-down resistor to 3.3V Vcc
 *  - 12-bit ADC (0 - 4095)
 */
export class VirtualSensorEngine {
  // Global reference sensor (e.g. roof-mounted, unoccluded)
  private globalLux: number = 0
  private globalResistance: number = 0
  private globalVoltage: number = 0
  private globalADC: number = 0
  private globalFilteredADC: number = 0

  // Per-module sensor state
  private moduleLux = new Map<string, number>()
  private moduleResistance = new Map<string, number>()
  private moduleVoltage = new Map<string, number>()
  private moduleADC = new Map<string, number>()
  private moduleFilteredADC = new Map<string, number>()

  /**
   * Evaluates the sensor pipeline.
   * @param surfaces The building surfaces containing the adaptive modules
   * @param solarPhysics The solar physics engine containing effective irradiance
   * @param dt Time delta in seconds for the digital filter
   */
  update(surfaces: BuildingSurface[], solarPhysics: SolarPhysicsEngine, dt: number): void {
    // A simple exponential smoothing filter with a 0.5s time constant
    const alpha = 1.0 - Math.exp(-dt / 0.5)

    // 1. Process Global Reference Sensor
    const globalGHI = solarPhysics.getGlobalRawGHI() * solarPhysics.getGlobalCloudAttenuation()
    this.globalLux = Math.round(globalGHI * 120)
    this.globalResistance = this.globalLux > 0 ? (500 / this.globalLux) : 10000
    this.globalVoltage = 3.3 * (10 / (this.globalResistance + 10))
    this.globalADC = Math.round((10 / (this.globalResistance + 10)) * 4095)
    
    const prevGlobalF = this.globalFilteredADC || this.globalADC
    this.globalFilteredADC = prevGlobalF + (this.globalADC - prevGlobalF) * alpha

    // 2. Process Per-Module Sensors
    for (const s of surfaces) {
      for (const p of s.panels) {
        const irradiance = solarPhysics.getModuleEffectiveIrradiance(p.id)
        
        const lux = Math.round(irradiance * 120)
        const res = lux > 0 ? (500 / lux) : 10000
        const vOut = 3.3 * (10 / (res + 10))
        const adc = Math.round((10 / (res + 10)) * 4095)
        
        this.moduleLux.set(p.id, lux)
        this.moduleResistance.set(p.id, res)
        this.moduleVoltage.set(p.id, vOut)
        this.moduleADC.set(p.id, adc)
        
        const prevF = this.moduleFilteredADC.get(p.id) ?? adc
        const filtered = prevF + (adc - prevF) * alpha
        this.moduleFilteredADC.set(p.id, filtered)
      }
    }
  }

  // --- Public API ---

  getGlobalLux(): number { return this.globalLux }
  getGlobalResistance(): number { return this.globalResistance }
  getGlobalVoltage(): number { return this.globalVoltage }
  getGlobalADC(): number { return this.globalADC }
  getGlobalFilteredADC(): number { return Math.round(this.globalFilteredADC) }

  getModuleLux(id: string): number { return this.moduleLux.get(id) ?? 0 }
  getModuleResistance(id: string): number { return this.moduleResistance.get(id) ?? 10000 }
  getModuleVoltage(id: string): number { return this.moduleVoltage.get(id) ?? 0 }
  getModuleADC(id: string): number { return this.moduleADC.get(id) ?? 0 }
  getModuleFilteredADC(id: string): number { return Math.round(this.moduleFilteredADC.get(id) ?? 0) }
}
