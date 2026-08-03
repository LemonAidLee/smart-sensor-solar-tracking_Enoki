import { subsystems } from './subsystems'
import { engineeringConcepts } from './concepts'
import type { SubsystemKnowledge, EngineeringConcept, FaqEntry, SubsystemId } from './types'

/**
 * Searches across all subsystems for a specific keyword in their name, purpose, or howItWorks.
 */
export function searchSubsystems(keyword: string): SubsystemKnowledge[] {
  const query = keyword.toLowerCase()
  return subsystems.filter(
    (sub) =>
      sub.name.toLowerCase().includes(query) ||
      sub.purpose.toLowerCase().includes(query) ||
      sub.howItWorks.toLowerCase().includes(query)
  )
}

/**
 * Searches across all concepts for a specific keyword in their name or definition.
 */
export function searchConcepts(keyword: string): EngineeringConcept[] {
  const query = keyword.toLowerCase()
  return engineeringConcepts.filter(
    (concept) =>
      concept.name.toLowerCase().includes(query) ||
      concept.definition.toLowerCase().includes(query)
  )
}

/**
 * Searches all FAQs across all subsystems for a specific keyword in the question or answer.
 * Returns a unified list of matches annotated with their parent subsystem.
 */
export function searchFaqs(keyword: string): { subsystemId: SubsystemId; entry: FaqEntry }[] {
  const query = keyword.toLowerCase()
  const results: { subsystemId: SubsystemId; entry: FaqEntry }[] = []

  for (const sub of subsystems) {
    for (const faq of sub.frequentlyAskedQuestions) {
      if (
        faq.question.toLowerCase().includes(query) ||
        faq.answer.toLowerCase().includes(query)
      ) {
        results.push({ subsystemId: sub.id, entry: faq })
      }
    }
  }

  return results
}

/**
 * Retrieves a specific subsystem exactly by its ID.
 */
export function getSubsystemById(id: SubsystemId): SubsystemKnowledge | undefined {
  return subsystems.find((sub) => sub.id === id)
}

/**
 * Retrieves a specific concept exactly by its ID.
 */
export function getConceptById(id: string): EngineeringConcept | undefined {
  return engineeringConcepts.find((concept) => concept.id === id)
}
