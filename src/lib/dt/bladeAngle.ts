/**
 * Blade-angle terminology — the single source of the WORDS the Digital Twin
 * uses for rotation.
 *
 * The simulation exposes several rotation quantities (unbounded kinematic world
 * rotation, the folded servo command, the folded servo position, the PWM pulse
 * that drives it). Historically each panel invented its own label for these —
 * "World Rotation", "Commanded Rotation", "Target Motor Angle", "Servo
 * Position", "Current Panel Angle" — so the same number appeared under four
 * names and a newcomer could not tell which was which.
 *
 * There are only ever THREE things a reader needs:
 *
 *   Current Blade Angle   where the façade blade physically is now
 *   Target Blade Angle    where the controller wants it to go
 *   Servo Status          plain language for what the motor is doing about it
 *
 * Everything else is an implementation detail and belongs behind
 * `BLADE_LABEL.advanced` ("Advanced Servo Diagnostics").
 *
 * This module is PRESENTATION ONLY. It reads values the engines already
 * computed (`FacadePanel.rotationAngle` / `.targetRotation`, `ServoState`) and
 * formats them. It performs no kinematics, no decision logic and no physics —
 * per the "physics drives UI, never vice versa" rule.
 */

import { wrap360 } from '@/lib/kinematics'
import { SERVO_SETTLED_DEG } from '@/lib/embedded/servo'

/**
 * The canonical labels. Import these instead of typing the string — that is what
 * keeps every panel in agreement.
 */
export const BLADE_LABEL = {
  /** Actual physical position of the façade blade right now. */
  current: 'Current Blade Angle',
  /** Where the controller (PBIF → kinematics solver) wants the blade. */
  target: 'Target Blade Angle',
  /** Plain-language description of what the servo is doing. */
  servoStatus: 'Servo Status',
  /** Collapsible home for world rotation, servo command/position and PWM. */
  advanced: 'Advanced Servo Diagnostics',
} as const

/**
 * Present any rotation in one consistent frame: wrapped to 0–360° and rounded.
 * Kinematics may hold an unbounded value (e.g. −735° after a day of tracking);
 * that raw number is engineering detail, never a headline figure.
 */
export function formatBladeAngle(deg: number): string {
  return `${Math.round(wrap360(deg))}°`
}

export interface BladeMotion {
  /** True while the servo is still travelling (same threshold the engine uses). */
  moving: boolean
  /** Servo Status — what the motor is doing. */
  status: string
  /** Current Blade Angle status — how the blade relates to its target. */
  currentStatus: string
  /** Absolute travel still to go, degrees. */
  remainingDeg: number
  /** Remaining travel, formatted — e.g. `85°`. */
  remaining: string
  /** Progress, formatted — e.g. `185° → 270°`. */
  progress: string
}

/**
 * Describe the blade's motion in the words a non-specialist can follow.
 * `currentDeg` / `targetDeg` are the raw engine values; the caller never has to
 * decide what counts as "settled".
 */
export function describeBladeMotion(currentDeg: number, targetDeg: number): BladeMotion {
  const remainingDeg = Math.abs(targetDeg - currentDeg)
  const moving = remainingDeg > SERVO_SETTLED_DEG
  return {
    moving,
    status: moving ? 'Moving to target' : 'Holding position',
    currentStatus: moving ? 'Moving toward target' : 'Already aligned',
    remainingDeg,
    remaining: `${Math.round(remainingDeg)}°`,
    progress: `${formatBladeAngle(currentDeg)} → ${formatBladeAngle(targetDeg)}`,
  }
}
