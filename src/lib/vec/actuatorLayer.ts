/**
 * Virtual Actuator Layer.
 *
 * The inverse of the sensor layer: it takes the controller's hardware outputs
 * (an {@link ActuatorPacket}) and applies them to the Digital Twin. The servo
 * angle (0–180°) maps 1:1 onto the Adaptive Skin blade rotation for Panel 0 — the
 * new mechanism shares the firmware's exact 0–180° travel — so a real motor's
 * command and a simulated one drive the façade identically.
 *
 * This layer never talks to a controller directly; the synchronisation manager
 * reads outputs and hands them here. It knows only the engine's public API.
 */

import type { Simulation } from '@/lib/engine/simulation'
import type { ActuatorPacket } from './types'

/** The panel designated as the physical/embedded one — Panel 0 of the building. */
export function vecPanelId(sim: Simulation): string | null {
  return sim.skin.getAllPanels()[0]?.id ?? null
}

/**
 * Drive Panel 0 from the controller's actuator outputs. The servo angle becomes
 * the blade's target rotation via a low-level rotation override, which the
 * Adaptive Skin Engine then reaches with real motor inertia/cohesion. Returns the
 * panel id it drove (or null if the building has no panels).
 */
export function applyActuator(sim: Simulation, packet: ActuatorPacket): string | null {
  const id = vecPanelId(sim)
  if (!id) return null
  sim.skin.setPanelRotation(id, packet.servoAngle)
  return id
}
