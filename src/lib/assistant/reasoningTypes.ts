import type { SubsystemId } from '../knowledge/types'

export type ReasoningIntent = 'Cause' | 'Effect' | 'State' | 'Relationship' | 'Comparison'

export interface StructuredExplanation {
  observation: string
  evidence: Record<string, string>
  engineeringReason: string
  relatedSubsystems: SubsystemId[]
  assumptions: string[]
  limitations: string[]
  conclusion: string
}
