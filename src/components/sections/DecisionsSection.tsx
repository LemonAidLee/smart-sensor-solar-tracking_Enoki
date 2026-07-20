"use client"

import { motion } from "framer-motion"
import { SectionWrapper } from "@/components/layout/SectionWrapper"
import { GlassCard } from "@/components/ui/GlassCard"
import { CloudRain, Sun, Wind, Lightbulb } from "lucide-react"

const DECISIONS = [
  {
    icon: CloudRain,
    condition: "Cloud detected • Irradiance ↓ • Rain predicted",
    decision: "Return panels to safe neutral position.",
    color: "from-blue-500/20 to-transparent",
    iconColor: "text-blue-400"
  },
  {
    icon: Sun,
    condition: "High sunlight • Low wind • Cool temp",
    decision: "Maximize solar shading angle (60°).",
    color: "from-amber-500/20 to-transparent",
    iconColor: "text-amber-400"
  },
  {
    icon: Wind,
    condition: "Strong wind • Storm warning active",
    decision: "Lock façade flush to building to prevent damage.",
    color: "from-rose-500/20 to-transparent",
    iconColor: "text-rose-400"
  },
  {
    icon: Lightbulb,
    condition: "Indoor Lux < 300 • Occupancy active",
    decision: "Open panels to increase natural daylight.",
    color: "from-emerald-500/20 to-transparent",
    iconColor: "text-emerald"
  }
]

export function DecisionsSection() {
  return (
    <SectionWrapper id="decisions" className="relative bg-transparent overflow-hidden">
      <div className="absolute inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,black_40%,transparent_100%)]" />
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_bottom_left,rgba(56,189,248,0.05),transparent_60%)]" />
      <div className="flex flex-col items-center text-center gap-6 mb-20">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="rounded-full border border-blue-400/30 bg-blue-400/10 px-4 py-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-blue-400"
        >
          AI Decision Logic
        </motion.div>
        
        <h2 className="text-4xl md:text-5xl lg:text-6xl font-sans tracking-tighter text-white max-w-3xl">
          Context-Aware <br className="hidden lg:block"/> Edge Computing
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
        {DECISIONS.map((item, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ delay: idx * 0.1, duration: 0.6 }}
          >
            <GlassCard className="h-full group" innerClassName={`p-8 bg-gradient-to-br ${item.color} flex flex-col gap-6 transition-all duration-500 group-hover:bg-white/10`}>
              
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-navy border border-white/10 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-500">
                  <item.icon className={`w-5 h-5 ${item.iconColor}`} />
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] text-gray-500 uppercase tracking-widest font-mono">Condition</span>
                  <span className="text-sm font-medium text-gray-300">{item.condition}</span>
                </div>
              </div>

              <div className="w-full h-[1px] bg-white/10 relative">
                <motion.div 
                  className={`absolute left-0 top-0 h-full w-0 bg-gradient-to-r from-transparent ${item.iconColor.replace('text-', 'via-')} to-transparent opacity-50`}
                  whileInView={{ w: "100%" }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                />
              </div>

              <div className="flex flex-col">
                <span className="text-[10px] text-gray-500 uppercase tracking-widest font-mono mb-2">Action Executed</span>
                <span className="text-xl font-bold text-white tracking-tight leading-snug">
                  {item.decision}
                </span>
              </div>
              
            </GlassCard>
          </motion.div>
        ))}
      </div>
    </SectionWrapper>
  )
}
