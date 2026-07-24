"use client"

import { memo } from "react"
import {
  ResponsiveContainer,
  LineChart, Line,
  AreaChart, Area,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
} from "recharts"
import type { MonthlyPoint, MetricKey } from "@/data/klWeather"
import { METRICS } from "@/data/klWeather"

interface WeatherChartProps {
  metric: MetricKey
  data: MonthlyPoint[]
  selectedMonth: number
}

/* Glassy custom tooltip ---------------------------------------------------- */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label, metric }: any) {
  if (!active || !payload?.length) return null
  const m = METRICS[metric as MetricKey]
  const val = payload[0].value
  return (
    <div className="rounded-xl border border-white/10 bg-navy/80 backdrop-blur-xl px-3.5 py-2.5 shadow-[0_20px_45px_-20px_rgba(0,0,0,0.8)]">
      <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: m.color }} />
        <span className="font-mono text-white text-sm font-semibold">
          {val === null || val === undefined ? "—" : val}
          <span className="text-gray-400 text-xs ml-1">{m.unit}</span>
        </span>
      </div>
    </div>
  )
}

const AXIS = { fill: "#64748b", fontSize: 11 }
const GRID_STROKE = "rgba(255,255,255,0.06)"

function WeatherChartsBase({ metric, data, selectedMonth }: WeatherChartProps) {
  const m = METRICS[metric]
  const activeName = data.find((d) => d.month === selectedMonth)?.name
  const gradId = `wx-grad-${metric}`

  const common = {
    data,
    margin: { top: 12, right: 12, left: -12, bottom: 4 },
  }

  const axes = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
      <XAxis dataKey="name" tick={AXIS} axisLine={false} tickLine={false} interval={0} />
      <YAxis tick={AXIS} axisLine={false} tickLine={false} width={44} />
      <Tooltip
        content={<ChartTooltip metric={metric} />}
        cursor={{ stroke: m.color, strokeOpacity: 0.35, strokeWidth: 1 }}
      />
      {activeName && (
        <ReferenceLine
          x={activeName}
          stroke={m.color}
          strokeOpacity={0.55}
          strokeDasharray="4 4"
        />
      )}
    </>
  )

  const grad = (
    <defs>
      <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={m.color} stopOpacity={0.55} />
        <stop offset="100%" stopColor={m.color} stopOpacity={0.02} />
      </linearGradient>
    </defs>
  )

  let chart: React.ReactElement

  if (m.chart === "line") {
    chart = (
      <LineChart {...common}>
        {axes}
        <Line
          type="monotone"
          dataKey={metric}
          stroke={m.color}
          strokeWidth={2.5}
          dot={{ r: 3, fill: "#060608", stroke: m.color, strokeWidth: 2 }}
          activeDot={{ r: 6, fill: m.color, stroke: "#060608", strokeWidth: 2 }}
          animationDuration={700}
          connectNulls
        />
      </LineChart>
    )
  } else if (m.chart === "bar") {
    chart = (
      <BarChart {...common}>
        {grad}
        {axes}
        <Bar
          dataKey={metric}
          fill={`url(#${gradId})`}
          stroke={m.color}
          strokeOpacity={0.6}
          radius={[6, 6, 0, 0]}
          animationDuration={700}
        />
      </BarChart>
    )
  } else {
    chart = (
      <AreaChart {...common}>
        {grad}
        {axes}
        <Area
          type="monotone"
          dataKey={metric}
          stroke={m.color}
          strokeWidth={2.5}
          fill={`url(#${gradId})`}
          dot={{ r: 3, fill: "#060608", stroke: m.color, strokeWidth: 2 }}
          activeDot={{ r: 6, fill: m.color, stroke: "#060608", strokeWidth: 2 }}
          animationDuration={700}
          connectNulls
        />
      </AreaChart>
    )
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      {chart}
    </ResponsiveContainer>
  )
}

export const WeatherCharts = memo(WeatherChartsBase)
export default WeatherCharts