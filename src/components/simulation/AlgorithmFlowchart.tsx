import React from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert, CloudRain, ThermometerSun, Sun, ArrowDown } from 'lucide-react';
import { GlassCard } from '../ui/GlassCard';

const FLOW_STEPS = [
  {
    priority: "Priority 1",
    title: "Safety Override (Storm / Rain)",
    condition: "Wind Speed > 40 km/h OR Rain = TRUE",
    action: "Close Louvers (0°)",
    reason: "Protects the kinetic mechanisms and building envelope from physical damage and water ingress.",
    icon: ShieldAlert,
    color: "text-red-400",
    border: "border-red-500/30",
    bg: "bg-red-500/10"
  },
  {
    priority: "Priority 2",
    title: "Diffuse Light Mode (Overcast)",
    condition: "Cloud Cover > 80% & Irradiance < 200 W/m²",
    action: "Open Louvers (45° - 90°)",
    reason: "Maximizes the intake of diffuse ambient daylight when direct glare is not an issue, reducing artificial lighting loads.",
    icon: CloudRain,
    color: "text-sky-400",
    border: "border-sky-500/30",
    bg: "bg-sky-500/10"
  },
  {
    priority: "Priority 3",
    title: "Thermal Management",
    condition: "Indoor Temp > 24°C",
    action: "Close/Angle Louvers (0° - 30°)",
    reason: "Blocks direct solar radiation from entering the building to prevent overheating and reduce HVAC cooling demands.",
    icon: ThermometerSun,
    color: "text-amber-400",
    border: "border-amber-500/30",
    bg: "bg-amber-500/10"
  },
  {
    priority: "Priority 4",
    title: "Active Solar Tracking",
    condition: "Normal Weather Conditions",
    action: "Dynamic Angle Tracking",
    reason: "Louvers dynamically track the solar elevation angle. They block direct sun rays while bouncing indirect daylight onto the ceiling.",
    icon: Sun,
    color: "text-emerald-400",
    border: "border-emerald-500/30",
    bg: "bg-emerald-500/10"
  }
];

export function AlgorithmFlowchart() {
  return (
    <div className="mt-16 mb-8 w-full max-w-4xl mx-auto relative z-10">
      <div className="text-center mb-10">
        <h2 className="text-2xl font-bold tracking-tight text-white mb-2">Decision Tree Logic</h2>
        <p className="text-gray-400 text-sm">
          The system evaluates environmental conditions sequentially from top to bottom. 
          Higher priorities will always override lower priorities.
        </p>
      </div>

      <div className="relative">
        {/* Connecting Line */}
        <div className="absolute left-8 md:left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-red-500/50 via-amber-500/50 to-emerald-500/50 -translate-x-1/2" />

        <div className="flex flex-col gap-6">
          {FLOW_STEPS.map((step, idx) => (
            <motion.div 
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ delay: idx * 0.15 }}
              className={`relative flex flex-col md:flex-row items-center gap-6 ${
                idx % 2 === 0 ? "md:flex-row-reverse" : ""
              }`}
            >
              {/* Timeline Dot / Icon */}
              <div className={`absolute left-8 md:left-1/2 -translate-x-1/2 w-12 h-12 rounded-full border border-white/20 bg-[#0a1128] z-10 flex items-center justify-center shadow-lg ${step.bg}`}>
                <step.icon className={`w-5 h-5 ${step.color}`} />
              </div>

              {/* Empty space for alternating layout on desktop */}
              <div className="hidden md:block w-1/2" />

              {/* Card */}
              <div className="w-full pl-20 md:pl-0 md:w-1/2">
                <GlassCard className={`w-full ${idx % 2 === 0 ? "md:mr-10" : "md:ml-10"}`} innerClassName={`p-5 flex flex-col gap-3 border-t-2 ${step.border}`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-mono tracking-widest uppercase px-2 py-1 rounded-sm bg-black/30 ${step.color}`}>
                      {step.priority}
                    </span>
                    <span className="text-xs font-mono text-gray-500">IF</span>
                  </div>
                  
                  <div>
                    <h3 className="text-lg font-bold text-white mb-1">{step.title}</h3>
                    <p className="text-sm font-mono text-gray-300 bg-black/20 p-2 rounded border border-white/5">
                      {step.condition}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 mt-2 pt-3 border-t border-white/10">
                    <ArrowDown className={`w-4 h-4 ${step.color}`} />
                    <span className="text-sm font-bold text-white">{step.action}</span>
                  </div>
                  
                  <p className="text-xs text-gray-400 leading-relaxed mt-1">
                    {step.reason}
                  </p>
                </GlassCard>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
