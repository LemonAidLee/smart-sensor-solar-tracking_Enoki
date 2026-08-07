import type { SubsystemKnowledge } from './types'

export const subsystems: SubsystemKnowledge[] = [
  {
    id: 'Weather',
    name: 'Weather Scenario Engine',
    purpose: 'Provides the deterministic environmental state at the current simulation time.',
    responsibilities: [
      'Interpolate weather keyframes over simulated time.',
      'Provide current temperature, humidity, cloud coverage, rain intensity, and wind speed.',
      'Manage continuous 24-hour cyclic timelines.',
    ],
    inputs: ['Simulated Time (Hour of Day)', 'Forecast or Scenario Keyframes'],
    outputs: ['Temperature', 'Humidity', 'Cloud Coverage', 'Rain Intensity', 'Wind Speed'],
    howItWorks: 'The engine walks an array of 24 hourly keyframes. Based on the current simulated hour, it identifies the surrounding keyframes and performs cubic or linear interpolation to compute the exact instantaneous environmental conditions. The timeline wraps at midnight.',
    keyEquations: [
      'value = mix(keyframe[t], keyframe[t+1], smoothstep(t, t+1, current_time))'
    ],
    engineeringAssumptions: [
      'Weather is geographically uniform across the entire site.',
      'Interpolation between hours provides sufficient resolution for thermal and electrical response.',
    ],
    knownLimitations: [
      'Does not model microclimates or local wind turbulence around the building.',
    ],
    relatedSubsystems: ['SolarPhysics', 'VirtualSensors', 'BuildingEnergy'],
    engineeringReferences: ['Open-Meteo API Documentation'],
    frequentlyAskedQuestions: [
      { question: 'What is cloud cover?', answer: 'A percentage (0-1) representing the fraction of the sky obscured by clouds, which attenuates direct solar irradiance.' }
    ],
    futureExtensions: ['Integration of localized microclimate data.']
  },
  {
    id: 'SolarPhysics',
    name: 'Solar Physics Engine',
    purpose: 'Computes astronomical sun position and site-specific solar irradiance.',
    responsibilities: [
      'Calculate solar azimuth and altitude based on time and geographical coordinates.',
      'Compute clear-sky direct and diffuse irradiance.',
      'Apply cloud cover attenuation to determine actual incident solar vectors.'
    ],
    inputs: ['Geographical Coordinates (Lat/Lon)', 'Simulated Time', 'Cloud Coverage'],
    outputs: ['Sun Altitude', 'Sun Azimuth', 'Direct Normal Irradiance (DNI)', 'Diffuse Horizontal Irradiance (DHI)'],
    howItWorks: 'Uses astronomical formulas to determine the precise angle of the sun relative to the site. It then calculates the theoretical maximum solar radiation reaching the ground and reduces it based on the current cloud coverage provided by the Weather subsystem.',
    keyEquations: [
      'altitude = asin(sin(lat)*sin(declination) + cos(lat)*cos(declination)*cos(hour_angle))',
      'DNI_actual = DNI_clear * (1 - 0.75 * cloud_cover^3)'
    ],
    engineeringAssumptions: [
      'Atmospheric scattering is approximated using standard clear-sky models.',
      'Cloud cover acts as a non-linear attenuator.'
    ],
    knownLimitations: [
      'Does not account for partial shading from distant mountains.'
    ],
    relatedSubsystems: ['Weather', 'VirtualSensors', 'PVElectrical', 'AdaptiveFacade'],
    engineeringReferences: ['NREL Solar Position Algorithm (SPA)'],
    frequentlyAskedQuestions: [
      { question: 'What is effective irradiance?', answer: 'The actual solar power per square meter reaching a specific tilted surface, accounting for the incident angle and atmospheric conditions.' }
    ],
    futureExtensions: ['Spectral irradiance modelling.']
  },
  {
    id: 'VirtualSensors',
    name: 'Virtual Sensor Engine',
    purpose: 'Models the physical electronic sensors embedded in the façade.',
    responsibilities: [
      'Convert raw incident irradiance into simulated analog electrical signals.',
      'Apply a first-order low-pass smoothing filter to the raw ADC reading (τ = 0.5 s) — the only temporal behaviour this engine models.',
      'Map physical sensor layouts (e.g., upper/lower LDRs) into discrete ADC channels.'
    ],
    inputs: ['Incident Irradiance', 'Temperature', 'Wind Speed', 'Rain Intensity'],
    outputs: ['LDR Voltages', 'Anemometer Pulse Rate', 'Rain Sensor Resistance'],
    howItWorks: 'Translates physical environmental loads into simulated electrical responses using transfer functions that mimic real hardware components — a GL5528-style CdS photoresistor wired as the VCC-side leg of a voltage divider — including ADC quantization. The full chain (irradiance → lux → LDR resistance → divider voltage → ADC counts) is computed by exactly one shared module, `src/lib/engine/ldrPhysics.ts`, reused by both the live twin (`VirtualSensorEngine`) and the Virtual Embedded System explainability layer (`embedded/sensors.ts`) — the equations below are that module, not a description of it.',
    keyEquations: [
      'Ev = eta * G  (illuminance from effective irradiance, eta = 120 lux per W/m^2)',
      'R_ldr = R10 * (10 / Ev)^gamma  (R10 = 10,000 ohm, gamma = 0.7, clamped at a 1 M ohm dark ceiling)',
      'V_out = V_cc * (R_fixed / (R_fixed + R_ldr))  (R_fixed = 10,000 ohm; the LDR is the VCC-side leg, so brighter light raises V_out)',
      'ADC_val = round((V_out / V_ref) * 4095)'
    ],
    engineeringAssumptions: [
      'LDR resistance follows the GL5528 datasheet power law (R = R10 * (10/lux)^gamma), extrapolated beyond its calibrated 10-100 lux range to full daylight illuminance — documented, not hidden.',
      'ADC is 12-bit.'
    ],
    knownLimitations: [
      'Does not model long-term component degradation.',
      'Deterministic by design: no electrical noise or thermal-drift model exists. A given irradiance input always produces the same reading, modulo the smoothing filter\'s own transient response.'
    ],
    relatedSubsystems: ['SolarPhysics', 'Weather', 'EmbeddedController'],
    engineeringReferences: ['LDR GL5528 Datasheet', 'ESP32 ADC Specifications'],
    frequentlyAskedQuestions: [
      { question: 'Why do the sensors fluctuate?', answer: 'Because the irradiance driving them changes — sun angle, cloud attenuation, façade rotation — smoothed by a first-order low-pass filter (τ = 0.5 s) so a reading eases toward its new value rather than jumping. There is no injected noise; the same irradiance always yields the same settled reading.' }
    ],
    futureExtensions: ['Modeling dirt accumulation (soiling) over time.']
  },
  {
    id: 'EmbeddedController',
    name: 'Virtual Embedded Controller',
    purpose: 'Simulates the physical microcontroller executing local logic.',
    responsibilities: [
      'Read and filter raw ADC values from Virtual Sensors.',
      'Execute safety overrides (e.g., high wind stow, rain closure).',
      'Translate high-level angle targets from PBIF into low-level servo PWM signals.'
    ],
    inputs: ['Virtual Sensor ADC values', 'PBIF Target Angle'],
    outputs: ['Servo PWM signal', 'Controller State (Normal/Override)'],
    howItWorks: 'Acts as the digital brain on the physical device. It polls sensor channels periodically, applies software debouncing and moving averages, checks thresholds for safety conditions, and emits hardware-level commands (PWM) to the actuators.',
    keyEquations: [
      'PWM_duty = map(target_angle, 0, 180, PWM_MIN, PWM_MAX)'
    ],
    engineeringAssumptions: [
      'Controller execution is instantaneous relative to the simulation tick.',
      'Firmware logic perfectly matches the intended physical device firmware.'
    ],
    knownLimitations: [
      'Does not simulate CPU clock cycles, RTOS overhead, or memory constraints.'
    ],
    relatedSubsystems: ['VirtualSensors', 'PBIF', 'ServoKinematics'],
    engineeringReferences: ['ESP32 Technical Reference Manual'],
    frequentlyAskedQuestions: [
      { question: 'Why is the controller in override mode?', answer: 'Safety constraints take precedence. If the wind speed exceeds the structural limit, the controller ignores PBIF and forces the façade into a safe stow position.' }
    ],
    futureExtensions: ['Hardware-in-the-loop (HIL) integration.']
  },
  {
    id: 'PBIF',
    name: 'Predictive Building Intelligence Framework (PBIF)',
    purpose: 'A deterministic, rule-based decision layer that picks ONE building-level operational objective for the façade — despite the "Predictive" in its name, PBIF v1 contains no prediction, optimization, ML or MPC (stated explicitly in its own module headers). It never outputs a panel angle itself.',
    responsibilities: [
      'Classify wind, rain and solar-resource inputs into engineering states (Situation Assessment).',
      'Resolve ONE operational state — NORMAL_TRACKING, ECONOMY_TRACKING, WEATHER_PROTECTION or SAFE_MODE — via a first-match-wins priority table (Structural Safety › Weather Protection › Solar Availability › Thermal Demand).',
      'Hand the resolved state to the Tracking Policy, which alone routes it through the existing kinematics solver into a target angle.'
    ],
    inputs: ['Wind Speed', 'Rain Intensity', 'Solar ADC (cloud/irradiance proxy)', 'Outdoor Temperature'],
    outputs: ['Operational State (PbifState)', 'Priority Tier', 'Confidence (always 100 — no predictive/AI source exists yet to vary it)'],
    howItWorks: 'Evaluates a declarative, ordered rule table top-down; the first rule whose condition matches wins and no lower-priority rule is ever consulted, so the whole policy is auditable at a glance. The resolved state then selects a Tracking Policy: full kinematics tracking, a dynamic-deadband-limited tracking (actuator-wear mitigation), or a predefined safe orientation (wind- or rain-protection) that suspends tracking entirely.',
    keyEquations: [
      'state = firstMatch(RULES) over [windBand, rainBand, solarResource, thermalDemand], strict priority order',
      'ECONOMY_TRACKING: move only if |targetAngle - currentAngle| > DYNAMIC_DEADBAND_DEG[solarResource]'
    ],
    engineeringAssumptions: [
      'Thresholds (wind/rain bands, solar-resource ADC bands) are fixed, named constants, not learned or adaptive.',
      'No hysteresis: classification is a single-pass band walk with no separate rising/falling threshold and no memory of the previous tick.'
    ],
    knownLimitations: [
      'Not predictive despite the name: PBIF v1 reacts to the current instant only — it does not read the 48-hour forecast at all (that is the AI Prediction layer\'s job, and PBIF is not wired to consume its output).',
      '`confidence` is hardcoded to 100 on every decision; it exists as a field so a future predictive source can populate it without an interface change, not because today\'s confidence is actually assessed.'
    ],
    relatedSubsystems: ['Weather', 'SolarPhysics', 'EmbeddedController', 'BuildingEnergy'],
    engineeringReferences: ['ASHRAE Standard 55 (Thermal Environmental Conditions)'],
    frequentlyAskedQuestions: [
      { question: 'Why didn\'t the façade move?', answer: 'Under ECONOMY_TRACKING, PBIF applies a dynamic deadband threshold (tighter when solar resource is high, wider when it is low) to prevent micro-adjustments — if the new target angle is too close to the current one, it holds position to save motor life and energy.' },
      { question: 'Is PBIF an optimizer or an AI?', answer: 'No — it is a deterministic rule table, by its own module documentation. It contains no weighting, penalty function, angle sweep or learning of any kind. Model Predictive Control using the 48-hour forecast is a named future extension, not current behaviour.' }
    ],
    futureExtensions: ['Model Predictive Control (MPC) utilizing the 48-hour forecast.']
  },
  {
    id: 'ServoKinematics',
    name: 'Servo & Kinematics Solver',
    purpose: 'Translates controller signals into physical mechanical motion over time.',
    responsibilities: [
      'Model physical actuator travel time and rotational inertia.',
      'Convert PWM signals back into target mechanical angles.',
      'Update the current physical angle of the façade blades incrementally.'
    ],
    inputs: ['Servo PWM Command', 'Simulated Delta Time'],
    outputs: ['Current Blade Angle', 'Servo Motion Status'],
    howItWorks: 'Calculates the difference between the current mechanical position and the commanded position. Based on the servo\'s maximum slew rate (degrees per second), it steps the current angle toward the target angle over the elapsed simulation delta time.',
    keyEquations: [
      'Δθ = min(|target - current|, max_speed * Δt)',
      'current_angle = current_angle + sign(target - current) * Δθ'
    ],
    engineeringAssumptions: [
      'Motion is perfectly linear (constant velocity slew).',
      'Motor torque is always sufficient to overcome wind resistance and friction.'
    ],
    knownLimitations: [
      'Does not model mechanical backlash, gear wear, or dynamic wind loading torque.'
    ],
    relatedSubsystems: ['EmbeddedController', 'AdaptiveFacade'],
    engineeringReferences: ['Standard RC Servo Specifications'],
    frequentlyAskedQuestions: [
      { question: 'Why is Current Blade Angle different from Target Blade Angle?', answer: 'Mechanical motion takes time. The servo is currently transiting to the new position at its maximum physical speed.' }
    ],
    futureExtensions: ['Dynamic torque modelling and motor power consumption based on load.']
  },
  {
    id: 'AdaptiveFacade',
    name: 'Adaptive Skin Engine',
    purpose: 'Calculates the geometric and physical impact of the actuated façade on the building.',
    responsibilities: [
      'Determine self-occlusion and shading geometry based on current blade angles.',
      'Calculate net solar transmission (daylight) passing into the interior.',
      'Calculate net solar thermal gain on the building envelope.'
    ],
    inputs: ['Current Blade Angle', 'Solar Incident Vector', 'Direct/Diffuse Irradiance'],
    outputs: ['Façade Solar Gain (kW)', 'Daylight Transmission (%)', 'Normalised Exposure'],
    howItWorks: 'Projects the 3D geometry of the blades against the solar vector. It computes the illuminated versus shaded areas of the windows behind the blades, combining direct transmission (using ray occlusion) and diffuse transmission (using sky view factor).',
    keyEquations: [
      'Transmission = (Direct_Area_Exposed * DNI) + (Sky_View_Factor * DHI)',
      'Solar_Gain_kW = Transmission * Window_Area * SHGC / 1000'
    ],
    engineeringAssumptions: [
      'Blades are perfectly opaque.',
      'Diffuse light is isotropic.'
    ],
    knownLimitations: [
      'Downstream HVAC capacity is not yet limited: BuildingThermalEngine (Stage 7.9) currently assumes the cooling plant can always remove 100% of the heat this engine admits.'
    ],
    relatedSubsystems: ['ServoKinematics', 'SolarPhysics', 'BuildingEnergy'],
    engineeringReferences: ['LBNL WINDOW / Radiance geometrical models'],
    frequentlyAskedQuestions: [
      { question: 'Why is daylight non-zero when blades are closed?', answer: 'Even when blocking direct sun, diffuse light from the sky and ground reflections still enters through gaps and ambient scattering.' },
      { question: 'Does the façade\'s solar gain affect HVAC electrical demand?', answer: 'Yes, since Stage 7.9. This engine\'s solar gain output feeds BuildingThermalEngine, which converts it into HVAC electrical demand (via a cooling-plant COP) that BuildingEnergy adds to its own bus. Daylight similarly feeds BuildingLightingEngine (Stage 7.10) for artificial-lighting demand. Both are separate sibling engines documented in docs/ai/implementation/building_thermal.md and building_lighting.md, not (yet) individually registered in this knowledge base.' }
    ],
    futureExtensions: ['Modelling a capacity-limited HVAC response (today the cooling plant is assumed to always meet demand exactly).']
  },
  {
    id: 'RooftopPV',
    name: 'Rooftop PV Array',
    purpose: 'Models the physical configuration and geometric performance of the solar panels.',
    responsibilities: [
      'Define the tilt, azimuth, and capacity of the PV array.',
      'Calculate the incident angle of the sun on the specific plane of the panels.',
      'Provide the plane-of-array (POA) irradiance to the electrical engine.'
    ],
    inputs: ['Sun Position', 'Direct/Diffuse Irradiance'],
    outputs: ['Plane of Array Irradiance (W/m²)'],
    howItWorks: 'Uses cosine projection to map the 3D solar vector onto the 2D plane of the rooftop panels. It aggregates direct beam, sky diffuse, and ground-reflected radiation arriving at the tilted surface.',
    keyEquations: [
      'cos(θ_inc) = sin(lat)*sin(dec) + cos(lat)*cos(dec)*cos(hour_angle)',
      'POA = (DNI * cos(θ_inc)) + (DHI * view_factor_sky) + (GHI * albedo * view_factor_ground)'
    ],
    engineeringAssumptions: [
      'Panels are fixed-tilt and facing a uniform direction.',
      'No self-shading between rows is modelled.'
    ],
    knownLimitations: [
      'Assumes a clean array (no soiling losses modeled geometrically).'
    ],
    relatedSubsystems: ['SolarPhysics', 'PVElectrical'],
    engineeringReferences: ['Perez or Hay-Davies Transposition Models'],
    frequentlyAskedQuestions: [
      { question: 'Why is POA irradiance higher than DNI?', answer: 'The plane of array captures direct sunlight perfectly normal to its surface (if aligned) while also collecting diffuse light from the sky and reflections from the roof/ground.' }
    ],
    futureExtensions: ['Row-to-row self-shading calculations.']
  },
  {
    id: 'PVElectrical',
    name: 'PV Electrical Engine',
    purpose: 'Converts solar irradiance on the panels into raw DC electrical power.',
    responsibilities: [
      'Apply panel efficiency ratings and temperature coefficients.',
      'Calculate raw string DC voltage and current.',
      'Output total DC power generated by the array.'
    ],
    inputs: ['Plane of Array Irradiance', 'Ambient Temperature'],
    outputs: ['DC Power (kW)'],
    howItWorks: 'Translates irradiance to power using the panel\'s nominal efficiency. It derates the power output based on the cell temperature, which rises above ambient temperature under intense sunlight, reducing the semiconductor\'s efficiency.',
    keyEquations: [
      'T_cell = T_ambient + (POA / 800) * (NOCT - 20)',
      'Efficiency = η_ref * [1 - β * (T_cell - 25)]',
      'Power_DC = POA * Area * Efficiency'
    ],
    engineeringAssumptions: [
      'Maximum Power Point Tracking (MPPT) is ideal and instantaneous.',
      'Uniform temperature across all modules.'
    ],
    knownLimitations: [
      'Does not model bypass diode activation under partial shading.'
    ],
    relatedSubsystems: ['RooftopPV', 'Weather', 'PVInverter'],
    engineeringReferences: ['Standard Test Conditions (STC) vs Nominal Operating Cell Temp (NOCT)'],
    frequentlyAskedQuestions: [
      { question: 'Why does efficiency drop at noon?', answer: 'Solar cells lose efficiency as they heat up. The intense noon sun increases the cell temperature significantly above ambient, causing a thermal derating of the DC output.' }
    ],
    futureExtensions: ['String-level mismatch and partial shading IV-curve modeling.']
  },
  {
    id: 'PVInverter',
    name: 'PV Inverter Engine',
    purpose: 'Models the power electronics converting DC solar power into usable AC power.',
    responsibilities: [
      'Apply inverter conversion efficiency curves.',
      'Enforce maximum AC power clipping (inverter capacity limits).',
      'Deliver final AC power to the building bus.'
    ],
    inputs: ['DC Power (kW)'],
    outputs: ['AC Power (kW)', 'Clipping Loss (kW)'],
    howItWorks: 'Takes the raw DC power and multiplies it by the inverter\'s efficiency (which varies slightly with load). If the incoming DC power exceeds the inverter\'s maximum AC rating, the excess power is "clipped" (lost as heat), and output is capped at the maximum rating.',
    keyEquations: [
      'Power_AC = min(Power_DC * η_inverter, Max_AC_Rating)',
      'Clipped = max(0, (Power_DC * η_inverter) - Max_AC_Rating)'
    ],
    engineeringAssumptions: [
      'Inverter efficiency is treated as a constant average rather than a dynamic curve.',
      'Inverter availability is 100%.'
    ],
    knownLimitations: [
      'Does not model reactive power (VAR) support or grid voltage stabilization.'
    ],
    relatedSubsystems: ['PVElectrical', 'UtilityGrid', 'Battery'],
    engineeringReferences: ['Huawei SUN2000 Inverter Datasheet'],
    frequentlyAskedQuestions: [
      { question: 'What is inverter clipping?', answer: 'When the solar panels produce more DC power than the inverter is physically rated to convert, the inverter restricts its output to its maximum capacity. The excess DC power is unused.' }
    ],
    futureExtensions: ['Dynamic efficiency curves based on partial loading.']
  },
  {
    id: 'BuildingEnergy',
    name: 'Building Energy Management System (BEMS)',
    purpose: 'Simulates the total electrical demand of the building.',
    responsibilities: [
      'Model base loads (lighting, equipment, plug loads) based on occupancy schedules.',
      'Model HVAC thermal loads based on ambient temperature.',
      'Provide total required AC power demand to the energy bus.'
    ],
    inputs: ['Simulated Time (Hour of Day)', 'Ambient Temperature', 'Façade Solar Cooling Load (kW electrical, from BuildingThermalEngine)', 'Façade Artificial Lighting Addition (kW electrical, from BuildingLightingEngine)'],
    outputs: ['Building Demand (kW)'],
    howItWorks: 'Combines a fixed diurnal schedule for occupancy-driven loads with a weather-responsive curve for HVAC (15-minute thermal-mass lag). As ambient temperature rises above the cooling setpoint, the HVAC electrical demand increases proportionally to remove the heat. Since Stage 7.9/7.10, the façade\'s own thermal and daylight effect on the building — computed by the sibling BuildingThermalEngine and BuildingLightingEngine, never re-derived here — is added straight onto the HVAC and Lighting categories\' occupancy-driven baselines, because both arrive already expressed in the same electrical kW those categories use.',
    keyEquations: [
      'Base_Load = Occupancy_Profile(t) * Max_Base_kW',
      'HVAC_Load = max(0, (T_ambient - Setpoint) * Cooling_Factor) + Facade_Solar_Cooling_kW',
      'Lighting_Load = Base_Lighting(Occupancy) + Facade_Artificial_Lighting_kW',
      'Total_Demand = HVAC_Load + Lighting_Load + Equipment_Load + Elevators_Load + Services_Load'
    ],
    engineeringAssumptions: [
      'HVAC responds instantaneously to ambient temperature (no thermal mass lag) — but see limitations: the façade-driven addition brings its own, separate lag from BuildingThermalEngine.',
      'Building is strictly cooling-dominant (no heating load modeled).'
    ],
    knownLimitations: [
      'HVAC capacity is not yet limited: coolingRequiredKW (BuildingThermalEngine) always equals the heat gain admitted, so this engine\'s HVAC demand never reflects a plant running at its ceiling.',
      'The façade-driven addition is read at BuildingThermalEngine/BuildingLightingEngine\'s own equilibrium/lag, not independently re-derived here — this engine only ever adds their published output, never recomputes the thermal or daylight chain itself.'
    ],
    relatedSubsystems: ['Weather', 'UtilityGrid', 'Battery', 'AdaptiveFacade'],
    engineeringReferences: ['ASHRAE 90.1 Load Profiles'],
    frequentlyAskedQuestions: [
      { question: 'Why does demand spike in the afternoon?', answer: 'Afternoon demand peaks due to the combination of maximum occupancy base loads and peak HVAC cooling demand driven by the highest daily ambient temperatures.' },
      { question: 'Does closing the façade blades change HVAC electrical demand?', answer: 'Yes, since Stage 7.9. Less admitted solar gain lowers BuildingThermalEngine\'s cooling-plant electrical draw, which this engine adds straight onto its own occupancy-driven HVAC baseline — a real, traceable electrical effect, not just a thermal-comfort display number.' }
    ],
    futureExtensions: ['Modelling an HVAC capacity ceiling so coolingRequiredKW can diverge from indoor heat gain under extreme load (see BuildingThermalEngine).']
  },
  {
    id: 'Battery',
    name: 'Battery Energy Storage System (BESS)',
    purpose: 'Stores excess solar energy and discharges it to offset grid import during high demand.',
    responsibilities: [
      'Track State of Charge (SOC) over time.',
      'Enforce maximum charge and discharge rate limits (C-rates).',
      'Settle the energy bus by absorbing excess PV or covering unmet demand.'
    ],
    inputs: ['Net Bus Power (PV Supply - Building Demand)', 'Simulated Delta Time'],
    outputs: ['Battery Charge/Discharge Power (kW)', 'State of Charge (%)'],
    howItWorks: 'Acts as the primary buffer. If PV AC power exceeds building demand, the battery charges (up to its max rate and capacity). If demand exceeds PV, the battery discharges to cover the shortfall. Any remaining imbalance is passed to the Utility Grid.',
    keyEquations: [
      'Power_BESS = clamp(Net_Power, -Max_Discharge, Max_Charge)',
      'SOC_new = clamp(SOC_old + (Power_BESS * Δt * η) / Capacity, 0, 100)'
    ],
    engineeringAssumptions: [
      'Round-trip efficiency is symmetric.',
      'Degradation of capacity over charge cycles is ignored.'
    ],
    knownLimitations: [
      'Does not employ smart dispatch arbitrage (e.g., waiting to discharge until peak pricing hours). It strictly follows a greedy self-consumption strategy.'
    ],
    relatedSubsystems: ['PVInverter', 'BuildingEnergy', 'UtilityGrid'],
    engineeringReferences: ['Lithium-Ion Storage System Specifications'],
    frequentlyAskedQuestions: [
      { question: 'Why isn\'t the battery charging?', answer: 'The battery only charges if there is an excess of PV power after the building\'s demand is fully met, and only if it hasn\'t reached its maximum capacity (100% SOC).' }
    ],
    futureExtensions: ['Time-of-Use (TOU) price arbitrage dispatch algorithms.']
  },
  {
    id: 'UtilityGrid',
    name: 'Utility Grid Engine',
    purpose: 'The ultimate balancing authority of the microgrid.',
    responsibilities: [
      'Supply any building demand that PV and Battery cannot meet (Grid Import).',
      'Absorb any excess PV generation that the Battery cannot store (Grid Export).',
      'Ensure the local energy bus always balances to zero.'
    ],
    inputs: ['Residual Bus Power (after PV and Battery)'],
    outputs: ['Grid Import (kW)', 'Grid Export (kW)'],
    howItWorks: 'Evaluates the residual power on the bus after the building, PV, and battery have settled. A negative residual means unmet demand, resulting in Grid Import. A positive residual means stranded excess power, resulting in Grid Export.',
    keyEquations: [
      'Import = abs(min(0, Residual_Power))',
      'Export = max(0, Residual_Power)'
    ],
    engineeringAssumptions: [
      'The grid has infinite capacity to supply or absorb power.',
      'No curtailment limits are enforced by the utility.'
    ],
    knownLimitations: [
      'Does not model grid outages or islanding frequency control.'
    ],
    relatedSubsystems: ['Battery', 'PVInverter', 'BuildingEnergy'],
    engineeringReferences: ['IEEE 1547 Interconnection Standards'],
    frequentlyAskedQuestions: [
      { question: 'Why is grid import increasing?', answer: 'Grid import increases when the building\'s electrical demand exceeds the combined output of the solar array and the available battery discharge power.' }
    ],
    futureExtensions: ['Grid outage simulations and financial cost modeling based on TOU tariffs.']
  },
  {
    id: 'AIPrediction',
    name: 'AI Prediction Layer',
    purpose: 'Projects the state of the Digital Twin into the future to provide engineering foresight.',
    responsibilities: [
      'Simulate the future state of weather, solar, PV, and energy using the 48-hour forecast.',
      'Synthesize human-readable insights explaining future trends.',
      'Act strictly as a read-only observer; it controls nothing.'
    ],
    inputs: ['Live Forecast Timeline', 'Current Building State'],
    outputs: ['12-Hour Projection', 'Confidence Score', 'Engineering Explanations'],
    howItWorks: 'Executes a lightweight, accelerated pass of the core physics engines using upcoming forecast keyframes. It compares the projected future state against the present to identify critical transitions (e.g., battery depletion, peak solar generation) and formats them into an explainable report.',
    keyEquations: [
      'Confidence = min(1.0, Horizon_Factor * Freshness_Factor * Stability_Factor)'
    ],
    engineeringAssumptions: [
      'The forecast is entirely accurate.',
      'The façade remains locked at its current mean openness for the duration of the projection (avoids predicting PBIF logic).'
    ],
    knownLimitations: [
      'Does not perform a forward occlusion ray-cast (uses scalar daylight approximations).',
      'Prediction horizon is limited to 12 hours to maintain high confidence.'
    ],
    relatedSubsystems: ['Weather', 'Battery', 'BuildingEnergy', 'RooftopPV'],
    engineeringReferences: ['Model Predictive Control (Observation Layer)'],
    frequentlyAskedQuestions: [
      { question: 'Why does the prediction say "Holding"?', answer: 'If the forecast cache is empty or network connectivity is lost, the AI cannot confidently project the future and will hold its prediction rather than inventing data.' }
    ],
    futureExtensions: ['Prediction accuracy tracking (comparing past predictions against actual twin data).']
  },
  {
    id: 'AIWhatIf',
    name: 'AI What-If Analysis',
    purpose: 'Evaluates hypothetical engineering alternatives in an isolated sandbox.',
    responsibilities: [
      'Clone the current simulation state into a throwaway context.',
      'Override exactly one physical parameter (e.g., Battery Capacity).',
      'Run a parallel projection and calculate the differential impact versus the live twin.'
    ],
    inputs: ['Live Prediction Walk', 'Override Parameter'],
    outputs: ['Counterfactual Projection', 'Differential Metrics (e.g., +12% Export)'],
    howItWorks: 'Instantiates a pure data copy of the twin\'s configuration. It applies the requested change, runs the same forward projection loop used by the AI Prediction Layer, and compares the resulting energy integrals (e.g., total grid import) against the baseline to prove causality.',
    keyEquations: [
      'Δ_Metric = Sandbox_Integral(t_0, t_12) - Baseline_Integral(t_0, t_12)'
    ],
    engineeringAssumptions: [
      'The baseline walk is byte-identical to the live prediction\'s walk.',
      'Changes are isolated (ceteris paribus).'
    ],
    knownLimitations: [
      'Financial ROI analysis is currently unavailable as energy costs are not yet modeled.'
    ],
    relatedSubsystems: ['AIPrediction', 'Battery', 'UtilityGrid', 'RooftopPV'],
    engineeringReferences: ['Digital Twin Counterfactual Simulation'],
    frequentlyAskedQuestions: [
      { question: 'Does a locked-façade study show an electrical change?', answer: 'Yes, since Stage 7.9/7.10. Façade solar gain and daylight couple into projected HVAC and lighting electrical demand via BuildingThermalEngine/BuildingLightingEngine, so a locked-façade study moves solar gain, daylight AND projected HVAC/lighting electrical demand together — a thermal-only change with zero electrical effect would now indicate a bug, not expected behaviour.' }
    ],
    futureExtensions: ['Financial payback period calculations for hardware upgrades.']
  },
  {
    id: 'CyberPhysicalPipeline',
    name: 'Cyber-Physical Pipeline UI',
    purpose: 'Provides the primary integrated engineering visualization of the entire control loop.',
    responsibilities: [
      'Display the end-to-end signal path: Environment → Sensor → Controller → Servo → Façade.',
      'Unify solar geometry and mechanical kinematics into a single coherent narrative.',
      'Map internal canonical names to user-friendly UI terminology.'
    ],
    inputs: ['Solar Vectors', 'Sensor ADC', 'PBIF Targets', 'Servo Position'],
    outputs: ['Unified Telemetry UI'],
    howItWorks: 'Acts as a read-only presentation layer. It polls the various engines and maps their internal states to canonical terminology (e.g., replacing "Servo Position" with "Current Blade Angle"). It performs no physics or logic itself.',
    keyEquations: [],
    engineeringAssumptions: [
      'The UI accurately reflects the real-time state of the underlying engines.',
      'The four-LDR demonstration array is mapped safely from the two underlying physical sensor channels.'
    ],
    knownLimitations: [
      'Limited to displaying pre-computed metrics; cannot alter control modes directly.'
    ],
    relatedSubsystems: ['Weather', 'VirtualSensors', 'EmbeddedController', 'ServoKinematics', 'AdaptiveFacade'],
    engineeringReferences: ['HMI (Human-Machine Interface) Design Principles'],
    frequentlyAskedQuestions: [
      { question: 'Why are there four sensor channels shown if only two are modeled?', answer: 'The demonstration hardware presents a four-LDR array. The UI re-maps the two modeled physical channels (Upper/Lower) to the four display quadrants purely for presentation purposes.' }
    ],
    futureExtensions: ['Interactive override controls embedded directly within the pipeline stages.']
  }
]
