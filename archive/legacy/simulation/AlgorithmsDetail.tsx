"use client"

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard } from '../ui/GlassCard';
import { Calculator, Filter, Code2, Cpu } from 'lucide-react';

const ALGORITHMS = [
  {
    id: 'algo1',
    title: '1. Astronomical Solar Position',
    icon: Calculator,
    color: 'text-amber-400',
    description: 'Computes the exact solar elevation and azimuth based on latitude, longitude, and precise local time rather than relying purely on light sensors.',
    details: [
      { label: 'Equation of Time (EoT)', text: 'Corrects for the Earth elliptical orbit.' },
      { label: 'Local Solar Time (LST)', text: 'Adjusts local clock time based on longitude offset.' },
      { label: 'Elevation Angle', text: 'Calculated using declination, latitude, and hour angle.' }
    ],
    code: `function solarPosition(time, lat, lon):
  # Calculate Solar Declination
  decl = 23.45 * sin(deg2rad(360/365 * (dayOfYear + 284)))
  
  # Calculate Elevation
  elevation = asin(sin(decl)*sin(lat) + cos(decl)*cos(lat)*cos(hourAngle))
  
  return { elevation, azimuth }`
  },
  {
    id: 'algo2',
    title: '2. Sensor Data Processing',
    icon: Filter,
    color: 'text-sky-400',
    description: 'Cleans noisy raw sensor readings into trustworthy physical units using a 5-stage DSP (Digital Signal Processing) pipeline.',
    details: [
      { label: 'Range Validation', text: 'Rejects physically impossible outliers instantly.' },
      { label: 'Median Filter', text: 'A sliding window buffer removes single-sample spikes.' },
      { label: 'Exponential Moving Average', text: 'Smooths out high-frequency noise for stable readings.' },
      { label: 'Sensor Fusion', text: 'Detects clouds by comparing measured irradiance against clear-sky astronomical estimates.' }
    ],
    code: `function processSensors(raw):
  if outOfBounds(raw): return lastGoodValue
  
  buffer.push(raw)
  val = median(buffer)
  
  EMA = alpha * val + (1 - alpha) * prev_EMA
  
  cloudy = (EMA < clearSkyEstimate * 0.6)
  return EMA`
  },
  {
    id: 'algo3',
    title: '3. Hierarchical Decision Logic',
    icon: Code2,
    color: 'text-emerald-400',
    description: 'A priority-ordered state machine that balances the 25% cooling load reduction target with natural daylighting needs.',
    details: [
      { label: 'Thermal vs Daylight', text: 'Computes a weighted trade-off between thermal demand (T > 24°C) and interior illuminance (< 500 lux).' },
      { label: 'Fail-Safe Overrides', text: 'Storm and rain triggers completely bypass optimization logic.' }
    ],
    code: `function computeOptimalAngle(solar, sensors):
  thermalDemand = clamp((sensors.temp - 24) / 4, 0, 1)
  daylightHave = clamp(sensors.lux / 500, 0, 1)
  
  # Bias calculation
  openBias = (1 - thermalDemand) * (1 - daylightHave)
  
  target = blockAngle*thermalDemand + openBias*MAX_OPEN
  return clamp(target, MIN, MAX)`
  },
  {
    id: 'algo4',
    title: '4. Servo Kinematic Control',
    icon: Cpu,
    color: 'text-purple-400',
    description: 'Translates target angles into smooth, physical actuation without jitter or mechanical wear.',
    details: [
      { label: 'Rate Limiter', text: 'Restricts maximum angular velocity (e.g. max 2° per cycle) for smooth motion.' },
      { label: 'Deadband Filter', text: 'Ignores tiny target fluctuations (e.g. < 1.5°) to prevent continuous servo twitching.' },
      { label: 'PID Controller', text: 'Uses Proportional, Integral, and Derivative gains to approach targets smoothly.' }
    ],
    code: `function updateServo(targetAngle):
  # Ignore tiny noisy changes
  if abs(targetAngle - currentAngle) < DEADBAND:
    return currentAngle
    
  # Prevent violent jerks
  delta = clamp(targetAngle - currentAngle, -MAX_STEP, MAX_STEP)
  
  currentAngle += delta
  writePWM(currentAngle)`
  }
];

export function AlgorithmsDetail() {
  const [activeTab, setActiveTab] = useState(ALGORITHMS[0].id);
  const activeAlgo = ALGORITHMS.find(a => a.id === activeTab)!;

  return (
    <div className="w-full max-w-6xl mx-auto mt-24 mb-16 relative z-10">
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold tracking-tight text-white mb-4">Core Algorithms</h2>
        <p className="text-gray-400 max-w-2xl mx-auto">
          Deep dive into the 4 mathematical algorithms powering the ESP32 mechatronic brain.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        
        {/* TABS */}
        <div className="w-full lg:w-1/3 flex flex-col gap-3">
          {ALGORITHMS.map((algo) => (
            <button
              key={algo.id}
              onClick={() => setActiveTab(algo.id)}
              className={`flex items-center gap-4 p-4 rounded-xl border transition-all duration-300 text-left ${
                activeTab === algo.id 
                  ? "bg-white/10 border-white/20 shadow-[0_0_20px_rgba(255,255,255,0.05)]" 
                  : "bg-white/5 border-transparent hover:bg-white/10 opacity-70 hover:opacity-100"
              }`}
            >
              <div className={`p-2 rounded-lg bg-black/30 ${algo.color}`}>
                <algo.icon className="w-5 h-5" />
              </div>
              <span className="font-bold text-sm text-white">{algo.title}</span>
            </button>
          ))}
        </div>

        {/* CONTENT */}
        <div className="w-full lg:w-2/3">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
              className="h-full"
            >
              <GlassCard className="h-full" innerClassName="p-6 md:p-8 flex flex-col gap-6">
                
                <div className="flex items-center gap-4">
                  <div className={`p-3 rounded-xl bg-black/30 ${activeAlgo.color}`}>
                    <activeAlgo.icon className="w-6 h-6" />
                  </div>
                  <h3 className="text-2xl font-bold text-white">{activeAlgo.title}</h3>
                </div>

                <p className="text-gray-300 leading-relaxed text-sm md:text-base">
                  {activeAlgo.description}
                </p>

                <div className="flex flex-col gap-8 mt-2">
                  <div className="flex flex-col gap-4">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-white/10 pb-2">
                      Key Concepts
                    </h4>
                    <ul className="flex flex-col gap-4">
                      {activeAlgo.details.map((detail, idx) => (
                        <li key={idx} className="text-sm">
                          <span className={`font-bold ${activeAlgo.color} block mb-1`}>{detail.label}</span>
                          <span className="text-gray-400">{detail.text}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex flex-col gap-4 h-full min-w-0">
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest border-b border-white/10 pb-2">
                      ESP32 Pseudocode
                    </h4>
                    <div className="bg-[#0a1128] rounded-xl border border-white/10 p-4 w-full overflow-x-auto relative">
                      <pre className="text-xs md:text-sm font-mono text-gray-300 leading-relaxed whitespace-pre">
                        <code>{activeAlgo.code}</code>
                      </pre>
                    </div>
                  </div>
                </div>

              </GlassCard>
            </motion.div>
          </AnimatePresence>
        </div>

      </div>
    </div>
  );
}
