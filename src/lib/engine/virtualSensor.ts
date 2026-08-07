import type { BuildingSurface } from './types'
import type { SolarPhysicsEngine } from './solarPhysics'
import { computeLdrChain } from './ldrPhysics'

/**
 * Virtual Sensor Engine
 *
 * Simulates the physical hardware sensing chain from Effective Irradiance down to a
 * filtered 12-bit ADC reading. This decouples the PBIF logic from the environmental
 * physics models.
 *
 * Electrical Model (the GL5528-style LDR power law, `src/lib/engine/ldrPhysics.ts`
 * — the single authority every consumer, including the Virtual Embedded System's
 * `embedded/sensors.ts`, computes this chain through):
 *  - LDR resistance falls non-linearly with light: R = R10 * (10 / lux)^gamma
 *  - Voltage divider: V = VCC * R_FIXED / (R_FIXED + R_LDR)
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
    const globalChain = computeLdrChain(globalGHI)
    this.globalLux = globalChain.lux
    this.globalResistance = globalChain.resistanceOhms
    this.globalVoltage = globalChain.voltage
    this.globalADC = globalChain.adc

    const prevGlobalF = this.globalFilteredADC || this.globalADC
    this.globalFilteredADC = prevGlobalF + (this.globalADC - prevGlobalF) * alpha

    // 2. Process Per-Module Sensors
    for (const s of surfaces) {
      for (const p of s.panels) {
        const irradiance = solarPhysics.getModuleEffectiveIrradiance(p.id)
        const chain = computeLdrChain(irradiance)

        this.moduleLux.set(p.id, chain.lux)
        this.moduleResistance.set(p.id, chain.resistanceOhms)
        this.moduleVoltage.set(p.id, chain.voltage)
        this.moduleADC.set(p.id, chain.adc)
        
        const prevF = this.moduleFilteredADC.get(p.id) ?? chain.adc
        const filtered = prevF + (chain.adc - prevF) * alpha
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
