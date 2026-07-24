'use client'

import { useState } from 'react'
import {
  Blinds,
  Boxes,
  Building2,
  ChevronDown,
  CloudLightning,
  CloudRain,
  Eye,
  Gauge,
  Plus,
  RotateCcw,
  SlidersHorizontal,
  Sun,
  Trash2,
  TreePine,
  Waves,
  Wrench,
} from 'lucide-react'
import { useTwinStore } from '@/lib/engine/store'
import type { BuildingShape, GlassType, SkinMode } from '@/lib/engine/types'
import { STATE_LABEL } from '@/lib/engine/panelStates'
import { bearingToSvg } from '@/lib/engine/solarViz'
import { WEATHER_VALIDATION_MODE, MANUAL_MAX } from '@/lib/engine/validationMode'
import { Slider } from './Slider'
import { motion, AnimatePresence } from 'framer-motion'

type Tab = 'building' | 'site' | 'weather' | 'skin'

const TABS: { key: Tab; label: string; icon: typeof Building2 }[] = [
  { key: 'building', label: 'Building', icon: Building2 },
  { key: 'site', label: 'Site', icon: TreePine },
  { key: 'weather', label: 'Weather', icon: CloudRain },
  { key: 'skin', label: 'Skin', icon: Blinds },
]

const SHAPES: { key: BuildingShape; label: string; icon: React.FC<any> }[] = [
  { key: 'rectangle', label: 'Box', icon: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><rect x="4" y="4" width="16" height="16" rx="2" /></svg> },
  { key: 'triangle', label: 'Triangle', icon: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><polygon points="12 4 4 20 20 20" strokeLinejoin="round" /></svg> },
  { key: 'hexagon', label: 'Hexagon', icon: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><polygon points="12 3 20 7.5 20 16.5 12 21 4 16.5 4 7.5" strokeLinejoin="round" /></svg> },
  { key: 'cylinder', label: 'Cylinder', icon: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v12c0 1.66 3.58 3 8 3s8-1.34 8-3V6" /></svg> },
  { key: 'lshape', label: 'L-Shape', icon: (p) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" {...p}><polygon points="4 4 10 4 10 14 20 14 20 20 4 20" strokeLinejoin="round" /></svg> },
]

const PROGRAMS: { key: SkinMode; label: string; icon: typeof Building2 }[] = [
  { key: 'auto', label: 'Auto', icon: Gauge },
  { key: 'solar-tracking', label: 'Solar', icon: Sun },
  { key: 'manual', label: 'Manual', icon: SlidersHorizontal },
  { key: 'maintenance', label: 'Service', icon: Wrench },
  { key: 'storm', label: 'Storm', icon: CloudLightning },
  { key: 'privacy', label: 'Privacy', icon: Eye },
]

const GLASS_TYPES: GlassType[] = ['clear', 'tinted', 'low-e', 'reflective']
const LOCATIONS = [
  { name: 'Kuala Lumpur', latitude: 3.14, longitude: 101.69, timezone: 8 },
  { name: 'Singapore', latitude: 1.35, longitude: 103.82, timezone: 8 },
  { name: 'Dubai', latitude: 25.2, longitude: 55.27, timezone: 4 },
]

export function ControlDeck() {
  const [tab, setTab] = useState<Tab>('building')
  const building = useTwinStore((s) => s.building)
  const neighbors = useTwinStore((s) => s.neighbors)
  const weather = useTwinStore((s) => s.weather)
  const skinMode = useTwinStore((s) => s.skinMode)
  const manualRotation = useTwinStore((s) => s.manualRotation)
  const facadeControlMode = useTwinStore((s) => s.facadeControlMode)
  const trackingIntent = useTwinStore((s) => s.trackingIntent)
  const powerLoss = useTwinStore((s) => s.powerLoss)

  const s = useTwinStore.getState()
  const [isExpanded, setIsExpanded] = useState(false)
  
  const activeTab = TABS.find((t) => t.key === tab)
  const title = activeTab?.label ?? 'Building'
  const Icon = activeTab?.icon ?? Building2

  return (
    <motion.div layout className="relative w-[340px] max-w-[88vw] rounded-[24px] border border-white/5 bg-[#05060a]/60 backdrop-blur-xl p-5 shadow-2xl">
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />

      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="group mb-1 flex w-full items-center justify-between text-left focus:outline-none"
      >
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-emerald-400 drop-shadow-[0_0_8px_rgba(0,208,132,0.4)]" />
          <p className="text-[11px] font-bold tracking-[0.2em] text-emerald-400 uppercase drop-shadow-[0_0_8px_rgba(0,208,132,0.4)]">{title}</p>
        </div>
        <div className="flex h-6 w-6 items-center justify-center rounded-full transition-colors group-hover:bg-white/5">
          <ChevronDown className={`h-4 w-4 text-white/50 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''} group-hover:text-white`} />
        </div>
      </button>

      <AnimatePresence initial={false} mode="wait">
        {!isExpanded ? (
          <motion.div
            key="collapsed"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="mt-4 border-t border-white/5 pt-4">
              {tab === 'building' && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div><p className="text-[9px] uppercase tracking-widest text-white/40">Geometry</p><p className="text-[11px] font-medium capitalize text-white/90">{building.shape}</p></div>
                  <div><p className="text-[9px] uppercase tracking-widest text-white/40">Height</p><p className="font-mono text-[11px] font-medium text-white/90">{Math.round(building.height)} m</p></div>
                  <div className="col-span-2"><p className="text-[9px] uppercase tracking-widest text-white/40">Orientation</p><p className="text-[11px] font-medium text-emerald-400">{getCompassLabel(building.orientation)} <span className="font-mono text-white/60">({Math.round(building.orientation)}°)</span></p></div>
                </div>
              )}
              {tab === 'site' && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div><p className="text-[9px] uppercase tracking-widest text-white/40">Location</p><p className="text-[11px] font-medium text-white/90">{building.locationName}</p></div>
                  <div><p className="text-[9px] uppercase tracking-widest text-white/40">Simulation Neighbours</p><p className="font-mono text-[11px] font-medium text-white/90">{neighbors.length}</p></div>
                </div>
              )}
              {tab === 'weather' && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div><p className="text-[9px] uppercase tracking-widest text-white/40">Temp</p><p className="font-mono text-[11px] font-medium text-white/90">{weather.temperature.toFixed(1)} °C</p></div>
                  <div><p className="text-[9px] uppercase tracking-widest text-white/40">Cloud / Rain</p><p className="font-mono text-[11px] font-medium text-white/90">{Math.round(weather.cloudCoverage*100)}% / {Math.round(weather.rainIntensity*100)}%</p></div>
                </div>
              )}
              {tab === 'skin' && (
                <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                  <div className="col-span-2"><p className="text-[9px] uppercase tracking-widest text-white/40">Program</p><p className="text-[11px] font-medium capitalize text-white/90">{WEATHER_VALIDATION_MODE ? facadeControlMode : skinMode}</p></div>
                  {!WEATHER_VALIDATION_MODE && <div><p className="text-[9px] uppercase tracking-widest text-white/40">Power Loss</p><p className="font-mono text-[11px] font-medium text-red-400">{Math.round(powerLoss*100)}%</p></div>}
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="expanded"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-4">
              {/* Workspace Selectors */}
              <div className="mb-6 flex border-b border-white/10">
                {TABS.map((t) => {
                  const isActive = tab === t.key
                  return (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className={`relative flex flex-1 items-center justify-center gap-1.5 pb-2.5 text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                        isActive ? 'text-white' : 'text-white/40 hover:text-white/70'
                      }`}
                    >
                      <t.icon className={`h-3 w-3 ${isActive ? 'text-emerald-400' : ''}`} />
                      <span className="hidden sm:inline">{t.label}</span>
                      {isActive && (
                        <motion.div
                          layoutId="activeTabIndicator"
                          className="absolute -bottom-[1px] left-0 right-0 h-[2px] bg-emerald-400"
                          style={{ boxShadow: '0 -2px 10px rgba(0,208,132,0.4)' }}
                        />
                      )}
                    </button>
                  )
                })}
              </div>

              {/* BUILDING ------------------------------------------------------------ */}
              {tab === 'building' && (
                <div className="space-y-6">
                  {/* Orientation Widget */}
                  <div className="rounded-[16px] bg-white/[0.02] p-4 border border-white/5">
                    <div className="mb-4 flex items-baseline justify-between">
                      <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-white/50">Orientation</p>
                      <p className="font-mono text-[11px] font-semibold text-emerald-400">{getCompassLabel(building.orientation)} · {Math.round(building.orientation)}°</p>
                    </div>
                    <InteractiveCompass heading={building.orientation} onChange={(v) => s.setOrientation(v)} />
                    <div className="mt-4 flex gap-1">
                      {[
                        { deg: 0, l: 'N' },
                        { deg: 90, l: 'E' },
                        { deg: 180, l: 'S' },
                        { deg: 270, l: 'W' },
                      ].map((d) => (
                        <button
                          key={d.l}
                          onClick={() => s.setOrientation(d.deg)}
                          className="flex-1 rounded-md bg-white/5 py-1 text-[10px] font-medium text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                        >
                          {d.l}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Geometry Widget */}
                  <div>
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.15em] text-white/50">Geometry</p>
                    <div className="grid grid-cols-5 gap-1.5">
                      {SHAPES.map((sh) => {
                        const active = building.shape === sh.key
                        return (
                          <button
                            key={sh.key}
                            onClick={() => s.setBuilding({ shape: sh.key })}
                            className={`flex flex-col items-center justify-center gap-2 rounded-xl border p-2 transition-all ${
                              active 
                                ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400 shadow-[inset_0_0_15px_rgba(0,208,132,0.1)]' 
                                : 'border-white/5 bg-white/[0.02] text-white/40 hover:border-white/20 hover:text-white/80'
                            }`}
                          >
                            <sh.icon className="h-5 w-5" />
                            <span className="text-[9px] tracking-wider">{sh.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Dimensions */}
                  <div className="space-y-4">
                    <Slider label="Height" value={building.height} min={60} max={280} step={2} display={`${Math.round(building.height)} m`} accent="#00D084" onChange={(v) => s.setBuilding({ height: v })} />
                    <Slider label="Width" value={building.width} min={30} max={110} step={1} display={`${Math.round(building.width)} m`} accent="#00D084" onChange={(v) => s.setBuilding({ width: v })} />
                  </div>

                  {!WEATHER_VALIDATION_MODE && (
                    <div className="space-y-4 border-t border-white/5 pt-4">
                      <Slider label="Glass ratio" value={building.glassRatio} min={0.2} max={0.95} step={0.01} display={`${Math.round(building.glassRatio * 100)}%`} accent="#a78bfa" onChange={(v) => s.setBuilding({ glassRatio: v })} />
                      <Slider label="Façade air-gap" value={building.facadeDepth} min={0.1} max={0.8} step={0.02} display={`${(building.facadeDepth * 1000).toFixed(0)} mm`} accent="#22d3ee" onChange={(v) => s.setBuilding({ facadeDepth: v })} />
                      <div>
                        <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.15em] text-white/50">Glass type</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {GLASS_TYPES.map((g) => (
                            <button
                              key={g}
                              onClick={() => s.setBuilding({ glassType: g })}
                              className={`rounded-lg border py-2 text-[10px] font-medium uppercase tracking-widest transition-colors ${
                                building.glassType === g 
                                  ? 'border-electric/30 bg-electric/10 text-electric shadow-[inset_0_0_15px_rgba(34,211,238,0.1)]' 
                                  : 'border-white/5 bg-white/[0.02] text-white/40 hover:border-white/20 hover:text-white/80'
                              }`}
                            >
                              {g}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* SITE ---------------------------------------------------------------- */}
              {tab === 'site' && (
                <div className="space-y-6">
                  <div>
                    <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.15em] text-white/50">Location</p>
                    <div className="grid grid-cols-1 gap-1.5">
                      {LOCATIONS.map((loc) => (
                        <button
                          key={loc.name}
                          onClick={() => s.setBuilding({ locationName: loc.name, latitude: loc.latitude, longitude: loc.longitude, timezone: loc.timezone })}
                          className={`flex items-center justify-between rounded-xl border px-3 py-2.5 transition-all ${
                            building.locationName === loc.name 
                              ? 'border-emerald-400/30 bg-emerald-400/10 shadow-[inset_0_0_15px_rgba(0,208,132,0.1)]' 
                              : 'border-white/5 bg-white/[0.02] hover:border-white/20'
                          }`}
                        >
                          <span className={`text-[11px] font-medium tracking-wider ${building.locationName === loc.name ? 'text-emerald-400' : 'text-white/60'}`}>{loc.name}</span>
                          <span className="font-mono text-[9px] text-white/30">{loc.latitude}°N, {loc.longitude}°E</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-white/5 pt-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-white/50">Simulation Neighbours <span className="text-white/30">· {neighbors.length}</span></p>
                      <button
                        onClick={() => s.addNeighbor()}
                        className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-1 text-[9px] font-semibold tracking-widest text-white/60 transition-colors hover:bg-white/10 hover:text-white"
                      >
                        <Plus className="h-3 w-3" /> ADD
                      </button>
                    </div>

                    <div className="max-h-[36vh] space-y-3 overflow-y-auto pr-2 no-scrollbar">
                      {neighbors.map((n) => (
                        <div key={n.id} className="rounded-[16px] border border-white/5 bg-white/[0.02] p-3">
                          <div className="mb-3 flex items-center justify-between">
                            <span className="font-mono text-[10px] text-white/40">{n.id}</span>
                            <button onClick={() => s.removeNeighbor(n.id)} className="text-white/30 transition-colors hover:text-red-400">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <div className="space-y-4">
                            <Slider label="Height" value={n.height} min={20} max={260} step={2} display={`${Math.round(n.height)} m`} accent="#94a3b8" onChange={(v) => s.updateNeighbor(n.id, { height: v })} />
                            <Slider label="Distance" value={n.distance} min={60} max={280} step={2} display={`${Math.round(n.distance)} m`} accent="#94a3b8" onChange={(v) => s.updateNeighbor(n.id, { distance: v })} />
                            <Slider label="Bearing" value={n.bearing} min={0} max={360} step={1} display={`${Math.round(n.bearing)}°`} accent="#94a3b8" onChange={(v) => s.updateNeighbor(n.id, { bearing: v })} />
                          </div>
                        </div>
                      ))}
                      {neighbors.length === 0 && (
                        <div className="flex h-20 items-center justify-center rounded-[16px] border border-dashed border-white/10 bg-white/[0.01]">
                          <p className="text-[10px] tracking-widest text-white/30 uppercase">No simulation neighbours (Clear horizon)</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* WEATHER ------------------------------------------------------------- */}
              {tab === 'weather' && (
                <div className="space-y-6">
                  <Slider label="Temperature" value={weather.temperature} min={16} max={44} step={0.5} display={`${weather.temperature.toFixed(1)}°C`} accent="#f97316" onChange={(v) => s.setWeather({ temperature: v })} />
                  <Slider label="Humidity" value={weather.humidity} min={20} max={100} step={1} display={`${Math.round(weather.humidity)}%`} accent="#38BDF8" onChange={(v) => s.setWeather({ humidity: v })} />
                  <Slider label="Cloud cover" value={weather.cloudCoverage} min={0} max={1} step={0.01} display={`${Math.round(weather.cloudCoverage * 100)}%`} accent="#94a3b8" onChange={(v) => s.setWeather({ cloudCoverage: v })} />
                  <Slider label="Rain" value={weather.rainIntensity} min={0} max={1} step={0.01} display={`${Math.round(weather.rainIntensity * 100)}%`} accent="#60a5fa" onChange={(v) => s.setWeather({ rainIntensity: v })} />
                  <Slider label="Wind speed" value={weather.windSpeed} min={0} max={60} step={1} display={`${Math.round(weather.windSpeed)} km/h`} accent="#22d3ee" onChange={(v) => s.setWeather({ windSpeed: v })} />
                  
                  <div className="border-t border-white/5 pt-4">
                    <MonthPicker />
                  </div>
                </div>
              )}

              {/* ADAPTIVE SKIN ------------------------------------------------------- */}
              {tab === 'skin' && (
                <div className="space-y-6">
                  {WEATHER_VALIDATION_MODE ? (
                    <div className="space-y-4">
                      <div>
                        <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.15em] text-white/50">Façade Control</p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {([
                            { key: 'manual', label: 'Manual' },
                            { key: 'sun-tracking', label: 'Solar' },
                            { key: 'pbif', label: 'PBIF' },
                          ] as const).map((o) => (
                            <button
                              key={o.key}
                              onClick={() => s.setFacadeControlMode(o.key)}
                              className={`rounded-lg border py-2 text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                                facadeControlMode === o.key 
                                  ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400 shadow-[inset_0_0_15px_rgba(0,208,132,0.1)]' 
                                  : 'border-white/5 bg-white/[0.02] text-white/40 hover:border-white/20 hover:text-white/80'
                              }`}
                            >
                              {o.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {facadeControlMode === 'sun-tracking' && (
                        <div>
                          <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.15em] text-white/50">Tracking Intent</p>
                          <div className="grid grid-cols-2 gap-1.5">
                            {([
                              { key: 'shade', label: 'Shade' },
                              { key: 'daylight', label: 'Daylight' },
                            ] as const).map((o) => (
                              <button
                                key={o.key}
                                onClick={() => s.setTrackingIntent(o.key)}
                                className={`rounded-lg border py-2 text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                                  trackingIntent === o.key 
                                    ? 'border-electric/30 bg-electric/10 text-electric shadow-[inset_0_0_15px_rgba(34,211,238,0.1)]' 
                                    : 'border-white/5 bg-white/[0.02] text-white/40 hover:border-white/20 hover:text-white/80'
                                }`}
                              >
                                {o.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="rounded-xl border border-white/5 bg-white/[0.01] p-3">
                        <p className="text-[10px] leading-relaxed text-white/40">
                          {facadeControlMode === 'manual'
                            ? 'Manual — you set the target angle directly.'
                            : facadeControlMode === 'sun-tracking'
                              ? 'Sun Tracking — kinematics respond dynamically to the solar vector.'
                              : 'PBIF — rule-based physics engine prioritises weather safety over solar performance.'}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.15em] text-white/50">Program Mode</p>
                      <div className="grid grid-cols-3 gap-1.5">
                        {PROGRAMS.map((pg) => (
                          <button
                            key={pg.key}
                            onClick={() => s.setSkinMode(pg.key)}
                            className={`flex flex-col items-center gap-2 rounded-xl border p-2 transition-colors ${
                              skinMode === pg.key 
                                ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-400 shadow-[inset_0_0_15px_rgba(0,208,132,0.1)]' 
                                : 'border-white/5 bg-white/[0.02] text-white/40 hover:border-white/20 hover:text-white/80'
                            }`}
                          >
                            <pg.icon className="h-4 w-4" />
                            <span className="text-[9px] font-semibold uppercase tracking-widest">{pg.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {(!WEATHER_VALIDATION_MODE || facadeControlMode === 'manual') && (
                    <>
                    <div className="rounded-[16px] border border-white/5 bg-white/[0.02] p-4">
                      <Slider
                        label={`Manual Rotation`}
                        value={manualRotation}
                        min={0}
                        max={WEATHER_VALIDATION_MODE ? MANUAL_MAX : 180}
                        step={1}
                        display={`${Math.round(manualRotation)}° · ${openLabel(manualRotation)}`}
                        accent="#00D084"
                        onChange={(v) => s.setManualRotation(v)}
                      />
                      <div className="mt-4 flex gap-1">
                        {[
                          { a: 0, l: 'CLS' },
                          { a: 45, l: 'HVY' },
                          { a: 60, l: 'PRT' },
                          { a: 90, l: 'OPN' },
                          { a: 180, l: 'PRV' },
                        ].map((q) => (
                          <button
                            key={q.a}
                            onClick={() => s.setManualRotation(q.a)}
                            className="flex-1 rounded-md bg-white/5 py-1.5 text-[9px] font-medium tracking-widest text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                          >
                            {q.l}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => s.openAll()} className="flex items-center justify-center gap-1.5 rounded-xl border border-white/5 bg-white/[0.02] py-2 text-[10px] font-semibold tracking-widest text-white/70 hover:border-white/20 hover:bg-white/5 hover:text-white">
                        <Sun className="h-3 w-3" /> OPEN ALL
                      </button>
                      <button onClick={() => s.closeAll()} className="flex items-center justify-center gap-1.5 rounded-xl border border-white/5 bg-white/[0.02] py-2 text-[10px] font-semibold tracking-widest text-white/70 hover:border-white/20 hover:bg-white/5 hover:text-white">
                        <Blinds className="h-3 w-3" /> CLOSE ALL
                      </button>
                      {!WEATHER_VALIDATION_MODE && (
                        <>
                          <button onClick={() => s.wave()} className="flex items-center justify-center gap-1.5 rounded-xl border border-white/5 bg-white/[0.02] py-2 text-[10px] font-semibold tracking-widest text-white/70 hover:border-white/20 hover:bg-white/5 hover:text-white">
                            <Waves className="h-3 w-3" /> WAVE
                          </button>
                          <button onClick={() => s.resetSkin()} className="flex items-center justify-center gap-1.5 rounded-xl border border-white/5 bg-white/[0.02] py-2 text-[10px] font-semibold tracking-widest text-white/70 hover:border-white/20 hover:bg-white/5 hover:text-white">
                            <RotateCcw className="h-3 w-3" /> RESET
                          </button>
                        </>
                      )}
                    </div>
                    </>
                  )}
                  {!WEATHER_VALIDATION_MODE && (
                    <div className="border-t border-white/5 pt-4 space-y-6">
                      <Slider label="Fault Injection (Loss)" value={powerLoss} min={0} max={1} step={0.05} display={`${Math.round(powerLoss * 100)}%`} accent="#f43f5e" onChange={(v) => s.setPowerLoss(v)} />
                      <SurfaceTargets />
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

function openLabel(angle: number): string {
  const o = 1 - Math.abs(Math.cos((angle * Math.PI) / 180))
  if (o > 0.9) return 'Open'
  if (o > 0.42) return 'Partial'
  if (o > 0.12) return 'Heavy'
  return 'Closed'
}

function MonthPicker() {
  const month = useTwinStore((s) => s.month)
  const setMonth = useTwinStore((s) => s.setMonth)
  const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
  return (
    <div>
      <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.15em] text-white/50">Month</p>
      <div className="grid grid-cols-4 gap-1.5">
        {MONTHS.map((m, i) => (
          <button
            key={m}
            onClick={() => setMonth(i)}
            className={`rounded-lg border py-1.5 text-[9px] font-semibold tracking-widest transition-colors ${
              month === i 
                ? 'border-electric/30 bg-electric/10 text-electric shadow-[inset_0_0_15px_rgba(34,211,238,0.1)]' 
                : 'border-white/5 bg-white/[0.02] text-white/40 hover:border-white/20 hover:text-white/80'
            }`}
          >
            {m}
          </button>
        ))}
      </div>
    </div>
  )
}

function SurfaceTargets() {
  const surfaces = useTwinStore((s) => s.snapshot.surfaces)
  const setSurfaceRotation = useTwinStore((s) => s.setSurfaceRotation)
  const [overrides, setOverrides] = useState<Record<string, number>>({})

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-[0.15em] text-white/50">Surfaces <span className="text-white/30">· {surfaces.length}</span></p>
      </div>
      <div className="max-h-[26vh] space-y-2 overflow-y-auto pr-2 no-scrollbar">
        {surfaces.map((sf) => {
          const value = overrides[sf.id] ?? sf.averagePanelAngle
          return (
            <div key={sf.id} className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5">
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-[10px] text-white/60">{sf.id}</span>
                <span className="text-[9px] font-bold tracking-widest text-emerald-400/80 uppercase">{STATE_LABEL[sf.dominantState]}</span>
              </div>
              <Slider
                label=""
                value={value}
                min={0}
                max={180}
                step={1}
                accent="#38BDF8"
                onChange={(v) => {
                  setOverrides((o) => ({ ...o, [sf.id]: v }))
                  setSurfaceRotation(sf.id, v)
                }}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** 
 * Interactive Compass replacing both the rotation slider and static compass.
 * Click or drag to set the building's heading.
 */
function InteractiveCompass({ heading, onChange }: { heading: number, onChange: (deg: number) => void }) {
  const cx = 80
  const cy = 80
  const r = 58
  const fw = bearingToSvg(heading)
  const fwX = cx + r * fw.x
  const fwY = cy + r * fw.y

  const handlePointer = (e: React.PointerEvent) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left - cx
    const y = e.clientY - rect.top - cy
    
    const rad = Math.atan2(y, x)
    let deg = (rad * 180) / Math.PI
    deg = deg + 90
    if (deg < 0) deg += 360
    
    onChange(Math.round(deg))
  }

  return (
    <div 
      className="relative mx-auto w-[150px] cursor-crosshair touch-none select-none"
      onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); handlePointer(e) }}
      onPointerMove={(e) => { if (e.buttons > 0) handlePointer(e) }}
    >
      <svg viewBox="0 0 160 160" className="w-full drop-shadow-[0_0_15px_rgba(0,0,0,0.5)]">
        <circle cx={cx} cy={cy} r={r} fill="rgba(255,255,255,0.01)" stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
        {/* cardinal ticks */}
        {[0, 90, 180, 270].map((b) => {
          const d = bearingToSvg(b)
          return <line key={b} x1={cx + (r - 6) * d.x} y1={cy + (r - 6) * d.y} x2={cx + r * d.x} y2={cy + r * d.y} stroke="rgba(255,255,255,0.2)" strokeWidth={1} />
        })}
        {/* minor ticks */}
        {Array.from({length: 12}).map((_, i) => {
          if (i % 3 === 0) return null
          const d = bearingToSvg(i * 30)
          return <line key={i} x1={cx + (r - 3) * d.x} y1={cy + (r - 3) * d.y} x2={cx + r * d.x} y2={cy + r * d.y} stroke="rgba(255,255,255,0.1)" strokeWidth={1} />
        })}
        <text x={cx} y={16} fontSize={10} fontWeight={700} fill="#fff" textAnchor="middle">N</text>
        <text x={152} y={cy + 3} fontSize={10} fontWeight={600} fill="rgba(255,255,255,0.4)" textAnchor="middle">E</text>
        <text x={cx} y={154} fontSize={10} fontWeight={600} fill="rgba(255,255,255,0.4)" textAnchor="middle">S</text>
        <text x={8} y={cy + 3} fontSize={10} fontWeight={600} fill="rgba(255,255,255,0.4)" textAnchor="middle">W</text>

        <g transform={`translate(${cx}, ${cy}) rotate(${heading})`} style={{ transition: 'transform 0.05s linear' }}>
          <rect x={-15} y={-20} width={30} height={40} rx={2} fill="rgba(52, 211, 153, 0.1)" stroke="#34d399" strokeWidth={1.5} />
          <polygon points="-5,-20 5,-20 0,-28" fill="#34d399" />
        </g>
        
        <line x1={cx} y1={cy} x2={fwX} y2={fwY} stroke="#34d399" strokeWidth={1.5} strokeDasharray="4 4" opacity={0.6} style={{ transition: 'all 0.05s linear' }} />
        <circle cx={cx} cy={cy} r={2.5} fill="#e2e8f0" />
      </svg>
    </div>
  )
}

function getCompassLabel(deg: number) {
  const d = ((deg % 360) + 360) % 360
  if (d < 22.5) return 'North'
  if (d < 67.5) return 'North-East'
  if (d < 112.5) return 'East'
  if (d < 157.5) return 'South-East'
  if (d < 202.5) return 'South'
  if (d < 247.5) return 'South-West'
  if (d < 292.5) return 'West'
  if (d < 337.5) return 'North-West'
  return 'North'
}
