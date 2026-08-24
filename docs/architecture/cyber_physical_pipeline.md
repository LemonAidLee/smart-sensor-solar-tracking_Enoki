# Cyber-Physical Pipeline

I built the Cyber-Physical Pipeline as the core execution pathway connecting environmental sensing to physical actuation. This pipeline governs how raw solar irradiance becomes an electrical sensor reading, how that reading is interpreted by embedded logic, and how a decision becomes a physical servo command.

## Physical and Virtual Translation

I designed this subsystem to handle three distinct aspects of the project:

1. **Virtual Sensor Engine**: I created `VirtualSensorEngine` to run every simulation tick and feed the decision layer (`PBIF`). It is the single source of truth for "what the sensor reads" in the live digital twin.
2. **Explainability Layer**: I built a read-only visual representation (the Virtual Embedded System panel) to re-derive a human-readable narrative. It traces the signal from Environment → Electrical Signal → ESP32 reading for a selected panel, making it easy to explain without altering the underlying simulation physics.
3. **Simulated ESP32 Controller**: I ported the physical ESP32 firmware's priority state machine into the digital twin so that the virtual panels react exactly as the real board would.

## Engineering Equations

I implemented the sensing and control math using authentic component characteristics rather than arbitrary mappings:

- **LDR Sensor Physics**: The analog reading from the GL5528 photoresistor is non-linear. I model the exact power law to deduce Lux:
  - `lux = round(irradiance_Wm2 * 120)`
  - `R = lux <= 0 ? 1,000,000 : min(10,000 * (10/lux)^0.7, 1,000,000)`
  - `V = 3.3 * (10,000 / (10,000 + R))`
  - `ADC = round((V / 3.3) * 4095)`
- **First-Order Smoothing**: To prevent servo jitter from rapid light fluctuations, I applied a digital low-pass filter:
  - `α = 1 - e^(-dt/0.5)`
  - `filtered += (raw - filtered) * α`
- **Servo Kinematics**: Because the physical louvre is flat and optically symmetrical every 180°, I implemented a servo-folding algorithm so the kinematics engine can accumulate unbounded world rotation without requiring impossible physical servo ranges:
  - `servoAngle = ((worldDeg % 180) + 180) % 180`
  - `pwm = lerp(1000, 2000, clamp(angle/180))`

## Design Principles

I kept the embedded controller twin independent of the master simulation loop. The master twin drives the global building physics, while the simulated firmware provides a fault-injectable debugging twin for the electronics demonstration. This separation allowed me to build advanced debugging tools without letting them silently bypass the façade's real PBIF safety controls.
