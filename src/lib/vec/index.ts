/**
 * VEC module barrel + controller factory.
 *
 * The rest of the website imports the {@link VirtualEmbeddedController} interface
 * and this factory — never a concrete controller. Today the interchangeable
 * implementations are `simulated` and `wokwi-mqtt`; `real-esp32` reuses the same
 * MQTT transport, so a physical board on the broker needs no new code.
 */

import type { ControllerKind, VirtualEmbeddedController } from './types'
import { SimulatedController } from './simulatedController'
import { WokwiMqttController } from './wokwiMqttController'

export interface CreateControllerOptions {
  /** Clock for the SimulatedController's astronomical fallback (0–24 h). */
  nowHours?: () => number
}

/** Instantiate the controller backing the VEC for the given kind. */
export function createController(
  kind: ControllerKind,
  opts: CreateControllerOptions = {},
): VirtualEmbeddedController {
  switch (kind) {
    case 'wokwi-mqtt':
    case 'real-esp32':
      return new WokwiMqttController()
    case 'simulated':
    default:
      return new SimulatedController({ nowHours: opts.nowHours })
  }
}

export * from './types'
export { buildSensorPacket, type SensorOverrides } from './sensorLayer'
export { applyActuator, vecPanelId } from './actuatorLayer'
export { SimulatedController } from './simulatedController'
export { WokwiMqttController, ENOKI_MQTT } from './wokwiMqttController'
