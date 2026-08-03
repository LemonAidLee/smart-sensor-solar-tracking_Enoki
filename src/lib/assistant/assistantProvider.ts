import type { SubsystemId } from '../knowledge/types'
import type { ReasoningIntent, StructuredExplanation } from './reasoningTypes'

export interface AssistantQuery {
  text: string
}

export interface AssistantResponse {
  question: string
  intent: ReasoningIntent | null
  primarySubsystem: SubsystemId | null
  targetSubsystem?: SubsystemId | null
  explanation: StructuredExplanation | null
  provider: string
  /**
   * 0–1 confidence the routing layer had in the matched subsystem/intent
   * BEFORE dispatching — not a grade of the answer itself. Absent when no
   * intent-matching was attempted (e.g. a raw deterministic-only caller).
   */
  confidence?: number
  error?: string
}

export interface AssistantProvider {
  ask(query: AssistantQuery): Promise<AssistantResponse>
}
