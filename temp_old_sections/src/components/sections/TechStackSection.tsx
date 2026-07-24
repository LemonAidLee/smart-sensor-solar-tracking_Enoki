"use client"

import { motion } from "framer-motion"
import { SectionWrapper } from "@/components/layout/SectionWrapper"
import { GlassCard } from "@/components/ui/GlassCard"

const CATEGORIES = [
  {
    name: "Sensors",
    color: "from-blue-500/20 to-transparent border-blue-500/20",
    items: ["LDR Array", "Pyranometer", "Rain Sensor", "Temperature", "Humidity", "Wind Anemometer", "PIR", "CO₂ NDIR"]
  },
  {
    name: "Hardware",
    color: "from-emerald-500/20 to-transparent border-emerald-500/20",
    items: ["ESP32 Master", "Arduino Nano Nodes", "Raspberry Pi 4", "Motor Drivers"]
  },
  {
    name: "Actuators",
    color: "from-amber-500/20 to-transparent border-amber-500/20",
    items: ["High-Torque Servo", "NEMA 17 Stepper", "Linear Actuator"]
  },
  {
    name: "Software & Cloud",
    color: "from-purple-500/20 to-transparent border-purple-500/20",
    items: ["MQTT Broker", "Node-RED", "Python / C++", "TensorFlow Lite", "OpenCV", "Firebase Realtime DB", "AWS IoT Core"]
  }
]

export function TechStackSection() {
  return (
    <SectionWrapper id="technology" className="relative bg-transparent overflow-hidden">
      <div className="absolute inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,black_40%,transparent_100%)]" />
      <div className="flex flex-col items-center text-center gap-6 mb-20">
        <h2 className="text-4xl md:text-5xl font-sans tracking-tighter text-white">
          Full-Stack <span className="text-gradient-primary">Engineering</span>
        </h2>
        <p className="text-gray-400 max-w-xl">
          An integrated mechatronic ecosystem spanning hardware sensors, edge computing, and cloud infrastructure.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto">
        {CATEGORIES.map((cat, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ delay: idx * 0.1, duration: 0.6 }}
          >
            <GlassCard className="h-full group" innerClassName={`p-6 bg-gradient-to-b ${cat.color} flex flex-col gap-6`}>
              <h3 className="text-xl font-bold text-white tracking-tight">{cat.name}</h3>
              <div className="flex flex-col gap-3">
                {cat.items.map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <div className="w-1.5 h-1.5 rounded-full bg-white/20 group-hover:bg-white/60 transition-colors" />
                    <span className="text-sm font-mono text-gray-300">{item}</span>
                  </div>
                ))}
              </div>
            </GlassCard>
          </motion.div>
        ))}
      </div>
    </SectionWrapper>
  )
}
