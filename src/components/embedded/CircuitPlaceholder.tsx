'use client'

import { Waypoints } from 'lucide-react'

/**
 * CircuitPlaceholder — reserved layout for a future Wokwi-style ESP32 wiring
 * diagram. Deliberately not implemented yet; this only reserves the space and
 * visual language so the real circuit simulation can be dropped in later
 * without reworking the panel around it.
 */
export function CircuitPlaceholder() {
  return (
    <div
      className="relative flex h-[150px] flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border border-dashed border-white/15 bg-black/20"
      style={{
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)',
        backgroundSize: '16px 16px',
      }}
    >
      <Waypoints className="h-6 w-6 text-white/25" />
      <p className="text-[11px] font-medium text-white/50">Circuit Simulation — Reserved</p>
      <p className="max-w-[260px] text-center text-[9px] leading-relaxed text-white/30">
        The full ESP32 wiring diagram (Wokwi-style) will render here in a future revision.
      </p>
    </div>
  )
}
