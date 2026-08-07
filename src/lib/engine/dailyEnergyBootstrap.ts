/**
 * Deterministic Daily Energy Initialisation — Stage 7.9.5.
 *
 * ── The problem ───────────────────────────────────────────────────────────
 * `DailyEnergyLedger` (Stage 7.9.4) correctly integrates energy from 00:00 to
 * "now" — but only over the ticks it has actually seen. A session that opens,
 * or a page that reloads, with the clock already at 19:11 has never ticked
 * through 00:00–19:11, so the ledger's honest answer for that stretch is "I
 * don't know" — displayed as 0.0 kWh. That reads as a bug: the twin should
 * show today's real accumulated energy regardless of when the browser
 * happened to load it.
 *
 * ── The fix ───────────────────────────────────────────────────────────────
 * Run the twin's own forward-projection physics — the SAME `projectAt` the AI
 * Prediction layer (Stage 8.1) walks forward with — from a midnight base
 * clock up to the landing time, and feed each step's resulting bus into the
 * ledger exactly as a live tick would. No second solar model, no second PV
 * curve, no second load or dispatch rule: every historical instant is the
 * twin's existing model evaluated at that hour, so the reconstruction is
 * "what the twin would have shown," not an estimate of it.
 *
 * ── What's held constant across the walk, and why ────────────────────────
 * These are the exact simplifications `projectAt` already documents for
 * projecting FORWARD (CLAUDE.md §11.2, §11.5) — reused unchanged, because the
 * same reasoning applies looking backward:
 * - **Façade openness is pinned at its current measured mean.** Reconstructing
 *   the blades' actual path through the day would mean reconstructing PBIF's
 *   history — PBIF is the sole controller, and the AI/bootstrap layer must
 *   never stand in for it, forward OR backward.
 * - **Thermal lags are read at equilibrium**, not integrated minute by minute
 *   (`equilibriumThermalState`, inside `projectAt`).
 * - **Weather is sampled from whichever timeline is active**, at each
 *   historical hour. `sampleTimeline` is a pure function of hour-of-day
 *   (CLAUDE.md §5.3), so this is exact for Scenario/Forecast Mode. Manual
 *   Mode has no history to sample, so the operator's current sliders are held
 *   for the whole reconstructed day — the same persistence rule
 *   `projectDrivers` already applies going forward.
 * - **The battery starts the day at `batteryStartKWh`** — the just-constructed
 *   engine's own default state of charge, i.e. the same assumption the live
 *   twin already makes about where the battery begins. The walk carries it
 *   forward through real dispatch decisions (`planStorage`) rather than
 *   skipping straight to "now."
 *
 * Nothing here is fabricated or averaged: every step is a real evaluation of
 * the twin's physics at a real point in time, and every simplification above
 * already exists elsewhere in this codebase for the identical reason.
 *
 * ── Why it never touches a live engine ───────────────────────────────────
 * `ctx` is read-only `PredictionContext` data (CLAUDE.md §11.1 — no engine
 * reference reaches it), and the battery figure is a local number, not the
 * live `BatteryEnergyEngine`. The only object this function mutates is the
 * `ledger` passed in. Grid, Battery, PV and Building Energy stay exactly the
 * engines Stage 7.9.4 already validated.
 *
 * ── Cost ──────────────────────────────────────────────────────────────────
 * Runs once, synchronously, at construction (or whenever a session needs to
 * re-baseline a day it never ticked through) — never from the render loop.
 * `BOOTSTRAP_STEP_HOURS` trades reconstruction resolution against that
 * one-time cost; five minutes tracks the solar ramp closely enough for a
 * kWh figure while keeping even a 23:30 landing time to a few hundred steps.
 * Those steps write through `writeHistorical`, not the normal per-tick
 * `update()` — recomputing the displayed totals after every intermediate
 * step would rescan the whole bucket grid for a total nothing reads until
 * the walk finishes; `update()` is called exactly once, at the end.
 */

import { emptyBus, projectAt } from '../prediction/projection'
import type { PredictionContext } from '../prediction/types'
import type { DailyEnergyLedger } from './energyLedger'

const BOOTSTRAP_STEP_HOURS = 1 / 12 // 5 simulated minutes

/**
 * Reconstruct `ledger`'s totals from 00:00 to `landingHours` using the twin's
 * own projection physics, then leave the ledger positioned exactly at
 * `landingHours` so live ticking continues the same integral without a gap
 * or a double count.
 *
 * @param ledger          The (freshly constructed, empty) daily ledger.
 * @param ctx             Read-only context for "today" — weather timeline,
 *                         geometry, plant limits and the current measured
 *                         façade openness. Its `clock.timeHours` is ignored;
 *                         the walk supplies its own, starting at midnight.
 * @param landingHours    The simulated time of day to reconstruct up to, 0–24.
 * @param batteryStartKWh Assumed state of charge at 00:00 — the battery
 *                         engine's own just-constructed default.
 */
export function bootstrapDailyEnergy(
  ledger: DailyEnergyLedger,
  ctx: PredictionContext,
  landingHours: number,
  batteryStartKWh: number,
): void {
  ledger.beginBootstrap()

  const midnightCtx: PredictionContext = { ...ctx, clock: { ...ctx.clock, timeHours: 0 } }
  const bus = emptyBus()
  let storedKWh = batteryStartKWh
  let h = 0

  while (h < landingHours - 1e-9) {
    const next = Math.min(landingHours, h + BOOTSTRAP_STEP_HOURS)
    const step = projectAt(midnightCtx, next, storedKWh, ctx.timeline, bus, next - h)
    storedKWh = step.storedKWh
    ledger.writeHistorical(h, next, bus)
    h = next
  }

  // Place the read head at the landing hour and recompute the displayed
  // totals exactly once, now that the whole walk has finished.
  ledger.update(landingHours, 0, bus)
}
