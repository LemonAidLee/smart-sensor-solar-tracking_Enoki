export * from './types'
export { subsystems } from './subsystems'
export { engineeringConcepts } from './concepts'
export { knowledgeGraph } from './relationships'
export { 
  searchSubsystems, 
  searchConcepts, 
  searchFaqs, 
  getSubsystemById, 
  getConceptById 
} from './search'

/**
 * The unified Engineering Knowledge Base.
 * 
 * This object serves as the single "textbook" for the Digital Twin. It provides 
 * a completely static, read-only representation of the system's architecture, 
 * physical concepts, and dependency graph.
 * 
 * Future AI agents will consult this object to ground their explanations in 
 * factual engineering reality without ever touching or interfering with the 
 * live simulation loop.
 */
import { subsystems } from './subsystems'
import { engineeringConcepts } from './concepts'
import { knowledgeGraph } from './relationships'
import { searchSubsystems, searchConcepts, searchFaqs, getSubsystemById, getConceptById } from './search'

export const EngineeringKnowledgeBase = {
  // Static Definitions
  subsystems,
  concepts: engineeringConcepts,
  graph: knowledgeGraph,
  
  // Search Utilities
  searchSubsystems,
  searchConcepts,
  searchFaqs,
  
  // Exact Lookups
  getSubsystemById,
  getConceptById
}
