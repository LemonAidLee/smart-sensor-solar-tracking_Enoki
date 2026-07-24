/**
 * Virtual Sensor Layer.
 *
 * Its single responsibility is to translate the master simulation's physical
 * state into **sensor values**, expressed exactly as the ESP32 firmware would
 * read them off its pins (ADC counts 0–4095, °C, %RH, booleans). Each virtual
 * sensor mimics one real device on the Enoki board:
 *
 *   Ambient temperature/humidity → virtual DHT22
 *   Light intensity (per side)   → virtual LDR ×4  (BH1750-style lux behind it)
 *   Wind speed                   → virtual anemometer (potentiometer ADC)
 *   Rain intensity               → virtual rain sensor (potentiometer ADC)
 *   Occupancy                    → virtual PIR
 *   Maintenance                  → virtual slide switch
 *
 * The firmware cannot tell these apart from real hardware — that is the point.
 * This layer knows nothing about Wokwi or MQTT; it only produces a
 * {@link VirtualSensorPacket}. The synchronisation layer hands that packet to
 * whichever {@link VirtualEmbeddedController} is active.
 */

import type { Simulation } from '@/lib/engine/simulation'
import { clamp, normalize, type Vec3 } from '@/lib/engine/math'
import { FW, type VirtualSensorPacket } from './types'

/** Manual, operator-controlled sensor inputs the environment can't derive. */
export interface SensorOverrides {
  /** PIR — is a person present behind Panel 0? */
  motion: boolean
  /** Maintenance slide switch — LOW/true pauses the controller. */
  pauseSwitch: boolean
}

const toAdc = (unit: number): number => Math.round(clamp(unit) * FW.ADC_MAX)

/** Horizontal (XZ) axis pointing along the panel's "right" side. */
function rightAxis(normal: Vec3): Vec3 {
  // Perpendicular to the outward normal in the ground plane (yaw-only blades).
  return normalize({ x: normal.z, y: 0, z: -normal.x })
}

// -- Individual virtual sensors ---------------------------------------------

/** DHT22: ambient temperature with a little solar skin-heating, and humidity. */
export function virtualDHT22(sim: Simulation, exposure: number): { temperatureC: number; humidityPct: number } {
  return {
    temperatureC: Math.round((sim.weather.temperature + exposure * 2) * 10) / 10,
    humidityPct: Math.round(sim.weather.humidity),
  }
}

/**
 * Four photoresistors. Brightness comes from Panel 0's solar exposure (already
 * incidence- and occlusion-aware); a left/right differential is injected from
 * the sun's horizontal bearing relative to the panel so the firmware's
 * differential tracker has something to chase. Higher ADC = darker.
 */
function virtualLDRs(sim: Simulation, normal: Vec3, exposure: number): VirtualSensorPacket['ldr'] {
  const darkness = 1 - exposure
  const baseAdc = 350 + darkness * 3700 // bright ≈ 350, dark ≈ 4050

  const r = rightAxis(normal)
  const sunHoriz = { x: sim.sun.worldDir.x, y: 0, z: sim.sun.worldDir.z }
  const side = sim.sun.isDaytime ? sunHoriz.x * r.x + sunHoriz.z * r.z : 0 // [-1,1]
  const spread = 900 * exposure // only meaningful in real light

  const left = clamp((baseAdc + side * spread) / FW.ADC_MAX)
  const right = clamp((baseAdc - side * spread) / FW.ADC_MAX)
  const jitter = (n: number) => clamp(n + (Math.sin(sim.clock.timeHours * 13 + n * 7) * 0.004))
  return {
    l1: toAdc(jitter(left)),
    l2: toAdc(jitter(left + 0.002)),
    l3: toAdc(jitter(right)),
    l4: toAdc(jitter(right + 0.002)),
  }
}

/** Anemometer as a potentiometer: km/h mapped onto the 0–4095 ADC span. */
function virtualAnemometer(sim: Simulation): number {
  return toAdc(sim.weather.windSpeed / 60)
}

/** Rain sensor as a potentiometer: intensity 0–1 mapped onto the ADC span. */
function virtualRainSensor(sim: Simulation): number {
  return toAdc(sim.weather.rainIntensity)
}

/**
 * Build the full sensor packet for Panel 0 from the current simulation state.
 * Returns `null` only if the building has no panels (nothing to sense).
 */
export function buildSensorPacket(sim: Simulation, overrides: SensorOverrides): VirtualSensorPacket | null {
  const panel0 = sim.skin.getAllPanels()[0]
  if (!panel0) return null

  const exposure = clamp(panel0.solarExposure)
  const dht = virtualDHT22(sim, exposure)

  return {
    timestamp: Date.now(),
    temperatureC: dht.temperatureC,
    humidityPct: dht.humidityPct,
    windAdc: virtualAnemometer(sim),
    rainAdc: virtualRainSensor(sim),
    motion: overrides.motion,
    pauseSwitch: overrides.pauseSwitch,
    ldr: virtualLDRs(sim, panel0.normal, exposure),
  }
}
