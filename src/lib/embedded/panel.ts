/**
 * Virtual Embedded System — panel selection + read-only output derivation.
 *
 * Picks the ONE façade module this panel observes ("Upper Centre") and derives
 * the ESP32's outputs (servo echo, status LEDs, LCD text) purely by READING
 * already-computed state — `FacadePanel.rotationAngle`, `facadeControlMode`,
 * and the existing `PbifEvaluation` (see `src/lib/pbif`). Nothing here
 * computes a rotation, a PBIF decision, or writes back to the simulation; it
 * only explains what the embedded controller would see and display.
 */

import type { Simulation } from '@/lib/engine/simulation'
import type { FacadePanel } from '@/lib/engine/types'
import type { FacadeControlMode } from '@/lib/engine/facadeControl'
import { SERVO_SETTLED_DEG, servoAngleToPwmMicros, worldRotationToServoAngle } from './servo'

/** The three status LEDs on the board, per the panel spec. */
export interface LedState {
  /** Green — actively solar-tracking. */
  tracking: boolean
  /** Yellow — a human is directly commanding the panel (manual mode). */
  maintenance: boolean
  /** Red — PBIF has forced a protective override (façade forced closed). */
  override: boolean
}

export interface ServoState {
  /** Raw world-space kinematic rotation Building Kinematics is commanding — unbounded (e.g. -735°). */
  worldRotationTarget: number
  /** Raw world-space kinematic rotation the blade is currently at — unbounded. */
  worldRotationCurrent: number
  /** `worldRotationTarget` folded into the servo's physical 0–180° travel. */
  servoCommandAngle: number
  /** PWM pulse width the ESP32 would drive for `servoCommandAngle`, µs. */
  pwmMicros: number
  /** `worldRotationCurrent` folded into the servo's physical 0–180° travel. */
  servoPositionAngle: number
  moving: boolean
}

/**
 * Reuse the same "most-lit surface" auto-select already established by
 * `KinematicsInspector`/`PbifPanel` (`averageSolarExposure` max), then pick
 * that surface's top row (row 0), middle column — the "Upper Centre" module.
 * Re-run only when the building geometry actually changes (see the panel
 * component's `useMemo` deps), never per-frame.
 */
export function pickUpperCentrePanel(sim: Simulation): FacadePanel | undefined {
  const summaries = sim.skin.getSurfaceSummaries()
  if (summaries.length === 0) return undefined
  const best = summaries.reduce((a, b) => (b.averageSolarExposure > a.averageSolarExposure ? b : a))
  const surface = sim.skin.getSurface(best.id)
  if (!surface || surface.panels.length === 0) return undefined

  const minRow = Math.min(...surface.panels.map((p) => p.row))
  const topRow = surface.panels.filter((p) => p.row === minRow)
  const cols = [...new Set(topRow.map((p) => p.column))].sort((a, b) => a - b)
  const midCol = cols[Math.floor((cols.length - 1) / 2)]
  return topRow.find((p) => p.column === midCol) ?? topRow[0]
}

/**
 * Index of a panel within `sim.skin.getAllPanels()` — the SAME array order
 * `FacadeLayer`'s InstancedMesh uses for its per-instance transforms. A
 * consumer can pass this to `InstancedMesh.getMatrixAt(index, matrix)` to read
 * the EXACT transform already driving that panel (position, rotation and
 * scale, including its current blade angle) instead of recomputing an
 * approximation of it — the one source of truth for "where is this panel".
 * Returns -1 if the panel no longer exists (e.g. geometry just changed).
 */
export function panelIndex(sim: Simulation, panelId: string): number {
  return sim.skin.getAllPanels().findIndex((p) => p.id === panelId)
}

/**
 * Current/target angle straight off the live panel — never recomputed — then
 * folded into the servo's physical frame of reference (see `servo.ts`). The
 * façade's own unbounded rotation stays exactly as Building Kinematics
 * produced it; only the DISPLAY separates "world rotation" from "servo
 * position", per the engineering distinction between kinematics and hardware.
 */
export function servoState(panel: FacadePanel): ServoState {
  const servoCommandAngle = worldRotationToServoAngle(panel.targetRotation)
  const servoPositionAngle = worldRotationToServoAngle(panel.rotationAngle)
  return {
    worldRotationTarget: panel.targetRotation,
    worldRotationCurrent: panel.rotationAngle,
    servoCommandAngle,
    pwmMicros: servoAngleToPwmMicros(servoCommandAngle),
    servoPositionAngle,
    moving: Math.abs(panel.targetRotation - panel.rotationAngle) > SERVO_SETTLED_DEG,
  }
}

/**
 * LEDs read the SAME façade-control decision already shown elsewhere (the
 * ControlDeck's mode selector, `PbifPanel`'s decision) — never a new one.
 */
export function ledState(sim: Simulation, mode: FacadeControlMode): LedState {
  if (mode === 'manual') {
    return { tracking: false, maintenance: true, override: false }
  }
  if (mode === 'sun-tracking') {
    return { tracking: true, maintenance: false, override: false }
  }
  const decision = sim.skin.getPbifEvaluation()?.policy
  const tracksSun = decision?.tracksSun ?? true
  return { tracking: tracksSun, maintenance: false, override: !tracksSun }
}

/** Short mode label for the 20-column LCD (≤ 13 chars to leave room for "MODE: "). */
function lcdModeLabel(sim: Simulation, mode: FacadeControlMode): string {
  if (mode === 'manual') return 'MANUAL'
  if (mode === 'sun-tracking') return 'TRACKING'
  const state = sim.skin.getPbifEvaluation()?.decision.state ?? 'NORMAL_TRACKING'
  switch (state) {
    case 'SAFE_MODE':
      return 'SAFE MODE'
    case 'WEATHER_PROTECTION':
      return 'PROTECT'
    case 'ECONOMY_TRACKING':
      return 'ECONOMY'
    case 'NORMAL_TRACKING':
    default:
      return 'TRACKING'
  }
}

/** Pad/truncate to the 20×4 LCD's fixed character grid. */
function lcdLine(text: string): string {
  return text.slice(0, 20).padEnd(20, ' ')
}

/**
 * The 20×4 LCD's four lines, built exactly as the firmware would render them.
 * `angle` must be the PHYSICAL servo angle (0–180°, from `servoState()`) —
 * a real LCD reads the actuator, never the unbounded kinematic rotation.
 */
export function lcdLines(sim: Simulation, mode: FacadeControlMode, angle: number): string[] {
  return [
    lcdLine('PBIF READY'),
    lcdLine(`MODE: ${lcdModeLabel(sim, mode)}`),
    lcdLine(`TEMP: ${sim.weather.temperature.toFixed(1)} C`),
    lcdLine(`ANGLE: ${Math.round(angle)} deg`),
  ]
}
