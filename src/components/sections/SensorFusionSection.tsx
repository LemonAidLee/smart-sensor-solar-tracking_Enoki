"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { SectionWrapper } from "@/components/layout/SectionWrapper"
import { Sun, CloudRain, Wind, Thermometer, Users, Cloud, Lightbulb, Activity } from "lucide-react"

const NODES = [
  { id: "solar", label: "Solar Sensor", icon: Sun, color: "text-amber-400", bg: "bg-amber-400/20", border: "border-amber-400/30", desc: "Measures solar irradiance (W/m²) using LDR & Pyranometer." },
  { id: "weather", label: "Weather API", icon: CloudRain, color: "text-blue-400", bg: "bg-blue-400/20", border: "border-blue-400/30", desc: "Fetches live forecasting for rain, storms, and cloud cover." },
  { id: "wind", label: "Wind Sensor", icon: Wind, color: "text-gray-300", bg: "bg-gray-300/20", border: "border-gray-300/30", desc: "Anemometer monitors wind speed to trigger safety locks." },
  { id: "temp", label: "Indoor Temp", icon: Thermometer, color: "text-rose-400", bg: "bg-rose-400/20", border: "border-rose-400/30", desc: "Closed-loop feedback to maintain 22-24°C comfort zone." },
  { id: "occ", label: "Occupancy", icon: Users, color: "text-emerald", bg: "bg-emerald/20", border: "border-emerald/30", desc: "PIR sensors determine if shading is needed for humans." },
  { id: "cloud", label: "Cloud Detect", icon: Cloud, color: "text-slate-400", bg: "bg-slate-400/20", border: "border-slate-400/30", desc: "Detects passing clouds to avoid unnecessary micro-movements." },
  { id: "light", label: "Daylight", icon: Lightbulb, color: "text-yellow-200", bg: "bg-yellow-200/20", border: "border-yellow-200/30", desc: "Ensures minimum required lux levels for reading/working." },
]

export function SensorFusionSection() {
  const [activeNode, setActiveNode] = useState<string | null>(null)

  return (
    <SectionWrapper id="sensor-fusion" className="relative bg-transparent overflow-hidden">
      
      {/* Subtle Grid and Glow Background */}
      <div className="absolute inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,black_40%,transparent_100%)]" />
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,rgba(0,208,132,0.05),transparent_60%)]" />

      <div className="relative z-10 flex flex-col items-center text-center gap-6 mb-20">
        <h2 className="text-4xl md:text-5xl lg:text-6xl font-sans tracking-tighter text-white">
          Sensor Fusion Network
        </h2>
        <p className="text-gray-400 max-w-xl">
          A single sensor can be wrong. Our fusion engine aggregates multiple data streams to construct an accurate environmental twin.
        </p>
      </div>

      <div className="relative w-full max-w-4xl mx-auto h-[600px] flex items-center justify-center">
        {/* Central Brain */}
        <div className="absolute z-20 flex flex-col items-center justify-center">
          <motion.div 
            animate={{ boxShadow: ["0 0 20px rgba(0,208,132,0.2)", "0 0 60px rgba(0,208,132,0.6)", "0 0 20px rgba(0,208,132,0.2)"] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="w-32 h-32 rounded-full bg-navy border border-emerald/50 flex flex-col items-center justify-center relative backdrop-blur-md"
          >
            <Activity className="w-10 h-10 text-emerald mb-1" />
            <span className="text-[10px] font-mono text-emerald uppercase tracking-widest font-bold">AI Brain</span>
          </motion.div>
        </div>

        {/* Orbiting Nodes */}
        {NODES.map((node, index) => {
          const angle = (index / NODES.length) * Math.PI * 2
          const radius = 220
          const x = Math.cos(angle) * radius
          const y = Math.sin(angle) * radius

          const isActive = activeNode === node.id

          return (
            <motion.div
              key={node.id}
              initial={{ opacity: 0, scale: 0 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1, type: "spring", stiffness: 100 }}
              className="absolute z-30"
              style={{ x, y }}
              onMouseEnter={() => setActiveNode(node.id)}
              onMouseLeave={() => setActiveNode(null)}
            >
              {/* Connecting Line (SVG) */}
              <svg className="absolute top-1/2 left-1/2 -z-10 overflow-visible pointer-events-none">
                <motion.line
                  x1="0" y1="0"
                  x2={-x} y2={-y}
                  stroke={isActive ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.1)"}
                  strokeWidth="1.5"
                  strokeDasharray="4 4"
                />
                {/* Data flow particle */}
                <motion.circle
                  r="3"
                  fill="#ffffff"
                  initial={{ cx: 0, cy: 0, opacity: 0 }}
                  animate={{ 
                    cx: [-x * 0.1, -x * 0.9], 
                    cy: [-y * 0.1, -y * 0.9],
                    opacity: [0, 1, 0]
                  }}
                  transition={{ 
                    duration: 2, 
                    repeat: Infinity, 
                    delay: index * 0.5,
                    ease: "linear"
                  }}
                />
              </svg>

              <div className="relative group cursor-pointer">
                <div className={`w-16 h-16 rounded-full border ${node.border} ${node.bg} backdrop-blur-sm flex items-center justify-center transition-transform hover:scale-110`}>
                  <node.icon className={`w-6 h-6 ${node.color}`} />
                </div>
                
                <AnimatePresence>
                  {isActive && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.9 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.9 }}
                      className="absolute top-20 left-1/2 -translate-x-1/2 w-48 bg-navy/90 border border-white/10 rounded-xl p-3 shadow-2xl backdrop-blur-xl pointer-events-none"
                    >
                      <h4 className={`text-xs font-bold ${node.color} mb-1 uppercase tracking-wider`}>{node.label}</h4>
                      <p className="text-[11px] text-gray-300 leading-relaxed">{node.desc}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )
        })}
      </div>
    </SectionWrapper>
  )
}
