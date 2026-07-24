'use client'

import { SimulationHeader } from '@/components/twin3d/ui/SimulationHeader'
import { SimulationCursor } from '@/components/twin3d/ui/SimulationCursor'
import { TwinScene } from '@/components/twin3d/TwinScene'
import { VECDriver } from '@/components/twin3d/VECDriver'

// Import the 4 Layers
import { BuildingLayer } from '@/components/dt-layers/BuildingLayer'
import { DecisionLayer } from '@/components/dt-layers/DecisionLayer'
import { ElectronicsLayer } from '@/components/dt-layers/ElectronicsLayer'
import { ExplainabilityLayer } from '@/components/dt-layers/ExplainabilityLayer'

import { usePlatformStore, DtLayer } from '@/lib/dt/platformStore'
import { WEATHER_VALIDATION_MODE } from '@/lib/engine/validationMode'
import { Brain, Cpu, SearchCode, Building2 } from 'lucide-react'

export default function DigitalTwinPage() {
  return (
    <main className="relative h-[100dvh] w-full overflow-hidden bg-[#05060a] dt-cursor-active">
      <SimulationCursor />
      
      {/* 
        The lightweight Simulation Header replaces the global marketing Navigation 
        to maximize vertical screen space for the Digital Twin.
      */}
      <SimulationHeader />

      {/* Layer 1: Core Simulation & Visualization (Always running) */}
      <div className="absolute inset-0 z-0">
        <TwinScene />
      </div>

      {/* Synchronisation Engine (headless) — the Virtual Embedded Controller is
          disabled in Weather Validation Mode. */}
      {!WEATHER_VALIDATION_MODE && <VECDriver />}

      {/*
        The Digital Twin Layers. In Weather Validation Mode only the Building layer
        (Building · Weather · Sun · manual façade · time) is shown; the Decision
        (PBIF), Electronics (VEC) and Explainability layers are hidden.
      */}
      <BuildingLayer />
      {!WEATHER_VALIDATION_MODE && (
        <>
          <DecisionLayer />
          <ElectronicsLayer />
          <ExplainabilityLayer />
        </>
      )}

      {/* Global Layer Switcher — hidden when only the Building layer is available */}
      {!WEATHER_VALIDATION_MODE && <LayerSwitcher />}
    </main>
  )
}

function LayerSwitcher() {
  const layer = usePlatformStore((s) => s.layer)
  const setLayer = usePlatformStore((s) => s.setLayer)

  const layers: { id: DtLayer; label: string; icon: typeof Building2 }[] = [
    { id: 'BUILDING', label: 'Building', icon: Building2 },
    { id: 'DECISION', label: 'Decision', icon: Brain },
    { id: 'ELECTRONICS', label: 'Electronics', icon: Cpu },
    { id: 'EXPLAINABILITY', label: 'Explainability', icon: SearchCode },
  ]

  return (
    <div className="absolute bottom-24 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-[#0a0e16]/80 p-1.5 backdrop-blur-xl shadow-2xl">
      {layers.map((l) => {
        const active = layer === l.id
        const Icon = l.icon
        return (
          <button
            key={l.id}
            onClick={() => setLayer(l.id)}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all ${
              active 
                ? 'bg-emerald text-[#0a0e16] shadow-[0_0_15px_rgba(0,208,132,0.4)]' 
                : 'text-white/60 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{l.label}</span>
          </button>
        )
      })}
    </div>
  )
}
