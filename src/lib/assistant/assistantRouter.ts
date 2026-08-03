/**
 * Engineering Assistant Router — confidence-based dispatch between the
 * Deterministic Assistant and the Gemini Assistant.
 *
 * ── Why a router exists ───────────────────────────────────────────────────────
 * Before this, the panel called `GeminiAssistantProvider` directly, and THAT
 * provider re-implemented its own low-confidence handling by falling back to
 * `DeterministicAssistant` — which meant a question the deterministic matcher
 * couldn't confidently resolve always ended in "please specify a subsystem",
 * even though Gemini (with the full project context) could very often have
 * just answered it. This router inverts that: deterministic is the fast path
 * for what it is actually good at, and everything else escalates UP to
 * Gemini rather than failing DOWN to a clarification prompt.
 *
 * ── Routing ───────────────────────────────────────────────────────────────────
 *   confidence ≥ DETERMINISTIC_CONFIDENCE_THRESHOLD → Deterministic Assistant
 *   confidence <  DETERMINISTIC_CONFIDENCE_THRESHOLD → Gemini Assistant
 *
 * Even a confident match escalates if the deterministic engine still couldn't
 * produce a complete explanation (requirement #2) — a confident INTENT match
 * is not a guarantee the reasoning graph could resolve it.
 *
 * The user is asked to specify a subsystem ONLY when Gemini itself sets
 * `clarification` in its response (see `geminiAssistant.ts`) — never as an
 * automatic consequence of low deterministic confidence, and never from this
 * router directly.
 */

import type { AssistantProvider, AssistantQuery, AssistantResponse } from './assistantProvider'
import { deterministicAssistant } from './deterministicAssistant'
import { geminiAssistant } from './geminiAssistant'
import { resolveIntent } from './intentRegistry'

/** Confidence at/above which the deterministic fast path is trusted outright. */
export const DETERMINISTIC_CONFIDENCE_THRESHOLD = 0.9

export class EngineeringAssistantRouter implements AssistantProvider {
  public async ask(query: AssistantQuery): Promise<AssistantResponse> {
    const match = resolveIntent(query.text)
    const confidence = (match?.score ?? 0) / 100

    if (confidence >= DETERMINISTIC_CONFIDENCE_THRESHOLD) {
      const result = await deterministicAssistant.ask(query)
      // A confident intent match with a complete explanation and no internal
      // error is exactly the "fast, deterministic response" case (req. #1) —
      // return it as-is. Anything less complete escalates to Gemini instead
      // of surfacing the deterministic engine's internal error to the user.
      if (result.explanation && !result.error) {
        return result
      }
    }

    return geminiAssistant.ask(query)
  }
}

export const engineeringAssistant = new EngineeringAssistantRouter()
