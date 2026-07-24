import React from 'react';
import { SensorData, SolarData, FacadeState, CONSTANTS } from '@/lib/simulation/algorithms';

interface DashboardProps {
  sensorData: SensorData;
  solarData: SolarData;
  facadeState: FacadeState;
  computedClearSky: number;
  targetAngleEast: number;
  actualAngleEast: number;
  targetAngleWest: number;
  actualAngleWest: number;
}

export function Dashboard({ 
  sensorData, 
  solarData, 
  facadeState, 
  computedClearSky, 
  targetAngleEast,
  actualAngleEast,
  targetAngleWest,
  actualAngleWest
}: DashboardProps) {

  let stateColor = "text-gray-400";
  let explanation = "";

  switch (facadeState) {
    case FacadeState.STORM_PROTECT:
      stateColor = "text-red-500";
      explanation = `Safety override (P1). Wind speed (${sensorData.windSpeed.toFixed(1)} km/h) > limit (${CONSTANTS.WIND_LIMIT}).`;
      break;
    case FacadeState.RAIN_PROTECT:
      stateColor = "text-blue-500";
      explanation = `Safety override (P1). Rain detected.`;
      break;
    case FacadeState.FAILSAFE:
      stateColor = "text-yellow-500";
      explanation = `Safety override (P1). Sensor errors exceeded.`;
      break;
    case FacadeState.NIGHT:
      stateColor = "text-indigo-400";
      explanation = `Night mode (P2). Sun below horizon (elev: ${solarData.elevation.toFixed(1)}°). Opened for passive cooling.`;
      break;
    case FacadeState.DAYLIGHT_OPEN:
      stateColor = "text-gray-300";
      const ratio = (sensorData.measuredIrradiance / (computedClearSky + 1)).toFixed(2);
      explanation = `Cloud detected via Sensor Fusion (P3). Ratio ${ratio} < ${CONSTANTS.CLOUD_RATIO} threshold. Opening to maximise daylight.`;
      break;
    case FacadeState.TRACK_SUN:
      stateColor = "text-emerald-400";
      explanation = `Normal operation (P4). Optimising thermal demand (Temp: ${sensorData.indoorTemp}°C) vs daylight (Lux: ${sensorData.indoorLux}).`;
      break;
  }

  return (
    <div className="w-full h-full bg-white/[0.03] backdrop-blur-xl rounded-2xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.5)] p-6 flex flex-col gap-6 font-mono text-sm">
      
      {/* State Header */}
      <div className="flex flex-col border-b border-white/10 pb-4">
        <span className="text-white/60 font-semibold uppercase tracking-widest text-xs mb-1 drop-shadow-md">Active Decision State</span>
        <div className={`text-2xl font-bold ${stateColor} drop-shadow-lg`}>
          {facadeState}
        </div>
        <div className="text-white/80 mt-2 text-sm leading-relaxed bg-black/20 p-3 rounded-lg border border-white/10 shadow-inner">
          <span className="text-white font-bold block mb-1 drop-shadow-sm">Decision Rationale:</span>
          {explanation}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        {/* Sensors Column */}
        <div className="flex flex-col gap-3 border-r border-white/10 pr-6">
          <span className="text-white/60 font-semibold uppercase tracking-widest text-xs border-b border-white/10 pb-2 drop-shadow-md">Sensor Telemetry</span>
          
          <div className="flex justify-between items-center">
            <span className="text-white/70 font-medium">Irradiance</span>
            <span className="text-white font-bold drop-shadow-md">{sensorData.measuredIrradiance.toFixed(0)} <span className="text-white/50 font-normal text-[10px]">W/m²</span></span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-white/70 font-medium">Clear Sky Est.</span>
            <span className="text-white/80 font-semibold drop-shadow-md">{computedClearSky.toFixed(0)} <span className="text-white/50 font-normal text-[10px]">W/m²</span></span>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-white/70 font-medium">Indoor Temp</span>
            <span className={`font-bold drop-shadow-md ${sensorData.indoorTemp > CONSTANTS.SETPOINT ? "text-rose-400" : "text-white"}`}>
              {sensorData.indoorTemp.toFixed(1)} <span className="text-white/50 font-normal text-[10px]">°C</span>
            </span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-white/70 font-medium">Indoor Lux</span>
            <span className="text-white font-bold drop-shadow-md">{sensorData.indoorLux.toFixed(0)} <span className="text-white/50 font-normal text-[10px]">lx</span></span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-white/70 font-medium">Wind Speed</span>
            <span className={`font-bold drop-shadow-md ${sensorData.windSpeed > CONSTANTS.WIND_LIMIT ? "text-red-500" : "text-white"}`}>
              {sensorData.windSpeed.toFixed(1)} <span className="text-white/50 font-normal text-[10px]">km/h</span>
            </span>
          </div>
        </div>

        {/* Servo / Output Column */}
        <div className="flex flex-col gap-3">
          <span className="text-white/60 font-semibold uppercase tracking-widest text-xs border-b border-white/10 pb-2 drop-shadow-md">Actuator Output</span>
          
          {/* East */}
          <div className="bg-sky-500/10 p-2 rounded border border-sky-500/30 mb-2 shadow-[0_0_15px_rgba(56,189,248,0.1)]">
            <div className="text-[10px] text-sky-300 uppercase font-bold mb-1 tracking-wider drop-shadow-md">East Facade</div>
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="text-white/70">Target</span>
              <span className="text-white font-bold drop-shadow-sm">{targetAngleEast.toFixed(1)}°</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-sky-400 font-bold drop-shadow-md">Actual</span>
              <span className="text-sky-400 font-bold drop-shadow-md text-sm">{actualAngleEast.toFixed(1)}°</span>
            </div>
          </div>

          {/* West */}
          <div className="bg-emerald-500/10 p-2 rounded border border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
            <div className="text-[10px] text-emerald-300 uppercase font-bold mb-1 tracking-wider drop-shadow-md">West Facade</div>
            <div className="flex justify-between items-center text-xs mb-1">
              <span className="text-white/70">Target</span>
              <span className="text-white font-bold drop-shadow-sm">{targetAngleWest.toFixed(1)}°</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-emerald-400 font-bold drop-shadow-md">Actual</span>
              <span className="text-emerald-400 font-bold drop-shadow-md text-sm">{actualAngleWest.toFixed(1)}°</span>
            </div>
          </div>

          <div className="mt-auto bg-black/20 p-2 rounded border border-white/10 shadow-inner">
            <div className="text-[10px] text-white/60 mb-1 uppercase font-semibold drop-shadow-sm">Servo Smoothing</div>
            <div className="flex justify-between text-[10px] font-medium">
              <span className="text-white/70">Deadband ±{CONSTANTS.DEADBAND}°</span>
              <span className="text-white/70">Rate {CONSTANTS.MAX_STEP}°/tick</span>
            </div>
          </div>
        </div>
      </div>
      
    </div>
  );
}
