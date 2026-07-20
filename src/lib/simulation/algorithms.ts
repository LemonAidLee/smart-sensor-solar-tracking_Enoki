export const CONSTANTS = {
  SETPOINT: 24,           // °C
  TEMP_BAND: 4,           // °C
  TARGET_LUX: 500,        // lux
  WIND_LIMIT: 40,         // km/h
  CLOUD_RATIO: 0.6,       // ratio measured / clear sky
  CLOUD_SLOPE_THRESHOLD: 5, // W/m2 per cycle drop
  MAX_STEP: 2.0,          // degrees per cycle
  DEADBAND: 1.5,          // degrees
  SERVO_MIN: 0,           // degrees (e.g. horizontal)
  SERVO_MAX: 90,          // degrees (e.g. vertical down)
  ERROR_LIMIT: 5,
  OPEN_NIGHT: 0,          // open for night cooling (horizontal)
  DAYLIGHT_OPEN: 0,       // open for max daylight
  STORM_PROTECT: 0,       // lock flat for wind
  RAIN_PROTECT: 90,       // close for rain
  FAILSAFE: 90,           // close if sensors fail
};

export enum FacadeState {
  STORM_PROTECT = "STORM_PROTECT",
  RAIN_PROTECT = "RAIN_PROTECT",
  FAILSAFE = "FAILSAFE",
  NIGHT = "NIGHT",
  DAYLIGHT_OPEN = "DAYLIGHT_OPEN", // Cloud detected
  TRACK_SUN = "TRACK_SUN",
}

export interface SolarData {
  elevation: number;
  azimuth: number;
  isDaytime: boolean;
  declination: number;
}

export interface SensorData {
  indoorTemp: number;
  indoorLux: number;
  windSpeed: number;
  rain: boolean;
  measuredIrradiance: number;
  irradianceSlope: number;
  sensorErrorCount: number;
}

// ----------------------------------------------------------------
// 1. Astronomical Solar Position Algorithm
// ----------------------------------------------------------------
function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = (date.getTime() - start.getTime()) + ((start.getTimezoneOffset() - date.getTimezoneOffset()) * 60 * 1000);
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

function deg2rad(deg: number): number { return deg * (Math.PI / 180.0); }
function rad2deg(rad: number): number { return rad * (180.0 / Math.PI); }
function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

export function solarPosition(date: Date, latitude: number, longitude: number, tzOffsetHours: number): SolarData {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const hour = date.getHours();
  const minute = date.getMinutes();
  const second = date.getSeconds();

  const localTime = hour + minute / 60.0 + second / 3600.0;
  const N = getDayOfYear(date);

  // declination
  const decl = 23.45 * Math.sin(deg2rad(360.0 / 365.0 * (N + 284)));

  // equation of time
  const B = deg2rad(360.0 / 365.0 * (N - 81));
  const EoT = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);

  // time correction
  const LSTM = 15.0 * tzOffsetHours;
  const TC = 4.0 * (longitude - LSTM) + EoT;
  const LST = localTime + TC / 60.0;

  // hour angle
  const H = 15.0 * (LST - 12.0);

  // elevation
  const Hr = deg2rad(H);
  const dr = deg2rad(decl);
  const pr = deg2rad(latitude);
  const elevation = rad2deg(Math.asin(Math.sin(dr) * Math.sin(pr) + Math.cos(dr) * Math.cos(pr) * Math.cos(Hr)));

  // azimuth
  let cosAz = (Math.sin(dr) * Math.cos(pr) - Math.cos(dr) * Math.sin(pr) * Math.cos(Hr)) / Math.cos(deg2rad(elevation));
  cosAz = clamp(cosAz, -1.0, 1.0);
  let azimuth = rad2deg(Math.acos(cosAz));
  if (H > 0) {
    azimuth = 360.0 - azimuth;
  }

  const isDaytime = elevation > 0;

  return { elevation, azimuth, isDaytime, declination: decl };
}

// ----------------------------------------------------------------
// 2. Sensor Fusion (Cloud Detection)
// ----------------------------------------------------------------
export function detectCloud(measuredIrradiance: number, elevation: number, slope: number): boolean {
  if (elevation <= 0) return false;
  
  // Clear-sky estimate from solar elevation
  const I_clear = 1000 * Math.sin(deg2rad(elevation));
  const ratio = measuredIrradiance / (I_clear + 1);
  const cloudy = (ratio < CONSTANTS.CLOUD_RATIO) && (slope < -CONSTANTS.CLOUD_SLOPE_THRESHOLD);
  return cloudy;
}

// ----------------------------------------------------------------
// 3. Decision-Making Algorithm
// ----------------------------------------------------------------
export function decideFacadeState(sensors: SensorData, solar: SolarData): FacadeState {
  // PRIORITY 1: SAFETY (fail-safe, non-negotiable)
  if (sensors.windSpeed > CONSTANTS.WIND_LIMIT) {
    return FacadeState.STORM_PROTECT;
  }
  if (sensors.rain) {
    return FacadeState.RAIN_PROTECT;
  }
  if (sensors.sensorErrorCount > CONSTANTS.ERROR_LIMIT) {
    return FacadeState.FAILSAFE;
  }

  // PRIORITY 2: NIGHT
  if (!solar.isDaytime) {
    return FacadeState.NIGHT;
  }

  // PRIORITY 3: CLOUD (sensor fusion)
  if (detectCloud(sensors.measuredIrradiance, solar.elevation, sensors.irradianceSlope)) {
    return FacadeState.DAYLIGHT_OPEN;
  }

  // PRIORITY 4: NORMAL THERMAL / DAYLIGHT OPTIMISATION
  return FacadeState.TRACK_SUN;
}

// ----------------------------------------------------------------
// 3b. Core Optimisation (Cooling vs Daylight)
// ----------------------------------------------------------------
export function computeOptimalAngle(solar: SolarData, sensors: SensorData, facadeOrientation: string = "WEST"): number {
  // 1. Block direct solar heat -> argues for CLOSING
  // 2. Keep natural daylight -> argues for OPENING

  const thermalDemand = clamp((sensors.indoorTemp - CONSTANTS.SETPOINT) / CONSTANTS.TEMP_BAND, 0, 1);
  const daylightHave = clamp(sensors.indoorLux / CONSTANTS.TARGET_LUX, 0, 1);

  // Simplified beam block angle for horizontal louvers: 
  // If sun is high, close to 0 (horizontal). If sun is low, tilt steeper to block (towards 90).
  // This is a proxy for the complex profile angle function f(elevation, azimuth).
  // Assuming a west facade, afternoon sun is low.
  // Profile angle for horizontal louvers facing azimuth A_f.
  const facadeAzimuth = facadeOrientation === "WEST" ? 270 : facadeOrientation === "EAST" ? 90 : 180;
  
  // Profile angle omega = atan( tan(elevation) / cos(sunAzimuth - facadeAzimuth) )
  const azDiff = Math.cos(deg2rad(solar.azimuth - facadeAzimuth));
  let profileAngle = solar.elevation; // fallback
  if (azDiff > 0) {
    profileAngle = rad2deg(Math.atan(Math.tan(deg2rad(solar.elevation)) / azDiff));
  } else {
    // Sun is behind the facade, so no direct beam hits it. Open for daylight.
    return CONSTANTS.DAYLIGHT_OPEN;
  }

  // To block the beam, the louver tilt angle should theoretically be 90 - profileAngle (if 0 is horizontal).
  // If profile angle is 90 (sun overhead), tilt is 0 (horizontal).
  // If profile angle is 20 (sun low), tilt is 70 (steep).
  const beamBlockAngle = clamp(90 - profileAngle, CONSTANTS.SERVO_MIN, CONSTANTS.SERVO_MAX);

  // Bias to open if the room is not hot or if it's too dim.
  const openBias = (1 - thermalDemand) * (1 - daylightHave);
  
  const targetAngle = beamBlockAngle * thermalDemand + CONSTANTS.DAYLIGHT_OPEN * openBias;
  
  return clamp(targetAngle, CONSTANTS.SERVO_MIN, CONSTANTS.SERVO_MAX);
}

export function getTargetAngleForState(state: FacadeState, solar: SolarData, sensors: SensorData, facadeOrientation: string): number {
  switch (state) {
    case FacadeState.STORM_PROTECT: return CONSTANTS.STORM_PROTECT;
    case FacadeState.RAIN_PROTECT: return CONSTANTS.RAIN_PROTECT;
    case FacadeState.FAILSAFE: return CONSTANTS.FAILSAFE;
    case FacadeState.NIGHT: return CONSTANTS.OPEN_NIGHT;
    case FacadeState.DAYLIGHT_OPEN: return CONSTANTS.DAYLIGHT_OPEN;
    case FacadeState.TRACK_SUN: return computeOptimalAngle(solar, sensors, facadeOrientation);
    default: return CONSTANTS.FAILSAFE;
  }
}

// ----------------------------------------------------------------
// 4. Servo Control Algorithm (Deadband + Rate Limit)
// ----------------------------------------------------------------
export function applyDeadband(target: number, current: number): number {
  if (Math.abs(target - current) < CONSTANTS.DEADBAND) {
    return current; // hold position
  }
  return target;
}

export function rateLimit(target: number, current: number): number {
  const delta = clamp(target - current, -CONSTANTS.MAX_STEP, CONSTANTS.MAX_STEP);
  return current + delta;
}

export function updateServo(desiredAngle: number, currentAngle: number): number {
  const withDeadband = applyDeadband(desiredAngle, currentAngle);
  return rateLimit(withDeadband, currentAngle);
}
