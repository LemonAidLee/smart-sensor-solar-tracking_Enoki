import { PVElectricalEngine } from './pvElectrical'

export type InverterState = 'Offline' | 'Standby' | 'Producing' | 'Clipping' | 'Fault'

/** Nameplate AC capacity of the Huawei SUN2000-80KTL-M1, kW. */
export const INVERTER_RATED_CAPACITY_KW = 80
/** Nominal conversion efficiency before clipping, 0–1. */
export const INVERTER_BASE_EFFICIENCY = 0.98
/** DC input below which the inverter is not producing at all, kW. */
export const INVERTER_OFFLINE_KW = 0.01
/** DC input below which the inverter idles rather than converts, kW (50 W). */
export const INVERTER_STANDBY_KW = 0.05

/** The result of one DC → AC conversion. */
export interface InverterConversion {
  acKW: number
  lossKW: number
  /** Effective efficiency, RATIO 0-1 (matches `getMetrics().currentEfficiency`). */
  efficiency: number
  state: InverterState
}

/**
 * Convert DC input to AC output — the single authority for the power-electronics
 * model, including the standby threshold and rated-capacity clipping.
 *
 * Pure, so the Prediction Engine can project future AC output through exactly the
 * same conversion the live inverter performs rather than approximating it.
 */
export function convertDcToAc(
  dcInputKW: number,
  ratedCapacityKW: number = INVERTER_RATED_CAPACITY_KW,
  baseEfficiency: number = INVERTER_BASE_EFFICIENCY,
): InverterConversion {
  // Offline / Standby threshold
  if (dcInputKW <= INVERTER_STANDBY_KW) {
    return {
      acKW: 0,
      // DC energy lost as heat during standby
      lossKW: dcInputKW,
      efficiency: 0,
      state: dcInputKW > INVERTER_OFFLINE_KW ? 'Standby' : 'Offline',
    }
  }

  // Step 1: theoretical maximum AC output at the current efficiency
  // (Future: hook in partial load and temperature derating here)
  const theoreticalACPower = dcInputKW * baseEfficiency

  // Step 2: inverter clipping (limiting)
  if (theoreticalACPower > ratedCapacityKW) {
    // Total loss is the difference between raw DC input and final clipped AC
    // output; effective efficiency drops because DC power is thrown away.
    return {
      acKW: ratedCapacityKW,
      lossKW: dcInputKW - ratedCapacityKW,
      efficiency: ratedCapacityKW / dcInputKW,
      state: 'Clipping',
    }
  }

  return {
    acKW: theoreticalACPower,
    // Standard conversion loss (e.g. the 2% lost as heat)
    lossKW: dcInputKW - theoreticalACPower,
    efficiency: baseEfficiency,
    state: 'Producing',
  }
}

/**
 * Stage 7.3: PV Inverter Engine
 * 
 * Converts DC Array output to AC output using a realistic inverter model.
 * Enforces rated capacity clipping and tracks conversion losses.
 * 
 * Prepares the architecture for future battery/grid integration via AC output.
 */
export class PVInverterEngine {
  private ratedCapacityKW: number
  private baseEfficiency: number

  private currentDCPowerKW = 0
  private currentACPowerKW = 0
  private conversionLossKW = 0
  private currentEfficiency = 0
  private operatingState: InverterState = 'Offline'

  constructor(
    ratedCapacityKW = INVERTER_RATED_CAPACITY_KW,
    baseEfficiency = INVERTER_BASE_EFFICIENCY,
  ) {
    this.ratedCapacityKW = ratedCapacityKW
    this.baseEfficiency = baseEfficiency
  }

  /** Nominal conversion efficiency, 0–1 — read by the Prediction Engine. */
  public getBaseEfficiency(): number {
    return this.baseEfficiency
  }

  /**
   * Advances the simulation step, taking the latest DC metrics
   * from the electrical engine and converting to AC.
   */
  public update(electrical: PVElectricalEngine) {
    const dcInputKW = electrical.getArrayMetrics().currentOutputKW
    this.currentDCPowerKW = dcInputKW

    const result = convertDcToAc(dcInputKW, this.ratedCapacityKW, this.baseEfficiency)
    this.currentACPowerKW = result.acKW
    this.conversionLossKW = result.lossKW
    this.currentEfficiency = result.efficiency
    this.operatingState = result.state
  }

  public getMetrics() {
    return {
      ratedCapacityKW: this.ratedCapacityKW,
      currentDCPowerKW: this.currentDCPowerKW,
      currentACPowerKW: this.currentACPowerKW,
      conversionLossKW: this.conversionLossKW,
      currentEfficiency: this.currentEfficiency,
      operatingState: this.operatingState
    }
  }
}
