import { EngineeringKnowledgeBase } from '../knowledge'
import { engineeringContext } from './index'
import { PROJECT_OVERVIEW, AI_KNOWLEDGE_GOVERNANCE, buildKnowledgeBaseOverview } from './projectContext'
import type { StructuredExplanation } from './reasoningTypes'
import type { SubsystemId } from '../knowledge/types'
import { resolveDocSlugs, IMPLEMENTATION_DOCS } from './implementationIndex'
import { loadImplementationDocs } from './implementationDocsLoader'

/**
 * What the deterministic matcher was able to establish before Gemini was
 * invoked — anywhere from "nothing" (a genuinely open-ended question) to a
 * full `StructuredExplanation` (a matched-but-low-confidence question, where
 * Gemini is escalated to for its natural-language judgement, not because the
 * deterministic reasoning chain itself was unavailable).
 */
export interface ContextBundleOptions {
  primarySubsystem?: SubsystemId | null
  relatedSubsystems?: readonly SubsystemId[]
  explanation?: StructuredExplanation | null
}

/** The 11-step teaching order every engineering answer must follow (see
 *  `docs/ai/AI_IMPLEMENTATION_INDEX.md`). Kept as one exported constant so
 *  the system prompt is the only place this order is spelled out. */
const ANSWER_STRUCTURE = `1. High-level concept
2. Why the subsystem exists
3. How THIS Digital Twin implements it
4. Step-by-step calculation pipeline
5. Engineering equations
6. Constants used
7. Current live values (if applicable)
8. Engineering assumptions
9. Limitations
10. Related subsystems
11. Summary`

export class PromptBuilder {
  public buildSystemPrompt(): string {
    return `You are the Engineering Assistant for the SOLIS AI Digital Twin — an Engineering Tutor, not a generic chatbot.
The Digital Twin is the single source of truth. You are an Engineering Communicator, NOT an Engineering Simulator.

You teach THIS project's actual implementation with the depth of an experienced engineering lecturer:
theory AND how this specific codebase realizes it — never generic engineering knowledge alone when
implementation-specific grounding was supplied to you.

GROUNDING PRIORITY (highest to lowest — never invert this order):
1. Implementation Documentation (the "--- IMPLEMENTATION DOCUMENTATION ---" section below, when present) —
   this is the authoritative, code-traceable description of how the named subsystem(s) actually work:
   equations, constants, pipeline steps, assumptions and limitations, all sourced from real code.
2. Engineering Knowledge Base (the subsystem overview / deep-dive sections below) — the project's curated
   "textbook", broader but shallower than the implementation docs.
3. General engineering knowledge — usable ONLY to fill a genuine gap the above two don't cover, and MUST be
   clearly labelled as general knowledge, never presented as this project's own behaviour.
If the Implementation Documentation and the Knowledge Base ever appear to disagree, the Implementation
Documentation wins — it is generated closer to the real source code.

ANSWER STRUCTURE — for any question that asks about how a subsystem works, why it behaves a certain way, or
what it computes, structure your "observation" + "engineeringReason" + "conclusion" fields (in that order,
flowing into each other as one continuous explanation) to walk through exactly these eleven steps, in order,
skipping only the ones that genuinely do not apply to the question asked:
${ANSWER_STRUCTURE}
For a narrow status/definition question you may compress steps 1-3 into one sentence and spend the rest of
the answer on steps 4-7 — never pad an answer with irrelevant steps just to hit all eleven.

CRITICAL RULES:
1. Never invent values, subsystem behaviour, equations, or your own engineering calculations.
   Everything you state as fact about the twin must come from the supplied context.
2. Never contradict the supplied Implementation Documentation, Engineering Context or Knowledge Base.
3. Distinguish clearly between what the twin IMPLEMENTS today and what is listed as
   future/roadmap work. Never describe roadmap items as already working.
4. If information is genuinely unavailable in what was supplied, say so plainly rather
   than guessing — and prefer general engineering knowledge, clearly labelled as such,
   over silence when it would help.
5. State your assumptions explicitly whenever you have to make one to answer.
6. Do NOT try to determine PBIF decisions, battery dispatch, or physics results yourself;
   those are calculated by the deterministic twin and handed to you as context.
7. Only set "clarification" when the question is GENUINELY ambiguous — e.g. it names no
   subsystem, topic or concept this project could plausibly involve, and you cannot infer
   one from the conversation history either. A broad or project-level question ("summarise
   today's simulation", "how does this whole system work") is NOT ambiguous — answer it
   using the Project Overview and Knowledge Base below. When you DO set "clarification",
   leave "observation", "engineeringReason" and "conclusion" as short empty strings.
8. If the project deliberately simplifies a model (e.g. equilibrium thermal lag instead of
   hour-by-hour integration, a fixed COP, no forward occlusion ray-cast), explain that
   simplification honestly — never invent a more sophisticated model than what is implemented.
9. Do NOT write your own "Implementation References" section — it is appended automatically
   from the supplied Implementation Documentation metadata after you respond. Just answer the question.

Your response MUST match the JSON schema exactly. Use Markdown inside the string fields to make it readable.`
  }

  /**
   * Async because loading the Implementation Documentation for the relevant
   * subsystem(s) is a network fetch (see `implementationDocsLoader.ts`) —
   * the docs live in `docs/ai/implementation/`, outside the client bundle.
   * A failed or empty load never blocks the prompt: the model still gets the
   * Knowledge Base and Engineering Context sections either way.
   */
  public async buildUserPrompt(question: string, opts: ContextBundleOptions = {}): Promise<string> {
    const { primarySubsystem = null, relatedSubsystems = [], explanation = null } = opts

    let prompt = `User Question: "${question}"\n\n`

    prompt += `--- PROJECT OVERVIEW ---\n${PROJECT_OVERVIEW}\n\n`
    prompt += `--- AI KNOWLEDGE GOVERNANCE ---\n${AI_KNOWLEDGE_GOVERNANCE}\n\n`
    prompt += `--- ENGINEERING KNOWLEDGE BASE (ALL SUBSYSTEMS, OVERVIEW) ---\n${buildKnowledgeBaseOverview()}\n\n`

    const focusIds = new Set<SubsystemId>()
    if (primarySubsystem) focusIds.add(primarySubsystem)
    for (const id of relatedSubsystems) focusIds.add(id)

    if (focusIds.size > 0) {
      prompt += `--- RELEVANT SUBSYSTEM KNOWLEDGE (DEEP DIVE) ---\n`
      for (const id of focusIds) {
        const k = EngineeringKnowledgeBase.getSubsystemById(id)
        if (k) {
          prompt += `Subsystem: ${k.name}\nPurpose: ${k.purpose}\nHow it works: ${k.howItWorks}\nKey equations: ${k.keyEquations.join('; ') || 'none'}\nKnown limitations: ${k.knownLimitations.join('; ')}\nFuture extensions (NOT implemented): ${k.futureExtensions.join('; ')}\n\n`
        }
      }
    }

    // Identify subsystem(s) → load ONLY their implementation doc(s). Never
    // the whole documentation layer — see `implementationIndex.ts`'s
    // `resolveDocSlugs` for exactly what counts as "relevant" here.
    const docSlugs = resolveDocSlugs(question, primarySubsystem, relatedSubsystems)
    if (docSlugs.length > 0) {
      const docs = await loadImplementationDocs(docSlugs)
      if (docs.length > 0) {
        prompt += `--- IMPLEMENTATION DOCUMENTATION (SUBSYSTEM-SPECIFIC, AUTHORITATIVE) ---\n`
        prompt += `The following are curated, code-traceable engineering documents for exactly the subsystem(s) this question touches. Prefer these over the shallower Knowledge Base above whenever they overlap.\n\n`
        for (const { slug, content } of docs) {
          prompt += `### Source: ${IMPLEMENTATION_DOCS[slug].docPath}\n${content}\n\n`
        }
      }
    }

    prompt += `--- ENGINEERING CONTEXT (LIVE) ---\n`
    // A confident-enough match narrows this to what is actually relevant; an
    // open-ended question gets the whole twin's live state so Gemini can judge
    // for itself which part the question is really about.
    const contexts =
      focusIds.size > 0
        ? Array.from(focusIds)
            .map((id) => engineeringContext.getSubsystemContext(id))
            .filter((c): c is NonNullable<typeof c> => !!c)
        : engineeringContext.getAllContexts()
    for (const c of contexts) {
      prompt += `Subsystem: ${c.subsystem}\nStatus: ${c.status}\nState: ${c.currentState}\nSummary: ${c.summary}\n\n`
    }

    prompt += `--- ENGINEERING REASONING (DETERMINISTIC) ---\n`
    if (explanation) {
      prompt += `Observation: ${explanation.observation}\n`
      prompt += `Engineering Reason: ${explanation.engineeringReason}\n`
      prompt += `Evidence: ${JSON.stringify(explanation.evidence)}\n`
      prompt += `Assumptions: ${explanation.assumptions.join(', ')}\n`
      prompt += `Limitations: ${explanation.limitations.join(', ')}\n`
      prompt += `Conclusion: ${explanation.conclusion}\n\n`
    } else {
      prompt += `No deterministic reasoning chain was available for this question — reason from the Project Overview, Engineering Knowledge Base and Engineering Context above instead.\n\n`
    }

    prompt += `Task: Using ONLY the information provided above (and general engineering knowledge where clearly labelled as such, and only when nothing above covers it), generate a natural language explanation that addresses the user's question, following the eleven-step teaching order from your system instructions where it applies.`

    return prompt
  }
}

export const promptBuilder = new PromptBuilder()
