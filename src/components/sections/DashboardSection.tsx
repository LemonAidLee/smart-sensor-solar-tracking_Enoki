"use client"

import { motion } from "framer-motion"
import { SectionWrapper } from "@/components/layout/SectionWrapper"
import { GlassCard } from "@/components/ui/GlassCard"
import { Thermometer, Wind, CloudRain, Sun, Activity, Zap, Users, Battery } from "lucide-react"

const WIDGETS = [
  { label: "Live Temp", value: "24.2", unit: "°C", icon: Thermometer, trend: "+0.2", color: "text-rose-400" },
  { label: "Humidity", value: "58", unit: "%", icon: CloudRain, trend: "-1.5", color: "text-blue-400" },
  { label: "Solar Rad", value: "850", unit: "W/m²", icon: Sun, trend: "+12", color: "text-amber-400" },
  { label: "Wind Speed", value: "14.5", unit: "km/h", icon: Wind, trend: "+2.1", color: "text-slate-300" },
]

export function DashboardSection() {
  return (
    <SectionWrapper id="dashboard" className="relative bg-transparent overflow-hidden">
      <div className="absolute inset-0 z-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,black_40%,transparent_100%)]" />
      <div className="absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,rgba(0,208,132,0.05),transparent_60%)]" />
      <div className="flex flex-col items-center text-center gap-6 mb-16">
        <h2 className="text-4xl md:text-5xl font-sans tracking-tighter text-white">
          Digital Twin <span className="text-gradient-primary">Dashboard</span>
        </h2>
        <p className="text-gray-400 max-w-xl">
          Real-time monitoring and analytics. The Cockpit view gives building managers complete observability over the mechatronic system.
        </p>
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        
        {/* Top KPI Widgets */}
        {WIDGETS.map((widget, idx) => (
          <GlassCard key={idx} className="col-span-1" innerClassName="p-5 flex flex-col justify-between h-32">
            <div className="flex justify-between items-start">
               <span className="text-xs text-gray-400 uppercase tracking-widest">{widget.label}</span>
               <widget.icon className={`w-4 h-4 ${widget.color}`} />
            </div>
            <div className="flex items-end gap-2">
               <span className="text-3xl font-mono text-white font-bold">{widget.value}</span>
               <span className="text-sm font-mono text-gray-500 mb-1">{widget.unit}</span>
            </div>
          </GlassCard>
        ))}

        {/* Main Chart Area */}
        <GlassCard className="col-span-1 md:col-span-3 lg:col-span-2 row-span-2" innerClassName="p-6 flex flex-col">
          <div className="flex justify-between items-center mb-6">
             <span className="text-xs text-gray-400 uppercase tracking-widest">HVAC Load Reduction</span>
             <div className="flex items-center gap-2">
               <span className="w-2 h-2 rounded-full bg-emerald animate-pulse" />
               <span className="text-xs text-emerald font-mono">Live</span>
             </div>
          </div>
          
          <div className="flex-1 w-full flex items-end gap-2 relative">
             {/* Fake Chart Bars */}
             {[40, 65, 45, 80, 55, 90, 60, 40, 30, 75, 50, 85].map((h, i) => (
               <motion.div 
                 key={i}
                 className="flex-1 bg-electric/20 rounded-t-sm relative overflow-hidden"
                 style={{ height: `${h}%` }}
                 animate={{ height: [`${h}%`, `${Math.max(20, h - 20 + Math.random()*40)}%`, `${h}%`] }}
                 transition={{ duration: 3, repeat: Infinity, delay: i * 0.1 }}
               >
                 <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-electric/50" />
               </motion.div>
             ))}
             {/* Overlay trend line (abstract) */}
             <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="none">
               <motion.path 
                 d="M0,80 Q50,40 100,70 T200,30 T300,60" 
                 stroke="#38BDF8" strokeWidth="2" fill="none"
                 initial={{ pathLength: 0 }}
                 whileInView={{ pathLength: 1 }}
                 transition={{ duration: 2 }}
               />
             </svg>
          </div>
        </GlassCard>

        {/* Current Angle Gauge */}
        <GlassCard className="col-span-1 md:col-span-1 lg:col-span-1 row-span-1" innerClassName="p-5 flex flex-col items-center justify-center relative">
          <span className="text-xs text-gray-400 uppercase tracking-widest absolute top-5 left-5">Panel Angle</span>
          
          <div className="w-24 h-24 mt-4 rounded-full border-4 border-navy relative flex items-center justify-center">
             {/* Gauge arc */}
             <svg className="absolute inset-0 w-full h-full -rotate-90">
               <circle cx="48" cy="48" r="44" stroke="#00D084" strokeWidth="4" fill="none" strokeDasharray="276" strokeDashoffset="100" className="opacity-80" />
             </svg>
             <div className="flex flex-col items-center">
               <span className="text-2xl font-mono text-white font-bold">42°</span>
             </div>
          </div>
        </GlassCard>

        {/* System Status */}
        <GlassCard className="col-span-1 md:col-span-2 lg:col-span-1 row-span-1" innerClassName="p-5 flex flex-col gap-4">
          <span className="text-xs text-gray-400 uppercase tracking-widest mb-2">System Health</span>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Battery className="w-4 h-4 text-emerald" />
              <span className="text-sm text-gray-300 font-mono">Battery</span>
            </div>
            <span className="text-sm text-white font-mono">98%</span>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-400" />
              <span className="text-sm text-gray-300 font-mono">Occupancy</span>
            </div>
            <span className="text-sm text-white font-mono">Active</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-rose-400" />
              <span className="text-sm text-gray-300 font-mono">CO₂ Level</span>
            </div>
            <span className="text-sm text-white font-mono">420 ppm</span>
          </div>
        </GlassCard>

      </div>
    </SectionWrapper>
  )
}
