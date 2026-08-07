import {
  ADC_MAX,
  LDR_DARK_RESISTANCE_OHMS,
  LDR_FIXED_RESISTOR_OHMS,
  LDR_GAMMA,
  LDR_R10_OHMS,
  LUX_PER_WM2,
  VCC,
} from '@/lib/embedded/constants'

/**
 * LDR Sensor Physics — the ONE place the Environment → Electrical Signal
 * chain (irradiance → lux → LDR resistance → divider voltage → ADC counts)
 * is computed. Every consumer (`VirtualSensorEngine`, the Virtual Embedded
 * System's `embedded/sensors.ts`, and any future one) calls these functions
 * rather than re-deriving the arithmetic, so the GL5528 power-law model
 * documented in `embedded/constants.ts` and displayed in the UI is
 * guaranteed to be the model that actually runs (CLAUDE.md §6, Single
 * Source of Truth). Pure and framework-free.
 */

/** Ev = eta x G — daylight luminous efficacy converts radiometric irradiance into photometric illuminance. */
export function irradianceToLux(irradianceWm2: number): number {
  return Math.round(Math.max(0, irradianceWm2) * LUX_PER_WM2)
}

/**
 * R = R10 x (10 / Ev)^gamma — the GL5528-style CdS photoresistor power law,
 * clamped at `LDR_DARK_RESISTANCE_OHMS` as illuminance approaches zero (the
 * power law alone diverges to infinity, which no physical cell does).
 */
export function luxToLdrResistanceOhms(lux: number): number {
  if (lux <= 0) return LDR_DARK_RESISTANCE_OHMS
  const resistance = LDR_R10_OHMS * Math.pow(10 / lux, LDR_GAMMA)
  return Math.min(resistance, LDR_DARK_RESISTANCE_OHMS)
}

/** V = VCC x R_FIXED / (R_FIXED + R_LDR) — the LDR is wired as the VCC-side leg of the divider. */
export function ldrResistanceToVoltage(resistanceOhms: number): number {
  return VCC * (LDR_FIXED_RESISTOR_OHMS / (LDR_FIXED_RESISTOR_OHMS + resistanceOhms))
}

/** ADC = (V / VREF) x 4095 — the ESP32-S3's 12-bit SAR ADC, VREF approx VCC at default attenuation. */
export function voltageToAdcCounts(voltage: number): number {
  return Math.round((voltage / VCC) * ADC_MAX)
}

/** One sensor's full Effective Irradiance -> ADC Counts reading, in a single call. */
export interface LdrChainResult {
  lux: number
  resistanceOhms: number
  voltage: number
  adc: number
}

export function computeLdrChain(effectiveIrradianceWm2: number): LdrChainResult {
  const lux = irradianceToLux(effectiveIrradianceWm2)
  const resistanceOhms = luxToLdrResistanceOhms(lux)
  const voltage = ldrResistanceToVoltage(resistanceOhms)
  const adc = voltageToAdcCounts(voltage)
  return { lux, resistanceOhms, voltage, adc }
}
