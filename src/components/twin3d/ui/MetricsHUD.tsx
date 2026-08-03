'use client'

import { useState } from 'react'
import { useTwinStore } from '@/lib/engine/store'
import { WEATHER_VALIDATION_MODE } from '@/lib/engine/validationMode'
import { assessRain, type RainState } from '@/lib/pbif'
import { IrradianceInspector } from './IrradianceInspector'
import { UVIndexInspector } from './UVIndexInspector'

/** Plain-language rain labels, keyed by the SAME PBIF rain state the decision
 *  engine and Virtual Embedded Controller consume — one source of truth. */
const RAIN_LABEL: Record<RainState, string> = {
  NONE: 'No Rain',
  LIGHT: 'Light Rain',
  MODERATE: 'Moderate Rain',
  HEAVY: 'Heavy Rain',
}

function Metric({
  label,
  value,
  unit,
  secondary,
  accent,
  onClick,
  tooltip,
  className,
}: {
  label: string
  value: string
  unit?: string
  /** Smaller trailing text, e.g. the rain intensity percentage "(100%)". */
  secondary?: string
  accent?: string
  onClick?: () => void
  /** Native hover tooltip — a concise engineering description of the metric. */
  tooltip?: string
  /** Extra classes, e.g. `col-span-2` for a wide state card. */
  className?: string
}) {
  return (
    <div
      title={tooltip}
      className={`rounded-xl bg-white/[0.03] px-2.5 py-1.5 ${onClick ? 'cursor-pointer transition-all hover:bg-white/[0.07] hover:ring-1 hover:ring-white/10' : ''} ${className ?? ''}`}
      onClick={onClick}
    >
      <p className="text-[9px] font-medium uppercase tracking-wider text-white/45">
        {label}
        {onClick && <span className="ml-1 text-[8px] text-white/25">ⓘ</span>}
      </p>
      <p className="font-mono text-[13px] font-semibold tabular-nums" style={{ color: accent ?? '#fff' }}>
        {value}
        {unit && <span className="ml-0.5 text-[9px] text-white/50">{unit}</span>}
        {secondary && <span className="ml-1 text-[9px] font-normal text-white/40">{secondary}</span>}
      </p>
    </div>
  )
}

/** Group heading — matches the existing panel label typography (see SolarGeometry). */
function GroupLabel({ children }: { children: React.ReactNode }) {
  return <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wider text-white/50">{children}</p>
}

/**
 * WeatherPanelBody — the "Environmental Conditions" panel, rendered inside a
 * FloatingWindow (the window shell owns the title, drag, collapse and close).
 *
 * WEATHER VALIDATION OVERRIDE:
 *  If WEATHER_VALIDATION_MODE is true, this panel presents the complete
 *  environmental state PBIF evaluates, split into two groups — Solar Environment
 *  (sun geometry + radiation) and Atmospheric Environment (temperature,
 *  humidity, wind, cloud, rain). Every value is read live from the SAME snapshot
 *  the Situation Assessment / Virtual Embedded Controller consume, so there is no
 *  discrepancy between systems. PBIF-derived building metrics (blade angle,
 *  openness, cooling, daylight, comfort, energy saving, actuators, façade temp)
 *  are hidden until PBIF is reintroduced. Clicking Irradiance / UV opens the
 *  Engineering Inspector. */
export function WeatherPanelBody() {
  const snap = useTwinStore((s) => s.snapshot)
  const w = snap.weather
  const m = snap.metrics

  const [showIrradiance, setShowIrradiance] = useState(false)
  const [showUV, setShowUV] = useState(false)

  return (
    <>
      {/* Live status strip (was the panel header's daytime dot + fps readout). */}
      <div className="mb-3 flex items-center justify-between rounded-xl bg-white/[0.03] px-2.5 py-1.5 text-[10px]">
        <span className="inline-flex items-center gap-1.5 text-white/60">
          <span className={`h-2 w-2 rounded-full ${snap.sun.isDaytime ? 'bg-emerald' : 'bg-electric'} animate-pulse`} />
          {snap.sun.isDaytime ? 'Daytime' : 'Night'}
        </span>
        <span className="font-mono text-white/45">{snap.fps} fps</span>
      </div>

      {WEATHER_VALIDATION_MODE ? (
        <div className="space-y-3">
          {/* ── Solar Environment ─────────────────────────────────────────────
              Sun geometry + radiation. GHI and UV open the Engineering Inspector. */}
          <div>
            <GroupLabel>Solar Environment</GroupLabel>
            <div className="grid grid-cols-2 gap-2">
              <Metric label="Sun azimuth" value={`${snap.sun.azimuth}`} unit="°" accent="#fbbf24" />
              <Metric label="Sun altitude" value={`${snap.sun.altitude}`} unit="°" accent="#fbbf24" />
              <Metric
                label="Irradiance (GHI)"
                value={`${snap.sun.irradiance}`}
                unit="W/m²"
                accent="#fbbf24"
                onClick={() => setShowIrradiance(true)}
              />
              <Metric
                label="UV index"
                value={`${snap.sun.uvIndex}`}
                accent="#fbbf24"
                onClick={() => setShowUV(true)}
              />
            </div>
          </div>

          {/* ── Atmospheric Environment ───────────────────────────────────────
              The atmospheric loads PBIF evaluates — read live from the SAME
              weather state (snap.weather) the Situation Assessment consumes. */}
          <div>
            <GroupLabel>Atmospheric Environment</GroupLabel>
            <div className="grid grid-cols-2 gap-2">
              <Metric
                label="Air temp"
                value={`${w.temperature.toFixed(1)}`}
                unit="°C"
                accent="#f97316"
                tooltip="Outdoor air temperature driving PBIF thermal-demand assessment."
              />
              <Metric
                label="Humidity"
                value={`${Math.round(w.humidity)}`}
                unit="%"
                accent="#38BDF8"
                tooltip="Relative humidity of the surrounding environment."
              />
              <Metric
                label="Wind speed"
                value={`${Math.round(w.windSpeed)}`}
                unit="km/h"
                accent="#22d3ee"
                tooltip="Current ambient wind speed affecting façade loading."
              />
              <Metric
                label="Cloud cover"
                value={`${Math.round(w.cloudCoverage * 100)}`}
                unit="%"
                accent="#94a3b8"
                tooltip="Cloud cover, the proxy PBIF uses to estimate the available solar resource."
              />
              <Metric
                className="col-span-2"
                label="Rain"
                value={RAIN_LABEL[assessRain(w.rainIntensity).state]}
                secondary={`(${Math.round(w.rainIntensity * 100)}%)`}
                accent="#60a5fa"
                tooltip="Current rainfall intensity used by PBIF weather-protection logic."
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Sun azimuth" value={`${snap.sun.azimuth}`} unit="°" accent="#fbbf24" />
          <Metric label="Sun altitude" value={`${snap.sun.altitude}`} unit="°" accent="#fbbf24" />
          <Metric
            label="Irradiance (GHI)"
            value={`${snap.sun.irradiance}`}
            unit="W/m²"
            accent="#fbbf24"
            onClick={() => setShowIrradiance(true)}
          />
          <Metric label="Surfaces" value={`${m.surfaceCount}`} accent="#38BDF8" />
          <Metric label="Avg Blade Angle" value={`${m.averagePanelAngle}`} unit="°" accent="#a78bfa" />
          <Metric label="Openness" value={`${Math.round(m.averageOpenness * 100)}`} unit="%" accent="#22d3ee" />
          <Metric label="Cooling load" value={`${m.totalCoolingLoad}`} unit="kW" accent="#f43f5e" />
          <Metric label="Daylight" value={`${m.averageDaylight}`} unit="%" accent="#38BDF8" />
          <Metric label="Comfort" value={`${m.averageComfort}`} unit="/100" accent="#00D084" />
          <Metric label="Energy saving" value={`${m.totalEnergySaving}`} unit="%" accent="#00D084" />
          <Metric label="Skin temp" value={`${m.averageFacadeTemperature}`} unit="°C" accent="#f97316" />
          <Metric label="Actuators" value={`${(m.totalPowerConsumption / 1000).toFixed(2)}`} unit="kW" accent="#fbbf24" />
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between border-t border-white/5 pt-2.5 text-[10px]">
        <span className="text-white/45">{m.totalPanels} panels</span>
        <span className="text-emerald">● {m.healthyPanels} ok</span>
        {!WEATHER_VALIDATION_MODE && <span className="text-electric">◆ {m.movingPanels} moving</span>}
        {/* Fault statistics hidden in Weather Validation Mode (no faults exist). */}
        {!WEATHER_VALIDATION_MODE && <span className="text-red-400">▲ {m.faultPanels} fault</span>}
      </div>

      {/* Engineering Inspectors (modal overlays) */}
      {showIrradiance && <IrradianceInspector onClose={() => setShowIrradiance(false)} />}
      {showUV && <UVIndexInspector onClose={() => setShowUV(false)} />}
    </>
  )
}
