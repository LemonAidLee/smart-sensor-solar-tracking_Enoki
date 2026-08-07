/**
 * Recommendation generation — Stage 8.2.
 *
 * Turns a comparison table into an engineering conclusion, as the four-part
 * chain the spec requires:
 *
 *   Observation → Evidence → Reason → Expected Impact
 *
 * ── Never fabricate a benefit ────────────────────────────────────────────────
 * Every sentence is built from the comparison it is describing. Where a study
 * produces no change, the recommendation says so plainly and explains *why the
 * twin's physics produced no change* — that is a real engineering finding, and
 * far more useful than a manufactured upside.
 *
 * Two of these studies land squarely on a modelling boundary, and both report it
 * in `limitation` rather than papering over it:
 *
 *   • The façade studies (Stage 7.9) move the **thermal** load at the glazing,
 *     which `BuildingThermalEngine` now carries through the envelope and the
 *     cooling plant's COP into the BEMS's **electrical** HVAC demand — so a
 *     locked façade correctly shows a large thermal change AND a proportional
 *     electrical one. What remains an assumption, not a live simulation, is the
 *     projection reading that chain at equilibrium and through a fixed COP.
 *   • The islanding study changes no dispatch, because the utility is the
 *     balancing component and performs no routing the battery reacts to.
 *
 * Reporting those honestly is the point of the stage. Inventing a coupling to
 * make the numbers look richer would make every other number untrustworthy.
 */

import type { MetricComparison, WhatIfRecommendation, WhatIfScenario } from './types'
import type { TwinProjection } from '../types'
import { findMetric } from './compare'

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

const kwh = (v: number) => `${v.toFixed(1)} kWh`
const kw = (v: number) => `${v.toFixed(1)} kW`
const pct = (v: number) => `${v.toFixed(0)}%`

/** "18% lower" / "3.2 kWh higher" / "unchanged" — reads after "is". */
function movement(m: MetricComparison | undefined): string {
  if (!m) return 'unchanged'
  if (m.direction === 'unchanged') return 'unchanged'
  return `${magnitude(m)} ${m.direction === 'higher' ? 'higher' : 'lower'}`
}

/**
 * "18%" / "3.2 kWh" — the size of the change with no direction word, so it reads
 * after a verb that already carries the direction ("cuts … by 18%"). Keeping the
 * two forms apart is what stops sentences like "reduces import by 18% lower".
 */
function magnitude(m: MetricComparison | undefined): string {
  if (!m || m.direction === 'unchanged') return 'nothing'
  if (m.deltaPercent !== null) return `${Math.abs(m.deltaPercent).toFixed(0)}%`
  return `${Math.abs(m.delta).toFixed(1)} ${m.unit}`
}

/** "142.0 → 116.4 kWh" */
function pair(m: MetricComparison | undefined): string {
  if (!m) return '—'
  const digits = m.unit === '%' ? 0 : 1
  return `${m.baseline.toFixed(digits)} → ${m.sandbox.toFixed(digits)}${m.unit ? ` ${m.unit}` : ''}`
}

const moved = (m: MetricComparison | undefined): boolean => !!m && m.direction !== 'unchanged'

// ---------------------------------------------------------------------------
// Per-scenario conclusions
// ---------------------------------------------------------------------------

interface Inputs {
  scenario: WhatIfScenario
  comparisons: MetricComparison[]
  baseline: readonly TwinProjection[]
  sandbox: readonly TwinProjection[]
}

/** Hours the battery spent actively delivering power. */
function dischargingHours(walk: readonly TwinProjection[]): number {
  return walk.filter((p) => p.batteryDischargeKW > 0.1).length
}

function recommendOvercast({ comparisons }: Inputs): WhatIfRecommendation {
  const pv = findMetric(comparisons, 'pv')
  const grid = findMetric(comparisons, 'grid-import')
  const irr = findMetric(comparisons, 'irradiance')
  const gain = findMetric(comparisons, 'facade-gain')

  return {
    headline: moved(pv)
      ? `Heavy overcast cuts PV generation by ${magnitude(pv)} and pushes grid import up by ${magnitude(grid)}.`
      : 'Heavy overcast changes little — the window is already dominated by hours with no sun.',
    observation: `PV generation is ${movement(pv)} and grid import ${movement(grid)}.`,
    evidence: `Horizontal irradiance ${pair(irr)}; PV ${pair(pv)}; grid import ${pair(grid)}; façade solar gain ${pair(gain)}.`,
    reason:
      'Cloud attenuates global horizontal irradiance through the ASHRAE cloud modification factor. The PV array is linear in plane-of-array irradiance, so generation tracks it directly, and every kilowatt the array no longer produces has to come from the grid instead.',
    impact: moved(grid)
      ? `The site imports ${kwh(Math.abs(grid!.delta))} more across the window, and the façade admits ${kw(Math.abs(gain?.delta ?? 0))} less peak solar heat.`
      : 'No material change to imported energy across this window.',
    limitation: null,
  }
}

function recommendWeatherEarlier({ comparisons, baseline, sandbox }: Inputs): WhatIfRecommendation {
  const pv = findMetric(comparisons, 'pv')
  const grid = findMetric(comparisons, 'grid-import')

  const peakRain = (w: readonly TwinProjection[]) =>
    w.reduce((best, p) => (p.rainIntensity > best.rainIntensity ? p : best), w[0])
  const b = baseline.length ? peakRain(baseline) : null
  const s = sandbox.length ? peakRain(sandbox) : null

  return {
    headline: moved(pv)
      ? `Bringing the weather forward moves PV generation ${movement(pv)} across the window.`
      : 'Bringing the weather forward does not change total generation — the pattern shifts into hours of comparable sun.',
    observation: `Peak rainfall moves from ${b?.clockLabel ?? '—'} to ${s?.clockLabel ?? '—'}; PV generation is ${movement(pv)}.`,
    evidence: `PV ${pair(pv)}; grid import ${pair(grid)}. Rain intensity peaks at ${pct((b?.rainIntensity ?? 0) * 100)} (baseline) and ${pct((s?.rainIntensity ?? 0) * 100)} (shifted).`,
    reason:
      'The timeline is sampled at a shifted hour, so the same weather meets a different sun altitude. Whether that helps or hurts depends entirely on whether the cloud now coincides with the high-irradiance middle of the day or with hours that were already dim.',
    impact: moved(grid)
      ? `Grid import over the window changes by ${kwh(Math.abs(grid!.delta))}.`
      : 'Imported energy over the window is materially unchanged.',
    limitation: null,
  }
}

function recommendWarmer({ comparisons }: Inputs): WhatIfRecommendation {
  const cooling = findMetric(comparisons, 'cooling')
  const load = findMetric(comparisons, 'load')
  const grid = findMetric(comparisons, 'grid-import')
  const pv = findMetric(comparisons, 'pv')

  return {
    headline: moved(cooling)
      ? `A 3 °C warmer day raises peak cooling demand by ${magnitude(cooling)} and grid import by ${magnitude(grid)}.`
      : 'A 3 °C warmer day does not move cooling demand — the plant is already at the modelled limit of its response.',
    observation: `Peak cooling demand is ${movement(cooling)} and total building demand ${movement(load)}.`,
    evidence: `Cooling ${pair(cooling)}; building load ${pair(load)}; grid import ${pair(grid)}; PV ${pair(pv)}.`,
    reason:
      'HVAC demand follows the degree-hour response between the 24 °C balance point and the 34 °C design condition. Warming pushes the plant up that curve, while PV generation is unaffected because the array is modelled as linear in irradiance with no temperature derate.',
    impact: moved(grid)
      ? `The extra demand is met entirely from the grid: ${kwh(Math.abs(grid!.delta))} more imported across the window.`
      : 'No material change to imported energy.',
    limitation:
      'The PV model carries no temperature coefficient, so this study does not capture the real efficiency loss a hotter array would suffer. The true impact would be slightly worse than shown.',
  }
}

function recommendPvDerate({ comparisons }: Inputs): WhatIfRecommendation {
  const pv = findMetric(comparisons, 'pv')
  const grid = findMetric(comparisons, 'grid-import')
  const soc = findMetric(comparisons, 'battery-soc')

  return {
    headline: moved(pv)
      ? `A 10% efficiency loss costs ${kwh(Math.abs(pv!.delta))} of generation and adds ${kwh(Math.abs(grid?.delta ?? 0))} of grid import.`
      : 'A 10% efficiency loss has no measurable effect across this window — the array is producing little or nothing in it.',
    observation: `PV generation is ${movement(pv)}; grid import is ${movement(grid)}.`,
    evidence: `PV ${pair(pv)}; grid import ${pair(grid)}; final battery SoC ${pair(soc)}.`,
    reason:
      'The derate scales module DC output linearly, so lost generation passes straight through the inverter to the bus. Because this building’s demand exceeds PV output for essentially the whole window, every lost kilowatt is replaced one-for-one by import rather than by reduced battery charging.',
    impact: moved(grid)
      ? `Imported energy rises by ${kwh(Math.abs(grid!.delta))} over 12 h — the direct cost of soiling or degradation at this level.`
      : 'No material change to imported energy across this window.',
    limitation: null,
  }
}

function recommendBatteryDouble({ comparisons, baseline, sandbox }: Inputs): WhatIfRecommendation {
  const grid = findMetric(comparisons, 'grid-import')
  const discharge = findMetric(comparisons, 'battery-discharge')
  const soc = findMetric(comparisons, 'battery-soc')
  const pv = findMetric(comparisons, 'pv')

  const bHours = dischargingHours(baseline)
  const sHours = dischargingHours(sandbox)
  const extraHours = sHours - bHours
  const chargesAtAll = sandbox.some((p) => p.batteryChargeKW > 0.1)

  // WHERE the extra energy is delivered is read off the walk, never assumed. A
  // pack that empties before noon has not improved evening autonomy, however
  // intuitive that story is — so the sentence names the hours the data shows.
  const gained = sandbox
    .filter((p, i) => p.batteryDischargeKW - (baseline[i]?.batteryDischargeKW ?? 0) > 0.1)
    .map((p) => p.clockLabel)
  const window =
    gained.length === 0
      ? null
      : gained.length === 1
        ? `at ${gained[0]}`
        : `between ${gained[0]} and ${gained[gained.length - 1]}`
  const afterDark = sandbox.some(
    (p, i) => !p.isDaytime && p.batteryDischargeKW - (baseline[i]?.batteryDischargeKW ?? 0) > 0.1,
  )

  return {
    headline: moved(grid)
      ? `Doubling battery capacity reduces grid import by ${magnitude(grid)}${chargesAtAll ? '' : ', but does not raise daytime self-consumption because the array never produces a surplus to store'}.`
      : 'Doubling battery capacity does not reduce grid import over this window — there is no stored energy left to deliver.',
    observation: `Grid import is ${movement(grid)}; the battery delivers ${movement(discharge)}${extraHours > 0 ? ` and discharges for ${extraHours} additional hour${extraHours === 1 ? '' : 's'}` : ' over the same number of hours'}.`,
    evidence: `Grid import ${pair(grid)}; battery discharge ${pair(discharge)} across ${bHours} h → ${sHours} h; final SoC ${pair(soc)}; PV generation ${pair(pv)} (unchanged, as expected).`,
    reason:
      'A larger pack holds proportionally more energy above the same reserve floor, and its power limit scales with capacity at the specified C-rate. Whether that buys extra hours or simply a bigger single dump depends on how the deficit compares with the power limit.',
    impact: moved(grid)
      ? `${kwh(Math.abs(grid!.delta))} less imported across the window${window ? `, delivered ${window}` : ''}${window && !afterDark ? ' — not after sunset, because the pack reaches its reserve floor before then' : ''}.`
      : 'No reduction in imported energy — the extra capacity has nothing to draw on.',
    limitation: chargesAtAll
      ? null
      : 'The larger battery never charges in this window: building demand exceeds PV output at every projected hour, so no surplus is ever offered to storage. Its only benefit here is discharging energy it already held — a bigger pack cannot help a site that never generates a surplus to fill it.',
  }
}

function recommendIsland({ comparisons, sandbox }: Inputs): WhatIfRecommendation {
  const unserved = findMetric(comparisons, 'unserved')
  const discharge = findMetric(comparisons, 'battery-discharge')
  const load = findMetric(comparisons, 'load')
  const pv = findMetric(comparisons, 'pv')

  const unservedHours = sandbox.filter((p) => p.unservedLoadKW > 0.1).length
  const worst = sandbox.reduce((max, p) => Math.max(max, p.unservedLoadKW), 0)
  const unservedKWh = unserved?.sandbox ?? 0
  // Coverage by its actual definition: the share of demand the site DID serve.
  const totalLoad = load?.sandbox ?? 0
  const covered = totalLoad > 0 ? ((totalLoad - unservedKWh) / totalLoad) * 100 : 0

  return {
    headline: `Islanding the site leaves ${kwh(unservedKWh)} of demand unserved across ${unservedHours} of ${sandbox.length} projected hours.`,
    observation: `Grid import is reclassified as unserved load; PV generation and battery dispatch are unchanged.`,
    evidence: `Unserved load ${kwh(unservedKWh)} over ${unservedHours} h, peaking at ${kw(worst)}, against ${kwh(totalLoad)} of demand. Battery discharge ${pair(discharge)} and PV ${pair(pv)} — both identical to the connected case.`,
    reason:
      'The utility is the balancing component: it performs no routing of its own, and the battery already dispatches to cover the full deficit within its limits regardless of whether a grid exists. Removing the connection therefore changes no decision — it only removes the supply that was absorbing the shortfall.',
    impact: `On-site generation and storage cover ${pct(covered)} of the window's demand. The site cannot run islanded at this load without substantially more generation and storage.`,
    limitation:
      'The twin models no load shedding or critical-circuit prioritisation, so the shortfall is reported in full rather than as the reduced demand an islanded building would actually be run at.',
  }
}

function recommendFacade({ scenario, comparisons }: Inputs): WhatIfRecommendation {
  const open = scenario.id === 'facade-open'
  const gain = findMetric(comparisons, 'facade-gain')
  const daylight = findMetric(comparisons, 'daylight')
  const cooling = findMetric(comparisons, 'cooling')

  return {
    headline: open
      ? `Locking the façade open raises peak solar heat gain by ${magnitude(gain)}, daylight availability by ${magnitude(daylight)} and peak HVAC electrical demand by ${magnitude(cooling)}.`
      : `Locking the façade closed cuts peak solar heat gain by ${magnitude(gain)} and peak HVAC electrical demand by ${magnitude(cooling)}, at the cost of daylight availability falling by ${magnitude(daylight)}.`,
    observation: `Façade solar gain is ${movement(gain)}, daylight availability ${movement(daylight)} and HVAC electrical demand ${movement(cooling)}.`,
    evidence: `Peak façade solar gain ${pair(gain)} (thermal); daylight ${pair(daylight)}; peak HVAC electrical demand ${pair(cooling)}.`,
    reason: open
      ? 'Fully retracted blades admit the incident beam at the glazing’s full solar heat-gain coefficient, so the thermal load and the useful daylight both scale directly with openness. `BuildingThermalEngine` (Stage 7.9) carries that thermal load through the envelope and the cooling plant’s COP into electrical HVAC demand, so the electrical figure moves with it.'
      : 'Fully deployed blades admit nothing at the glazing, so the solar component of the façade load falls to zero — and so does the daylight that openness was providing, and the electrical cooling load `BuildingThermalEngine` derives from it.',
    impact: open
      ? `${kw(Math.abs(gain?.delta ?? 0))} more peak thermal load reaching the glazing, ${kw(Math.abs(cooling?.delta ?? 0))} more peak HVAC electrical demand, with daylight availability at ${pct(daylight?.sandbox ?? 0)} across daylight hours.`
      : `${kw(Math.abs(gain?.delta ?? 0))} less peak thermal load at the glazing and ${kw(Math.abs(cooling?.delta ?? 0))} less peak HVAC electrical demand, with daylight availability falling to ${pct(daylight?.sandbox ?? 0)} — deep-plan spaces would need artificial lighting.`,
    limitation:
      'The projection evaluates the façade’s thermal mass at equilibrium rather than integrating its ~20-minute lag hour by hour (negligible over this horizon — see `equilibriumThermalState`), and converts thermal to electrical cooling load through a fixed assumed plant COP. Both are documented assumptions, not fabricated precision, and neither changes the direction of the result above.',
  }
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

const GENERATORS: Record<WhatIfScenario['id'], (i: Inputs) => WhatIfRecommendation> = {
  overcast: recommendOvercast,
  'weather-earlier': recommendWeatherEarlier,
  warmer: recommendWarmer,
  'pv-derate': recommendPvDerate,
  'battery-double': recommendBatteryDouble,
  island: recommendIsland,
  'facade-open': recommendFacade,
  'facade-closed': recommendFacade,
}

/**
 * The engineering conclusion for one completed study.
 *
 * Each generator is written for its own scenario because a useful conclusion
 * names the specific mechanism — a generic "metric X moved by Y%" template would
 * satisfy the format while explaining nothing.
 */
export function recommend(
  scenario: WhatIfScenario,
  comparisons: MetricComparison[],
  baseline: readonly TwinProjection[],
  sandbox: readonly TwinProjection[],
): WhatIfRecommendation {
  return GENERATORS[scenario.id]({ scenario, comparisons, baseline, sandbox })
}
