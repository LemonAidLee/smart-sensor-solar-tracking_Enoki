'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { usePlatformStore } from '@/lib/dt/platformStore'
import { Brain, CloudLightning, Activity, Target, ShieldAlert, Cpu } from 'lucide-react'

export function DecisionLayer() {
  const layer = usePlatformStore((s) => s.layer)
  const isActive = layer === 'DECISION'

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          key="decision-layer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
          className="absolute inset-0 z-20 flex flex-col bg-background/80 px-8 py-24 pt-32 backdrop-blur-md"
        >
          {/* Header */}
          <div className="mb-8">
            <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white">
              <Brain className="h-6 w-6 text-electric" />
              Decision Intelligence <span className="text-white/40">Engine</span>
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-white/50">
              Observing the PBIF reasoning pipeline. The system interprets forecast tensors, converts them to semantic indicators, resolves objective conflicts via MCDM, and issues the optimal building strategy.
            </p>
          </div>

          {/* Main Grid */}
          <div className="grid min-h-0 flex-1 grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Column 1: Prediction & Situation */}
            <div className="flex flex-col gap-6">
              <Panel title="Prediction Tensor" icon={CloudLightning} color="text-sky-400">
                <div className="flex flex-col gap-3">
                  <DataRow label="Forecast Horizon" value="H = 240 min" />
                  <DataRow label="Peak Solar Irradiance" value="950 W/m² @ 14:00" />
                  <DataRow label="Cloud Cover Probability" value="12% (CLEAR)" />
                  <DataRow label="Occupancy Forecast" value="85% (HIGH)" />
                  <DataRow label="Thermal Load Delta" value="+4.2°C/hr" />
                  <div className="mt-2 flex items-center justify-between rounded bg-white/5 px-3 py-2">
                    <span className="text-xs text-white/50">ML Confidence Score</span>
                    <span className="font-mono text-xs font-bold text-emerald">0.94</span>
                  </div>
                </div>
              </Panel>

              <Panel title="Situation Assessment" icon={Activity} color="text-emerald">
                <div className="flex flex-col gap-2">
                  <Indicator label="Solar Severity" level="HIGH" trend="stable" />
                  <Indicator label="Thermal Stress" level="MEDIUM" trend="rising" />
                  <Indicator label="Cooling Demand" level="HIGH" trend="rising" />
                  <Indicator label="Rain Risk" level="LOW" trend="stable" />
                  <Indicator label="Visual Comfort" level="LOW" trend="falling" />
                </div>
              </Panel>
            </div>

            {/* Column 2: Decision Intelligence (MCDM) */}
            <div className="flex flex-col gap-6">
              <Panel title="Multi-Criteria Evaluation" icon={Cpu} color="text-purple-400" className="flex-1">
                <div className="mb-4 flex items-center justify-between rounded border border-white/10 bg-white/5 px-3 py-2">
                  <span className="text-xs text-white/50">Context Profile</span>
                  <span className="text-xs font-bold text-white">Occupied · Day</span>
                </div>
                
                <div className="space-y-4">
                  <ObjectiveScore name="HEAT_REJECTION" score={0.88} winner />
                  <ObjectiveScore name="MAXIMUM_COMFORT" score={0.68} />
                  <ObjectiveScore name="MAXIMUM_DAYLIGHT" score={0.61} />
                  <ObjectiveScore name="PASSIVE_COOLING" score={0.55} />
                </div>

                <div className="mt-auto pt-6">
                  <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-3">
                    <div className="flex items-center gap-2">
                      <ShieldAlert className="h-4 w-4 text-red-400" />
                      <span className="text-xs font-bold text-red-400">Safety Lexicographic Filter</span>
                    </div>
                    <p className="mt-1 text-[10px] text-white/50">
                      No safety overrides triggered. Wind=LOW, Rain=LOW. Arbitration defaults to weighted utility.
                    </p>
                  </div>
                </div>
              </Panel>
            </div>

            {/* Column 3: Strategy & Explainability */}
            <div className="flex flex-col gap-6">
              <Panel title="Decision Record" icon={Target} color="text-electric" className="flex-1">
                <div className="flex flex-col rounded-lg border border-electric/30 bg-electric/10 p-4">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-electric">Building Objective</span>
                  <span className="mt-1 text-xl font-bold text-white">HEAT_REJECTION</span>
                  <span className="mt-1 text-xs text-white/70">Plan: PRE_COOLING → 14:45</span>
                </div>

                <div className="mt-6 space-y-4">
                  <div>
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-white/50">Primary Rationale</h4>
                    <ul className="mt-2 space-y-2">
                      <RationaleItem text="Predicted outdoor temperature exceeds 37°C at 15:00." />
                      <RationaleItem text="Cooling load expected to increase by 18% (HIGH ↑)." />
                      <RationaleItem text="Occupancy begins in 45 minutes (HIGH)." />
                    </ul>
                  </div>

                  <div>
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-white/50">Rejected Alternatives</h4>
                    <ul className="mt-2 space-y-2">
                      <RejectedItem 
                        name="MAXIMUM_DAYLIGHT" 
                        reason="Visual comfort and cooling load penalties outweigh daylight benefit at this solar load." 
                      />
                      <RejectedItem 
                        name="MAXIMUM_COMFORT" 
                        reason="Reactive only; does not preempt the predicted thermal mass charging." 
                      />
                    </ul>
                  </div>
                </div>
              </Panel>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Helper UI Components
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Panel({ title, icon: Icon, color, children, className = '' }: any) {
  return (
    <div className={`flex flex-col rounded-2xl border border-white/10 bg-[#080b12] p-5 shadow-2xl ${className}`}>
      <div className="mb-4 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${color}`} />
        <h3 className="text-sm font-bold text-white">{title}</h3>
      </div>
      {children}
    </div>
  )
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 pb-2">
      <span className="text-xs text-white/50">{label}</span>
      <span className="font-mono text-xs text-white/90">{value}</span>
    </div>
  )
}

function Indicator({ label, level, trend }: { label: string; level: string; trend: 'stable' | 'rising' | 'falling' }) {
  const getLevelColor = (l: string) => {
    if (l === 'HIGH') return 'text-red-400 bg-red-400/10 border-red-400/20'
    if (l === 'MEDIUM') return 'text-amber-400 bg-amber-400/10 border-amber-400/20'
    return 'text-emerald bg-emerald/10 border-emerald/20'
  }
  return (
    <div className="flex items-center justify-between rounded border border-white/5 bg-white/[0.02] px-3 py-2">
      <span className="text-xs text-white/70">{label}</span>
      <div className="flex items-center gap-2">
        {trend === 'rising' && <span className="text-[10px] text-red-400">↑</span>}
        {trend === 'falling' && <span className="text-[10px] text-emerald">↓</span>}
        {trend === 'stable' && <span className="text-[10px] text-white/30">—</span>}
        <span className={`rounded border px-2 py-0.5 text-[9px] font-bold ${getLevelColor(level)}`}>
          {level}
        </span>
      </div>
    </div>
  )
}

function ObjectiveScore({ name, score, winner = false }: { name: string; score: number; winner?: boolean }) {
  return (
    <div className={`flex flex-col gap-1.5 rounded-lg border p-3 ${winner ? 'border-electric/30 bg-electric/10' : 'border-white/5 bg-white/5'}`}>
      <div className="flex items-center justify-between">
        <span className={`text-xs font-bold ${winner ? 'text-electric' : 'text-white/70'}`}>{name}</span>
        <span className={`font-mono text-xs ${winner ? 'text-white' : 'text-white/50'}`}>{score.toFixed(2)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${score * 100}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className={`h-full ${winner ? 'bg-electric' : 'bg-white/30'}`}
        />
      </div>
    </div>
  )
}

function RationaleItem({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-electric" />
      <span className="text-xs text-white/80">{text}</span>
    </li>
  )
}

function RejectedItem({ name, reason }: { name: string; reason: string }) {
  return (
    <li className="flex flex-col gap-1 rounded border border-white/5 bg-white/[0.02] p-2">
      <span className="text-[10px] font-bold text-white/70">{name}</span>
      <span className="text-[11px] text-white/50">{reason}</span>
    </li>
  )
}
