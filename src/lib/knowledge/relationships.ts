import type { KnowledgeGraph } from './types'

/**
 * Engineering Relationships Graph
 * 
 * Maps the flow of physics, logic, and energy through the digital twin.
 * - downstreamDependencies: Subsystems that receive data or physical effects FROM this subsystem.
 * - upstreamDependencies: Subsystems that provide data or physical effects TO this subsystem.
 */
export const knowledgeGraph: KnowledgeGraph[] = [
  {
    subsystem: 'Weather',
    downstreamDependencies: ['SolarPhysics', 'VirtualSensors', 'BuildingEnergy', 'PVElectrical', 'AIPrediction', 'CyberPhysicalPipeline'],
    upstreamDependencies: []
  },
  {
    subsystem: 'SolarPhysics',
    downstreamDependencies: ['VirtualSensors', 'PBIF', 'AdaptiveFacade', 'RooftopPV'],
    upstreamDependencies: ['Weather']
  },
  {
    subsystem: 'VirtualSensors',
    downstreamDependencies: ['EmbeddedController', 'CyberPhysicalPipeline'],
    upstreamDependencies: ['Weather', 'SolarPhysics']
  },
  {
    subsystem: 'EmbeddedController',
    downstreamDependencies: ['ServoKinematics', 'CyberPhysicalPipeline'],
    upstreamDependencies: ['VirtualSensors', 'PBIF']
  },
  {
    subsystem: 'PBIF',
    downstreamDependencies: ['EmbeddedController', 'CyberPhysicalPipeline'],
    upstreamDependencies: ['SolarPhysics', 'Weather', 'BuildingEnergy']
  },
  {
    subsystem: 'ServoKinematics',
    downstreamDependencies: ['AdaptiveFacade', 'CyberPhysicalPipeline'],
    upstreamDependencies: ['EmbeddedController']
  },
  {
    subsystem: 'AdaptiveFacade',
    downstreamDependencies: ['BuildingEnergy', 'CyberPhysicalPipeline'],
    upstreamDependencies: ['ServoKinematics', 'SolarPhysics']
  },
  {
    subsystem: 'RooftopPV',
    downstreamDependencies: ['PVElectrical'],
    upstreamDependencies: ['SolarPhysics']
  },
  {
    subsystem: 'PVElectrical',
    downstreamDependencies: ['PVInverter'],
    upstreamDependencies: ['RooftopPV', 'Weather']
  },
  {
    subsystem: 'PVInverter',
    downstreamDependencies: ['Battery', 'UtilityGrid'],
    upstreamDependencies: ['PVElectrical']
  },
  {
    subsystem: 'BuildingEnergy',
    downstreamDependencies: ['Battery', 'UtilityGrid', 'PBIF'],
    upstreamDependencies: ['Weather', 'AdaptiveFacade']
  },
  {
    subsystem: 'Battery',
    downstreamDependencies: ['UtilityGrid'],
    upstreamDependencies: ['PVInverter', 'BuildingEnergy']
  },
  {
    subsystem: 'UtilityGrid',
    downstreamDependencies: [],
    upstreamDependencies: ['Battery', 'PVInverter', 'BuildingEnergy']
  },
  {
    subsystem: 'AIPrediction',
    downstreamDependencies: ['AIWhatIf'],
    upstreamDependencies: ['Weather', 'Battery', 'BuildingEnergy', 'RooftopPV']
  },
  {
    subsystem: 'AIWhatIf',
    downstreamDependencies: [],
    upstreamDependencies: ['AIPrediction', 'Battery', 'UtilityGrid', 'RooftopPV']
  },
  {
    subsystem: 'CyberPhysicalPipeline',
    downstreamDependencies: [],
    upstreamDependencies: ['Weather', 'VirtualSensors', 'EmbeddedController', 'ServoKinematics', 'AdaptiveFacade']
  }
]
