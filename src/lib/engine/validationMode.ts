/**
 * Staged-development toggle — "Weather Validation Mode".
 *
 * This is a TEMPORARY simplification switch. It disables (never deletes) the
 * intelligence layers so the Building ⇄ Weather ⇄ Sun ⇄ manual-façade interaction
 * can be validated in isolation before PBIF is reintroduced.
 *
 *   WEATHER_VALIDATION_MODE = true  →
 *     • no fault / degraded / offline panels (all operational)
 *     • no Auto / Solar-tracking / Storm / Privacy / Maintenance programs
 *     • no Virtual Embedded Controller, no PBIF, no servo easing
 *     • ONE manual façade angle (0–360°) applied UNIFORMLY to every panel
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
