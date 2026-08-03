/**
 * FDD recommendations + capability catalogue — Stage 8.5.
 *
 * `recommendationFor` turns a graded {@link SubsystemHealth} into the plain
 * operator instruction the panel and each {@link Anomaly} show — never more
 * alarming than the grade earns, and always "No action required" for a
 * genuinely healthy subsystem.
 *
 * {@link DETECTABLE_CONDITIONS} is the opposite of a live check: it is a
 * static, hand-authored catalogue of conditions this engine is ARCHITECTED to
 * catch (Stage 8.5 §5/§6) but has not observed. It is never generated from a
 * live value, so it can never be mistaken for — or accidentally promoted
 * into — a real anomaly. New detection rules extend `rules.ts`; entries here
 * only ever describe future capability.
 */

import type { DetectableCondition, SubsystemHealth } from './types'

export function recommendationFor(subsystem: SubsystemHealth): string {
  if (subsystem.status === 'Healthy') return 'No action required.'
  if (subsystem.status === 'Warning') {
    return `Monitor ${subsystem.label} — ${subsystem.reason}`
  }
  return `Investigate ${subsystem.label} immediately — an engineering consistency check has failed: ${subsystem.reason}`
}

export const DETECTABLE_CONDITIONS: readonly DetectableCondition[] = [
  {
    id: 'sensor-failure',
    subsystem: 'VirtualSensors',
    label: 'Sensor failure',
    description: "An LDR or ADC channel stops responding to changing light — the reading stays fixed regardless of irradiance.",
  },
  {
    id: 'ldr-sensor-disagreement',
    subsystem: 'VirtualSensors',
    label: 'LDR sensor disagreement',
    description: 'The four presented LDR quadrants diverge beyond what the two underlying upper/lower channels should allow.',
  },
  {
    id: 'pv-underperformance',
    subsystem: 'RooftopPV',
    label: 'PV underperformance / degradation',
    description: "DC yield falls persistently below the irradiance-scaled expectation — soiling, shading or module degradation.",
  },
  {
    id: 'inverter-clipping',
    subsystem: 'PVInverter',
    label: 'Inverter clipping',
    description: "DC input sustained above the inverter's rated AC capacity, so excess power is clipped rather than converted.",
  },
  {
    id: 'battery-not-charging',
    subsystem: 'Battery',
    label: 'Battery not charging',
    description: 'PV surplus is available and the battery is below capacity, yet charge power stays at zero.',
  },
  {
    id: 'battery-abnormality',
    subsystem: 'Battery',
    label: 'Battery abnormality',
    description: 'State of charge drifts in a way inconsistent with the reported charge/discharge power over time.',
  },
  {
    id: 'servo-tracking-failure',
    subsystem: 'ServoKinematics',
    label: 'Servo tracking failure',
    description: "A blade's commanded and actual rotation diverge and never converge within the servo's rated slew rate.",
  },
  {
    id: 'communication-loss',
    subsystem: 'EmbeddedController',
    label: 'Communication loss',
    description: "The embedded controller stops acknowledging PBIF's target angle within the expected control-loop interval.",
  },
  {
    id: 'grid-outage',
    subsystem: 'UtilityGrid',
    label: 'Grid outage',
    description: 'The utility connection stops responding despite the bus requiring an import.',
  },
  {
    id: 'hvac-energy-anomaly',
    subsystem: 'BuildingEnergy',
    label: 'HVAC energy anomaly',
    description: 'Building load diverges from the occupancy/temperature model beyond the intensity tolerance.',
  },
  {
    id: 'over-temperature',
    subsystem: 'AdaptiveFacade',
    label: 'Over-temperature',
    description: "Façade surface or inverter temperature exceeds its rated operating envelope.",
  },
] as const
