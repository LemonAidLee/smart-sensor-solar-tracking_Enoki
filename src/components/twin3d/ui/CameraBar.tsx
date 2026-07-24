'use client'

import { Box, Eye, Grid3x3, Move3d, ScanLine } from 'lucide-react'
import { useTwinStore } from '@/lib/engine/store'
import type { CameraView } from '@/lib/engine/types'

const VIEWS: { key: CameraView; label: string; icon: typeof Eye }[] = [
  { key: 'perspective', label: 'Perspective', icon: Eye },
  { key: 'isometric', label: 'Isometric', icon: Box },
  { key: 'orthographic', label: 'Orthographic', icon: Move3d },
  { key: 'top', label: 'Top', icon: Grid3x3 },
  { key: 'facade', label: 'Façade inspection', icon: ScanLine },
]

export function CameraBar() {
  const view = useTwinStore((s) => s.cameraView)
  const set = useTwinStore((s) => s.setCameraView)

  return (
    <div className="relative flex flex-col gap-1 rounded-lg bg-[#05080c]/80 p-1 backdrop-blur-md ring-1 ring-white/10 shadow-2xl">
      {VIEWS.map((v) => (
        <div key={v.key} className="group relative">
          <button
            onClick={() => set(v.key)}
            className={`relative flex h-8 w-8 items-center justify-center rounded-md transition-all duration-150 ${
              view === v.key 
                ? 'bg-white/10 text-white ring-1 ring-white/60 shadow-[inset_0_0_8px_rgba(255,255,255,0.1)]' 
                : 'text-white/50 hover:bg-white/10 hover:text-white'
            }`}
          >
            <v.icon className="h-[15px] w-[15px]" strokeWidth={1.5} />
          </button>
          
          {/* Technical Tooltip */}
          <span className="pointer-events-none absolute right-full top-1/2 mr-2 -translate-y-1/2 whitespace-nowrap rounded bg-[#0a0e16] px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-white/80 opacity-0 ring-1 ring-white/20 transition-all duration-150 group-hover:opacity-100 group-hover:mr-3">
            {v.label}
          </span>
        </div>
      ))}
    </div>
  )
}
