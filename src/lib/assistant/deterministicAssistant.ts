import type { AssistantProvider, AssistantQuery, AssistantResponse } from './assistantProvider'
import { engineeringReasoning } from './reasoningEngine'
import { resolveIntent } from './intentRegistry'

/** Below this score the matcher itself is not confident there IS a subsystem
 *  here to reason about — this is a floor for "attempt at all", separate from
 *  (and lower than) the router's 0.90 deterministic-routing threshold. */
const MINIMUM_MATCH_SCORE = 50

export class DeterministicAssistant implements AssistantProvider {
  private readonly providerName = 'Deterministic Engine'

  public async ask(query: AssistantQuery): Promise<AssistantResponse> {
    const text = query.text
    const match = resolveIntent(text)
    const confidence = (match?.score ?? 0) / 100

    if (!match || match.score < MINIMUM_MATCH_SCORE) {
      return {
        question: query.text,
        intent: null,
        primarySubsystem: null,
        explanation: null,
        provider: this.providerName,
        confidence,
        error: "I couldn't confidently map your question to a specific engineering flow. Could you clarify what subsystem or relationship you'd like to analyze?",
      }
    }

    const { primarySubsystem, intent, targetSubsystem } = match.def

    try {
      const explanation = engineeringReasoning.generateExplanation(intent, primarySubsystem, targetSubsystem)
      return {
        question: query.text,
        intent,
        primarySubsystem,
        targetSubsystem,
        explanation,
        provider: this.providerName,
        confidence,
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error'
      return {
        question: query.text,
        intent,
        primarySubsystem,
        targetSubsystem,
        explanation: null,
        provider: this.providerName,
        confidence,
        error: msg || 'Failed to generate deterministic reasoning.',
      }
    }
  }
}

export const deterministicAssistant = new DeterministicAssistant()
