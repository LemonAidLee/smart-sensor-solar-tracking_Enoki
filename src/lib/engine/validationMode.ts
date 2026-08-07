/**
 * Staged-development toggle — "Weather Validation Mode".
 *
 * This is a TEMPORARY simplification switch. It disables (never deletes) the
 * intelligence layers so the Building ⇄ Weather ⇄ Sun ⇄ manual-façade interaction
 * can be validated in isolation before PBIF is reintroduced.
 *
 *   WEATHER_VALIDATION_MODE = true  →
 *     • no fault / degraded / offline panels (all operational)
 *     • no Auto / Solar-tracking / Storm / Privacy / Maintenance render
 *       programs — the render `program` boots into `'manual'`
 *     • no Virtual Embedded Controller, no servo easing
 *     • `facadeControlMode` (the SOURCE of the target rotation — separate
 *       from the render `program` above) defaults to `'pbif'`, same as the
 *       full simulation: PBIF drives the façade by default in every mode,
 *       routing through the real decision → policy → kinematics chain. An
 *       operator can switch to `'manual'` (ONE angle, 0–360°, applied
 *       UNIFORMLY to every panel) or `'sun-tracking'` via the Program control.
 *     • Decision / Electronics / Explainability layers hidden
 *
 *   WEATHER_VALIDATION_MODE = false →
 *     • restores the full PBIF simulation exactly as before
 *
 * Every downstream system is gated on this single constant, so the full twin can
 * be switched back on with one edit. Nothing is removed from the project.
 */
export const WEATHER_VALIDATION_MODE = true

/** Manual façade rotation range (degrees) exposed while in validation mode. */
export const MANUAL_MIN = 0
export const MANUAL_MAX = 360
