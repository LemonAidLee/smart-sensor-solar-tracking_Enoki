/**
 * Typed access layer for the pre-aggregated Kuala Lumpur weather climatology.
 *
 * The raw Kaggle dataset (shahmirvarqha/weather-data-malaysia, ~24.5M rows) is
 * distilled offline by scripts/aggregate_kl_weather.py — it streams the CSV in
 * chunks, filters state === "Kuala Lumpur", parses timestamps into month/hour,
 * and writes the compact climatology below. This module just types it and
 * derives a few display selectors so the UI stays lean and fully memoizable.
 */
import raw from "./kl_weather.json"

export interface MonthlyPoint {
  month: number
  name: string
  temperature: number
  feelsLike: number
  humidity: number
  windSpeed: number
  solar: number
  uvIndex: number
  rainfall: number
}

export interface HourlyPoint {
  hour: number
  temperature: number
  humidity: number
  windSpeed: number
  solar: number
  uvIndex: number
  rainfall: number
}

export interface WeatherData {
  meta: {
    source: string
    region: string
    records: number
    yearStart: number
    yearEnd: number
  }
  overall: {
    temperature: number
    humidity: number
    rainfall: number
    windSpeed: number
    solar: number
    uvIndex: number
  }
  monthly: MonthlyPoint[]
  hourly: HourlyPoint[]
  insights: {
    peakSolarMonths: string[]
    peakRainfallMonth: string
    peakWindMonths: string[]
    peakHumidityMonth: string
    peakSolarHour: number
    peakTempHour: number
  }
}

export const weatherData = raw as WeatherData

/* Metric configuration — drives tabs, KPI accents, and chart rendering ------ */
export type MetricKey = "temperature" | "humidity" | "rainfall" | "windSpeed" | "solar"
export type ChartKind = "line" | "area" | "bar"

export interface MetricConfig {
  label: string
  tab: string
  unit: string
  color: string
  chart: ChartKind
  decimals: number
}

export const METRICS: Record<MetricKey, MetricConfig> = {
  temperature: { label: "Temperature", tab: "Temperature", unit: "°C", color: "#fb7185", chart: "line", decimals: 1 },
  humidity: { label: "Humidity", tab: "Humidity", unit: "%", color: "#38BDF8", chart: "area", decimals: 0 },
  rainfall: { label: "Rainfall", tab: "Rainfall", unit: "mm/h", color: "#60a5fa", chart: "bar", decimals: 2 },
  windSpeed: { label: "Wind Speed", tab: "Wind", unit: "m/s", color: "#94a3b8", chart: "line", decimals: 1 },
  solar: { label: "Solar Radiation", tab: "Solar", unit: "W/m²", color: "#fbbf24", chart: "area", decimals: 0 },
}

export const TAB_ORDER: MetricKey[] = ["temperature", "humidity", "rainfall", "windSpeed", "solar"]

/* Selectors ---------------------------------------------------------------- */

/** Formats a 12h clock label from a 24h hour, e.g. 13 -> "1 PM". */
export function hourLabel(h: number): string {
  const period = h < 12 ? "AM" : "PM"
  const hr = h % 12 === 0 ? 12 : h % 12
  return `${hr} ${period}`
}

/** Four headline KPIs for a given month (1-12), with delta vs. annual mean. */
export function kpisForMonth(month: number) {
  const m = weatherData.monthly.find((d) => d.month === month) ?? weatherData.monthly[0]
  const o = weatherData.overall
  return {
    monthName: m.name,
    temperature: { value: m.temperature, delta: +(m.temperature - o.temperature).toFixed(1) },
    humidity: { value: m.humidity, delta: +(m.humidity - o.humidity).toFixed(1) },
    rainfall: { value: m.rainfall, delta: +(m.rainfall - o.rainfall).toFixed(2) },
    windSpeed: { value: m.windSpeed, delta: +(m.windSpeed - o.windSpeed).toFixed(1) },
  }
}

/** Static, dataset-derived engineering insights shown below the chart. */
export function baseInsights() {
  const i = weatherData.insights
  return [
    {
      icon: "sun",
      text: `Highest solar exposure occurs across ${i.peakSolarMonths.slice(0, 2).join(" & ")}, when façade tilt is pre-optimised for irradiance.`,
    },
    {
      icon: "cloud-rain",
      text: `Rainfall peaks during ${i.peakRainfallMonth} — the AI relaxes shading and prioritises daylight capture.`,
    },
    {
      icon: "wind",
      text: `Strong winds concentrate around ${i.peakWindMonths.join(" & ")} monsoon periods, triggering protective panel stow logic.`,
    },
    {
      icon: "gauge",
      text: `AI increases façade shading between ${hourLabel(i.peakSolarHour)} and ${hourLabel(i.peakSolarHour + 3)} to blunt peak solar gain.`,
    },
    {
      icon: "zap",
      text: `Estimated cooling demand is highest near ${hourLabel(i.peakTempHour)}, when ambient temperature crests for the day.`,
    },
  ]
}

/** A shading recommendation that adapts to the selected month's solar load. */
export function monthAdvisory(month: number) {
  const m = weatherData.monthly.find((d) => d.month === month) ?? weatherData.monthly[0]
  const solarValues = weatherData.monthly.map((d) => d.solar)
  const min = Math.min(...solarValues)
  const max = Math.max(...solarValues)
  const load = (m.solar - min) / (max - min || 1) // 0..1 relative solar load
  const shade = Math.round(35 + load * 55) // 35%..90% shading response
  const tilt = Math.round(18 + load * 24) // 18°..42° tracking tilt
  let posture: string
  if (load > 0.66) posture = "aggressive solar shading"
  else if (load > 0.33) posture = "balanced daylight harvesting"
  else posture = "open daylight capture"
  return { monthName: m.name, solar: m.solar, humidity: m.humidity, shade, tilt, posture }
}