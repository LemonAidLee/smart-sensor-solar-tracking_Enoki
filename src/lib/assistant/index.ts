export * from './types'
export * from './reasoningTypes'
export * from './assistantProvider'
export { EngineeringContextBuilder } from './contextBuilder'
export { EngineeringReasoningEngine, engineeringReasoning } from './reasoningEngine'
export { DeterministicAssistant, deterministicAssistant } from './deterministicAssistant'
export { GeminiAssistantProvider, geminiAssistant } from './geminiAssistant'
export { EngineeringAssistantRouter, engineeringAssistant, DETERMINISTIC_CONFIDENCE_THRESHOLD } from './assistantRouter'
export { resolveIntent, intentRegistry } from './intentRegistry'
export type { IntentDefinition, IntentMatch } from './intentRegistry'
export { PROJECT_OVERVIEW, AI_KNOWLEDGE_GOVERNANCE, buildKnowledgeBaseOverview } from './projectContext'

/**
 * Singleton instance of the Engineering Context Builder.
 * 
 * It transforms raw simulation state into standardized, human-readable
 * engineering summaries for the AI assistant, ensuring snapshot consistency
 * and zero allocations during idle render loops.
 */
import { EngineeringContextBuilder } from './contextBuilder'

export const engineeringContext = new EngineeringContextBuilder()

