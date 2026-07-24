/**
 * Virtual Embedded System — Servo Actuator Mapping.
 *
 *   Building Kinematics (unbounded world rotation)  →  [ Servo Mapping ]  →  Physical Actuator
 *
 * Building Kinematics may use unrestricted, continuous world-space rotation —
 * the shortest-path solver in `src/lib/kinematics/rotationSolver.ts` happily
 * accumulates values like -735° across a simulated day so a blade never
 * unwinds through 360°. A REAL servo cannot do that: it has a fixed 0–180°
 * mechanical travel and is driven by a PWM pulse width, not a mathematical
 * angle. This module NEVER touches the kinematics/PBIF math — it only folds
 * the EXISTING world-rotation value into the physical actuator's frame of
 * reference for display, exploiting the flat blade's own 180° optical
 * symmetry (θ and θ+180° are the SAME physical plane — see
 * `rotationSolver.ts`'s header comment): any world rotation is achievable at
 * a physically-identical blade orientation somewhere within one 180° span, so
 * folding modulo 180° is not an approximation of the kinematics, it's exactly
 * what a real bounded servo would be commanded to.
 */

import { clamp, lerp } from '@/lib/engine/math'

/** Physical servo travel, degrees — matches the real firmware's `FW.SERVO_MIN/MAX`. */
export const SERVO_MIN_DEG = 0
export const SERVO_MAX_DEG = 180

/**
 * PWM pulse width at 0°/180°, µs. 1000–2000 µs spanning the full 180° travel
 * (centre ≈ 1500 µs at 90°) is a common simplified hobby-servo convention;
 * real hardware varies by brand (e.g. 500–2400 µs). Documented here as the
 * one place this convention is defined.
 */
export const PWM_MIN_US = 1000
export const PWM_MAX_US = 2000

/**
 * Fold an unrestricted world-space rotation into the servo's 0–180° physical
 * travel via the blade's 180° symmetry. Always returns a value in [0, 180).
 */
export function worldRotationToServoAngle(worldRotationDeg: number): number {
  return ((worldRotationDeg % 180) + 180) % 180
}

/** Linear PWM pulse width for a given (already-folded) servo angle. */
export function servoAngleToPwmMicros(servoAngleDeg: number): number {
  const t = clamp(servoAngleDeg / SERVO_MAX_DEG, 0, 1)
  return Math.round(lerp(PWM_MIN_US, PWM_MAX_US, t))
}
