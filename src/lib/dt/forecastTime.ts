/**
 * Forecast timestamp formatting — the single source of these strings.
 *
 * Every forecast time is presented in the FORECAST SITE's own clock, not the
 * viewer's browser timezone: the whole point of showing dates is that the
 * operator can put the twin side by side with Open-Meteo's published forecast
 * and see the same numbers. The site's UTC offset and timezone abbreviation come
 * from the provider's own response.
 *
 * Pure formatting. Import these; never retype the format inline.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const pad = (n: number) => n.toString().padStart(2, '0')

/**
 * Shift an instant into site-local time, then read it with UTC getters — this is
 * what makes the result independent of where the viewer's machine is.
 */
function siteDate(epochMs: number, utcOffsetSeconds: number): Date {
  return new Date(epochMs + utcOffsetSeconds * 1000)
}

/** "2 Aug" */
export function formatSiteDay(epochMs: number, utcOffsetSeconds: number): string {
  const d = siteDate(epochMs, utcOffsetSeconds)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`
}

/** "2 Aug 2026" */
export function formatSiteDate(epochMs: number, utcOffsetSeconds: number): string {
  const d = siteDate(epochMs, utcOffsetSeconds)
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

/** "15:00" */
export function formatSiteClock(epochMs: number, utcOffsetSeconds: number): string {
  const d = siteDate(epochMs, utcOffsetSeconds)
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

/** "15:00 MYT" — for a moment whose date is obvious from context. */
export function formatSiteTime(epochMs: number | null, utcOffsetSeconds: number, tz: string): string {
  if (epochMs == null) return '—'
  return `${formatSiteClock(epochMs, utcOffsetSeconds)} ${tz}`
}

/** "2 Aug 2026 15:00 MYT" — the fully qualified stamp. */
export function formatSiteStamp(epochMs: number | null, utcOffsetSeconds: number, tz: string): string {
  if (epochMs == null) return '—'
  return `${formatSiteDate(epochMs, utcOffsetSeconds)} ${formatSiteClock(epochMs, utcOffsetSeconds)} ${tz}`
}

/** "1 Aug 2026 10:00 MYT → 3 Aug 2026 10:00 MYT" */
export function formatCoverage(
  startMs: number | null,
  endMs: number | null,
  utcOffsetSeconds: number,
  tz: string,
): string {
  if (startMs == null || endMs == null) return '—'
  return `${formatSiteStamp(startMs, utcOffsetSeconds, tz)} → ${formatSiteStamp(endMs, utcOffsetSeconds, tz)}`
}

/** "42 min" / "2 h 05 min" — durations, not instants. */
export function formatMinutes(minutes: number): string {
  if (minutes < 0) return '—'
  if (minutes < 60) return `${minutes} min`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h} h` : `${h} h ${pad(m)} min`
}
