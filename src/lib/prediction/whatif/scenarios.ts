/**
 * What-If scenario catalogue — Stage 8.2.
 *
 * Each entry is a hypothesis and the single parameter change that expresses it.
 * `apply` returns a NEW context built by spreading the live one; nothing is
 * mutated, so a sandbox cannot leak back into the twin even if a caller misuses
 * it.
 *
 * ── The one-change rule ──────────────────────────────────────────────────────
 * Every scenario changes exactly one thing. That is what makes the resulting
 * difference attributable: if a study altered both cloud cover and temperature,
 * no amount of comparison could say which one moved the grid import.
 *
 * The only entry that touches two fields is `battery-double`, which must scale
 * the envelope AND the stored energy to keep the state of charge comparable —
 * still one physical change (a larger battery), stated as such in `assumption`.
 */

import type { PredictionContext } from '../types'
import type { WhatIfScenario, WhatIfScenarioId } from './types'

// ---------------------------------------------------------------------------
// Study magnitudes — named, so a scenario's strength is never an inline literal
// ---------------------------------------------------------------------------

/** Cloud coverage that counts as "heavily overcast". */
const OVERCAST_COVERAGE = 0.9
/** How much earlier the shifted weather pattern arrives, hours. */
const WEATHER_SHIFT_HOURS = 2
/** Warming applied to every projected air temperature, °C. */
const WARMING_C = 3
/** Retained module performance after the modelled efficiency loss. */
const PV_DERATE = 0.9
/** Multiplier applied to the battery envelope. */
const BATTERY_SCALE = 2

/** Blade openness for a fully retracted / fully deployed façade. */
const FACADE_FULLY_OPEN = 1
const FACADE_FULLY_CLOSED = 0

export const WHATIF_SCENARIOS: readonly WhatIfScenario[] = [
  // ── A. Weather ───────────────────────────────────────────────────────────
  {
    id: 'overcast',
    category: 'weather',
    label: 'Heavily Overcast',
    question: 'What if the day becomes heavily overcast?',
    modification: `Cloud coverage forced to ${Math.round(OVERCAST_COVERAGE * 100)}% for the whole projection window.`,
    assumption:
      'Only cloud is forced. Temperature, humidity, rain and wind keep whatever the active timeline schedules, so the study isolates the optical effect of cloud rather than bundling a whole different day.',
    apply: (ctx) => ({
      ...ctx,
      parameters: { ...ctx.parameters, cloudOverride: OVERCAST_COVERAGE },
    }),
  },
  {
    id: 'weather-earlier',
    category: 'weather',
    label: 'Rain Arrives Earlier',
    question: `What if rainfall begins ${WEATHER_SHIFT_HOURS} hours earlier?`,
    modification: `The whole weather pattern is read ${WEATHER_SHIFT_HOURS} h later on the timeline, so every scheduled event — the rain and the cloud that brings it — arrives ${WEATHER_SHIFT_HOURS} h sooner.`,
    assumption:
      'The entire driver sample is shifted, not the rain channel alone. Shifting rain by itself would schedule rainfall under an unchanged clear sky, which is not a weather pattern any forecast could produce.',
    apply: (ctx) => ({
      ...ctx,
      parameters: { ...ctx.parameters, weatherShiftHours: WEATHER_SHIFT_HOURS },
    }),
  },

  // ── C. Building ──────────────────────────────────────────────────────────
  {
    id: 'warmer',
    category: 'building',
    label: `+${WARMING_C} °C Outdoor`,
    question: `What if outdoor temperature increases by ${WARMING_C} °C?`,
    modification: `+${WARMING_C} °C added to every projected air temperature.`,
    assumption: null,
    apply: (ctx) => ({
      ...ctx,
      parameters: { ...ctx.parameters, temperatureOffsetC: WARMING_C },
    }),
  },

  // ── D. PV ────────────────────────────────────────────────────────────────
  {
    id: 'pv-derate',
    category: 'pv',
    label: 'PV −10% Efficiency',
    question: 'What if PV efficiency decreases by 10%?',
    modification: `Module DC output multiplied by ${PV_DERATE} — applied through the derating hook the PV electrical model already exposes, so no new equation is introduced.`,
    assumption:
      'The loss is modelled as a uniform derate across all modules, which is how soiling and age-related degradation are normally represented. A localised fault would need per-module shading instead.',
    apply: (ctx) => ({
      ...ctx,
      parameters: { ...ctx.parameters, pvDerate: PV_DERATE },
    }),
  },

  // ── E. Battery ───────────────────────────────────────────────────────────
  {
    id: 'battery-double',
    category: 'battery',
    label: 'Battery ×2 Capacity',
    question: 'What if battery capacity doubles?',
    modification: `Usable capacity and the ${BATTERY_SCALE}× larger pack's power limit both scaled by ${BATTERY_SCALE}, holding the C-rate and the reserve floor at their specified values.`,
    assumption:
      'State of charge is preserved rather than stored energy, so the larger pack starts the window at the same percentage the real one is at. Scaling the power limit with capacity keeps the C-rate — a physical property of the cells — unchanged.',
    apply: (ctx) => ({
      ...ctx,
      batteryLimits: {
        ...ctx.batteryLimits,
        capacityKWh: ctx.batteryLimits.capacityKWh * BATTERY_SCALE,
        maxPowerKW: ctx.batteryLimits.maxPowerKW * BATTERY_SCALE,
      },
      // Same percentage, larger pack → proportionally more stored energy.
      battery: { ...ctx.battery, storedKWh: ctx.battery.storedKWh * BATTERY_SCALE },
    }),
  },

  // ── F. Grid ──────────────────────────────────────────────────────────────
  {
    id: 'island',
    category: 'grid',
    label: 'Grid Unavailable',
    question: 'What if grid power is unavailable?',
    modification:
      'The utility connection is removed. Demand the site cannot serve is reported as unserved load instead of import.',
    assumption:
      'The utility is the balancing component — it performs no routing of its own — so removing it changes no PV or battery dispatch decision. This study therefore reclassifies the shortfall the bus already computes rather than re-settling the bus.',
    apply: (ctx) => ({
      ...ctx,
      parameters: { ...ctx.parameters, gridAvailable: false },
    }),
  },

  // ── G/H. Façade ──────────────────────────────────────────────────────────
  {
    id: 'facade-open',
    category: 'facade',
    label: 'Façade Locked Open',
    question: 'What if the adaptive façade is locked open?',
    modification: 'Blade openness held at 100% for the whole window, overriding PBIF.',
    assumption:
      'This is a hypothesis that overrides the controller, not a prediction of what PBIF would choose. The live baseline holds the façade at its current measured mean openness.',
    apply: (ctx) => ({
      ...ctx,
      parameters: { ...ctx.parameters, facadeOpenness: FACADE_FULLY_OPEN },
    }),
  },
  {
    id: 'facade-closed',
    category: 'facade',
    label: 'Façade Locked Closed',
    question: 'What if the adaptive façade is locked closed?',
    modification: 'Blade openness held at 0% for the whole window, overriding PBIF.',
    assumption:
      'This is a hypothesis that overrides the controller, not a prediction of what PBIF would choose. The live baseline holds the façade at its current measured mean openness.',
    apply: (ctx) => ({
      ...ctx,
      parameters: { ...ctx.parameters, facadeOpenness: FACADE_FULLY_CLOSED },
    }),
  },
]

export function getWhatIfScenario(id: WhatIfScenarioId): WhatIfScenario | undefined {
  return WHATIF_SCENARIOS.find((s) => s.id === id)
}

/** The study offered first — the one that moves the most in this twin. */
export const DEFAULT_WHATIF_SCENARIO: WhatIfScenarioId = 'overcast'

/** Human labels for the category chips. */
export const CATEGORY_LABEL: Record<WhatIfScenario['category'], string> = {
  weather: 'Weather',
  building: 'Building',
  pv: 'PV',
  battery: 'Battery',
  grid: 'Grid',
  facade: 'Façade',
}

/** Re-exported so the panel can type its selector without reaching into types. */
export type { PredictionContext }
