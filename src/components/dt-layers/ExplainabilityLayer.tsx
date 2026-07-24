'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Bug, GraduationCap, SearchCode } from 'lucide-react'
import { usePlatformStore } from '@/lib/dt/platformStore'
import { useEdtStore } from '@/lib/edt/store'
import { useVecStore } from '@/lib/vec/store'
import { ExecutionDebugger } from '@/components/edt/ExecutionDebugger'
import { CausalityStrip, InspectorPanel, EducationPanel } from '@/components/edt/panels'
import { useEffect } from 'react'

export function ExplainabilityLayer() {
  const layer = usePlatformStore((s) => s.layer)
  const isActive = layer === 'EXPLAINABILITY'

  const showEducation = useEdtStore((s) => s.showEducation)
  const toggle = useEdtStore((s) => s.toggle)
  const selectedId = useEdtStore((s) => s.selectedId)
  const stageIndex = useEdtStore((s) => s.stageIndex)
  const replayIndex = useEdtStore((s) => s.replayIndex)
  const trace = useVecStore((s) => s.trace)
  const history = useVecStore((s) => s.traceHistory)

  const shown = replayIndex != null ? history[replayIndex] ?? trace : trace
  const stageId = shown?.stages[Math.min(stageIndex, shown.stages.length - 1)]?.id ?? null

  const setOpen = useEdtStore((s) => s.setOpen)
  useEffect(() => {
    setOpen(true)
  }, [setOpen])

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          key="explainability-layer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
          className="absolute inset-0 z-40 flex flex-col bg-[#05060a] pt-24"
        >
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-white/10 bg-[#0d1420] px-6 py-3">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-emerald/20">
              <SearchCode className="h-4 w-4 text-emerald" />
            </div>
            <div>
              <p className="text-sm font-bold leading-tight text-white">Explainability Digital Twin</p>
              <p className="text-xs leading-tight text-white/50">Causality Trace · Firmware Execution Debugger</p>
            </div>
            
            <div className="ml-auto flex items-center gap-2">
              <Toggle active={showEducation} onClick={() => toggle('showEducation')} icon={GraduationCap} label="Education Mode" />
            </div>
          </div>

          {/* Main Layout */}
          <div className="flex min-h-0 flex-1">
            {/* Left side: Causality and Execution Debugger */}
            <div className="flex min-w-0 flex-1 flex-col border-r border-white/10">
              <div className="flex-1 overflow-auto bg-[#080b12] p-6">
                <div className="mb-6">
                  <h3 className="mb-2 text-sm font-bold text-white">Algorithm Causality Trace</h3>
                  <p className="text-xs text-white/50">Step-by-step firmware execution pipeline</p>
                </div>
                {/* Repurpose the CausalityStrip to take more space here */}
                <div className="h-48 rounded-xl border border-white/10 bg-black/20 p-4">
                  <CausalityStrip stageId={stageId} />
                </div>

                {/* Additional diagnostic graphs could go here in the future */}
                <div className="mt-8">
                  <h3 className="mb-2 text-sm font-bold text-white">Live Execution Telemetry</h3>
                  <p className="text-xs text-white/50">Select a firmware stage above to inspect its execution state.</p>
                </div>
              </div>
              
              {/* Execution Debugger docked to the bottom of the left column */}
              <div className="h-[300px] shrink-0 border-t border-white/10 bg-[#0a0e16]">
                <ExecutionDebugger />
              </div>
            </div>

            {/* Right side: Inspector or Education Panel */}
            <div className="w-[400px] shrink-0 bg-[#0a0e16]">
              {selectedId ? <InspectorPanel /> : showEducation ? <EducationPanel /> : (
                <div className="flex h-full flex-col items-center justify-center p-8 text-center opacity-50">
                  <Bug className="mb-4 h-12 w-12 text-white/20" />
                  <p className="text-sm text-white">Select a component or algorithm stage to inspect its variables.</p>
                  <p className="mt-2 text-xs text-white/50">Alternatively, enable Education Mode.</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Toggle({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? 'bg-emerald/20 text-emerald' : 'text-white/50 hover:bg-white/10 hover:text-white'
      }`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  )
}
