/**
 * FDD Engine — Stage 8.5.
 *
 * The AI Fault Detection & Diagnosis subsystem's single entry point: a
 * deterministic, read-only MONITOR. It consumes exactly four things —
 * {@link EngineeringKnowledgeBase} and {@link EngineeringReasoningEngine}
 * (imported as the module's own singletons, the same pattern
 * `reasoningEngine.ts` already uses), the live {@link EngineeringContextBuilder}
 * singleton, and the caller-supplied {@link SimSnapshot} — and produces
 * nothing that reaches back into the simulation.
 *
 * ── Recompute policy ─────────────────────────────────────────────────────────
 * `getReport()` is intended to be polled from the store's ~8 Hz snapshot loop,
 * exactly like the Prediction Engine, but a full twelve-subsystem pass runs
 * only when something a rule actually reads has changed. When the
 * invalidation key is unchanged the previously built report is returned by
 * reference, so React's reference equality sees no change and the panel does
 * not re-render. `Simulation.tick()` never calls into this file.
 */

import type { SimSnapshot } from '../../engine/types'
import { engineeringContext, engineeringReasoning } from '../../assistant'
import { evaluateSubsystems } from './rules'
import { aggregateOverall, buildAnomalies, buildDiagnosis, buildEvidence } from './diagnostics'
import { DETECTABLE_CONDITIONS } from './recommendations'
import type { FaultDetectionReport } from './types'

/** The model identity reported in the panel's AI Status block. */
export const FDD_MODEL = 'Engineering Fault Detection & Diagnosis Engine v1'

/**
 * Bucket size for numeric invalidation-key fields. Fine enough that a genuine
 * change a rule would react to is never missed, coarse enough that
 * floating-point noise between two otherwise-identical snapshots never forces
 * a recompute.
 */
const KEY_BUCKET = 100

function bucket(v: number): number {
  return Math.round(v * KEY_BUCKET)
}

export class FaultDetectionEngine {
  /** The last built report, returned by reference while the key is unchanged. */
  private report: FaultDetectionReport | null = null
  private key = ''
  private revision = 0

  /**
   * The current FDD report. Cached: an unchanged twin returns the identical
   * object, so polling this from the store's snapshot loop costs a key
   * comparison rather than twelve re-evaluations.
   */
  getReport(snapshot: SimSnapshot): FaultDetectionReport {
    const key = this.invalidationKey(snapshot)
    if (this.report && key === this.key) return this.report

    this.key = key
    this.report = this.build(snapshot)
    return this.report
  }

  /** Everything a rule in `rules.ts` reads, as one comparable string. Anything
   *  that would change a grade must appear here; anything that would not must
   *  not, or the report would never settle at a stable reference. */
  private invalidationKey(snap: SimSnapshot): string {
    const b = snap.battery
    const g = snap.grid
    const bus = snap.energy.bus
    const m = snap.metrics
    return [
      bucket(snap.timeHours),
      bucket(snap.weather.temperature),
      bucket(snap.weather.humidity),
      bucket(snap.weather.cloudCoverage),
      bucket(snap.weather.rainIntensity),
      bucket(snap.weather.windSpeed),
      bucket(snap.sun.altitude),
      bucket(snap.sun.irradiance),
      bucket(snap.sun.dniClearSky),
      snap.sun.isDaytime ? 1 : 0,
      bucket(snap.pvAverageIrradiance),
      bucket(snap.pvCurrentDCOutput),
      bucket(snap.pvInstalledCapacity),
      bucket(snap.pvUtilization),
      bucket(snap.invCurrentACOutput),
      bucket(snap.invCurrentDCOutput),
      bucket(snap.invEfficiency),
      bucket(bus.pvGenerationKW),
      bucket(bus.buildingLoadKW),
      bucket(bus.batteryChargeKW),
      bucket(bus.batteryDischargeKW),
      bucket(g.importKW),
      bucket(g.exportKW),
      bucket(b.soc),
      bucket(b.chargeKW),
      bucket(b.dischargeKW),
      bucket(snap.energy.loadIntensityWm2),
      bucket(snap.energy.occupancy),
      m.totalPanels,
      m.faultPanels,
      m.movingPanels,
      bucket(m.averagePanelAngle),
      bucket(m.averageOpenness),
      bucket(m.averageDaylight),
      bucket(m.averageComfort),
      snap.skinMode,
    ].join('|')
  }

  private build(snap: SimSnapshot): FaultDetectionReport {
    this.revision++

    const subsystems = evaluateSubsystems(engineeringContext, snap)
    const { score, status } = aggregateOverall(subsystems)

    return {
      revision: this.revision,
      model: FDD_MODEL,
      generatedAtHours: snap.timeHours,
      overallHealthScore: score,
      overallStatus: status,
      diagnosis: buildDiagnosis(status, subsystems),
      subsystems,
      evidence: buildEvidence(subsystems),
      anomalies: buildAnomalies(subsystems, engineeringReasoning),
      detectableConditions: [...DETECTABLE_CONDITIONS],
    }
  }
}
