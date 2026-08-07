/**
 * Registry for the "Implementation Documentation" layer (`docs/ai/implementation/*.md`).
 *
 * This is the single place that maps a `SubsystemId` (or one of the three
 * subsystems that exist in the code and in CLAUDE.md but are not yet
 * registered in `src/lib/knowledge` — BuildingThermal, BuildingLighting,
 * FaultDetection) to the implementation doc(s) that ground it, so
 * `promptBuilder.ts` can load ONLY the relevant doc(s) for a question instead
 * of the whole documentation layer.
 *
 * The docs themselves are hand-curated markdown files, not regenerated from
 * code — see `docs/ai/AI_IMPLEMENTATION_INDEX.md`. This module only mirrors
 * their metadata (path, source files, references) so that metadata can be
 * attached to an assistant answer's "Implementation References" deterministically,
 * in code, rather than trusting an LLM to recall it correctly.
 */

import type { SubsystemId } from '../knowledge/types'

/** The three real subsystems (per CLAUDE.md §2) that exist in the codebase
 *  but predate/postdate `SubsystemId` and are not yet registered in
 *  `src/lib/knowledge` — plus a meta id for the assistant's own architecture.
 *  Kept local to this module rather than widening `SubsystemId`, which would
 *  ripple into the knowledge base, context builder and intent registry. */
export type UnregisteredSubsystemId = 'BuildingThermal' | 'BuildingLighting' | 'FaultDetection' | 'EngineeringAssistant'

export type ImplementationDocId = SubsystemId | UnregisteredSubsystemId

export type DocSlug =
  | 'weather'
  | 'solar'
  | 'cyber_physical_pipeline'
  | 'pbif'
  | 'adaptive_facade'
  | 'building_thermal'
  | 'building_lighting'
  | 'building_energy'
  | 'energy_ledger'
  | 'pv'
  | 'battery'
  | 'grid'
  | 'prediction'
  | 'fault_detection'
  | 'engineering_assistant'

export interface ImplementationDocEntry {
  slug: DocSlug
  name: string
  /** Repo-relative path — shown to the user as the traceable source, never fetched by that path directly (see `implementationDocsLoader.ts`). */
  docPath: string
  sourceFiles: string[]
  /** SubsystemId(s) (or unregistered ids) this single doc covers — the inverse of `SUBSYSTEM_TO_DOC`. */
  covers: ImplementationDocId[]
  dependencies: ImplementationDocId[]
  engineeringReferences: string[]
  version: string
  lastUpdated: string
}

const V = '1.0.0'
const UPDATED = '2026-08-06'

export const IMPLEMENTATION_DOCS: Record<DocSlug, ImplementationDocEntry> = {
  weather: {
    slug: 'weather',
    name: 'Weather Subsystem',
    docPath: 'docs/ai/implementation/weather.md',
    sourceFiles: [
      'src/lib/engine/weather.ts',
      'src/lib/engine/weatherScenario.ts',
      'src/lib/engine/liveForecast.ts',
      'src/lib/engine/forecastProvider.ts',
      'src/lib/dt/forecastTime.ts',
    ],
    covers: ['Weather'],
    dependencies: [],
    engineeringReferences: ['Open-Meteo API Documentation'],
    version: V,
    lastUpdated: UPDATED,
  },
  solar: {
    slug: 'solar',
    name: 'Solar Physics Subsystem',
    docPath: 'docs/ai/implementation/solar.md',
    sourceFiles: ['src/lib/engine/solarPhysics.ts', 'src/lib/engine/solar.ts', 'src/lib/engine/solarPosition.ts', 'src/lib/engine/SOLAR_MODEL.md'],
    covers: ['SolarPhysics'],
    dependencies: ['Weather'],
    engineeringReferences: ['NREL Solar Position Algorithm (SPA)'],
    version: V,
    lastUpdated: UPDATED,
  },
  cyber_physical_pipeline: {
    slug: 'cyber_physical_pipeline',
    name: 'Cyber-Physical Pipeline (Sensors, Embedded Controller, Servo)',
    docPath: 'docs/ai/implementation/cyber_physical_pipeline.md',
    sourceFiles: [
      'src/lib/engine/virtualSensor.ts',
      'src/lib/embedded/sensors.ts',
      'src/lib/embedded/servo.ts',
      'src/lib/embedded/panel.ts',
      'src/lib/embedded/constants.ts',
      'src/lib/vec/simulatedController.ts',
      'src/lib/vec/actuatorLayer.ts',
      'src/lib/vec/sensorLayer.ts',
      'src/lib/vec/wokwiMqttController.ts',
    ],
    covers: ['VirtualSensors', 'EmbeddedController', 'ServoKinematics', 'CyberPhysicalPipeline'],
    dependencies: ['SolarPhysics', 'Weather', 'PBIF'],
    engineeringReferences: ['ESP32 Technical Reference Manual', 'ESP32 ADC Specifications', 'LDR GL5528 Datasheet'],
    version: V,
    lastUpdated: UPDATED,
  },
  pbif: {
    slug: 'pbif',
    name: 'Predictive Building Intelligence Framework (PBIF)',
    docPath: 'docs/ai/implementation/pbif.md',
    sourceFiles: [
      'src/lib/pbif/decisionEngine.ts',
      'src/lib/pbif/situationAssessment.ts',
      'src/lib/pbif/solarResourceAssessment.ts',
      'src/lib/pbif/thermalDemandAssessment.ts',
      'src/lib/pbif/trackingPolicy.ts',
      'src/lib/pbif/thresholds.ts',
      'src/lib/pbif/operationalObjective.ts',
    ],
    covers: ['PBIF'],
    dependencies: ['SolarPhysics', 'Weather'],
    engineeringReferences: ['ASHRAE Standard 55 (Thermal Environmental Conditions)'],
    version: V,
    lastUpdated: UPDATED,
  },
  adaptive_facade: {
    slug: 'adaptive_facade',
    name: 'Adaptive Façade (Skin) Subsystem',
    docPath: 'docs/ai/implementation/adaptive_facade.md',
    sourceFiles: ['src/lib/engine/adaptiveSkin.ts', 'src/lib/engine/facadeModule.ts', 'src/lib/engine/panelStates.ts', 'src/lib/engine/facadeControl.ts', 'src/lib/dt/bladeAngle.ts'],
    covers: ['AdaptiveFacade'],
    dependencies: ['ServoKinematics', 'SolarPhysics', 'PBIF'],
    engineeringReferences: ['LBNL WINDOW / Radiance geometrical models'],
    version: V,
    lastUpdated: UPDATED,
  },
  building_thermal: {
    slug: 'building_thermal',
    name: 'Building Thermal Response Engine',
    docPath: 'docs/ai/implementation/building_thermal.md',
    sourceFiles: ['src/lib/engine/buildingThermal.ts', 'src/lib/engine/metrics.ts'],
    covers: ['BuildingThermal'],
    dependencies: ['AdaptiveFacade', 'BuildingEnergy'],
    engineeringReferences: ['ASHRAE Fundamentals'],
    version: V,
    lastUpdated: UPDATED,
  },
  building_lighting: {
    slug: 'building_lighting',
    name: 'Building Lighting Response Engine',
    docPath: 'docs/ai/implementation/building_lighting.md',
    sourceFiles: ['src/lib/engine/buildingLighting.ts', 'src/lib/engine/metrics.ts'],
    covers: ['BuildingLighting'],
    dependencies: ['AdaptiveFacade', 'BuildingEnergy'],
    engineeringReferences: ['CIBSE Guide A', 'ASHRAE Fundamentals'],
    version: V,
    lastUpdated: UPDATED,
  },
  building_energy: {
    slug: 'building_energy',
    name: 'Building Energy Management System (BEMS)',
    docPath: 'docs/ai/implementation/building_energy.md',
    sourceFiles: ['src/lib/engine/buildingEnergy.ts', 'src/lib/engine/building.ts', 'src/lib/engine/dailyEnergyBootstrap.ts'],
    covers: ['BuildingEnergy'],
    dependencies: ['Weather', 'BuildingThermal', 'BuildingLighting'],
    engineeringReferences: ['ASHRAE 90.1 Load Profiles'],
    version: V,
    lastUpdated: UPDATED,
  },
  energy_ledger: {
    slug: 'energy_ledger',
    name: 'Energy Ledger (Centralized Accounting)',
    docPath: 'docs/ai/implementation/energy_ledger.md',
    sourceFiles: ['src/lib/engine/energyLedger.ts'],
    covers: [],
    dependencies: ['BuildingEnergy', 'Battery', 'UtilityGrid'],
    engineeringReferences: [],
    version: V,
    lastUpdated: UPDATED,
  },
  pv: {
    slug: 'pv',
    name: 'Rooftop PV, Electrical & Inverter Chain',
    docPath: 'docs/ai/implementation/pv.md',
    sourceFiles: ['src/lib/engine/pvArray.ts', 'src/lib/engine/pvElectrical.ts', 'src/lib/engine/pvInverter.ts', 'src/lib/engine/pvEquipment.ts'],
    covers: ['RooftopPV', 'PVElectrical', 'PVInverter'],
    dependencies: ['SolarPhysics', 'Weather'],
    engineeringReferences: ['LONGi LR5-72HBD 550M Datasheet', 'Huawei SUN2000-80KTL-M1 Inverter Datasheet', 'Standard Test Conditions (STC) vs NOCT'],
    version: V,
    lastUpdated: UPDATED,
  },
  battery: {
    slug: 'battery',
    name: 'Battery Energy Storage System (BESS)',
    docPath: 'docs/ai/implementation/battery.md',
    sourceFiles: ['src/lib/engine/battery.ts'],
    covers: ['Battery'],
    dependencies: ['PVInverter', 'BuildingEnergy'],
    engineeringReferences: ['Lithium-Ion Storage System Specifications'],
    version: V,
    lastUpdated: UPDATED,
  },
  grid: {
    slug: 'grid',
    name: 'Utility Grid Engine',
    docPath: 'docs/ai/implementation/grid.md',
    sourceFiles: ['src/lib/engine/grid.ts'],
    covers: ['UtilityGrid'],
    dependencies: ['Battery', 'PVInverter', 'BuildingEnergy'],
    engineeringReferences: ['IEEE 1547 Interconnection Standards'],
    version: V,
    lastUpdated: UPDATED,
  },
  prediction: {
    slug: 'prediction',
    name: 'AI Prediction & What-If Layer',
    docPath: 'docs/ai/implementation/prediction.md',
    sourceFiles: [
      'src/lib/prediction/predictionEngine.ts',
      'src/lib/prediction/projection.ts',
      'src/lib/prediction/confidence.ts',
      'src/lib/prediction/insights.ts',
      'src/lib/prediction/whatif/whatIfEngine.ts',
      'src/lib/prediction/whatif/scenarios.ts',
      'src/lib/prediction/whatif/compare.ts',
      'src/lib/prediction/whatif/recommend.ts',
    ],
    covers: ['AIPrediction', 'AIWhatIf'],
    dependencies: ['Weather', 'Battery', 'BuildingEnergy', 'RooftopPV'],
    engineeringReferences: ['Model Predictive Control (Observation Layer)'],
    version: V,
    lastUpdated: UPDATED,
  },
  fault_detection: {
    slug: 'fault_detection',
    name: 'AI Fault Detection & Diagnosis',
    docPath: 'docs/ai/implementation/fault_detection.md',
    sourceFiles: [
      'src/lib/ai/faultDetection/faultDetectionEngine.ts',
      'src/lib/ai/faultDetection/rules.ts',
      'src/lib/ai/faultDetection/diagnostics.ts',
      'src/lib/ai/faultDetection/recommendations.ts',
    ],
    covers: ['FaultDetection'],
    dependencies: [],
    engineeringReferences: [],
    version: V,
    lastUpdated: UPDATED,
  },
  engineering_assistant: {
    slug: 'engineering_assistant',
    name: 'Engineering Assistant (this AI layer)',
    docPath: 'docs/ai/implementation/engineering_assistant.md',
    sourceFiles: [
      'src/lib/assistant/geminiAssistant.ts',
      'src/lib/assistant/promptBuilder.ts',
      'src/lib/assistant/contextBuilder.ts',
      'src/lib/assistant/reasoningEngine.ts',
      'src/lib/assistant/intentRegistry.ts',
      'src/lib/assistant/assistantRouter.ts',
      'src/lib/knowledge/index.ts',
    ],
    covers: ['EngineeringAssistant'],
    dependencies: [],
    engineeringReferences: [],
    version: V,
    lastUpdated: UPDATED,
  },
}

/** The inverse of `IMPLEMENTATION_DOCS[*].covers` — resolved once at module
 *  load so lookups are O(1) rather than scanning every entry per question. */
const SUBSYSTEM_TO_DOC: Partial<Record<ImplementationDocId, DocSlug>> = Object.fromEntries(
  Object.values(IMPLEMENTATION_DOCS).flatMap((doc) => doc.covers.map((id) => [id, doc.slug] as const)),
)

/** Keyword detection for the three subsystems that exist in the codebase and
 *  CLAUDE.md but have no `SubsystemId` (so `resolveIntent` can never surface
 *  them as `primarySubsystem`), plus the assistant's own meta-doc. This is
 *  intentionally narrow — it exists ONLY to pick a documentation slug, never
 *  to drive reasoning, context or intent matching, which stay scoped to the
 *  registered `SubsystemId` union. */
const EXTRA_DOC_KEYWORDS: Record<Exclude<UnregisteredSubsystemId, never>, string[]> = {
  BuildingThermal: ['thermal', 'heat gain', 'cooling load', 'hvac electrical', 'thermal mass', 'envelope heat'],
  BuildingLighting: ['daylight harvesting', 'illuminance', 'artificial lighting', 'lux', 'lighting demand'],
  FaultDetection: ['fault', 'diagnos', 'anomaly', 'health score', 'malfunction'],
  EngineeringAssistant: ['this assistant', 'yourself', 'how do you work', 'gemini', 'prompt builder', 'engineering tutor', 'your own architecture'],
}

/**
 * Resolves the doc slug(s) a question should be grounded in, from whatever
 * the deterministic matcher already established (`primarySubsystem` /
 * `relatedSubsystems`) plus a narrow keyword scan for the three subsystems
 * with no `SubsystemId` yet. Returns at most `maxDocs` slugs, primary first.
 */
export function resolveDocSlugs(
  question: string,
  primarySubsystem: SubsystemId | null,
  relatedSubsystems: readonly SubsystemId[],
  maxDocs = 3,
): DocSlug[] {
  const slugs: DocSlug[] = []
  const push = (slug: DocSlug | undefined) => {
    if (slug && !slugs.includes(slug)) slugs.push(slug)
  }

  if (primarySubsystem) push(SUBSYSTEM_TO_DOC[primarySubsystem])
  for (const id of relatedSubsystems) push(SUBSYSTEM_TO_DOC[id])

  const q = question.toLowerCase()
  for (const [id, words] of Object.entries(EXTRA_DOC_KEYWORDS) as [UnregisteredSubsystemId, string[]][]) {
    if (words.some((w) => q.includes(w))) push(SUBSYSTEM_TO_DOC[id])
  }

  return slugs.slice(0, maxDocs)
}

/**
 * Builds the deterministic "Implementation References" list for a set of
 * subsystems — computed entirely from this registry, never from the model's
 * own output, so it can never drift from what actually exists on disk.
 */
export function buildImplementationReferences(subsystemIds: readonly ImplementationDocId[]) {
  const seen = new Set<DocSlug>()
  const refs: { subsystem: string; documentation: string; sourceFiles: string[]; engineeringReferences: string[] }[] = []
  for (const id of subsystemIds) {
    const slug = SUBSYSTEM_TO_DOC[id]
    if (!slug || seen.has(slug)) continue
    seen.add(slug)
    const doc = IMPLEMENTATION_DOCS[slug]
    refs.push({
      subsystem: doc.name,
      documentation: doc.docPath,
      sourceFiles: doc.sourceFiles,
      engineeringReferences: doc.engineeringReferences,
    })
  }
  return refs
}
