import type { EngineeringConcept } from './types'

export const engineeringConcepts: EngineeringConcept[] = [
  {
    id: 'effective-irradiance',
    name: 'Effective Irradiance',
    definition: 'The actual solar power per square meter reaching a specific surface, accounting for both the incident angle of the sun and atmospheric attenuation (e.g., cloud cover).',
    equation: 'Irradiance_effective = DNI_actual * cos(θ_incident) + Diffuse',
    units: 'W/m²',
    practicalMeaning: 'This determines exactly how much raw solar energy hits a façade blade or a PV panel. If the surface is pointed directly at the sun, it captures the maximum possible direct irradiance.',
    relatedSubsystems: ['SolarPhysics', 'RooftopPV', 'AdaptiveFacade']
  },
  {
    id: 'incident-angle',
    name: 'Incident Angle',
    definition: 'The angle between the sun\'s incoming direct rays and the normal (perpendicular) vector of a surface.',
    equation: 'cos(θ) = Vector_sun · Vector_normal',
    units: 'Degrees',
    practicalMeaning: 'An incident angle of 0° means the sun is hitting the surface perfectly dead-on (maximum energy). 90° means the sun is parallel to the surface (zero direct energy).',
    relatedSubsystems: ['SolarPhysics', 'RooftopPV', 'AdaptiveFacade']
  },
  {
    id: 'cosine-projection',
    name: 'Cosine Projection',
    definition: 'The mathematical reduction of perceived surface area when a surface is tilted away from the light source. The captured energy scales with the cosine of the incident angle.',
    equation: 'Energy_captured = Energy_total * cos(θ_incident)',
    units: null,
    practicalMeaning: 'This is the fundamental reason why solar panels must track the sun to maximize output, and why louvres can successfully block sunlight by simply rotating.',
    relatedSubsystems: ['SolarPhysics', 'RooftopPV', 'AdaptiveFacade']
  },
  {
    id: 'lux',
    name: 'Lux',
    definition: 'A unit of illuminance measuring the luminous flux per unit area. It represents the amount of visible light hitting a surface, weighted by the human eye\'s spectral sensitivity.',
    equation: 'Lux = Lumens / m²',
    units: 'lx',
    practicalMeaning: 'In the twin, Lux is used to evaluate the daylighting performance of the interior. Maintaining a target Lux level on work surfaces without causing glare is a primary objective of the PBIF.',
    relatedSubsystems: ['VirtualSensors', 'PBIF']
  },
  {
    id: 'adc',
    name: 'Analog-to-Digital Converter (ADC)',
    definition: 'An electronic component that converts a continuous physical voltage into a discrete digital number that a microcontroller can process.',
    equation: 'Digital_Value = floor((Voltage_in / Voltage_reference) * (2^Resolution - 1))',
    units: 'Counts (0-4095)',
    practicalMeaning: 'In the embedded simulation, light and rain sensors produce physical voltages. The ESP32\'s 12-bit ADC converts these into numbers (0-4095) so the firmware can make logical decisions.',
    relatedSubsystems: ['VirtualSensors', 'EmbeddedController']
  },
  {
    id: 'voltage-divider',
    name: 'Voltage Divider',
    definition: 'A simple linear circuit that produces an output voltage which is a fraction of its input voltage, typically constructed using two resistors in series.',
    equation: 'V_out = V_in * (R2 / (R1 + R2))',
    units: 'Volts (V)',
    practicalMeaning: 'Light Dependent Resistors (LDRs) change resistance based on light. Placed in a voltage divider, this varying resistance creates a varying voltage that the ADC can safely read.',
    relatedSubsystems: ['VirtualSensors']
  },
  {
    id: 'servo-pwm',
    name: 'Pulse Width Modulation (PWM) for Servos',
    definition: 'A digital signaling technique where the width (duration) of a high-voltage pulse determines the target physical angle of a servo motor.',
    equation: 'Angle ∝ Pulse_Width (Typically 1ms to 2ms)',
    units: 'Microseconds (µs) or Duty Cycle (%)',
    practicalMeaning: 'This is the raw machine language sent by the Embedded Controller. A 1.5ms pulse usually commands the servo to the center (90°). Changing the pulse width physically moves the façade blade.',
    relatedSubsystems: ['EmbeddedController', 'ServoKinematics']
  },
  {
    id: 'pv-efficiency',
    name: 'PV Efficiency & Thermal Derating',
    definition: 'The percentage of solar irradiance hitting a solar panel that is successfully converted into DC electricity, which degrades as the panel heats up.',
    equation: 'Efficiency = Nominal_Efficiency * (1 - Temp_Coeff * (T_cell - 25°C))',
    units: '%',
    practicalMeaning: 'Solar panels perform worse in extreme heat. On a very hot, sunny afternoon, a panel will produce less power than on a cool, sunny morning with the identical amount of sunlight.',
    relatedSubsystems: ['PVElectrical', 'SolarPhysics']
  },
  {
    id: 'battery-soc',
    name: 'State of Charge (SOC)',
    definition: 'The equivalent of a fuel gauge for the battery system, representing the current stored energy as a percentage of its maximum total capacity.',
    equation: 'SOC = (Current_Energy_kWh / Total_Capacity_kWh) * 100',
    units: '%',
    practicalMeaning: 'A SOC of 100% means the battery is full and cannot absorb excess PV power (resulting in Grid Export). A SOC of 0% means it is empty and cannot support building loads (resulting in Grid Import).',
    relatedSubsystems: ['Battery']
  },
  {
    id: 'grid-import',
    name: 'Grid Import / Export',
    definition: 'The flow of electrical power from the public utility grid into the local microgrid (Import), or from the microgrid out to the public utility (Export).',
    equation: 'Grid_Power = Building_Demand - PV_Generation - Battery_Discharge',
    units: 'kW',
    practicalMeaning: 'Grid Import represents energy the building must purchase. Grid Export represents excess clean energy the building can sell back. The ultimate goal of the system is to minimize Import through intelligent storage and demand reduction.',
    relatedSubsystems: ['UtilityGrid', 'BuildingEnergy', 'PVElectrical', 'Battery']
  }
]
