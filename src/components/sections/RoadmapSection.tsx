"use client"

import { motion } from "framer-motion"
import { SectionWrapper } from "@/components/layout/SectionWrapper"

const MILESTONES = [
  {
    phase: "Phase 1",
    title: "Proof of Concept",
    desc: "Single mechanical unit validated. Sensor fusion baseline established using Arduino Nano.",
    status: "completed"
  },
  {
    phase: "Phase 2",
    title: "The Scale Model",
    desc: "1:10 scale prototype with 7 active panels. ESP32 integration for Edge AI processing.",
    status: "current"
  },
  {
    phase: "Phase 3",
    title: "Building Integration Pilot",
    desc: "Full-scale single window installation on a commercial facade. Testing weather durability.",
    status: "future"
  },
  {
    phase: "Phase 4",
    title: "Commercial Deployment",
    desc: "Mass-manufacturable kinetic modules with centralized AWS IoT Core digital twin dashboard.",
    status: "future"
  }
]

export function RoadmapSection() {
  return (
    <SectionWrapper id="roadmap" className="relative bg-transparent overflow-hidden">
      <div className="absolute inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,black_40%,transparent_100%)]" />
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,rgba(0,208,132,0.05),transparent_60%)]" />
      <div className="flex flex-col items-center text-center gap-6 mb-24">
        <h2 className="text-4xl md:text-5xl font-sans tracking-tighter text-white">
          Development <span className="text-gradient-primary">Roadmap</span>
        </h2>
      </div>

      <div className="max-w-4xl mx-auto relative">
        {/* Timeline Line */}
        <div className="absolute left-4 md:left-1/2 top-0 bottom-0 w-[1px] bg-white/10 md:-translate-x-1/2" />

        <div className="flex flex-col gap-12">
          {MILESTONES.map((item, idx) => {
            const isEven = idx % 2 === 0
            
            return (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.6 }}
                className={`flex flex-col md:flex-row items-center relative w-full ${isEven ? "md:justify-start" : "md:justify-end"}`}
              >
                {/* Center Node */}
                <div className="absolute left-4 md:left-1/2 w-4 h-4 rounded-full bg-background border-2 border-emerald md:-translate-x-1/2 flex items-center justify-center z-10 shadow-[0_0_15px_rgba(0,208,132,0.5)]">
                  {item.status === "current" && (
                    <motion.div 
                      animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                      className="absolute inset-0 bg-emerald rounded-full"
                    />
                  )}
                  {item.status === "completed" && <div className="w-1.5 h-1.5 bg-emerald rounded-full" />}
                </div>

                {/* Content Card */}
                <div className={`w-[calc(100%-3rem)] ml-12 md:ml-0 md:w-[45%] ${isEven ? "md:pr-12 md:text-right" : "md:pl-12 md:text-left"}`}>
                  <div className={`flex flex-col gap-3 p-6 rounded-2xl border ${item.status === "current" ? "bg-emerald/5 border-emerald/30" : "bg-white/5 border-white/10"}`}>
                    <span className="text-[10px] uppercase tracking-widest font-mono text-gray-500">{item.phase}</span>
                    <h3 className="text-xl font-bold text-white tracking-tight">{item.title}</h3>
                    <p className="text-sm text-gray-400 leading-relaxed">{item.desc}</p>
                  </div>
                </div>

              </motion.div>
            )
          })}
        </div>
      </div>
    </SectionWrapper>
  )
}
