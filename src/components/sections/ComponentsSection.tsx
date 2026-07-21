"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { SectionWrapper } from "@/components/layout/SectionWrapper"
import { GlassCard } from "@/components/ui/GlassCard"
import { Cpu, Sun, ThermometerSun, RotateCw, Monitor, SlidersHorizontal, Box } from "lucide-react"
import { Canvas } from "@react-three/fiber"
import { Environment, ContactShadows } from "@react-three/drei"
import { ESP32Model } from "@/components/3d/ESP32Model"

const COMPONENTS = [
  {
    name: "ESP32 Microcontroller",
    description: "The core AI brain. Processes sensor data, runs the decision tree, and handles IoT WiFi telemetry via MQTT.",
    icon: Cpu,
    color: "text-emerald-400"
  },
  {
    name: "LDR Sensors (x4)",
    description: "Light Dependent Resistors arrayed to detect solar irradiance and calculate the exact angle of the sun.",
    icon: Sun,
    color: "text-amber-400"
  },
  {
    name: "DHT22 Sensor",
    description: "Monitors ambient temperature and humidity to detect overheating conditions and trigger cooling modes.",
    icon: ThermometerSun,
    color: "text-rose-400"
  },
  {
    name: "Servo Motor",
    description: "Provides precise physical actuation to rotate the facade louvers to the computed target angle.",
    icon: RotateCw,
    color: "text-blue-400"
  },
  {
    name: "I2C LCD Display (16x2)",
    description: "Provides real-time local readouts of system status, temperature, and tracking angles without needing a computer.",
    icon: Monitor,
    color: "text-sky-400"
  },
  {
    name: "Potentiometers",
    description: "Variable resistors utilized in the prototype to manually simulate wind gusts and rain sensor inputs.",
    icon: SlidersHorizontal,
    color: "text-purple-400"
  },
  {
    name: "Physical Prototype Housing",
    description: "Custom-built kinetic structure to house the electronics and demonstrate the moving facade mechanics in real life.",
    icon: Box,
    color: "text-gray-300"
  }
]

export function ComponentsSection() {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  return (
    <SectionWrapper id="components" className="relative bg-transparent overflow-hidden">
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_top,rgba(16,185,129,0.05),transparent_70%)]" />
      
      <div className="flex flex-col items-center text-center gap-6 mb-16">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-emerald-400"
        >
          Hardware Architecture
        </motion.div>
        
        <h2 className="text-4xl md:text-5xl font-sans tracking-tighter text-white">
          System <span className="text-emerald-400">Components</span>
        </h2>
        <p className="text-gray-400 max-w-2xl">
          The physical building blocks that bring the AI-driven kinetic facade to life. Hover over components to view 3D models.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 max-w-7xl mx-auto">
        {COMPONENTS.map((item, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ delay: idx * 0.1, duration: 0.5 }}
            onMouseEnter={() => setHoveredIdx(idx)}
            onMouseLeave={() => setHoveredIdx(null)}
          >
            <GlassCard className="h-full group" innerClassName="p-6 flex flex-col gap-4 hover:bg-white/5 transition-colors duration-500 relative h-full min-h-[220px] overflow-hidden">
              <div className={`flex items-center gap-4 mb-2 relative z-10 transition-opacity duration-300 ${hoveredIdx === idx && item.name === "ESP32 Microcontroller" ? "opacity-0" : "opacity-100"}`}>
                <div className={`w-12 h-12 rounded-xl bg-navy border border-white/10 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-500`}>
                  <item.icon className={`w-6 h-6 ${item.color}`} />
                </div>
                <h3 className="text-lg font-bold text-white tracking-tight leading-tight">
                  {item.name}
                </h3>
              </div>
              <p className={`text-sm text-gray-400 leading-relaxed relative z-10 transition-opacity duration-300 ${hoveredIdx === idx && item.name === "ESP32 Microcontroller" ? "opacity-0" : "opacity-100"}`}>
                {item.description}
              </p>

              {/* 3D Model Overlay */}
              <AnimatePresence>
                {hoveredIdx === idx && item.name === "ESP32 Microcontroller" && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.3 }}
                    className="absolute inset-0 z-20 bg-navy/90 backdrop-blur-md flex flex-col items-center justify-center rounded-[inherit]"
                  >
                    <div className="w-full h-full absolute inset-0 cursor-grab active:cursor-grabbing">
                      <Canvas camera={{ position: [0, 2, 6], fov: 45 }}>
                        <ambientLight intensity={1.5} />
                        <directionalLight position={[5, 10, 5]} intensity={3} />
                        <Environment preset="city" />
                        <ESP32Model />
                        <ContactShadows position={[0, -1, 0]} opacity={0.6} scale={10} blur={2} far={4} color="#00D084" />
                      </Canvas>
                    </div>
                    <span className="absolute bottom-4 text-[10px] font-mono text-emerald-400 tracking-widest uppercase z-30 bg-black/50 px-3 py-1 rounded-full border border-emerald-500/30">
                      ESP32-S3 3D View
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </GlassCard>
          </motion.div>
        ))}
      </div>
    </SectionWrapper>
  )
}
