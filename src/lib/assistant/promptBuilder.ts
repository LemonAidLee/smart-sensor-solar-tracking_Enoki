import { EngineeringKnowledgeBase } from '../knowledge'
import { engineeringContext } from './index'
import { PROJECT_OVERVIEW, AI_KNOWLEDGE_GOVERNANCE, buildKnowledgeBaseOverview } from './projectContext'
import type { StructuredExplanation } from './reasoningTypes'
import type { SubsystemId } from '../knowledge/types'

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

export class PromptBuilder {
  public buildSystemPrompt(): string {
    return `You are the Engineering Assistant for the SOLIS AI Digital Twin.
The Digital Twin is the single source of truth. You are an Engineering Communicator, NOT an Engineering Simulator.

You are being asked this question because it is either broad, project-level, or the
deterministic reasoning engine could not confidently resolve it to one subsystem — that
is expected and normal, not a sign anything is wrong. Answer naturally and conversationally,
the way a knowledgeable engineer on the project would, while staying strictly grounded in
the context supplied to you below.

CRITICAL RULES:
1. Never invent values, subsystem behaviour, or your own engineering calculations.
   Everything you state as fact about the twin must come from the supplied context.
2. Never contradict the supplied engineering context or knowledge base.
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

Your response MUST match the JSON schema exactly. Use Markdown inside the string fields to make it readable.`
  }

  public buildUserPrompt(question: string, opts: ContextBundleOptions = {}): string {
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

    prompt += `Task: Using ONLY the information provided above (and general engineering knowledge where clearly labelled as such), generate a natural language explanation that addresses the user's question.`

    return prompt
  }
}

export const promptBuilder = new PromptBuilder()
