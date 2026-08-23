"use client"

import { Navigation } from "@/components/layout/Navigation"
import { SmoothScroll } from "@/components/layout/SmoothScroll"
import { Footer } from "@/components/layout/Footer"
import { CustomCursor } from "@/components/ui/CustomCursor"
import { EngineeringHero } from "@/components/engineering/EngineeringHero"
import { SectionTitle } from "@/components/engineering/SectionTitle"
import { HardwareCard } from "@/components/engineering/HardwareCard"
import { HARDWARE_MODELS } from "@/components/engineering/hardwareData"
import { FirmwareViewer } from "@/components/engineering/FirmwareViewer"
import { motion, useInView } from "framer-motion"
import { useRef } from "react"
import { useTwinStore } from "@/lib/engine/store"
import { Activity, Battery, Thermometer, Wind, Eye, Cpu, Database, Network, Server, ArrowRight, Sun, CloudRain, ShieldCheck, Zap, BatteryCharging, Lightbulb, Factory, Workflow, BrainCircuit } from "lucide-react"

function FadeReveal({ children, delay = 0, className = "" }: { children: React.ReactNode, delay?: number, className?: string }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: "-10%" })
  
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
      transition={{ duration: 1, ease: [0.76, 0, 0.24, 1], delay }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

function LiveDataPanel() {
  const { snapshot, weather } = useTwinStore()
  
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6 w-full">
      <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-6">
        <Thermometer className="w-6 h-6 text-emerald mb-4" />
        <p className="text-xs font-mono text-gray-400 uppercase tracking-widest mb-1">HVAC Load</p>
        <p className="text-3xl font-medium tabular-nums">{snapshot.metrics.totalCoolingLoad.toFixed(1)} kW</p>
      </div>
      <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-6">
        <Activity className="w-6 h-6 text-emerald mb-4" />
        <p className="text-xs font-mono text-gray-400 uppercase tracking-widest mb-1">Avg Angle</p>
        <p className="text-3xl font-medium tabular-nums">{snapshot.metrics.averagePanelAngle.toFixed(1)}°</p>
      </div>
      <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-6">
        <Battery className="w-6 h-6 text-emerald mb-4" />
        <p className="text-xs font-mono text-gray-400 uppercase tracking-widest mb-1">Energy Saving</p>
        <p className="text-3xl font-medium tabular-nums">{snapshot.metrics.totalEnergySaving.toFixed(1)}%</p>
      </div>
      <div className="bg-black/40 backdrop-blur-md border border-white/10 rounded-xl p-6">
        <Wind className="w-6 h-6 text-emerald mb-4" />
        <p className="text-xs font-mono text-gray-400 uppercase tracking-widest mb-1">Wind Speed</p>
        <p className="text-3xl font-medium tabular-nums">{weather.windSpeed.toFixed(0)} km/h</p>
      </div>
    </div>
  )
}

export default function EngineeringPage() {
  return (
    <SmoothScroll>
      <CustomCursor />

      <main className="min-h-screen w-full bg-background text-white selection:bg-emerald/30 selection:text-emerald">
        <Navigation />

        <div className="relative z-10 flex flex-col">
          <EngineeringHero />

          {/* Section 1 — Hardware Designs */}
          <section id="hardware" className="w-full py-24 md:py-32">
            <div className="max-w-7xl mx-auto px-6 md:px-12">
              <SectionTitle
                eyebrow="Section 01"
                title={<>Hardware <span className="text-white/40 italic">Designs.</span></>}
                description="Interactive 3D reference models of the physical hardware behind the Digital Twin — orbit, zoom, and inspect each assembly."
              />

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-10">
                {HARDWARE_MODELS.map((model, i) => (
                  <HardwareCard key={model.id} model={model} delay={i * 0.15} />
                ))}
              </div>
            </div>
          </section>

          {/* Section 2 — System Architecture */}
          <section id="architecture" className="w-full bg-black/20 backdrop-blur-sm border-y border-white/5 py-24 md:py-32">
            <div className="max-w-7xl mx-auto px-6 md:px-12">
              <SectionTitle
                eyebrow="Section 02"
                title={<>System <span className="text-white/40 italic">Architecture.</span></>}
                description="The data pipeline coupling physical sensors, the Priority-Based Intelligent Façade (PBIF) engine, and the Digital Twin."
              />

              {/* Cyber-Physical Pipeline */}
              <FadeReveal>
                <h3 className="text-2xl font-medium mb-6">Cyber-Physical Pipeline</h3>
                <p className="text-gray-400 font-light max-w-3xl mb-8">
                  The system operates on a single unified physics model. The same environmental drivers, PBIF rules, and façade kinematics apply to the physical ESP32 edge node and the building-scale software twin.
                </p>
                <div className="w-full bg-black/40 backdrop-blur-xl border border-white/10 rounded-xl p-8 shadow-2xl relative overflow-hidden mb-12">
                   <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(52,211,153,0.05),transparent_70%)] pointer-events-none" />
                   
                   <div className="flex flex-wrap gap-4 items-center justify-center relative z-10 text-center">
                     <div className="flex flex-col items-center gap-3 bg-white/[0.02] p-5 rounded-lg border border-white/5 w-32">
                        <Sun className="w-6 h-6 text-emerald" />
                        <span className="text-xs font-medium">Environment</span>
                     </div>
                     <ArrowRight className="w-4 h-4 text-gray-600 hidden md:block" />
                     <div className="flex flex-col items-center gap-3 bg-white/[0.02] p-5 rounded-lg border border-white/5 w-32">
                        <Eye className="w-6 h-6 text-emerald" />
                        <span className="text-xs font-medium">Sensors</span>
                     </div>
                     <ArrowRight className="w-4 h-4 text-gray-600 hidden md:block" />
                     <div className="flex flex-col items-center gap-3 bg-emerald/10 p-5 rounded-lg border border-emerald/20 w-32">
                        <Cpu className="w-6 h-6 text-emerald" />
                        <span className="text-xs font-medium text-emerald">PBIF Controller</span>
                     </div>
                     <ArrowRight className="w-4 h-4 text-gray-600 hidden md:block" />
                     <div className="flex flex-col items-center gap-3 bg-white/[0.02] p-5 rounded-lg border border-white/5 w-32">
                        <Factory className="w-6 h-6 text-emerald" />
                        <span className="text-xs font-medium">Kinematics</span>
                     </div>
                     <ArrowRight className="w-4 h-4 text-gray-600 hidden md:block" />
                     <div className="flex flex-col items-center gap-3 bg-white/[0.02] p-5 rounded-lg border border-white/5 w-32">
                        <Server className="w-6 h-6 text-emerald" />
                        <span className="text-xs font-medium">Digital Twin</span>
                     </div>
                   </div>

                   <div className="mt-8 border-t border-white/5 pt-8">
                     <div className="flex items-center gap-3 mb-4">
                       <BrainCircuit className="w-5 h-5 text-amber-500" />
                       <h4 className="text-sm font-medium text-amber-500 tracking-wider uppercase">AI Advisory Layer</h4>
                     </div>
                     <p className="text-xs text-gray-400 font-light max-w-2xl">
                       Prediction, What-If Analysis, and Fault Detection observe the twin but <strong>never actuate</strong>. PBIF remains the sole controller of the façade to guarantee structural safety certification.
                     </p>
                   </div>
                </div>
              </FadeReveal>

              {/* PBIF Priority Hierarchy */}
              <FadeReveal delay={0.1}>
                <h3 className="text-2xl font-medium mb-6">PBIF Priority Logic</h3>
                <p className="text-gray-400 font-light max-w-3xl mb-8">
                  The Predictive Building Intelligence Framework evaluates a strict 5-tier safety hierarchy. Safety and weather protection always take precedence over energy optimisation.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  {[
                    { level: 1, icon: Wind, name: "Structural Safety", cond: "Wind ≥ 50 km/h", act: "0° (Flat Lockout)", desc: "Absolute override against mechanical damage." },
                    { level: 2, icon: CloudRain, name: "Weather Protection", cond: "Rain ≥ 0.35", act: "135° (Shedding)", desc: "Prevents water pooling and protects linkages." },
                    { level: 3, icon: Sun, name: "Solar Availability", cond: "LDR < Threshold", act: "Widen Deadband", desc: "Reduces servo wear in overcast conditions." },
                    { level: 4, icon: Thermometer, name: "Thermal Demand", cond: "Temp > 30°C", act: "Favour Shading", desc: "Rejects solar gain when cooling plant is loaded." },
                    { level: 5, icon: ShieldCheck, name: "Default Tracking", cond: "All Clear", act: "Analytic Tracking", desc: "Minimizes sun incidence angle." }
                  ].map((tier) => (
                    <div key={tier.level} className="bg-black/40 border border-white/5 rounded-xl p-6 shadow-xl relative overflow-hidden group">
                      <div className="absolute top-0 left-0 w-1 h-full bg-emerald/50 opacity-0 group-hover:opacity-100 transition-opacity" />
                      <div className="flex justify-between items-start mb-4">
                        <tier.icon className="w-6 h-6 text-emerald" />
                        <span className="text-xs font-mono text-gray-500">TIER {tier.level}</span>
                      </div>
                      <h4 className="font-medium text-sm mb-1">{tier.name}</h4>
                      <div className="text-xs font-mono text-emerald/80 mb-3">{tier.cond}</div>
                      <div className="text-xs bg-white/5 rounded px-2 py-1 mb-3 inline-block">{tier.act}</div>
                      <p className="text-xs text-gray-400 font-light leading-relaxed">{tier.desc}</p>
                    </div>
                  ))}
                </div>
              </FadeReveal>
            </div>
          </section>

          {/* Section 3 — Physics & Mathematics */}
          <section id="physics" className="w-full py-24 md:py-32">
            <div className="max-w-7xl mx-auto px-6 md:px-12">
              <SectionTitle
                eyebrow="Section 03"
                title={<>Physics & <span className="text-white/40 italic">Mathematics.</span></>}
                description="Core algorithms evaluating Solar Geometry, Daylighting, Thermal Dynamics, and Renewable Dispatch in a single coupled loop."
              />

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                
                {/* 1. Solar Geometry */}
                <FadeReveal delay={0.1}>
                  <div className="bg-black/40 border border-white/5 p-8 rounded-xl h-full shadow-2xl flex flex-col">
                    <Sun className="w-6 h-6 text-emerald mb-4" />
                    <h3 className="text-xl font-medium mb-4">Solar Incidence & Geometry</h3>
                    <p className="text-sm text-gray-400 font-light leading-relaxed mb-6 flex-1">
                      Computed via NOAA astronomical algorithms. The angle of incidence dictates the fraction of direct irradiance intercepted by the moving blade.
                    </p>
                    <div className="bg-black/60 p-5 rounded-lg border border-white/10 font-mono text-xs text-gray-300">
                      cosθ = clamp(sun_dir · n̂, 0, 1) <br/>
                      E_direct = GHI_atten × cosθ <br/>
                      <span className="text-emerald/70">// n̂ is the outward panel normal</span>
                    </div>
                  </div>
                </FadeReveal>

                {/* 2. LDR Sensor Physics */}
                <FadeReveal delay={0.2}>
                  <div className="bg-black/40 border border-white/5 p-8 rounded-xl h-full shadow-2xl flex flex-col">
                    <Eye className="w-6 h-6 text-emerald mb-4" />
                    <h3 className="text-xl font-medium mb-4">LDR Sensor Physics</h3>
                    <p className="text-sm text-gray-400 font-light leading-relaxed mb-6 flex-1">
                      The analog reading from the GL5528 photoresistor is non-linear. The digital twin applies an empirical power law to deduce Lux.
                    </p>
                    <div className="bg-black/60 p-5 rounded-lg border border-white/10 font-mono text-xs text-gray-300">
                      V_out = (ADC / 1023) × 5.0V <br/>
                      R_ldr = (5.0 - V_out) × 10kΩ / V_out <br/>
                      <span className="text-emerald/70">// Power law Lux approx</span><br/>
                      Lux = 500 / (R_ldr / 1000)
                    </div>
                  </div>
                </FadeReveal>

                {/* 3. Façade Thermal Gain */}
                <FadeReveal delay={0.3}>
                  <div className="bg-black/40 border border-white/5 p-8 rounded-xl h-full shadow-2xl flex flex-col">
                    <Thermometer className="w-6 h-6 text-emerald mb-4" />
                    <h3 className="text-xl font-medium mb-4">Façade Envelope Gain</h3>
                    <p className="text-sm text-gray-400 font-light leading-relaxed mb-6 flex-1">
                      Every degree of blade rotation instantly alters the solar heat gain transmitted into the building envelope.
                    </p>
                    <div className="bg-black/60 p-5 rounded-lg border border-white/10 font-mono text-xs text-gray-300">
                      Q_solar = E_exp × openness × A_gl × SHGC <br/>
                      Q_envelope = Q_solar × 0.9 <br/>
                      <span className="text-emerald/70">// SHGC = 0.45</span><br/>
                      <span className="text-emerald/70">// Transmitted to Cooling Plant</span>
                    </div>
                  </div>
                </FadeReveal>

                {/* 4. Thermal Lag */}
                <FadeReveal delay={0.4}>
                  <div className="bg-black/40 border border-white/5 p-8 rounded-xl h-full shadow-2xl flex flex-col">
                    <Workflow className="w-6 h-6 text-emerald mb-4" />
                    <h3 className="text-xl font-medium mb-4">Thermal Mass Lag</h3>
                    <p className="text-sm text-gray-400 font-light leading-relaxed mb-6 flex-1">
                      Indoor temperature is delayed by the structural mass absorbing heat, modeled as a first-order lag filter (τ = 20 mins).
                    </p>
                    <div className="bg-black/60 p-5 rounded-lg border border-white/10 font-mono text-xs text-gray-300">
                      T(t) = T(t-1) + α × (T_target - T(t-1)) <br/>
                      <span className="text-emerald/70">// α is the Thermal Mass factor</span><br/>
                      Q_cooling = Q_indoor_gain / COP <br/>
                      <span className="text-emerald/70">// COP = 3.5</span>
                    </div>
                  </div>
                </FadeReveal>

                {/* 5. Daylighting */}
                <FadeReveal delay={0.5}>
                  <div className="bg-black/40 border border-white/5 p-8 rounded-xl h-full shadow-2xl flex flex-col">
                    <Lightbulb className="w-6 h-6 text-emerald mb-4" />
                    <h3 className="text-xl font-medium mb-4">Daylighting & Harvesting</h3>
                    <p className="text-sm text-gray-400 font-light leading-relaxed mb-6 flex-1">
                      The same irradiance modifying thermal gain also drives indoor illuminance, which feeds proportional daylight harvesting.
                    </p>
                    <div className="bg-black/60 p-5 rounded-lg border border-white/10 font-mono text-xs text-gray-300">
                      E_in = E_exp × 1000 × 110 × 0.6 × open <br/>
                      <span className="text-emerald/70">// 110 lm/W luminous efficacy</span><br/>
                      <span className="text-emerald/70">// Drives artificial lighting demand</span><br/>
                      <span className="text-emerald/70">// down towards 500-lux target</span>
                    </div>
                  </div>
                </FadeReveal>

                {/* 6. PV & Battery Dispatch */}
                <FadeReveal delay={0.6}>
                  <div className="bg-black/40 border border-white/5 p-8 rounded-xl h-full shadow-2xl flex flex-col">
                    <BatteryCharging className="w-6 h-6 text-emerald mb-4" />
                    <h3 className="text-xl font-medium mb-4">PV & Dispatch Settlement</h3>
                    <p className="text-sm text-gray-400 font-light leading-relaxed mb-6 flex-1">
                      104 kW rooftop PV generation is settled in strict priority: Building Load first, Battery second, Grid export last.
                    </p>
                    <div className="bg-black/60 p-5 rounded-lg border border-white/10 font-mono text-xs text-gray-300">
                      P_DC = clamp((E/1k) × 550, 0, 550) <br/>
                      P_AC = min(P_DC × 0.98, 80kW) <br/>
                      <span className="text-emerald/70">// Inverter clipped at 80 kW</span><br/>
                      <span className="text-emerald/70">// Surplus charges 39.5 kWh BESS</span>
                    </div>
                  </div>
                </FadeReveal>

              </div>
            </div>
          </section>

          {/* Section 4 — Live Telemetry */}
          <section id="telemetry" className="w-full bg-black/20 backdrop-blur-sm border-y border-white/5 py-24 md:py-32">
            <div className="max-w-7xl mx-auto px-6 md:px-12">
              <SectionTitle
                eyebrow="Section 04"
                title={<>Live <span className="text-white/40 italic">Telemetry.</span></>}
                description="Real-time data ingested from the Digital Twin engine running locally in your browser."
              />
              <FadeReveal>
                <LiveDataPanel />
              </FadeReveal>
            </div>
          </section>

          {/* Section 5 — Firmware */}
          <section id="firmware" className="w-full py-24 md:py-32">
            <div className="max-w-7xl mx-auto px-6 md:px-12">
              <SectionTitle
                eyebrow="Section 05"
                title={<>ESP32 <span className="text-white/40 italic">Firmware.</span></>}
                description="The exact C++ source code flashed to the edge node, responsible for real-time sensor processing and actuator safety-locking."
              />

              <FadeReveal delay={0.2}>
                <FirmwareViewer />
              </FadeReveal>
            </div>
          </section>

          <Footer />
        </div>
      </main>
    </SmoothScroll>
  )
}
