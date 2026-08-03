export type SubsystemId = 
  | 'Weather'
  | 'SolarPhysics'
  | 'VirtualSensors'
  | 'EmbeddedController'
  | 'PBIF'
  | 'ServoKinematics'
  | 'AdaptiveFacade'
  | 'RooftopPV'
  | 'PVElectrical'
  | 'PVInverter'
  | 'BuildingEnergy'
  | 'Battery'
  | 'UtilityGrid'
  | 'AIPrediction'
  | 'AIWhatIf'
  | 'CyberPhysicalPipeline'

export interface FaqEntry {
  question: string
  answer: string
}

export interface SubsystemKnowledge {
  id: SubsystemId
  name: string
  purpose: string
  responsibilities: string[]
  inputs: string[]
  outputs: string[]
  howItWorks: string
  keyEquations: string[]
  engineeringAssumptions: string[]
  knownLimitations: string[]
  relatedSubsystems: SubsystemId[]
  engineeringReferences: string[]
  frequentlyAskedQuestions: FaqEntry[]
  futureExtensions: string[]
}

export interface EngineeringConcept {
  id: string
  name: string
  definition: string
  equation: string | null
  units: string | null
  practicalMeaning: string
  relatedSubsystems: SubsystemId[]
}

export interface ExplainabilityTemplate {
  observation: string
  evidence: string
  engineeringExplanation: string
  conclusion: string
}

export interface KnowledgeGraph {
  subsystem: SubsystemId
  downstreamDependencies: SubsystemId[]
  upstreamDependencies: SubsystemId[]
}
