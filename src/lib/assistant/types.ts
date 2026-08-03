import type { SubsystemId } from '../knowledge/types'

export interface SubsystemContext {
  subsystem: SubsystemId
  status: string
  currentState: string
  summary: string
  evidence: Record<string, string>
  keyMetrics: Record<string, string | number>
  warnings: string[]
  dependencies: SubsystemId[]
  limitations: string[]
  confidence: string
}

export type ContextSnapshot = Record<SubsystemId, SubsystemContext>

export interface ContextBuilderAPI {
  getSubsystemContext(name: SubsystemId): SubsystemContext | undefined
  getAllContexts(): SubsystemContext[]
  getContextSummary(): string
  searchContext(keyword: string): SubsystemContext[]
}
