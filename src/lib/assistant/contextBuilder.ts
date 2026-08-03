import type { Simulation } from '../engine/simulation'
import type { SubsystemId } from '../knowledge/types'
import { EngineeringKnowledgeBase } from '../knowledge'
import type { SubsystemContext, ContextSnapshot, ContextBuilderAPI } from './types'

export class EngineeringContextBuilder implements ContextBuilderAPI {
  private lastCacheKey: string | null = null
  private cachedContexts: ContextSnapshot = {} as ContextSnapshot

  /**
   * Generates a fast, allocation-free string hash representing the parts of the twin
   * that invalidate the context. If this key is unchanged, we reuse the cached contexts
   * to guarantee O(1) performance and zero garbage collection overhead.
   */
  private generateCacheKey(sim: Simulation): string {
    const timeHours = sim.clock.timeHours.toFixed(3)
    const weather = sim.weatherScenario.getStatus().mode
    const pbif = sim.skin.getMode()
    const batt = sim.battery.getState().soc.toFixed(1)
    const sun = sim.sun.irradiance.toFixed(0)
    
    return `${timeHours}|${weather}|${pbif}|${batt}|${sun}`
  }

  public update(sim: Simulation): void {
    const key = this.generateCacheKey(sim)
    if (this.lastCacheKey === key) return

    // Rebuild all contexts
    const snap = sim.snapshot()
    const b = this.buildContext.bind(this, sim, snap)

    this.cachedContexts = {
      Weather: b('Weather', this.buildWeather),
      SolarPhysics: b('SolarPhysics', this.buildSolarPhysics),
      VirtualSensors: b('VirtualSensors', this.buildVirtualSensors),
      EmbeddedController: b('EmbeddedController', this.buildEmbeddedController),
      PBIF: b('PBIF', this.buildPBIF),
      ServoKinematics: b('ServoKinematics', this.buildServoKinematics),
      AdaptiveFacade: b('AdaptiveFacade', this.buildAdaptiveFacade),
      RooftopPV: b('RooftopPV', this.buildRooftopPV),
      PVElectrical: b('PVElectrical', this.buildPVElectrical),
      PVInverter: b('PVInverter', this.buildPVInverter),
      BuildingEnergy: b('BuildingEnergy', this.buildBuildingEnergy),
      Battery: b('Battery', this.buildBattery),
      UtilityGrid: b('UtilityGrid', this.buildUtilityGrid),
      AIPrediction: b('AIPrediction', this.buildAIPrediction),
      AIWhatIf: b('AIWhatIf', this.buildAIWhatIf),
      CyberPhysicalPipeline: b('CyberPhysicalPipeline', this.buildCyberPhysicalPipeline),
    }

    this.lastCacheKey = key
  }

  private buildContext(
    sim: Simulation,
    snap: ReturnType<Simulation['snapshot']>,
    id: SubsystemId,
    builder: (sim: Simulation, snap: ReturnType<Simulation['snapshot']>) => Partial<SubsystemContext>
  ): SubsystemContext {
    const knowledge = EngineeringKnowledgeBase.getSubsystemById(id)!
    const data = builder.call(this, sim, snap)
    
    return {
      subsystem: id,
      status: data.status || 'Unknown',
      currentState: data.currentState || 'Idle',
      summary: data.summary || '',
      evidence: data.evidence || {},
      keyMetrics: data.keyMetrics || {},
      warnings: data.warnings || [],
      dependencies: knowledge.relatedSubsystems,
      limitations: knowledge.knownLimitations,
      confidence: data.confidence || 'High'
    }
  }

  // --- Subsystem Builders ---

  private buildWeather(sim: Simulation, snap: ReturnType<Simulation['snapshot']>): Partial<SubsystemContext> {
    const w = snap.weather
    const warnings = []
    if (w.rainIntensity > 5) warnings.push('Heavy Rain')
    if (w.windSpeed > 15) warnings.push('High Wind')
    if (w.cloudCoverage > 0.8) warnings.push('Low Solar Resource')

    return {
      status: snap.weatherSource.mode,
      currentState: w.cloudCoverage > 0.5 ? 'Cloudy' : 'Clear',
      summary: `Current weather is ${w.temperature.toFixed(1)}°C with ${Math.round(w.cloudCoverage * 100)}% cloud cover.`,
      evidence: {
        'Temperature': `${w.temperature.toFixed(1)} °C`,
        'Cloud Cover': `${Math.round(w.cloudCoverage * 100)} %`,
        'Wind Speed': `${w.windSpeed.toFixed(1)} m/s`,
        'Rain': `${w.rainIntensity.toFixed(1)} mm/h`
      },
      keyMetrics: { temperature: w.temperature, cloudCoverage: w.cloudCoverage },
      warnings
    }
  }

  private buildSolarPhysics(sim: Simulation, snap: ReturnType<Simulation['snapshot']>): Partial<SubsystemContext> {
    const s = snap.sun
    const w = []
    if (!s.isDaytime) w.push('Nighttime')

    return {
      status: s.isDaytime ? 'Active' : 'Offline',
      currentState: s.isDaytime ? 'Tracking' : 'Waiting for Sunrise',
      summary: `Sun altitude is ${s.altitude.toFixed(1)}° with actual DNI at ${Math.round(s.irradiance)} W/m².`,
      evidence: {
        'Altitude': `${s.altitude.toFixed(1)}°`,
        'Azimuth': `${s.azimuth.toFixed(1)}°`,
        'DNI': `${Math.round(s.irradiance)} W/m²`,
        'Daytime': s.isDaytime ? 'Yes' : 'No'
      },
      keyMetrics: { altitude: s.altitude, dni: s.irradiance },
      warnings: w
    }
  }

  private buildVirtualSensors(sim: Simulation, snap: ReturnType<Simulation['snapshot']>): Partial<SubsystemContext> {
    const adc = sim.virtualSensor.getGlobalFilteredADC()
    return {
      status: 'Active',
      currentState: 'Sampling',
      summary: `Sensors reporting ${adc} ADC counts based on current irradiance.`,
      evidence: {
        'Global ADC': `${adc}`,
        'Global Lux': `${Math.round(sim.virtualSensor.getGlobalLux())} lx`
      },
      keyMetrics: { globalADC: adc }
    }
  }

  private buildEmbeddedController(sim: Simulation, snap: ReturnType<Simulation['snapshot']>): Partial<SubsystemContext> {
    const mode = sim.skin.getFacadeControlMode()
    return {
      status: 'Active',
      currentState: mode,
      summary: `Controller operating in ${mode} mode.`,
      evidence: {
        'Mode': mode
      },
      keyMetrics: {}
    }
  }

  private buildPBIF(sim: Simulation, snap: ReturnType<Simulation['snapshot']>): Partial<SubsystemContext> {
    const mode = sim.skin.getMode()
    const evalData = sim.skin.getPbifEvaluation()
    return {
      status: mode === 'solar-tracking' ? 'Active' : 'Bypassed',
      currentState: evalData ? evalData.decision.state : 'Unknown',
      summary: evalData ? evalData.decision.reason : `PBIF not currently controlling façade.`,
      evidence: {
        'Objective': evalData ? evalData.objective : 'N/A',
        'Policy': evalData ? evalData.policy.label : 'N/A'
      },
      keyMetrics: {}
    }
  }

  private buildServoKinematics(sim: Simulation, snap: ReturnType<Simulation['snapshot']>): Partial<SubsystemContext> {
    const target = sim.skin.getManualRotation()
    return {
      status: 'Active',
      currentState: 'Holding',
      summary: `Servos holding target positions.`,
      evidence: {
        'Target Angle': `${Math.round(target)}°`
      },
      keyMetrics: {},
      warnings: [] // "Servo Holding"
    }
  }

  private buildAdaptiveFacade(sim: Simulation, snap: ReturnType<Simulation['snapshot']>): Partial<SubsystemContext> {
    const m = snap.metrics
    return {
      status: 'Active',
      currentState: 'Deployed',
      summary: `Façade transmitting ${Math.round(m.averageDaylight)}% daylight with comfort score ${Math.round(m.averageComfort)}.`,
      evidence: {
        'Daylight Transmitted': `${Math.round(m.averageDaylight)} %`,
        'Comfort': `${Math.round(m.averageComfort)} / 100`
      },
      keyMetrics: { daylight: m.averageDaylight, comfort: m.averageComfort }
    }
  }

  private buildRooftopPV(sim: Simulation, snap: ReturnType<Simulation['snapshot']>): Partial<SubsystemContext> {
    return {
      status: snap.pvOperatingModules > 0 ? 'Active' : 'Offline',
      currentState: 'Generating',
      summary: `Array receiving ${snap.pvAverageIrradiance} W/m² POA irradiance.`,
      evidence: {
        'POA Irradiance': `${snap.pvAverageIrradiance} W/m²`,
        'Utilization': `${Math.round(snap.pvUtilization * 100)} %`
      },
      keyMetrics: { poa: snap.pvAverageIrradiance }
    }
  }

  private buildPVElectrical(sim: Simulation, snap: ReturnType<Simulation['snapshot']>): Partial<SubsystemContext> {
    return {
      status: snap.pvCurrentDCOutput > 0 ? 'Generating' : 'Idle',
      currentState: 'MPPT Active',
      summary: `Producing ${snap.pvCurrentDCOutput.toFixed(1)} kW DC from ${snap.pvOperatingModules} modules.`,
      evidence: {
        'DC Output': `${snap.pvCurrentDCOutput.toFixed(1)} kW`
      },
      keyMetrics: { dcPower: snap.pvCurrentDCOutput }
    }
  }

  private buildPVInverter(sim: Simulation, snap: ReturnType<Simulation['snapshot']>): Partial<SubsystemContext> {
    const w = []
    if (snap.invConversionLossKW > snap.invRatedCapacityKW * 0.05) w.push('PV Clipping')

    return {
      status: snap.invOperatingState,
      currentState: snap.invCurrentACOutput > 0 ? 'Inverting' : 'Standby',
      summary: `Converting DC to AC at ${Math.round(snap.invEfficiency * 100)}% efficiency. Providing ${snap.invCurrentACOutput.toFixed(1)} kW AC.`,
      evidence: {
        'AC Output': `${snap.invCurrentACOutput.toFixed(1)} kW`,
        'Efficiency': `${Math.round(snap.invEfficiency * 100)} %`,
        'Clipping Loss': `${snap.invConversionLossKW.toFixed(1)} kW`
      },
      keyMetrics: { acPower: snap.invCurrentACOutput },
      warnings: w
    }
  }

  private buildBuildingEnergy(sim: Simulation, snap: ReturnType<Simulation['snapshot']>): Partial<SubsystemContext> {
    const e = snap.energy
    const total = e.bus.buildingLoadKW
    return {
      status: 'Active',
      currentState: 'Consuming',
      summary: `Building demanding ${total.toFixed(1)} kW (intensity: ${e.loadIntensityWm2.toFixed(1)} W/m²).`,
      evidence: {
        'Total Demand': `${total.toFixed(1)} kW`,
        'Occupancy': `${Math.round(e.occupancy * 100)} %`
      },
      keyMetrics: { demand: total }
    }
  }

  private buildBattery(sim: Simulation, snap: ReturnType<Simulation['snapshot']>): Partial<SubsystemContext> {
    const b = snap.battery
    const w = []
    const soc = b.soc * 100
    if (soc < 5) w.push('Battery at Reserve')

    let state = 'Idle'
    let dispatch = 0
    if (b.dischargeKW > 0.1) {
      state = 'Discharging'
      dispatch = b.dischargeKW
    } else if (b.chargeKW > 0.1) {
      state = 'Charging'
      dispatch = b.chargeKW
    }

    return {
      status: state,
      currentState: state,
      summary: `Battery is ${state.toLowerCase()} at ${dispatch.toFixed(1)} kW. SOC is ${Math.round(soc)}%.`,
      evidence: {
        'SOC': `${Math.round(soc)} %`,
        'Charge': `${b.chargeKW.toFixed(1)} kW`,
        'Discharge': `${b.dischargeKW.toFixed(1)} kW`
      },
      keyMetrics: { soc: soc, dispatch: dispatch },
      warnings: w
    }
  }

  private buildUtilityGrid(sim: Simulation, snap: ReturnType<Simulation['snapshot']>): Partial<SubsystemContext> {
    const g = snap.grid
    const w = []
    if (g.importKW > 50) w.push('Grid Import High')

    let state = 'Balanced'
    if (g.importKW > 0.1) state = 'Importing'
    else if (g.exportKW > 0.1) state = 'Exporting'

    return {
      status: 'Online',
      currentState: state,
      summary: `Grid is ${state.toLowerCase()}. Import: ${g.importKW.toFixed(1)} kW. Export: ${g.exportKW.toFixed(1)} kW.`,
      evidence: {
        'Import': `${g.importKW.toFixed(1)} kW`,
        'Export': `${g.exportKW.toFixed(1)} kW`
      },
      keyMetrics: { import: g.importKW, export: g.exportKW },
      warnings: w
    }
  }

  private buildAIPrediction(sim: Simulation, snap: ReturnType<Simulation['snapshot']>): Partial<SubsystemContext> {
    const report = sim.getPrediction()
    const insight = report.insights.length > 0 ? report.insights[0] : null
    
    return {
      status: report.status,
      currentState: report.status,
      summary: insight ? insight.text : 'No insights generated.',
      evidence: {
        'Confidence': insight ? insight.confidence : 'N/A',
        'Horizon': `${report.horizonHours} h`
      },
      keyMetrics: { confidence: insight ? insight.confidence : 'None' },
      confidence: insight ? insight.confidence : 'Low'
    }
  }

  private buildAIWhatIf(sim: Simulation, snap: ReturnType<Simulation['snapshot']>): Partial<SubsystemContext> {
    return {
      status: 'Idle',
      currentState: 'Ready',
      summary: `Sandbox ready for counterfactual analysis.`,
      evidence: {},
      keyMetrics: {}
    }
  }

  private buildCyberPhysicalPipeline(sim: Simulation, snap: ReturnType<Simulation['snapshot']>): Partial<SubsystemContext> {
    return {
      status: 'Active',
      currentState: 'Monitoring',
      summary: `Pipeline is tracking full Environment → Sensor → Controller → Servo → Façade chain.`,
      evidence: {
        'Mode': sim.skin.getMode()
      },
      keyMetrics: {}
    }
  }

  // --- API ---

  public getSubsystemContext(name: SubsystemId): SubsystemContext | undefined {
    return this.cachedContexts[name]
  }

  public getAllContexts(): SubsystemContext[] {
    return Object.values(this.cachedContexts)
  }

  public getContextSummary(): string {
    return `Currently tracking ${Object.keys(this.cachedContexts).length} subsystems.`
  }

  public searchContext(keyword: string): SubsystemContext[] {
    const q = keyword.toLowerCase()
    return this.getAllContexts().filter(ctx => 
      ctx.summary.toLowerCase().includes(q) || 
      ctx.currentState.toLowerCase().includes(q)
    )
  }
}
