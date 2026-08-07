/**
 * Comparison algorithm — Stage 8.2.
 *
 * Reduces two 12-hour projection walks to a set of side-by-side engineering
 * metrics. It computes nothing physical: every number here is an aggregation of
 * values `projection.ts` already produced through the engines' own physics.
 *
 * ── Why aggregation matters ──────────────────────────────────────────────────
 * Comparing two instantaneous values at +12 h would be nearly meaningless — it
 * would miss a storm that passed at +4 h entirely. Each metric is therefore
 * reduced the way an engineer would actually judge it:
 *
 *   • energy quantities  → **total** over the window (kWh)
 *   • capacity-limited   → **peak** over the window (kW)
 *   • state of charge    → **final** value, the autonomy left at the end
 *   • daylight           → **mean across daylight hours only**, because
 *                          averaging in twelve zeros overnight would report a
 *                          well-lit building as dark
 *
 * The walk steps exactly one hour, so a total in kWh is the plain sum of the kW
 * samples — no integration constant, no interpolation.
 *
 * ── Judgement is stated, not inferred ────────────────────────────────────────
 * `goodDirection` is declared per metric. Building demand and irradiance are
 * deliberately `null`: they are inputs to the design, not scores, and colouring
 * a hotter day "worse" would be editorialising rather than reporting.
 */

import type { TwinProjection } from '../types'
import { PROJECTION_STEP_HOURS } from '../projection'
import type { MetricAggregation, MetricComparison, MetricDirection, MetricJudgement } from './types'

/**
 * Below this the two walks are treated as identical. Chosen so that ordinary
 * floating-point noise never renders as a change the operator must explain.
 */
const NEGLIGIBLE = 0.05

/** Percent change below which a real difference still reads as "unchanged". */
const NEGLIGIBLE_PERCENT = 0.5

interface MetricSpec {
  id: string
  label: string
  unit: string
  aggregation: MetricAggregation
  basis: string
  /** The quantity to read from each projected hour. */
  pick: (p: TwinProjection) => number
  /** Which way is an improvement, or null when the metric is not a goal. */
  goodDirection: 'higher' | 'lower' | null
  /**
   * Metrics that only matter under a particular study — an unserved-load row is
   * noise while the grid is connected. Omitted when this returns false for BOTH
   * walks.
   */
  relevant?: (baseline: readonly TwinProjection[], sandbox: readonly TwinProjection[]) => boolean
}

const anyNonZero = (walk: readonly TwinProjection[], pick: (p: TwinProjection) => number) =>
  walk.some((p) => pick(p) > NEGLIGIBLE)

/**
 * The metrics Stage 8.2 compares, in the order the panel presents them.
 *
 * Note the two distinct cooling quantities. `coolingLoadKW` is the BEMS's
 * **electrical** HVAC demand, which responds to outdoor dry-bulb, occupancy AND
 * (Stage 7.9) the façade's solar-induced cooling load, already converted to
 * electrical kW by `BuildingThermalEngine`'s cooling-plant COP.
 * `facadeSolarGainKW` is the **thermal** load the skin admits to the glazing —
 * `coolingLoadKW`'s solar share is DERIVED from it, one step upstream, so the
 * two still read as different rows here (different units, different point in
 * the chain) even though they are no longer independent: closing the façade in
 * a study now moves both, and moving `coolingLoadKW` alone would double-count
 * the thermal chain rather than report it.
 */
const METRICS: readonly MetricSpec[] = [
  {
    id: 'pv',
    label: 'PV Generation',
    unit: 'kWh',
    aggregation: 'total',
    basis: '12 h total AC',
    pick: (p) => p.pvAcKW,
    goodDirection: 'higher',
  },
  {
    id: 'battery-soc',
    label: 'Battery SoC',
    unit: '%',
    aggregation: 'final',
    basis: 'at end of window',
    pick: (p) => p.batterySoc * 100,
    goodDirection: 'higher',
  },
  {
    id: 'battery-discharge',
    label: 'Battery Discharge',
    unit: 'kWh',
    aggregation: 'total',
    basis: '12 h total delivered',
    pick: (p) => p.batteryDischargeKW,
    goodDirection: null,
  },
  {
    id: 'grid-import',
    label: 'Grid Import',
    unit: 'kWh',
    aggregation: 'total',
    basis: '12 h total',
    pick: (p) => p.gridImportKW,
    goodDirection: 'lower',
  },
  {
    id: 'unserved',
    label: 'Unserved Load',
    unit: 'kWh',
    aggregation: 'total',
    basis: '12 h total',
    pick: (p) => p.unservedLoadKW,
    goodDirection: 'lower',
    relevant: (b, s) => anyNonZero(b, (p) => p.unservedLoadKW) || anyNonZero(s, (p) => p.unservedLoadKW),
  },
  {
    id: 'load',
    label: 'Building Load',
    unit: 'kWh',
    aggregation: 'total',
    basis: '12 h total demand',
    pick: (p) => p.buildingLoadKW,
    goodDirection: null,
  },
  {
    id: 'cooling',
    label: 'Cooling Demand',
    unit: 'kW',
    aggregation: 'peak',
    basis: 'peak HVAC electrical',
    pick: (p) => p.coolingLoadKW,
    goodDirection: 'lower',
  },
  {
    id: 'facade-gain',
    label: 'Façade Solar Gain',
    unit: 'kW',
    aggregation: 'peak',
    basis: 'peak thermal at glazing',
    pick: (p) => p.facadeSolarGainKW,
    goodDirection: 'lower',
  },
  {
    id: 'daylight',
    label: 'Daylight Availability',
    unit: '%',
    aggregation: 'daytimeMean',
    basis: 'mean over daylight hours',
    pick: (p) => p.facadeDaylight,
    goodDirection: null,
  },
  {
    id: 'irradiance',
    label: 'Solar Irradiance',
    unit: 'kWh/m²',
    aggregation: 'total',
    basis: '12 h total horizontal',
    // W/m² summed over 1 h steps → Wh/m²; reported in kWh/m².
    pick: (p) => p.ghi / 1000,
    goodDirection: null,
  },
]

function aggregate(
  walk: readonly TwinProjection[],
  spec: MetricSpec,
): number {
  if (walk.length === 0) return 0
  switch (spec.aggregation) {
    case 'total':
      // The step is exactly one hour, so kW summed IS kWh.
      return walk.reduce((sum, p) => sum + spec.pick(p), 0) * PROJECTION_STEP_HOURS
    case 'peak':
      return walk.reduce((max, p) => Math.max(max, spec.pick(p)), 0)
    case 'final':
      return spec.pick(walk[walk.length - 1])
    case 'daytimeMean': {
      const day = walk.filter((p) => p.isDaytime)
      if (day.length === 0) return 0
      return day.reduce((sum, p) => sum + spec.pick(p), 0) / day.length
    }
  }
}

function judge(
  direction: MetricDirection,
  goodDirection: MetricSpec['goodDirection'],
): MetricJudgement {
  if (direction === 'unchanged' || goodDirection === null) return 'neutral'
  return direction === goodDirection ? 'better' : 'worse'
}

/**
 * Reduce both walks to the comparison table.
 *
 * A metric whose two walks agree is still listed — "unchanged" is frequently the
 * most important finding a study can return, and hiding it would let the panel
 * imply an effect the physics did not produce.
 */
export function compareWalks(
  baseline: readonly TwinProjection[],
  sandbox: readonly TwinProjection[],
): MetricComparison[] {
  const out: MetricComparison[] = []

  for (const spec of METRICS) {
    if (spec.relevant && !spec.relevant(baseline, sandbox)) continue

    const b = aggregate(baseline, spec)
    const s = aggregate(sandbox, spec)
    const delta = s - b

    const deltaPercent = Math.abs(b) > NEGLIGIBLE ? (delta / b) * 100 : null
    const negligible =
      Math.abs(delta) <= NEGLIGIBLE ||
      (deltaPercent !== null && Math.abs(deltaPercent) < NEGLIGIBLE_PERCENT)
    const direction: MetricDirection = negligible ? 'unchanged' : delta > 0 ? 'higher' : 'lower'

    out.push({
      id: spec.id,
      label: spec.label,
      unit: spec.unit,
      aggregation: spec.aggregation,
      basis: spec.basis,
      baseline: b,
      sandbox: s,
      delta,
      deltaPercent,
      direction,
      judgement: judge(direction, spec.goodDirection),
      unavailable: null,
    })
  }

  // ── Energy cost ──────────────────────────────────────────────────────────
  // The spec asks for it "if available". It is NOT available: the grid engine
  // pins `tariffPeriod` and `carbonIntensity` to null until the Financial
  // Analytics stage, so there is no tariff to price the imported energy with.
  // The row is listed with its reason rather than dropped, so the gap is visible
  // instead of looking like a metric nobody thought to compare — and certainly
  // rather than inventing a number.
  out.push({
    id: 'cost',
    label: 'Predicted Energy Cost',
    unit: '',
    aggregation: 'total',
    basis: 'requires a tariff',
    baseline: 0,
    sandbox: 0,
    delta: 0,
    deltaPercent: null,
    direction: 'unchanged',
    judgement: 'neutral',
    unavailable:
      'No tariff is modelled yet — the grid connection pins its time-of-use period to null until the Financial Analytics stage, so imported energy cannot be priced without inventing a rate.',
  })

  return out
}

/** Find one comparison by id — used by the recommendation generator. */
export function findMetric(comparisons: readonly MetricComparison[], id: string): MetricComparison | undefined {
  return comparisons.find((c) => c.id === id)
}

/** True when nothing in the study moved — the "no effect" finding. */
export function isUnchanged(comparisons: readonly MetricComparison[]): boolean {
  return comparisons.every((c) => c.direction === 'unchanged' || c.unavailable !== null)
}
