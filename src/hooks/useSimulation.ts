import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  solarPosition, 
  detectCloud, 
  decideFacadeState, 
  getTargetAngleForState, 
  updateServo, 
  SolarData, 
  SensorData, 
  FacadeState,
  CONSTANTS
} from '@/lib/simulation/algorithms';

export interface SimulationControls {
  timeHours: number;      // 0 to 24
  cloudCover: number;     // 0 (clear) to 1 (overcast)
  rain: boolean;
  windSpeed: number;      // km/h
  indoorTemp: number;     // °C
  indoorLux: number;      // lux
}

export function useSimulation(latitude = 3.14, longitude = 101.69, tzOffset = 8) {
  const [controls, setControls] = useState<SimulationControls>({
    timeHours: 14.5, // 2:30 PM default
    cloudCover: 0,
    rain: false,
    windSpeed: 10,
    indoorTemp: 24,
    indoorLux: 600,
  });

  const [solarData, setSolarData] = useState<SolarData>({ elevation: 0, azimuth: 0, isDaytime: false, declination: 0 });
  const [sensorData, setSensorData] = useState<SensorData>({
    indoorTemp: 24, indoorLux: 600, windSpeed: 10, rain: false,
    measuredIrradiance: 0, irradianceSlope: 0, sensorErrorCount: 0
  });
  
  const [facadeState, setFacadeState] = useState<FacadeState>(FacadeState.NIGHT);
  const [targetAngleEast, setTargetAngleEast] = useState<number>(0);
  const [actualAngleEast, setActualAngleEast] = useState<number>(0);
  const [targetAngleWest, setTargetAngleWest] = useState<number>(0);
  const [actualAngleWest, setActualAngleWest] = useState<number>(0);
  
  const [computedClearSky, setComputedClearSky] = useState<number>(0);
  const [isCloudDetected, setIsCloudDetected] = useState<boolean>(false);
  
  const [isPlaying, setIsPlaying] = useState(false);
  
  const prevIrradiance = useRef(0);

  const tick = useCallback(() => {
    const today = new Date();
    const simDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 
      Math.floor(controls.timeHours), 
      Math.floor((controls.timeHours % 1) * 60), 
      0
    );

    const solar = solarPosition(simDate, latitude, longitude, tzOffset);
    setSolarData(solar);

    const I_clear = solar.elevation > 0 ? 1000 * Math.sin(solar.elevation * (Math.PI / 180)) : 0;
    setComputedClearSky(I_clear);
    
    const noise = (Math.random() - 0.5) * 50; 
    let measured = I_clear * (1 - controls.cloudCover) + noise;
    if (measured < 0) measured = 0;
    
    const slope = measured - prevIrradiance.current;
    prevIrradiance.current = measured;

    const currentSensors: SensorData = {
      indoorTemp: controls.indoorTemp,
      indoorLux: controls.indoorLux,
      windSpeed: controls.windSpeed,
      rain: controls.rain,
      measuredIrradiance: measured,
      irradianceSlope: slope,
      sensorErrorCount: 0
    };
    setSensorData(currentSensors);

    const cloudDetected = detectCloud(measured, solar.elevation, slope);
    setIsCloudDetected(cloudDetected);

    const state = decideFacadeState(currentSensors, solar);
    setFacadeState(state);

    const targetEast = getTargetAngleForState(state, solar, currentSensors, "EAST");
    const targetWest = getTargetAngleForState(state, solar, currentSensors, "WEST");
    
    setTargetAngleEast(targetEast);
    setTargetAngleWest(targetWest);

  }, [controls, latitude, longitude, tzOffset]);

  useEffect(() => {
    tick();
    
    const interval = setInterval(() => {
      if (isPlaying) {
        setControls(prev => ({
          ...prev,
          timeHours: (prev.timeHours + 0.1) % 24 
        }));
      }
      
      tick();
      
      setActualAngleEast(prev => updateServo(targetAngleEast, prev));
      setActualAngleWest(prev => updateServo(targetAngleWest, prev));
      
    }, 500);

    return () => clearInterval(interval);
  }, [isPlaying, tick, targetAngleEast, targetAngleWest]);

  const setTimeToRealTime = () => {
    const now = new Date();
    const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60.0;
    const klHours = (utcHours + tzOffset) % 24;
    setControls(prev => ({ ...prev, timeHours: klHours }));
  };

  return {
    controls,
    setControls,
    solarData,
    sensorData,
    facadeState,
    targetAngleEast,
    actualAngleEast,
    targetAngleWest,
    actualAngleWest,
    computedClearSky,
    isCloudDetected,
    isPlaying,
    setIsPlaying,
    setTimeToRealTime,
    constants: CONSTANTS
  };
}
