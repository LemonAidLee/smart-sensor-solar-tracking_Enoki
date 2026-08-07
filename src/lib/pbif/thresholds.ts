/**
 * PBIF v1 — Configuration constants.
 *
 * The single place where every raw threshold and safe orientation lives. Per
 * PBIF_ENGINEERING_GUIDE.md §6 ("No Magic Numbers") the decision engine never
 * embeds a literal — it reads named, documented, tunable constants from here.
 *
 * Units:
 *   • wind  — km/h (matches `WeatherState.windSpeed`)
 *   • rain  — 0–1 normalised intensity (matches `WeatherState.rainIntensity`)
 *   • cloud — 0–1 normalised cover     (matches `WeatherState.cloudCoverage`)
 *
 * This is deterministic, rule-based configuration. No AI, no learning, no
 * prediction — those are future phases that will replace the decision *source*,
 * not this table.
 */

/**
 * Wind-speed band edges, km/h. A value is `LOW` below `MODERATE`, `MODERATE`
 * up to `HIGH`, `HIGH` up to `EXTREME`, and `EXTREME` at/above `EXTREME`.
 * Loosely aligned with the Beaufort scale for a kinetic louvre façade:
 * gentle breeze → moderate breeze → strong breeze → near-gale.
 */
export const WIND_KMH = {
  MODERATE: 20,
  HIGH: 35,
  EXTREME: 50,
} as const

/** Rain-intensity band edges, 0–1 normalised. */
export const RAIN_LEVEL = {
  LIGHT: 0.05,
  MODERATE: 0.35,
  HEAVY: 0.65,
} as const

/** Simulated ADC thresholds for Solar Resource Assessment (0-4095). */
export const ADC_TO_SOLAR_RESOURCE = {
  HIGH_THRESHOLD: 4000,    // Above this, resource is HIGH (bright direct sunlight)
  MEDIUM_THRESHOLD: 2000,  // Above this, resource is MEDIUM (cloudy/overcast)
} as const

/** Outdoor Temperature band edges for Thermal Demand, °C. */
export const TEMPERATURE_C = {
  NORMAL: 24,
  HIGH: 30,
} as const

/**
 * Predefined **wind-safe** blade orientation, degrees. 90° = edge-on /
 * feathered: the flat fin presents its thin edge (minimum projected area) to a
 * façade-normal wind, minimising aerodynamic torque on the actuator and the
 * structure — the standard high-wind protection posture for louvre systems
 * (cf. feathering a wind-turbine blade). Configurable.
 *
 * NOT YET WIRED INTO `SAFE_MODE`'s arithmetic — `trackingPolicy.ts`'s
 * `resolveTarget()` closes the blade to a flat 0° for `SAFE_MODE` today. This
 * mirrors the `RAIN_SAFE_ANGLE`/`WEATHER_PROTECTION` gap that Stage 7.10.2
 * closed for rain (the two hazards were previously conflated into the same
 * 0° "CLOSED" branch); wiring wind protection to this constant the same way
 * is a candidate follow-up, not yet done, so this constant is currently
 * display/documentation-only.
 */
export const WIND_SAFE_ANGLE = 90

/**
 * The ONE authoritative **rain-safe** blade orientation, degrees — read by
 * BOTH `trackingPolicy.ts`'s `WEATHER_PROTECTION` case (the PBIF/validation
 * control path) and `panelStates.ts`'s `STATE_ANGLE[RAIN_PROTECTION]` (the
 * other, non-validation control path), so the twin has exactly one rain-safe
 * angle rather than two definitions that must be kept in sync by convention
 * (Stage 7.10.2 — before this, `trackingPolicy.ts` silently ignored this
 * constant and closed to 0° instead; see `ENGINEERING_DESIGN_REVIEW.md` §5/§11).
 *
 * 135° = an outward tilt that sheds water off the glazing rather than
 * tracking the sun. Mirrors the façade's established rain-shedding posture
 * and remains configurable — change it here and both control paths follow.
 */
export const RAIN_SAFE_ANGLE = 135

/**
 * `DYNAMIC_DEADBAND_DEG`: Dynamic deadband thresholds (degrees) based on Solar Resource.
 * High solar availability requires precise tracking (tight deadband).
 * Low solar availability permits relaxed tracking (wide deadband) to reduce actuator wear.
 */
export const DYNAMIC_DEADBAND_DEG = {
  HIGH: 2,
  MEDIUM: 5,
  LOW: 8,
} as const
