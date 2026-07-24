'use client'

import { Pause, Play } from 'lucide-react'
import { useTwinStore } from '@/lib/engine/store'
import { Slider } from './Slider'

const SPEEDS = [1, 5, 10]

function phase(h: number): string {
  if (h < 5 || h >= 20) return 'Night'
  if (h < 7) return 'Dawn'
  if (h < 11) return 'Morning'
  if (h < 14) return 'Midday'
  if (h < 17) return 'Afternoon'
  if (h < 18.8) return 'Sunset'
  return 'Dusk'
}

export function Timeline() {
  const snap = useTwinStore((s) => s.snapshot)
  const speed = useTwinStore((s) => s.speed)
  const playing = useTwinStore((s) => s.playing)
  const setTime = useTwinStore((s) => s.setTime)
  const setScrubbing = useTwinStore((s) => s.setScrubbing)
  const setSpeed = useTwinStore((s) => s.setSpeed)
  const togglePlay = useTwinStore((s) => s.togglePlay)

  return (
    <div className="glass-strong relative w-[440px] max-w-[92vw] rounded-2xl px-4 py-3">
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
      <div className="flex items-center gap-3">
        <button
          onClick={togglePlay}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald text-black shadow-[0_0_15px_rgba(0,208,132,0.5)] transition-transform hover:scale-105 active:scale-95"
          aria-label={playing ? 'Pause' : 'Play'}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="ml-0.5 h-4 w-4" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-baseline justify-between">
            <span className="font-mono text-lg font-bold leading-none text-white tabular-nums">{snap.clockLabel}</span>
            <span className="text-[10px] uppercase tracking-wider text-white/45">{phase(snap.timeHours)}</span>
          </div>
          <Slider
            label=""
            value={snap.timeHours}
            min={0}
            max={24}
            step={0.01}
            display=""
            accent="#38BDF8"
            onChange={setTime}
            onScrubStart={() => setScrubbing(true)}
            onScrubEnd={() => setScrubbing(false)}
          />
        </div>

        <div className="flex shrink-0 gap-1 rounded-full bg-white/5 p-1">
          {SPEEDS.map((sp) => (
            <button
              key={sp}
              onClick={() => setSpeed(sp)}
              className={`rounded-full px-2 py-1 text-[11px] font-semibold transition-colors ${
                speed === sp ? 'bg-white/90 text-black' : 'text-white/60 hover:text-white'
              }`}
            >
              {sp}×
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
