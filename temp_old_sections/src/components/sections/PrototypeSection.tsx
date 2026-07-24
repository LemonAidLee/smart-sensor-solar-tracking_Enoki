"use client"

import { motion } from "framer-motion"
import { SectionWrapper } from "@/components/layout/SectionWrapper"
import { GlassCard } from "@/components/ui/GlassCard"
import { Play } from "lucide-react"

export function PrototypeSection() {
  return (
    <SectionWrapper id="prototype" className="relative bg-transparent overflow-hidden">
      <div className="absolute inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,black_40%,transparent_100%)]" />
      <div className="flex flex-col items-center text-center gap-6 mb-20">
        <h2 className="text-4xl md:text-5xl font-sans tracking-tighter text-white">
          The <span className="text-gradient-primary">Prototype</span>
        </h2>
        <p className="text-gray-400 max-w-xl">
          From concept to reality. 
          A 1:10 scale physical model validating our kinematic equations and sensor fusion latency.
        </p>
      </div>

      <div className="max-w-6xl mx-auto flex flex-col gap-12">
        {/* Main Video / Image Area */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="w-full aspect-video md:aspect-[21/9] rounded-3xl overflow-hidden relative group cursor-pointer border border-white/10"
        >
          {/* Abstract Placeholder for Prototype Video/Image */}
          <div className="absolute inset-0 bg-gradient-to-br from-navy to-background flex items-center justify-center">
            {/* Grid Pattern */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px] opacity-30" />
            
            {/* Animated CAD placeholder */}
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              className="w-64 h-64 border border-emerald/30 rounded-lg flex items-center justify-center relative"
            >
              <div className="absolute inset-0 border border-emerald/50 rounded-lg rotate-45" />
              <span className="text-emerald font-mono uppercase tracking-widest text-xs rotate-[-360]">CAD Render Loading...</span>
            </motion.div>
          </div>

          <div className="absolute inset-0 bg-black/40 group-hover:bg-black/20 transition-colors flex items-center justify-center backdrop-blur-[2px] group-hover:backdrop-blur-0">
             <div className="w-20 h-20 rounded-full bg-emerald/90 flex items-center justify-center text-navy shadow-[0_0_30px_rgba(0,208,132,0.6)] group-hover:scale-110 transition-transform">
               <Play className="w-8 h-8 ml-1" />
             </div>
          </div>
        </motion.div>

        {/* Gallery */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((item) => (
             <GlassCard key={item} className="aspect-square" innerClassName="flex flex-col items-center justify-center relative group p-0 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent z-10" />
                <motion.div 
                  className="w-32 h-32 border border-white/20 rounded-full flex items-center justify-center relative"
                  animate={{ scale: [1, 1.05, 1] }}
                  transition={{ duration: 3, repeat: Infinity, delay: item }}
                >
                   <span className="text-xs text-gray-500 font-mono tracking-widest">IMG_{item}</span>
                </motion.div>
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent z-20 translate-y-full group-hover:translate-y-0 transition-transform">
                   <p className="text-sm text-white">Hardware Module 0{item}</p>
                </div>
             </GlassCard>
          ))}
        </div>
      </div>
    </SectionWrapper>
  )
}
