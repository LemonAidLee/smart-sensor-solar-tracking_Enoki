"use client"

import { useRef } from "react"
import { motion, useInView } from "framer-motion"
import { Sun, CloudRain, Wind, Thermometer, Cpu, Database, Cloud, Settings } from "lucide-react"

// Reusable cinematic text reveal component
function TextReveal({ children, delay = 0, className = "" }: { children: React.ReactNode, delay?: number, className?: string }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: "-10%" })
  
  return (
    <div ref={ref} className={`overflow-hidden ${className}`}>
      <motion.div
        initial={{ y: "120%", opacity: 0, rotateZ: 2 }}
        animate={isInView ? { y: 0, opacity: 1, rotateZ: 0 } : { y: "120%", opacity: 0, rotateZ: 2 }}
        transition={{ duration: 1.2, ease: [0.76, 0, 0.24, 1], delay }}
        className="origin-bottom-left"
      >
        {children}
      </motion.div>
    </div>
  )
}

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

const SENSORS = [
  { id: "solar", label: "Solar Sensor", icon: Sun, desc: "Measures solar irradiance (W/m²) using LDR & Pyranometer." },
  { id: "weather", label: "Weather API", icon: CloudRain, desc: "Fetches live forecasting for rain, storms, and cloud cover." },
  { id: "wind", label: "Wind Sensor", icon: Wind, desc: "Monitors wind speed (km/h) for structural safety overrides." },
  { id: "climate", label: "Climate Nodes", icon: Thermometer, desc: "Tracks interior/exterior Temp, Humidity, and CO₂." }
]

const TECH_STACK = [
  { name: "Hardware", items: ["ESP32 Master", "Arduino Nano Nodes", "Raspberry Pi 4", "Motor Drivers"] },
  { name: "Actuators", items: ["High-Torque Servo", "NEMA 17 Stepper", "Linear Actuator"] },
  { name: "Software & Cloud", items: ["AWS IoT Core", "Firebase RTDB", "React & Three.js", "C++ / FreeRTOS"] }
]

export function EngineeringDeepDive() {
  return (
    <section className="relative w-full text-white py-32 md:py-64 overflow-hidden bg-transparent">
      <div className="max-w-7xl mx-auto px-6 md:px-12">
        
        {/* Sensor Fusion Grid */}
        <div className="mb-48">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-24 bg-black/40 backdrop-blur-xl p-8 md:p-12 rounded-xl border border-white/5 shadow-2xl">
            <div className="max-w-2xl">
              <FadeReveal>
                <span className="text-gray-400 font-mono text-sm tracking-[0.2em] uppercase block mb-8">
                  Data Acquisition
                </span>
              </FadeReveal>
              <h2 className="text-4xl md:text-6xl font-sans tracking-tight leading-tight">
                <TextReveal>Sensor <span className="italic text-white/40">Fusion.</span></TextReveal>
              </h2>
            </div>
            <FadeReveal delay={0.2}>
              <p className="text-gray-300 font-mono text-sm max-w-sm leading-relaxed tracking-wide">
                The foundation of the digital twin. Physical nodes relay high-frequency telemetry back to the centralized PBIF engine.
              </p>
            </FadeReveal>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {SENSORS.map((sensor, idx) => (
              <SensorCard key={sensor.id} sensor={sensor} delay={0.1 * idx} />
            ))}
          </div>
        </div>

        {/* Tech Stack & Kinematics */}
        <div>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-24 bg-black/40 backdrop-blur-xl p-8 md:p-12 rounded-xl border border-white/5 shadow-2xl">
            <div className="max-w-2xl">
              <FadeReveal>
                <span className="text-gray-400 font-mono text-sm tracking-[0.2em] uppercase block mb-8">
                  Architecture
                </span>
              </FadeReveal>
              <h2 className="text-4xl md:text-6xl font-sans tracking-tight leading-tight">
                <TextReveal>Full-Stack</TextReveal>
                <TextReveal delay={0.1}><span className="italic text-white/40">Mechatronics.</span></TextReveal>
              </h2>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Left: Mechatronics Diagram */}
            <FadeReveal delay={0.2} className="lg:col-span-7">
              <div className="h-full bg-black/40 backdrop-blur-xl border border-white/5 rounded-xl p-8 md:p-12 flex flex-col justify-between min-h-[400px] relative overflow-hidden group transition-colors duration-500 hover:bg-black/60 shadow-2xl" data-cursor="VIEW">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(52,211,153,0.1),transparent_50%)] pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity duration-1000" />
                
                <div className="relative z-10 grid grid-cols-2 gap-8 mb-12">
                   <div className="flex flex-col gap-2">
                      <Cpu className="w-6 h-6 text-emerald mb-2" />
                      <span className="text-sm font-bold text-white tracking-wide">ESP32 Core</span>
                      <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">Edge Compute</span>
                   </div>
                   <div className="flex flex-col gap-2">
                      <Database className="w-6 h-6 text-emerald mb-2" />
                      <span className="text-sm font-bold text-white tracking-wide">Algorithm</span>
                      <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">NOAA SPA + ASHRAE</span>
                   </div>
                   <div className="flex flex-col gap-2">
                      <Cloud className="w-6 h-6 text-emerald mb-2" />
                      <span className="text-sm font-bold text-white tracking-wide">Telemetry</span>
                      <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">MQTT / RTDB</span>
                   </div>
                   <div className="flex flex-col gap-2">
                      <Settings className="w-6 h-6 text-emerald mb-2" />
                      <span className="text-sm font-bold text-white tracking-wide">Kinematics</span>
                      <span className="text-[10px] font-mono text-gray-400 uppercase tracking-widest">PWM Servos</span>
                   </div>
                </div>

                <div className="relative z-10 border-t border-white/10 pt-8 mt-auto">
                  <p className="text-gray-300 font-light leading-relaxed">
                    When the environment turns hostile, the system overrides solar optimization. Extreme wind, rain, and heat triggers autonomous safe-modes, protecting the structure.
                  </p>
                </div>
              </div>
            </FadeReveal>

            {/* Right: Stack List */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              {TECH_STACK.map((category, idx) => (
                <FadeReveal key={category.name} delay={0.2 + (0.1 * idx)}>
                  <div className="bg-black/40 backdrop-blur-xl border border-white/5 rounded-xl p-8 flex flex-col gap-6 shadow-xl hover:bg-black/60 transition-colors duration-500">
                    <span className="text-xs font-mono text-white/50 tracking-[0.2em] uppercase">{category.name}</span>
                    <ul className="flex flex-col gap-3">
                      {category.items.map((item) => (
                        <li key={item} className="text-lg text-white font-medium flex items-center gap-4 tracking-tight">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </FadeReveal>
              ))}
            </div>

          </div>
        </div>

      </div>
    </section>
  )
}

function SensorCard({ sensor, delay }: { sensor: any, delay: number }) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: "-10%" })

  return (
    <motion.div 
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{ duration: 1, ease: [0.76, 0, 0.24, 1], delay }}
      className="bg-black/40 backdrop-blur-xl border border-white/5 rounded-xl p-8 md:p-12 hover:bg-white/[0.03] transition-colors duration-500 shadow-xl" 
      data-cursor="EXPLORE"
    >
      <sensor.icon className="w-8 h-8 text-emerald/80 mb-12 drop-shadow-[0_0_15px_rgba(52,211,153,0.3)]" />
      <h3 className="text-xl font-medium mb-4 tracking-tight">{sensor.label}</h3>
      <p className="text-sm text-gray-400 leading-relaxed font-light">{sensor.desc}</p>
    </motion.div>
  )
}
