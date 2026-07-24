"use client"

import { motion } from "framer-motion"
import { SectionWrapper } from "@/components/layout/SectionWrapper"
import { ArrowDown } from "lucide-react"

const WORKFLOW = [
  { step: "Collect Sensor Data", latency: "10ms" },
  { step: "Normalize Data", latency: "5ms" },
  { step: "Sensor Fusion", latency: "15ms" },
  { step: "Predict Sun Position", latency: "50ms" },
  { step: "Evaluate Weather", latency: "200ms" },
  { step: "Calculate Optimal Angle", latency: "30ms" },
  { step: "Move Façade", latency: "Action" },
  { step: "Monitor Results", latency: "Loop" }
]

export function BrainSection() {
  return (
    <SectionWrapper id="ai-brain" className="relative bg-transparent overflow-hidden">
      
      {/* Subtle Grid and Glow Background */}
      <div className="absolute inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,black_40%,transparent_100%)]" />
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.05),transparent_60%)]" />

      {/* Large Faded Watermark */}
      <div className="absolute right-[-10%] top-1/4 z-0 select-none pointer-events-none opacity-[0.03]">
        <h1 className="text-[15rem] font-bold tracking-tighter text-white font-sans leading-none whitespace-nowrap">AI CORE</h1>
      </div>

      <div className="flex flex-col items-center text-center gap-6 mb-20 relative z-10">
        <h2 className="text-4xl md:text-5xl lg:text-6xl font-sans tracking-tighter text-white">
          The Mechatronic <span className="text-gradient-primary">Brain</span>
        </h2>
        <p className="text-gray-400 max-w-xl">
          Turning multiple data sources into intelligent decisions in milliseconds. 
          Our neural network processes environmental inputs to compute the optimal kinetic response.
        </p>
      </div>

      <div className="relative flex flex-col lg:flex-row items-center justify-between max-w-6xl mx-auto gap-16">
        
        {/* Left: Glowing Neural Network Animation */}
        <div className="w-full lg:w-1/2 relative h-[500px] flex items-center justify-center">
          <div className="absolute inset-0 bg-emerald/5 blur-[100px] rounded-full" />
          
          <svg className="w-full h-full" viewBox="0 0 500 500" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Layers */}
            {[100, 250, 400].map((cx, layerIdx) => (
              [100, 250, 400].map((cy, nodeIdx) => (
                <motion.circle
                  key={`node-${layerIdx}-${nodeIdx}`}
                  cx={cx}
                  cy={cy}
                  r={layerIdx === 1 ? 15 : 10}
                  fill={layerIdx === 2 ? "#38BDF8" : "#00D084"}
                  className="drop-shadow-[0_0_15px_rgba(0,208,132,0.8)]"
                  animate={{ scale: [1, 1.2, 1], opacity: [0.7, 1, 0.7] }}
                  transition={{ duration: 2 + nodeIdx, repeat: Infinity, delay: layerIdx * 0.5 }}
                />
              ))
            ))}

            {/* Connections */}
            {[100, 250, 400].map((y1, i) => (
              [100, 250, 400].map((y2, j) => (
                <g key={`line-1-${i}-${j}`}>
                  <line x1="100" y1={y1} x2="250" y2={y2} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                  <motion.circle r="3" fill="#ffffff"
                    animate={{ cx: [100, 250], cy: [y1, y2], opacity: [0, 1, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, delay: (i+j)*0.2 }}
                  />
                </g>
              ))
            ))}
            
            {[100, 250, 400].map((y1, i) => (
              [100, 250, 400].map((y2, j) => (
                <g key={`line-2-${i}-${j}`}>
                  <line x1="250" y1={y1} x2="400" y2={y2} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
                  <motion.circle r="3" fill="#38BDF8"
                    animate={{ cx: [250, 400], cy: [y1, y2], opacity: [0, 1, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, delay: (i+j)*0.2 }}
                  />
                </g>
              ))
            ))}
          </svg>

          {/* Stats Overlay */}
          <div className="absolute bottom-10 left-10 flex flex-col gap-2 bg-black/50 backdrop-blur-md p-4 rounded-xl border border-white/10">
            <span className="text-[10px] text-gray-400 uppercase tracking-widest">Prediction Accuracy</span>
            <span className="text-2xl font-mono text-emerald font-bold">98.4%</span>
          </div>
        </div>

        {/* Right: Vertical Workflow */}
        <div className="w-full lg:w-1/2 flex flex-col gap-0 relative">
          <div className="absolute left-6 top-6 bottom-6 w-[1px] bg-white/10" />
          
          {WORKFLOW.map((item, idx) => (
            <motion.div 
              key={idx}
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ delay: idx * 0.1 }}
              className="flex items-center gap-6 p-4 relative group"
            >
              <div className="relative z-10 w-12 h-12 rounded-full bg-navy border border-white/20 flex items-center justify-center shadow-lg group-hover:border-emerald transition-colors">
                {idx === WORKFLOW.length - 1 ? (
                  <div className="w-3 h-3 rounded-full bg-emerald animate-pulse" />
                ) : (
                  <ArrowDown className="w-4 h-4 text-gray-400 group-hover:text-emerald transition-colors" />
                )}
              </div>
              
              <div className="flex flex-col bg-white/5 border border-transparent group-hover:border-white/10 rounded-xl p-4 w-full backdrop-blur-sm transition-all group-hover:bg-white/10">
                <span className="text-white font-medium">{item.step}</span>
                <span className="text-xs font-mono text-electric mt-1">Latency: {item.latency}</span>
              </div>
            </motion.div>
          ))}
        </div>

      </div>
    </SectionWrapper>
  )
}
