"use client"

import { motion } from "framer-motion"
import { SectionWrapper } from "@/components/layout/SectionWrapper"
import { GlassCard } from "@/components/ui/GlassCard"
import { Linkedin, Github } from "@/components/ui/Icons"

const TEAM = [
  { name: "Alex Chen", role: "Mechatronics Lead", initials: "AC" },
  { name: "Sarah Jenkins", role: "AI & Sensor Fusion", initials: "SJ" },
  { name: "David Kim", role: "Architecture & Design", initials: "DK" },
  { name: "Elena Rodriguez", role: "Systems Engineering", initials: "ER" }
]

export function TeamSection() {
  return (
    <SectionWrapper id="team" className="relative bg-transparent overflow-hidden">
      <div className="absolute inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,black_40%,transparent_100%)]" />
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.05),transparent_60%)]" />
      <div className="flex flex-col items-center text-center gap-6 mb-20">
        <h2 className="text-4xl md:text-5xl font-sans tracking-tighter text-white">
          The <span className="text-gradient-primary">Team</span>
        </h2>
        <p className="text-gray-400 max-w-xl">
          A multidisciplinary group of engineers bridging the gap between architecture, robotics, and artificial intelligence.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
        {TEAM.map((member, idx) => (
          <motion.div
            key={idx}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ delay: idx * 0.1, duration: 0.6 }}
          >
            <GlassCard className="h-full group" innerClassName="p-6 flex flex-col items-center text-center gap-6 relative overflow-hidden">
               
               {/* Abstract Avatar */}
               <div className="w-24 h-24 rounded-full bg-navy border border-white/20 flex items-center justify-center relative z-10 group-hover:border-electric transition-colors duration-500">
                  <span className="text-2xl font-sans font-bold text-gray-300 group-hover:text-electric transition-colors">{member.initials}</span>
                  
                  {/* Rotating dashed border on hover */}
                  <div className="absolute inset-0 rounded-full border border-dashed border-electric opacity-0 group-hover:opacity-100 group-hover:animate-[spin_4s_linear_infinite]" />
               </div>

               <div className="flex flex-col relative z-10">
                 <h3 className="text-lg font-bold text-white mb-1">{member.name}</h3>
                 <span className="text-xs text-electric uppercase tracking-widest font-mono">{member.role}</span>
               </div>

               <div className="flex items-center gap-4 relative z-10 mt-2 opacity-0 group-hover:opacity-100 transition-opacity translate-y-4 group-hover:translate-y-0 duration-300">
                 <a href="#" className="w-8 h-8 rounded-full bg-white/10 hover:bg-electric hover:text-navy text-white flex items-center justify-center transition-colors">
                   <Linkedin className="w-4 h-4" />
                 </a>
                 <a href="#" className="w-8 h-8 rounded-full bg-white/10 hover:bg-electric hover:text-navy text-white flex items-center justify-center transition-colors">
                   <Github className="w-4 h-4" />
                 </a>
               </div>

               {/* Background glow on hover */}
               <div className="absolute -bottom-10 -right-10 w-32 h-32 bg-electric/20 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            </GlassCard>
          </motion.div>
        ))}
      </div>
    </SectionWrapper>
  )
}
