# Façade Design Concept

Everything else in `docs/facade/` and `docs/embedded/` documents what SOLIS actually runs — the PBIF decision logic, the kinematics solver, the Wokwi prototype. This page is different: it's the architectural and physical-engineering reasoning that motivated the project in the first place — the climate problem I designed against, the real buildings I drew precedent from, and the full-scale physical specification the prototype is a proof-of-concept toward. Everything on this page is **PROPOSED design intent**, not the as-built simulation — see the note at the end for exactly where the line sits.

## The climate problem

Malaysia sits in the tropics: intense, near-vertical solar radiation year-round, high ambient temperature, and no real heating season to offset the cooling load. Modern commercial architecture in this climate tends toward large glazed façades for daylighting and aesthetics, which turns the envelope into a direct thermal gateway — solar radiation strikes the glass and raises the mean radiant temperature indoors, independently of whatever the air-conditioning setpoint says. In commercial buildings across hot, humid climates, HVAC and refrigeration typically account for close to half of total building energy use, with lighting a distant second — which is exactly why a façade-level intervention (reducing heat gain before it becomes a cooling load, rather than cooling harder after the fact) has outsized leverage compared to almost any other single design decision.

A static mitigation — tinted glass, or a fixed louvre — runs into a structural limitation: the sun's angle changes continuously through the day and across seasons, but a static shade doesn't. Sized for the worst-case sun angle, it over-shades the building for most of the day, forcing artificial lighting to compensate for daylight it's blocking even when there's no heat gain to justify blocking it. Sized for an average angle, it under-shades during peak hours. There's no fixed geometry that's correct at every sun position — which is precisely the gap a *kinetic* façade is built to close: a shading surface that tracks the sun continuously, rather than being sized for the worst case and shading everything else too.

## Real-world precedent

Three built kinetic and bioclimatic façades informed the design thinking here, each solving the same problem with a different mechanism:

- **Menara Mesiniaga** (Ken Yeang, Subang Jaya, Malaysia) — one of the earliest and most cited bioclimatic skyscrapers built specifically for hot, humid tropical conditions. Spiralling sky courts act as thermal buffer zones, and deep-recessed glazing paired with aluminium louvres blocks the harsh low-angle morning and afternoon sun without any moving parts.
- **CapitaGreen** (Toyo Ito, Singapore) — a double-skin façade (frameless outer glass, double-glazed inner glass) with shading blades planted in the air cavity across more than half the façade area to cut surface temperature, combined with a rooftop wind scoop that funnels cooled ambient air 242 m down into the HVAC system.
- **Al-Bahr Towers** (Aedas / Arup, Abu Dhabi) — the direct kinetic-façade precedent: over 2,000 origami-folding fibreglass elements, each individually actuated, that respond to the sun's trajectory across the sky in real time. It's the clearest existing proof that a fully automated, individually-addressable kinetic shading skin is buildable at full commercial scale.

SOLIS's own architecture — many independently-actuated blades, each responding to a locally-sensed condition rather than one building-wide setpoint — sits closest to the Al-Bahr precedent, scaled to a research/demonstration footprint.

## The proposed physical design

### Blade and structure

- **Blade material: Aluminium Alloy 6063-T6** ("architectural aluminium"). Extrudes cleanly into custom aerodynamic profiles, T6 tempering gives it the tensile strength to resist dynamic wind load without flexing, it resists atmospheric oxidation in Malaysia's humidity without a protective coating, and at 2.7 g/cm³ it's light enough that the blade's own dead weight doesn't dominate the servo's torque budget.
- **Hybrid shading geometry**: a fixed aluminium louvre bank set at a static 45° angle provides a zero-power baseline of passive shading against high-angle sun, with the motorised dynamic blades layered on the same structural body. The fixed louvres carry the passive load reduction; the dynamic blades add the precision a static angle can't reach on its own — splitting the shading duty between a mechanism that costs nothing to run and one that's worth the actuation cost specifically where a fixed angle falls short.
- **Sensor protection**: a UV-filtering tint film over the LDRs, which does two jobs at once — it protects the cadmium-sulfide photoresistor element from long-term UV degradation, and it attenuates direct glare so the ADC reading stays inside its useful measurement range instead of saturating.

### Actuation and control electronics

- **Servo: RDS3225 digital servo** — 25 kg·cm stall torque, 180–270° rotation range, standard PWM control, splash-resistant housing. Sized to move an aluminium blade against real outdoor wind drag, not just its own weight.
- **Microcontroller: ESP32** — the same family the Wokwi prototype and the digital twin both already model (see [ESP32 Firmware & the Virtual Embedded Controller](../embedded/esp32_firmware.md)): dual-core, onboard Wi-Fi for telemetry, hardware PWM for the servo, dedicated GPIO interrupts reserved for safety-override signals so a critical trip doesn't wait behind a software polling loop.
- **Independent sensor tower concept**: a safety-sensor array (wind speed, rain, temperature/humidity) running its own logic directly on the ESP32, separate from the primary LDR-driven tracking loop and from any cloud/AI round-trip — so a wind or rain trip closes the façade in local real time even if the network path to a supervisory system is slow or down. This is the physical-design reasoning behind exactly the property PBIF enforces in software: safety tiers evaluated ahead of, and independently from, optimisation (see [PBIF & Adaptive Façade Kinematics](pbif_and_kinematics.md)).

### Engineering trade studies

Three component choices, each weighed against the alternatives on cost, maintenance, and lifecycle:

| Blade material | Why chosen over the alternative |
|---|---|
| Aluminium 6063-T6 (chosen) | Higher material cost than steel or PVC, but low structural weight cuts motor torque requirements and actuator wear, and ~20-year corrosion resistance keeps maintenance low |
| Structural steel A36 | Cheaper raw material, but heavier — needs a bigger motor and recurring anti-corrosion coating |
| PVC polymer | Cheapest to mould, but degrades under UV and thermal cycling outdoors — frequent replacement erodes the initial saving |

| Actuator | Why chosen over the alternative |
|---|---|
| RDS3225 digital servo (chosen) | Strong torque-to-cost ratio, draws power only during a movement transition (not while holding position), and a single failed unit is cheap to swap without taking the whole array offline |
| Industrial linear actuator | 5–10× the unit cost, longer service life, but the higher capital cost extends the payback period substantially |

| Control MCU | Why chosen over the alternative |
|---|---|
| ESP32 (chosen) | Onboard Wi-Fi eliminates a separate data-run cable — lowest total bill-of-materials and site-wiring cost of any option considered |
| Arduino / STM32 | Lower chip cost, but need an external Wi-Fi module and more site cabling, which erodes the saving |
| Raspberry Pi / PLC / FPGA | Viable as a central hub or for heavier processing, but overkill (and expensive) as the per-panel node this application actually needs |

### Retrofit feasibility

The system is designed to be installable on an existing building's exterior rather than requiring new construction. The aluminium structure's low dead weight means it can mount on existing floor slabs via secondary steel brackets without a foundation upgrade; the ESP32's onboard Wi-Fi means each panel talks to the rest of the system over MQTT without running new signal cabling through occupied tenant floors; and because the servos only draw meaningful power during a brief rotation (holding a fixed angle costs close to nothing), the whole system is sized to run from a low-voltage bus, small enough that a dedicated local PV panel and battery could make a retrofitted module close to energy-self-sufficient rather than drawing from the building's main supply.

### Compliance considerations

A retrofitted kinetic envelope has to satisfy the same categories of code a static façade does, just with a moving-parts dimension added: structural anchoring rated for local wind-load codes (with the wind-speed safety override acting as the primary flutter/detachment mitigation), low-voltage electrical design to limit shock risk, IP66-rated outdoor enclosures against rain and dust, electromagnetic-compatibility compliance for the PWM/servo signal lines so they don't interfere with other building systems, solar-heat-gain-coefficient and building-energy-intensity compliance (which the shading itself directly helps satisfy), workplace illuminance minimums met by the daylighting control logic, and non-combustible material selection for fire safety.

### Sustainability

Aluminium 6063-T6 with high recycled content cuts embodied smelting energy substantially versus virgin stock, while remaining fully recyclable at end of life. Because the blades hold position rather than actuating continuously — moving only to track meaningful sun-angle change — the servos are estimated to sit idle well over 90% of operating hours, which keeps actuation power small enough that a small integrated PV array could plausibly offset it, reducing the system's draw on the building's main grid connection. In Malaysia specifically, retrofits like this can qualify for the Green Investment Tax Allowance and count toward green building certification points, and a PV-integrated version can access Net Energy Metering — financial mechanisms that shorten the payback period on top of the direct energy savings from reduced HVAC load.

## Where this meets the as-built system

I want the boundary here to be unambiguous, because it's easy to blur:

- **Structural safety and weather-protection response** — the concept of the façade closing on a wind or rain trip, evaluated ahead of and independently from optimisation — **is implemented**, in PBIF's Tier 1/Tier 2 rules (see [PBIF & Adaptive Façade Kinematics](pbif_and_kinematics.md)).
- **The specific hardware named on this page** — RDS3225 servos, 6063-T6 aluminium blades, a dedicated wind-cup/rain-gauge sensor tower — is the **target full-scale specification**, not what the Wokwi prototype or the digital twin currently run. The prototype documented in [ESP32 Firmware & the Virtual Embedded Controller](../embedded/esp32_firmware.md) uses a generic simulated servo part and two potentiometers standing in for wind and rain sensing — a deliberate, stated substitution for a demo build, not this page's sensor tower.
- **The digital twin's simulation physics** (irradiance, thermal, lighting, energy models) are unaffected by anything on this page — they model the building and façade behaviour SOLIS actually implements, independent of which physical actuator or blade alloy a full-scale build would eventually use.
