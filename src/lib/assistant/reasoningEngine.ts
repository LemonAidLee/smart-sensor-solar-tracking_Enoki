import type { SubsystemId } from '../knowledge/types'
import { EngineeringKnowledgeBase } from '../knowledge'
import { engineeringContext } from './index'
import type { ReasoningIntent, StructuredExplanation } from './reasoningTypes'
import { buildImplementationReferences } from './implementationIndex'

export class EngineeringReasoningEngine {
  
  // --- Graph Traversal Utilities ---

  /**
   * Performs a breadth-first search upstream to find all subsystems that affect the target.
   */
  public findUpstreamCauses(id: SubsystemId): SubsystemId[] {
    const causes = new Set<SubsystemId>()
    const queue: SubsystemId[] = [id]

    while (queue.length > 0) {
      const current = queue.shift()!
      const node = EngineeringKnowledgeBase.graph.find(g => g.subsystem === current)
      if (node) {
        for (const up of node.upstreamDependencies) {
          if (!causes.has(up)) {
            causes.add(up)
            queue.push(up)
          }
        }
      }
    }
    return Array.from(causes)
  }

  /**
   * Performs a breadth-first search downstream to find all subsystems affected by the target.
   */
  public findDownstreamEffects(id: SubsystemId): SubsystemId[] {
    const effects = new Set<SubsystemId>()
    const queue: SubsystemId[] = [id]

    while (queue.length > 0) {
      const current = queue.shift()!
      const node = EngineeringKnowledgeBase.graph.find(g => g.subsystem === current)
      if (node) {
        for (const down of node.downstreamDependencies) {
          if (!effects.has(down)) {
            effects.add(down)
            queue.push(down)
          }
        }
      }
    }
    return Array.from(effects)
  }

  /**
   * Finds the shortest dependency path between a start node and an end node using BFS.
   * Returns an array of SubsystemIds representing the chain, or null if no path exists.
   */
  public findDependencyChain(start: SubsystemId, end: SubsystemId): SubsystemId[] | null {
    if (start === end) return [start]

    const queue: { current: SubsystemId, path: SubsystemId[] }[] = [{ current: start, path: [start] }]
    const visited = new Set<SubsystemId>([start])

    while (queue.length > 0) {
      const { current, path } = queue.shift()!
      const node = EngineeringKnowledgeBase.graph.find(g => g.subsystem === current)

      if (node) {
        for (const down of node.downstreamDependencies) {
          if (down === end) return [...path, down]
          if (!visited.has(down)) {
            visited.add(down)
            queue.push({ current: down, path: [...path, down] })
          }
        }
      }
    }
    return null
  }

  // --- Core Reasoning Pipeline ---

  /**
   * Generates a structured engineering explanation by fusing static knowledge 
   * and live context. Deterministic and read-only.
   */
  public generateExplanation(
    intent: ReasoningIntent, 
    primarySubsystem: SubsystemId, 
    targetSubsystem?: SubsystemId
  ): StructuredExplanation {
    const knowledge = EngineeringKnowledgeBase.getSubsystemById(primarySubsystem)
    const context = engineeringContext.getSubsystemContext(primarySubsystem)
    
    if (!knowledge) {
      throw new Error(`Reasoning failed: Missing knowledge base definitions for ${primarySubsystem}`)
    }

    if (!context) {
      return {
        observation: `${knowledge.name} context unavailable.`,
        evidence: {},
        engineeringReason: `Simulation has not yet produced a ${knowledge.name} snapshot.`,
        assumptions: [],
        limitations: [],
        conclusion: `Status: Waiting for engineering context.`,
        relatedSubsystems: []
      }
    }

    const related = new Set<SubsystemId>([primarySubsystem])
    
    let observation = ''
    let engineeringReason = ''
    let conclusion = ''
    const evidence: Record<string, string> = { ...context.evidence }

    switch (intent) {
      case 'State':
        observation = `The ${knowledge.name} subsystem is currently ${context.currentState}.`
        engineeringReason = `This state reflects the subsystem's primary purpose: ${knowledge.purpose}`
        conclusion = `The system is operating within defined parameters with confidence: ${context.confidence}.`
        knowledge.relatedSubsystems.forEach(s => related.add(s))
        break

      case 'Cause':
        const causes = this.findUpstreamCauses(primarySubsystem)
        causes.forEach(c => related.add(c))
        observation = `Observed state in ${knowledge.name} is driven by upstream inputs.`
        
        // Add upstream context evidence
        causes.forEach(causeId => {
          const cCtx = engineeringContext.getSubsystemContext(causeId)
          if (cCtx) {
            evidence[`${causeId} State`] = cCtx.currentState
          }
        })

        engineeringReason = `Upstream data flow dictates that changes in [${causes.join(', ')}] will directly affect ${knowledge.name}. Equation constraints: ${knowledge.keyEquations.join('; ')}`
        conclusion = `The current state (${context.currentState}) is an expected reaction to the upstream conditions.`
        break

      case 'Effect':
        const effects = this.findDownstreamEffects(primarySubsystem)
        effects.forEach(e => related.add(e))
        observation = `Changes in ${knowledge.name} will propagate to downstream systems.`
        
        // Add downstream context evidence
        effects.forEach(effectId => {
          const eCtx = engineeringContext.getSubsystemContext(effectId)
          if (eCtx) {
            evidence[`${effectId} State`] = eCtx.currentState
          }
        })

        engineeringReason = `Information and energy flow outward from ${knowledge.name} into [${effects.join(', ')}].`
        conclusion = `Any perturbations here will primarily impact the downstream dependencies listed above.`
        break

      case 'Relationship':
        if (!targetSubsystem) {
          throw new Error('Relationship intent requires a target subsystem.')
        }
        const path = this.findDependencyChain(primarySubsystem, targetSubsystem)
        path?.forEach(p => related.add(p))
        const targetCtx = engineeringContext.getSubsystemContext(targetSubsystem)
        
        if (targetCtx) {
          evidence[`${targetSubsystem} State`] = targetCtx.currentState
        }
        
        observation = `Analyzing relationship between ${primarySubsystem} and ${targetSubsystem}.`
        engineeringReason = path 
          ? `The dependency chain flows as follows: ${path.join(' → ')}.` 
          : `There is no direct downstream path from ${primarySubsystem} to ${targetSubsystem}.`
        conclusion = path 
          ? `They are physically or logically coupled.` 
          : `They operate independently in this direction.`
        break

      case 'Comparison':
        observation = `Evaluating consistency of ${knowledge.name} against predictions or alternative scenarios.`
        engineeringReason = `This compares the live telemetry (${context.currentState}) against the broader digital twin state.`
        conclusion = `System behaves as modelled subject to known limitations.`
        break
    }

    if (context.warnings.length > 0) {
      conclusion += ` Notable warnings: ${context.warnings.join(', ')}.`
    }

    return {
      observation,
      evidence,
      engineeringReason,
      relatedSubsystems: Array.from(related),
      assumptions: knowledge.engineeringAssumptions,
      limitations: knowledge.knownLimitations,
      conclusion,
      implementationReferences: buildImplementationReferences(Array.from(related)),
    }
  }
}

export const engineeringReasoning = new EngineeringReasoningEngine()
