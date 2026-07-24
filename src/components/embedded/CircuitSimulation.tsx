'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LcdScreen } from './LcdScreen'
import { Esp32Board, type BoardPin } from './Esp32Board'
import type { EmbeddedState } from '@/lib/embedded'

interface CircuitProps {
  state: EmbeddedState
  pins: BoardPin[]
}

const W = 1000
const H = 820

export function CircuitSimulation({ state, pins }: CircuitProps) {
  const [hovered, setHovered] = useState<HoverData | null>(null)

  // Central Controller Zone
  const espX = 350
  const espY = 295
  
  return (
    <div className="relative w-full rounded-2xl border border-white/10 bg-[#e5e5e5] shadow-inner overflow-hidden aspect-[5/4] select-none" style={{ backgroundColor: '#1a1f2e' }}>
      
      {/* SVG Canvas for wires and modules */}
      <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 w-full h-full drop-shadow-md">
        
        {/* Background Grid and Zones */}
        <g stroke="rgba(255,255,255,0.03)" strokeWidth="1">
          {Array.from({ length: 25 }).map((_, i) => (
            <line key={`v${i}`} x1={i * 40} y1="0" x2={i * 40} y2={H} />
          ))}
          {Array.from({ length: 21 }).map((_, i) => (
            <line key={`h${i}`} x1="0" y1={i * 40} x2={W} y2={i * 40} />
          ))}
        </g>
        
        <g className="text-white/40 font-mono text-[13px] font-bold tracking-widest pointer-events-none uppercase">
          {/* Inputs Zone */}
          <rect x="40" y="40" width="920" height="120" fill="transparent" stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="4 4" rx="4" />
          <text x="50" y="55" fill="currentColor">Input Devices</text>
          
          {/* Controller Zone */}
          <rect x="330" y="270" width="340" height="260" fill="transparent" stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="4 4" rx="4" />
          <text x="340" y="285" fill="currentColor">Controller</text>

          {/* Outputs Zone */}
          <rect x="220" y="600" width="600" height="160" fill="transparent" stroke="rgba(255,255,255,0.15)" strokeWidth="1" strokeDasharray="4 4" rx="4" />
          <text x="230" y="615" fill="currentColor">Output Devices</text>
        </g>

        {/* Wires */}
        <Wiring state={state} pins={pins} espX={espX} espY={espY} />

        {/* Modules - Inputs (Top) */}
        <LdrModule x={60} y={90} label="LDR Upper" value={state.sensors.ldrUpper} onHover={setHovered} />
        <LdrModule x={190} y={90} label="LDR Lower" value={state.sensors.ldrLower} onHover={setHovered} />
        <DhtModule x={330} y={80} temp={state.sensors.temperature} hum={state.sensors.humidity} onHover={setHovered} />
        <PotModule x={460} y={70} label="Wind" value={state.sensors.wind} onHover={setHovered} />
        <PotModule x={580} y={70} label="Rain" value={state.sensors.rain} onHover={setHovered} />
        <PirModule x={730} y={75} value={state.sensors.pir} onHover={setHovered} />
        <SwitchModule x={860} y={95} on={state.sensors.pauseSwitch.raw > 0} onHover={setHovered} signal={state.sensors.pauseSwitch} />
        
        {/* Modules - Outputs (Bottom) */}
        <ServoModule x={580} y={650} angle={state.servo.servoPositionAngle} moving={state.servo.moving} onHover={setHovered} />
        <LedModule x={740} y={660} on={state.led.tracking} onHover={setHovered} />
        
      </svg>
      
      {/* ESP32 Board embedded as HTML overlay to reuse existing component perfectly */}
      <div className="absolute" style={{ left: `${(espX / W) * 100}%`, top: `${(espY / H) * 100}%`, width: `${(300 / W) * 100}%`, height: `${(230 / H) * 100}%` }}>
        <Esp32Board pins={pins} />
      </div>

      {/* LCD Screen embedded as HTML inside the Outputs zone */}
      <div className="absolute z-10" style={{ left: `${(260 / W) * 100}%`, top: `${(630 / H) * 100}%`, width: `${(240 / W) * 100}%` }}>
        <div 
          className="relative p-2 bg-[#125824] rounded-lg border-4 border-[#0c4019] shadow-[0_8px_32px_rgba(0,0,0,0.5)] cursor-pointer"
          onMouseEnter={(e) => setHovered({ name: '20x4 LCD', pin: 'I2C (SDA/SCL)', reading: 'Text output', unit: '', purpose: 'Displays system status', x: e.clientX, y: e.clientY })}
          onMouseLeave={() => setHovered(null)}
          onMouseMove={(e) => setHovered(h => h ? { ...h, x: e.clientX, y: e.clientY } : null)}
        >
          {/* LCD Pins overlay on the top edge */}
          <div className="absolute -top-[14px] left-10 flex gap-[3px]">
             {[0,1,2,3].map(i => <div key={i} className="w-[10px] h-[10px] bg-zinc-400 rounded-full border border-zinc-600" />)}
          </div>
          <LcdScreen lines={state.lcd} />
        </div>
      </div>

      {/* Tooltip Overlay */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="fixed z-50 pointer-events-none bg-black/90 backdrop-blur border border-white/20 p-3 rounded-xl shadow-2xl text-white transform -translate-x-1/2 -translate-y-[110%]"
            style={{ left: hovered.x, top: hovered.y }}
          >
            <p className="text-[11px] font-bold text-white mb-1.5 uppercase tracking-wider">{hovered.name}</p>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[10px]">
              <span className="text-white/50">Pin</span>
              <span className="font-mono text-emerald-400">{hovered.pin}</span>
              <span className="text-white/50">Reading</span>
              <span className="font-mono text-white">{hovered.reading} {hovered.unit}</span>
            </div>
            <p className="text-[10px] text-white/50 mt-2 max-w-[180px] leading-relaxed">{hovered.purpose}</p>
          </motion.div>
        )}
      </AnimatePresence>
      
    </div>
  )
}

// ─── Wiring ─────────────────────────────────────────────────────────────

// ─── Wiring ─────────────────────────────────────────────────────────────

function Wiring({ pins, espX, espY }: { state: EmbeddedState, pins: BoardPin[], espX: number, espY: number }) {
  const getPinY = (index: number, count: number) => espY + 14 + ((index + 0.5) / count) * 202
  const leftPins = pins.filter(p => p.side === 'left')
  const rightPins = pins.filter(p => p.side === 'right')
  
  const leftX = espX + 78 - 22
  const rightX = espX + 222 + 22

  // Orthogonal wire router: draws lines with rounded 90-degree corners
  const orthoWire = (x1: number, y1: number, x2: number, y2: number, busY: number, routeX: number) => {
    return `M ${x1},${y1} V ${busY} H ${routeX} V ${y2} H ${x2}`
  }

  const busTop = 210
  const busBottom = 550

  return (
    <g fill="none" strokeWidth={3.5} strokeLinecap="square" strokeLinejoin="round" opacity={0.85}>
      {/* Dynamic Signal Wires */}
      {leftPins.map((p, i) => {
        const y = getPinY(i, leftPins.length)
        const bucket = Math.round(p.raw * 12)
        let path = ''
        let color = '#38bdf8'
        
        const spread = (i - 3) * 4 // Stagger bus lines slightly for bundled look
        
        if (p.id === 'ldrUpper') { path = orthoWire(120, 122, leftX, y, busTop + spread, 120); color = '#a855f7' }
        if (p.id === 'ldrLower') { path = orthoWire(250, 122, leftX, y, busTop + spread, 250); color = '#22c55e' }
        if (p.id === 'dht22') { path = orthoWire(346, 128, leftX, y, busTop + spread, 346); color = '#eab308' }
        if (p.id === 'wind') { path = orthoWire(490, 110, leftX, y, busTop + spread, 490); color = '#f59e0b' }
        if (p.id === 'rain') { path = orthoWire(610, 110, leftX, y, busTop + spread, 610); color = '#3b82f6' }
        if (p.id === 'pir') { path = orthoWire(755, 120, leftX, y, busTop + spread, 755); color = '#ec4899' }
        if (p.id === 'pauseSwitch') { path = orthoWire(872, 125, leftX, y, busTop + spread, 872); color = '#06b6d4' }

        if (!path) return null
        
        return (
          <g key={p.id}>
            <path d={path} stroke="#111" strokeWidth={5.5} />
            <motion.path 
              key={`${p.id}-${bucket}`}
              d={path} 
              stroke={color}
              initial={{ strokeWidth: 3.5, opacity: 0.8 }}
              animate={{ strokeWidth: [6.5, 3.5], opacity: [1, 0.8] }}
              transition={{ duration: 0.4 }}
            />
          </g>
        )
      })}

      {rightPins.map((p, i) => {
        const y = getPinY(i, rightPins.length)
        const bucket = Math.round(p.raw * 12)
        let path = ''
        let color = '#38bdf8'
        
        const spread = i * 4

        // Outputs drop down to bottom bus
        if (p.id === 'servo') { path = orthoWire(rightX, y, 620, 690, busBottom + spread, 820); color = '#f97316' }
        if (p.id === 'sda') { path = orthoWire(rightX, y, 310, 616, busBottom + spread, 310); color = '#eab308' }
        if (p.id === 'scl') { path = orthoWire(rightX, y, 325, 616, busBottom + spread + 4, 325); color = '#d946ef' }

        // Note: For the servo output, we'll route it out to X=820, drop down to Servo's wire connect at X=620, Y=690
        // Wait, servo connects on the right side of the module.
        // Let's refine the servo wire route.
        if (p.id === 'servo') { path = orthoWire(rightX, y, 622, 698, busBottom + spread, 622); color = '#f97316' }

        if (!path) return null
        
        return (
          <g key={p.id}>
            <path d={path} stroke="#111" strokeWidth={5.5} />
            <motion.path 
              key={`${p.id}-${bucket}`}
              d={path} 
              stroke={color}
              initial={{ strokeWidth: 3.5, opacity: 0.8 }}
              animate={{ strokeWidth: [6.5, 3.5], opacity: [1, 0.8] }}
              transition={{ duration: 0.4 }}
            />
          </g>
        )
      })}
    </g>
  )
}

// ─── Interactive Tooltip Wrapper ──────────────────────────────────────────

interface HoverData {
  name: string; pin: string; reading: string; unit: string; purpose: string; x: number; y: number;
}

const DEBUG_HITBOXES = false;

function InteractiveGroup({ x, y, children, onHover, data, className, hitboxX = 0, hitboxY = 0, hitboxW, hitboxH }: any) {
  return (
    <g 
      transform={`translate(${x}, ${y})`} 
      className={`cursor-pointer ${className || ''}`}
      onMouseEnter={(e) => onHover({ ...data, x: e.clientX, y: e.clientY })}
      onMouseLeave={() => onHover(null)}
      onMouseMove={(e) => onHover((h: any) => h ? { ...h, x: e.clientX, y: e.clientY } : null)}
    >
      {hitboxW && (
        <rect 
          x={hitboxX} 
          y={hitboxY} 
          width={hitboxW} 
          height={hitboxH} 
          fill={DEBUG_HITBOXES ? "rgba(255, 0, 255, 0.3)" : "transparent"} 
          stroke={DEBUG_HITBOXES ? "magenta" : "none"}
        />
      )}
      {children}
    </g>
  )
}

// ─── Hardware Modules ───────────────────────────────────────────────────

function LdrModule({ x, y, label, value, onHover, hidden }: any) {
  return (
    <InteractiveGroup x={x} y={y} onHover={onHover} hitboxW={64} hitboxH={32} data={{
      name: label, pin: value.gpioLabel, reading: value.steps[value.steps.length-1].value, unit: '', purpose: 'Measures incident daylight (simulated photoresistor).'
    }}>
      <rect width="64" height="32" rx="2" fill="#172554" />
      {/* IC and resistors */}
      <rect x="20" y="8" width="6" height="4" fill="#000" />
      <rect x="20" y="20" width="4" height="3" fill="#000" />
      {/* Photoresistor (Silver face, red squiggly) */}
      <circle cx="10" cy="16" r="7" fill="#f3f4f6" stroke="#9ca3af" strokeWidth="1.5" />
      <path d="M 5,16 Q 7,10 10,16 T 15,16" fill="none" stroke="#ef4444" strokeWidth="1" />
      {/* Trimmer pot (Blue block, brass dial) */}
      <rect x="30" y="8" width="12" height="16" fill="#1d4ed8" rx="1" />
      <circle cx="36" cy="16" r="4.5" fill="#fcd34d" />
      <line x1="33" y1="13" x2="39" y2="19" stroke="#b45309" strokeWidth="1.5" />
      {/* 4 Header Pins */}
      {[6, 12.5, 19.5, 26].map(py => (
        <g key={py}>
          <rect x="58" y={py - 1.5} width="6" height="3" fill="#cbd5e1" />
          <circle cx="56" cy={py} r="1.5" fill="#fcd34d" />
        </g>
      ))}
      <text x="53" y="27" fontSize="8" fontWeight="bold" fill="#cbd5e1" textAnchor="end">AO</text>
    </InteractiveGroup>
  )
}

function PirModule({ x, y, value, onHover }: any) {
  const isHigh = value.raw > 0
  return (
    <InteractiveGroup x={x} y={y} onHover={onHover} hitboxW={50} hitboxH={45} data={{
      name: 'PIR Motion Sensor', pin: value.gpioLabel, reading: isHigh ? 'DETECTED' : 'CLEAR', unit: '', purpose: 'Detects local occupancy to trigger overrides.'
    }}>
      <rect width="50" height="45" rx="2" fill="#172554" />
      <rect x="4" y="4" width="42" height="37" fill="#1e3a8a" />
      {/* Dome */}
      <motion.circle 
        cx="25" cy="22" r="16" 
        fill={isHigh ? "#fef08a" : "#f1f5f9"} 
        stroke={isHigh ? "#eab308" : "#cbd5e1"} 
        strokeWidth="1.5"
        animate={{ fill: isHigh ? "#fef08a" : "#f1f5f9" }}
      />
      {/* Dome pattern (Hexagons simulation) */}
      <path d="M 16,18 L 34,18 M 16,26 L 34,26 M 20,12 L 20,32 M 30,12 L 30,32" stroke={isHigh ? "#ca8a04" : "#94a3b8"} strokeWidth="0.5" opacity="0.5" />
      {/* 3 Header Pins at bottom */}
      {[15, 25, 35].map(px => (
        <g key={px}>
          <rect x={px - 1.5} y="45" width="3" height="6" fill="#cbd5e1" />
          <circle cx={px} cy="43" r="1.5" fill="#fcd34d" />
        </g>
      ))}
    </InteractiveGroup>
  )
}

function DhtModule({ x, y, temp, hum, onHover }: any) {
  return (
    <InteractiveGroup x={x} y={y} onHover={onHover} hitboxW={32} hitboxH={48} data={{
      name: 'DHT22 Temp/Humidity', pin: temp.gpioLabel, reading: `${temp.steps[0].value} / ${hum.steps[0].value}`, unit: '', purpose: 'Measures local atmospheric conditions.'
    }}>
      <rect width="32" height="48" rx="3" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1" />
      {/* Grill slots */}
      {[...Array(6)].map((_, i) => (
        <line key={i} x1="6" y1="10 + i * 5" x2="26" y2="10 + i * 5" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" />
      ))}
      {/* 4 Header Pins at bottom */}
      {[6, 12.5, 19.5, 26].map(px => (
        <rect key={px} x={px - 1} y="48" width="2" height="8" fill="#cbd5e1" />
      ))}
    </InteractiveGroup>
  )
}

function PotModule({ x, y, label, value, onHover }: any) {
  const rot = (value.raw * 270) - 135
  return (
    <InteractiveGroup x={x} y={y} onHover={onHover} hitboxW={40} hitboxH={40} data={{
      name: `${label} Sensor (Simulated)`, pin: value.gpioLabel, reading: value.steps[value.steps.length-1].value, unit: '', purpose: `Translates ${label} metrics into voltage.`
    }}>
      <rect width="40" height="40" rx="2" fill="#172554" />
      {/* Metallic base */}
      <circle cx="20" cy="20" r="16" fill="#9ca3af" />
      {/* Inner knob */}
      <circle cx="20" cy="20" r="12" fill="#f3f4f6" stroke="#d1d5db" strokeWidth="1" />
      {/* Indicator line */}
      <motion.line 
        x1="20" y1="20" x2="20" y2="10" 
        stroke="#374151" strokeWidth="2.5" strokeLinecap="round"
        animate={{ rotate: rot, transformOrigin: "20px 20px" }}
      />
      {/* 3 Header Pins at bottom */}
      {[10, 20, 30].map(px => (
        <g key={px}>
          <rect x={px - 1.5} y="40" width="3" height="6" fill="#cbd5e1" />
          <circle cx={px} cy="38" r="1.5" fill="#fcd34d" />
        </g>
      ))}
      <text x="20" y="58" fontSize="12" textAnchor="middle" fill="#e2e8f0" fontWeight="bold" letterSpacing="0.05em">{label}</text>
    </InteractiveGroup>
  )
}

function ServoModule({ x, y, angle, moving, onHover }: any) {
  const rot = Math.max(0, Math.min(180, angle)) - 90
  return (
    <InteractiveGroup x={x} y={y} onHover={onHover} hitboxX={-8} hitboxY={10} hitboxW={62} hitboxH={28} data={{
      name: 'Micro Servo (SG90)', pin: 'PWM CH0', reading: `${Math.round(angle)}°`, unit: '', purpose: 'Actuates the kinetic façade panel.'
    }}>
      {/* Servo body */}
      <rect x="0" y="10" width="46" height="28" rx="2" fill="#1f2937" />
      {/* Mounting flanges */}
      <rect x="-8" y="20" width="62" height="6" rx="1" fill="#374151" />
      <circle cx="-4" cy="23" r="1.5" fill="#111827" />
      <circle cx="50" cy="23" r="1.5" fill="#111827" />
      
      {/* Wires (Brown, Red, Orange) connecting to a female header */}
      <path d="M 40,38 C 40,45 30,50 30,60" fill="none" stroke="#a16207" strokeWidth="2" />
      <path d="M 42,38 C 42,45 34,50 34,60" fill="none" stroke="#dc2626" strokeWidth="2" />
      <path d="M 44,38 C 44,45 38,50 38,60" fill="none" stroke="#f97316" strokeWidth="2" />
      <rect x="28" y="60" width="12" height="6" fill="#111827" />
      
      {/* Rotor base */}
      <circle cx="14" cy="24" r="11" fill="#111827" />
      
      {/* Horn (Animated) */}
      <motion.g animate={{ rotate: rot, transformOrigin: "14px 24px" }} transition={{ type: "spring", stiffness: 100, damping: 20 }}>
        {/* Double-sided horn shape */}
        <path d="M 11,24 L 11,6 L 17,6 L 17,24 Z" fill="#e5e7eb" />
        <path d="M 11,24 L 11,42 L 17,42 L 17,24 Z" fill="#e5e7eb" />
        <circle cx="14" cy="24" r="5" fill="#d1d5db" stroke="#9ca3af" strokeWidth="1" />
        <circle cx="14" cy="24" r="2" fill="#4b5563" />
        {/* Horn holes */}
        {[9, 13, 17, 31, 35, 39].map(cy => (
          <circle key={cy} cx="14" cy={cy} r="1" fill="#9ca3af" />
        ))}
      </motion.g>

      {/* Activity indicator */}
      {moving && <circle cx="36" cy="15" r="2.5" fill="#fbbf24" />}
    </InteractiveGroup>
  )
}

function LedModule({ x, y, on, onHover }: any) {
  return (
    <InteractiveGroup x={x} y={y} onHover={onHover} hitboxX={2} hitboxY={19} hitboxW={18} hitboxH={21} data={{
      name: 'Status LED', pin: 'Output', reading: on ? 'ON' : 'OFF', unit: '', purpose: 'Indicates active tracking mode.'
    }}>
      {/* Legs */}
      <line x1="8" y1="20" x2="8" y2="40" stroke="#9ca3af" strokeWidth="1.5" />
      <line x1="14" y1="20" x2="14" y2="40" stroke="#9ca3af" strokeWidth="1.5" />
      <line x1="14" y1="22" x2="16" y2="24" stroke="#9ca3af" strokeWidth="1.5" /> {/* Kink for cathode */}
      {/* Bulb (Realistic 5mm LED) */}
      <motion.path 
        d="M 3,20 C 3,4 19,4 19,20 Z" 
        fill={on ? "#ef4444" : "#7f1d1d"} 
        stroke={on ? "#f87171" : "#450a0a"}
        strokeWidth="0.5"
        animate={{ fill: on ? "#ef4444" : "#7f1d1d", filter: on ? "drop-shadow(0px 0px 10px rgba(239,68,68,0.9))" : "none" }}
      />
      <rect x="2" y="19" width="18" height="3" fill={on ? "#dc2626" : "#991b1b"} rx="1" />
      <path d="M 6,17 Q 8,7 11,17" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1" /> {/* Glare */}
    </InteractiveGroup>
  )
}

function SwitchModule({ x, y, on, onHover, signal }: any) {
  return (
    <InteractiveGroup x={x} y={y} onHover={onHover} hitboxX={0} hitboxY={10} hitboxW={24} hitboxH={12} data={{
      name: 'Maintenance Switch', pin: signal.gpioLabel, reading: on ? 'PAUSED' : 'RUNNING', unit: '', purpose: 'Hard override to halt actuation.'
    }}>
      <rect x="0" y="10" width="24" height="12" fill="#9ca3af" stroke="#6b7280" strokeWidth="1" />
      <rect x="2" y="12" width="20" height="8" fill="#111827" />
      {/* Pins */}
      <line x1="4" y1="22" x2="4" y2="30" stroke="#9ca3af" strokeWidth="2" />
      <line x1="12" y1="22" x2="12" y2="30" stroke="#9ca3af" strokeWidth="2" />
      <line x1="20" y1="22" x2="20" y2="30" stroke="#9ca3af" strokeWidth="2" />
      {/* Slider */}
      <motion.rect 
        y="12" width="6" height="8" fill="#e5e7eb"
        initial={false}
        animate={{ x: on ? 16 : 2 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      />
    </InteractiveGroup>
  )
}
