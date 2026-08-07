import type { SubsystemId } from '../knowledge/types'

export type ReasoningIntent = 'Cause' | 'Effect' | 'State' | 'Relationship' | 'Comparison'

/** Traceability footer for a technical answer — computed deterministically
 *  from `implementationIndex.ts`, never from the model's own output, so it
 *  can never name a doc or source file that doesn't actually exist. */
export interface ImplementationReference {
  subsystem: string
  documentation: string
  sourceFiles: string[]
  engineeringReferences: string[]
}

export interface StructuredExplanation {
  observation: string
  evidence: Record<string, string>
  engineeringReason: string
  relatedSubsystems: SubsystemId[]
  assumptions: string[]
  limitations: string[]
  conclusion: string
  /** Absent when no implementation doc maps to any of `relatedSubsystems` yet. */
  implementationReferences?: ImplementationReference[]
}
