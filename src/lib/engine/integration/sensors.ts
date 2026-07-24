/**
 * Integration Layer — Virtual Sensor interfaces (FUTURE STAGE, not yet wired).
 *
 * Declared now to prove the architectural seam: virtual sensors *observe* the
 * Simulation exactly as physical sensors observe the real world. The next stage
 * (ESP32 → MQTT → Node-RED → AI) reads these instead of being hand-fed values.
 * Nothing in the simulation or renderer depends on this file today.
 */

import type { Simulation } from '../simulation'

export interface SensorReading<T = number> {
  sensorId: string
  type: string
  value: T
  unit: string
  timestamp: number
}

export interface VirtualSensor<T = number> {
  id: string
  read(sim: Simulation): SensorReading<T>
}

/** LDR observes the simulated sun + cloud (irradiance → a lux-like value). */
export const virtualLDR: VirtualSensor = {
  id: 'ldr-01',
  read: (sim) => ({
    sensorId: 'ldr-01',
    type: 'LDR',
    value: Math.round(sim.sun.irradiance * 120), // crude lux proxy
    unit: 'lux',
    timestamp: Date.now(),
  }),
}

/** DHT22 observes ambient temperature + humidity from the Weather Engine. */
export const virtualDHT22: VirtualSensor<{ temperature: number; humidity: number }> = {
  id: 'dht22-01',
  read: (sim) => ({
    sensorId: 'dht22-01',
    type: 'DHT22',
    value: { temperature: sim.weather.temperature, humidity: sim.weather.humidity },
    unit: '°C / %RH',
    timestamp: Date.now(),
  }),
}

/** Rain sensor observes simulated rain intensity. */
export const virtualRainSensor: VirtualSensor = {
  id: 'rain-01',
  read: (sim) => ({
    sensorId: 'rain-01',
    type: 'RAIN',
    value: Math.round(sim.weather.rainIntensity * 100),
    unit: '%',
    timestamp: Date.now(),
  }),
}

/** Anemometer observes the Wind Engine. */
export const virtualWindSensor: VirtualSensor = {
  id: 'wind-01',
  read: (sim) => ({
    sensorId: 'wind-01',
    type: 'ANEMOMETER',
    value: sim.weather.windSpeed,
    unit: 'km/h',
    timestamp: Date.now(),
  }),
}

export const VIRTUAL_SENSORS = [virtualLDR, virtualDHT22, virtualRainSensor, virtualWindSensor]
