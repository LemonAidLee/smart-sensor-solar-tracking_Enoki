"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"

export function Preloader({ onComplete }: { onComplete: () => void }) {
  const [progress, setProgress] = useState(0)
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    // Artificial loading progression to ensure it feels deliberate and premium
    let currentProgress = 0
    
    const interval = setInterval(() => {
      // Slower, more erratic loading progression for a heavier cinematic feel
      currentProgress += Math.floor(Math.random() * 8) + 2
      
      if (currentProgress >= 100) {
        currentProgress = 100
        setProgress(100)
        clearInterval(interval)
        
        // Wait a longer beat at 100% to let anticipation build
        setTimeout(() => {
          setIsLoaded(true)
          setTimeout(onComplete, 1800) // allow the slow exit animation to finish
        }, 800)
      } else {
        setProgress(currentProgress)
      }
    }, 120)

    return () => clearInterval(interval)
  }, [onComplete])

  return (
    <AnimatePresence>
      {!isLoaded && (
        <motion.div
          initial={{ opacity: 1, y: 0 }}
          exit={{ 
            opacity: 0,
            y: "-100vh",
            filter: "blur(20px)"
          }}
          transition={{ duration: 1.6, ease: [0.76, 0, 0.24, 1] }}
          className="fixed inset-0 z-[9000] flex flex-col items-center justify-center bg-[#020205] text-white overflow-hidden"
        >
          {/* Subtle grid background */}
          <div className="absolute inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px] opacity-20" />
          
          <div className="relative z-10 flex flex-col items-center gap-12">
            <motion.div 
              className="overflow-hidden"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, ease: [0.76, 0, 0.24, 1] }}
            >
              <h1 className="text-3xl md:text-5xl font-mono tracking-[0.5em] font-light uppercase text-emerald drop-shadow-[0_0_15px_rgba(52,211,153,0.3)]">
                Solis
              </h1>
            </motion.div>
            
            <div className="text-8xl md:text-[12rem] font-sans font-light tracking-tighter tabular-nums leading-none">
              {progress}
              <span className="text-2xl md:text-4xl text-white/20 ml-4 font-sans">%</span>
            </div>

            <div className="w-64 h-[2px] bg-white/5 relative overflow-hidden">
              <motion.div 
                className="absolute inset-y-0 left-0 bg-emerald shadow-[0_0_10px_rgba(52,211,153,0.8)]"
                initial={{ width: "0%" }}
                animate={{ width: `${progress}%` }}
                transition={{ ease: "circOut", duration: 0.3 }}
              />
            </div>
            
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: progress > 50 ? 1 : 0 }}
              transition={{ duration: 0.8 }}
              className="text-xs font-mono tracking-[0.3em] text-white/30 uppercase"
            >
              Predictive Building Intelligence
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
