/**
 * Panel operational states + the mechanical rotation model.
 *
 * The new adaptive-façade mechanism is a motor-driven blade mounted flush to the
 * wall. It rotates about its vertical mounting axis across a full 0°→180° sweep:
 *
 *     0°   flush against the façade      → FULLY CLOSED (covers the glazing)
 *     45°  tilted in                     → HEAVY SHADING
 *     60°  tilted further                → PARTIAL SHADING
 *     90°  perpendicular to the wall     → FULLY OPEN (edge-on, maximum daylight)
 *     120° tilted out                    → PARTIAL SHADING
 *     135° tilted out further            → HEAVY SHADING
 *     180° flush on the opposite side    → FULLY CLOSED (covers the glazing)
 *
 * Openness therefore peaks at 90° and falls to zero at both 0° and 180°. The
 * projected coverage of the glazing by a blade at angle θ is |cos θ|, so:
 *
 *     openness = 1 − |cos θ|      shading = |cos θ|
 *
 * The rest of the simulation requests high-level {@link PanelState}s; this module
 * is the single place that maps a state to a concrete rotation angle. Dynamic
 * states (solar tracking, rain) return `null` here and are resolved per-panel,
 * per-frame by the engine from live environmental vectors.
 */

import { clamp, deg2rad, rad2deg } from './math'
import { RAIN_SAFE_ANGLE } from '@/lib/pbif/thresholds'

/** Full mechanical travel of a blade, in degrees. */
export const ROTATION_MIN = 0
export const ROTATION_MAX = 180

/** The angle at which a blade is edge-on to the wall — maximum daylight. */
export const ANGLE_FULLY_OPEN = 90

/** High-level operational states an external controller can request. */
export enum PanelState {
  FULLY_OPEN = 'FULLY_OPEN',
  PARTIAL_SHADING = 'PARTIAL_SHADING',
  HEAVY_SHADING = 'HEAVY_SHADING',
  FULLY_CLOSED = 'FULLY_CLOSED',
  SOLAR_TRACKING = 'SOLAR_TRACKING',
  RAIN_PROTECTION = 'RAIN_PROTECTION',
  STORM_LOCK = 'STORM_LOCK',
  PRIVACY_MODE = 'PRIVACY_MODE',
  MAINTENANCE = 'MAINTENANCE',
}

/**
 * Static angle for each state, or `null` when the angle is derived live from the
 * environment. `RAIN_PROTECTION` reads `RAIN_SAFE_ANGLE` (`@/lib/pbif/thresholds`)
 * — the SAME constant `trackingPolicy.ts`'s `WEATHER_PROTECTION` case now reads
 * for the other (PBIF) control path, so there is exactly one rain-safe angle in
 * the twin rather than two definitions that happened to agree by coincidence.
 */
export const STATE_ANGLE: Record<PanelState, number | null> = {
  [PanelState.FULLY_OPEN]: 90,
  [PanelState.PARTIAL_SHADING]: 60,
  [PanelState.HEAVY_SHADING]: 45,
  [PanelState.FULLY_CLOSED]: 0,
  [PanelState.STORM_LOCK]: 0,
  [PanelState.PRIVACY_MODE]: 180,
  [PanelState.MAINTENANCE]: 90,
  [PanelState.RAIN_PROTECTION]: RAIN_SAFE_ANGLE,
  [PanelState.SOLAR_TRACKING]: null,
}

/** Human labels for the HUD / controller UI. */
export const STATE_LABEL: Record<PanelState, string> = {
  [PanelState.FULLY_OPEN]: 'Fully Open',
  [PanelState.PARTIAL_SHADING]: 'Partial Shading',
  [PanelState.HEAVY_SHADING]: 'Heavy Shading',
  [PanelState.FULLY_CLOSED]: 'Fully Closed',
  [PanelState.SOLAR_TRACKING]: 'Solar Tracking',
  [PanelState.RAIN_PROTECTION]: 'Rain Protection',
  [PanelState.STORM_LOCK]: 'Storm Lock',
  [PanelState.PRIVACY_MODE]: 'Privacy Mode',
  [PanelState.MAINTENANCE]: 'Maintenance',
}

/** Blade coverage of the glazing (1 = flush/closed, 0 = perpendicular/open). */
export function shadingFromAngle(angle: number): number {
  return Math.abs(Math.cos(deg2rad(angle)))
}

/** Daylight admitted (0 = closed, 1 = perpendicular/open). Peaks at 90°. */
export function opennessFromAngle(angle: number): number {
  return 1 - shadingFromAngle(angle)
}

/**
 * Inverse mapping used by solar tracking: pick the near-side (0–90°) blade angle
 * that admits a target openness. `openness→angle = acos(1 − openness)`.
 */
export function angleForOpenness(openness: number): number {
  return rad2deg(Math.acos(clamp(1 - clamp(openness), 0, 1)))
}

/**
 * Classify a live angle back into the nearest descriptive state (for telemetry /
 * the HUD). Dynamic control states are never inferred here — only the physical
 * openness bands.
 */
export function describeAngle(angle: number): PanelState {
  const o = opennessFromAngle(angle)
  if (o > 0.9) return PanelState.FULLY_OPEN
  if (o > 0.42) return PanelState.PARTIAL_SHADING
  if (o > 0.12) return PanelState.HEAVY_SHADING
  return PanelState.FULLY_CLOSED
}
