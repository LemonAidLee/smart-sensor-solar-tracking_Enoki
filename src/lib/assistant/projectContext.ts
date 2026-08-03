/**
 * Static project grounding for the AI Assistant's escalation path.
 *
 * `DeterministicAssistant` never needs this — it only ever reasons over a
 * single matched subsystem. `GeminiAssistantProvider` needs it precisely
 * because it is invoked for broader or lower-confidence questions, where the
 * matched subsystem (if any) is not enough context on its own.
 *
 * `PROJECT_OVERVIEW` and `AI_KNOWLEDGE_GOVERNANCE` are short, hand-written
 * summaries of `CLAUDE.md` and `AI_KNOWLEDGE.md` — those files are not
 * bundled into the client, so a summary is kept here instead of duplicated
 * per-call. `buildKnowledgeBaseOverview()` is deliberately NOT hand-written:
 * it is generated from `EngineeringKnowledgeBase.subsystems`, the single
 * source of truth for subsystem purposes, so the two can never drift apart.
 */

import { EngineeringKnowledgeBase } from '../knowledge'

/** Mirrors CLAUDE.md §1–3, §6–7 — what the twin is, how it flows, and its
 *  engineering rules. Kept prose-short; subsystem particulars come from the
 *  Knowledge Base overview instead of being duplicated here. */
export const PROJECT_OVERVIEW = `SOLIS AI is a comprehensive digital twin for an adaptive façade. It integrates
an embedded ESP32 simulation running a Cyber-Physical Pipeline, alongside a
Rooftop PV System and a Building Energy Management System (BEMS), to evaluate
and optimize physical interactions with environmental data.

Simulation flow (each stage feeds the next, in this order): Environment
(Weather / Forecast) → Solar Physics → Virtual Sensors → PBIF (façade
optimizer) → Servo → Adaptive Façade → PV Array → PV Inverter → Building
Energy → Battery → Utility Grid.

Engineering rules the twin is built to: single source of truth, one
responsibility per engine, simulation separated from visualization, no
duplicated calculations, no magic numbers, geometry-agnostic architecture,
physics drives UI (never the reverse).

Case study building: 5-storey commercial office, 25 × 40 m footprint, 19 m
tall, adaptive façade with 1,620 panels, 189 PV modules (LONGi LR5-72HBD
550M), Huawei SUN2000-80KTL-M1 inverter, 39.56 kWh battery.

IMPLEMENTED (you may state these as fact when the live context supports it):
adaptive façade kinematics, solar physics + occlusion, PBIF façade
optimization, virtual sensors, rooftop PV + inverter, battery storage,
utility grid balancing, the Weather Scenario Engine, real-time Open-Meteo
forecasting, an AI Prediction Layer (12 h projection), an AI What-If sandbox,
and an AI Fault Detection & Diagnosis monitor.

NOT YET IMPLEMENTED — treat as future work, never as present behaviour:
energy cost / financial analytics (so cost or payback questions are
"not modelled yet"), and direct coupling between the façade's solar thermal
gain and the BEMS's HVAC electrical demand (today they are computed
independently, so a façade change can show a thermal effect with zero
electrical effect — that is correct, not a bug).`

/** Mirrors AI_KNOWLEDGE.md's purpose and governance rules — mainly so the
 *  assistant can answer meta-questions about the project's own documentation
 *  honestly (e.g. "where is this decided?") without inventing a source. */
export const AI_KNOWLEDGE_GOVERNANCE = `The project keeps its engineering knowledge in layers: CLAUDE.md (architecture
and rules), the Engineering Knowledge Base (src/lib/knowledge — the static
"textbook" of subsystem definitions, equations, assumptions and limitations),
a live Engineering Context (current simulation state), and an Engineering
Reasoning layer (deterministic cause/effect/relationship traversal over the
Knowledge Base's dependency graph). walkthrough.md is a historical
implementation log only — never treat it as the current architecture.`

/**
 * A one-line-per-subsystem index of the whole Knowledge Base, generated from
 * `EngineeringKnowledgeBase.subsystems` so it can never fall out of sync with
 * the actual data. Gives the model enough breadth to judge which subsystem(s)
 * a broad or ambiguous question is really about, even when the deterministic
 * matcher found nothing.
 */
export function buildKnowledgeBaseOverview(): string {
  return EngineeringKnowledgeBase.subsystems
    .map((s) => `- ${s.name} (${s.id}): ${s.purpose}`)
    .join('\n')
}
