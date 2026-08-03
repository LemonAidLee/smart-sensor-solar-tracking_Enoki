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
      'Inject realistic electrical noise and thermal drift.',
      'Map physical sensor layouts (e.g., upper/lower LDRs) into discrete ADC channels.'
    ],
    inputs: ['Incident Irradiance', 'Temperature', 'Wind Speed', 'Rain Intensity'],
    outputs: ['LDR Voltages', 'Anemometer Pulse Rate', 'Rain Sensor Resistance'],
    howItWorks: 'Translates physical environmental loads into simulated electrical responses using transfer functions that mimic real hardware components (e.g., photoresistors in a voltage divider circuit), including ADC quantization.',
    keyEquations: [
      'V_out = V_cc * (R_ldr / (R_ldr + R_fixed))',
      'ADC_val = floor((V_out / V_ref) * 4095)'
    ],
    engineeringAssumptions: [
      'LDR response is roughly logarithmic with respect to lux.',
      'ADC is 12-bit.'
    ],
    knownLimitations: [
      'Does not model long-term component degradation.'
    ],
    relatedSubsystems: ['SolarPhysics', 'Weather', 'EmbeddedController'],
    engineeringReferences: ['LDR GL5528 Datasheet', 'ESP32 ADC Specifications'],
    frequentlyAskedQuestions: [
      { question: 'Why do the sensors fluctuate?', answer: 'The engine injects a simulated noise floor (Gaussian noise) to mimic real-world electrical and thermal interference in analog circuits.' }
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
    purpose: 'The master algorithmic optimization engine for the adaptive façade.',
    responsibilities: [
      'Evaluate competing building objectives: solar thermal gain, daylighting, and glare.',
      'Compute the theoretically optimal façade blade angle for the current time and conditions.',
      'Issue the Target Blade Angle to the Embedded Controller.'
    ],
    inputs: ['Sun Position', 'Current Weather', 'Building Energy State'],
    outputs: ['Target Blade Angle', 'Optimization Metrics (Glare, Heat, Light)'],
    howItWorks: 'Calculates the performance of the façade across all possible angles (0° to 90°). It assigns weights to daylighting (maximize), glare (minimize), and thermal gain (minimize in cooling-dominant climates), identifying the angle that yields the lowest overall penalty score.',
    keyEquations: [
      'Penalty(θ) = w_g * Glare(θ) + w_t * Thermal(θ) - w_d * Daylight(θ)',
      'θ_opt = argmin(Penalty(θ))'
    ],
    engineeringAssumptions: [
      'Optimization is discrete (evaluated at fixed degree intervals).',
      'The room interior requires constant lux levels during occupied hours.'
    ],
    knownLimitations: [
      'Does not yet predict future weather within its own immediate optimization loop; relies on instantaneous state.'
    ],
    relatedSubsystems: ['Weather', 'SolarPhysics', 'EmbeddedController', 'BuildingEnergy'],
    engineeringReferences: ['ASHRAE Standard 55 (Thermal Environmental Conditions)'],
    frequentlyAskedQuestions: [
      { question: 'Why didn\'t the façade move?', answer: 'PBIF incorporates a deadband threshold to prevent micro-adjustments. If the new optimal angle is too close to the current angle, it avoids actuating to save motor life and energy.' }
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
      'Does not currently feed thermal gain directly into the HVAC electrical load (uncoupled).'
    ],
    relatedSubsystems: ['ServoKinematics', 'SolarPhysics', 'BuildingEnergy'],
    engineeringReferences: ['LBNL WINDOW / Radiance geometrical models'],
    frequentlyAskedQuestions: [
      { question: 'Why is daylight non-zero when blades are closed?', answer: 'Even when blocking direct sun, diffuse light from the sky and ground reflections still enters through gaps and ambient scattering.' }
    ],
    futureExtensions: ['Coupling Façade thermal gain directly to BEMS HVAC electrical demand.']
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
    inputs: ['Simulated Time (Hour of Day)', 'Ambient Temperature'],
    outputs: ['Building Demand (kW)'],
    howItWorks: 'Combines a fixed diurnal schedule for occupancy-driven loads with a weather-responsive curve for HVAC. As ambient temperature rises above the cooling setpoint, the HVAC electrical demand increases proportionally to remove the heat.',
    keyEquations: [
      'Base_Load = Occupancy_Profile(t) * Max_Base_kW',
      'HVAC_Load = max(0, (T_ambient - Setpoint) * Cooling_Factor)',
      'Total_Demand = Base_Load + HVAC_Load'
    ],
    engineeringAssumptions: [
      'HVAC responds instantaneously to ambient temperature (no thermal mass lag).',
      'Building is strictly cooling-dominant (no heating load modeled).'
    ],
    knownLimitations: [
      'BEMS electrical demand is currently uncoupled from the Façade\'s solar thermal gain calculation.'
    ],
    relatedSubsystems: ['Weather', 'UtilityGrid', 'Battery'],
    engineeringReferences: ['ASHRAE 90.1 Load Profiles'],
    frequentlyAskedQuestions: [
      { question: 'Why does demand spike in the afternoon?', answer: 'Afternoon demand peaks due to the combination of maximum occupancy base loads and peak HVAC cooling demand driven by the highest daily ambient temperatures.' }
    ],
    futureExtensions: ['Coupling HVAC demand directly to Façade solar gain and modeling building thermal mass lag.']
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
      { question: 'Why does a locked-façade study show no electrical change?', answer: 'Because the Façade\'s thermal gain and the BEMS\'s HVAC electrical demand are currently uncoupled. The study correctly shows a thermal change, but it cannot propagate to electrical demand yet.' }
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
