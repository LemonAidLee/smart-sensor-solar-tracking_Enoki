'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Cpu, Maximize, RotateCcw, ZoomIn, ZoomOut, Layers } from 'lucide-react'
import { usePlatformStore } from '@/lib/dt/platformStore'
import { useEdtStore } from '@/lib/edt/store'
import { CircuitCanvas } from '@/components/edt/CircuitCanvas'
import { FaultPanel, LegendPanel } from '@/components/edt/panels'
import { useEffect } from 'react'

export function ElectronicsLayer() {
  const layer = usePlatformStore((s) => s.layer)
  const isActive = layer === 'ELECTRONICS'

  const view = useEdtStore((s) => s.view)
  const showLegend = useEdtStore((s) => s.showLegend)
  const zoomBy = useEdtStore((s) => s.zoomBy)
  const resetView = useEdtStore((s) => s.resetView)
  const fitView = useEdtStore((s) => s.fitView)
  const toggle = useEdtStore((s) => s.toggle)
  
  // Make sure EDT is 'open' so internal intervals run if needed
  const setOpen = useEdtStore((s) => s.setOpen)
  useEffect(() => {
    setOpen(true)
  }, [setOpen])

  return (
    <AnimatePresence>
      {isActive && (
        <motion.div
          key="electronics-layer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.3 } }}
          className="absolute inset-0 z-30 flex flex-col bg-[#080b12] pt-24"
        >
          {/* Header */}
          <div className="flex items-center gap-2 border-b border-white/10 bg-[#0d1420] px-6 py-3">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-electric/20">
              <Cpu className="h-4 w-4 text-electric" />
            </div>
            <div>
              <p className="text-sm font-bold leading-tight text-white">Electronics Digital Twin</p>
              <p className="text-xs leading-tight text-white/50">Wokwi Engine · ESP32-S3 · Active</p>
            </div>
            <span className="ml-4 rounded-full bg-emerald/15 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald">LIVE</span>
            
            <div className="ml-auto flex items-center gap-2">
              <IconBtn onClick={() => zoomBy(1.15)} title="Zoom in"><ZoomIn className="h-4 w-4" /></IconBtn>
              <IconBtn onClick={() => zoomBy(1 / 1.15)} title="Zoom out"><ZoomOut className="h-4 w-4" /></IconBtn>
              <span className="w-12 text-center font-mono text-xs text-white/50">{Math.round(view.zoom * 100)}%</span>
              <IconBtn onClick={fitView} title="Fit"><Maximize className="h-4 w-4" /></IconBtn>
              <IconBtn onClick={resetView} title="Reset view"><RotateCcw className="h-4 w-4" /></IconBtn>
              <div className="mx-2 h-5 w-px bg-white/10" />
              <Toggle active={showLegend} onClick={() => toggle('showLegend')} icon={Layers} label="Legend" />
            </div>
          </div>

          {/* Main Workspace */}
          <div className="relative flex min-h-0 flex-1 bg-[#05070a]">
            {showLegend && <LegendPanel />}
            <div className="relative min-w-0 flex-1 overflow-hidden">
              <CircuitCanvas />
            </div>
          </div>

          {/* Fault Panel at the bottom */}
          <div className="border-t border-white/10 bg-[#0a0e16]">
            <FaultPanel />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function IconBtn({ onClick, title, children }: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={title} className="rounded p-1.5 text-white/60 hover:bg-white/10 hover:text-white">
      {children}
    </button>
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function Toggle({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? 'bg-electric/20 text-electric' : 'text-white/50 hover:bg-white/10 hover:text-white'
      }`}
    >
      <Icon className="h-4 w-4" /> {label}
    </button>
  )
}
