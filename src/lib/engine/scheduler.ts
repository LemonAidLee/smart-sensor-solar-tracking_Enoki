/**
 * scheduler — the Digital Twin's update-frequency primitives.
 *
 * A real-time twin should NOT run every subsystem at the render rate. Expensive
 * calculations (solar geometry, irradiance, PBIF, occlusion, metrics) change far
 * more slowly than the camera repaints, so tying them to 60 fps just wastes CPU
 * and destabilises frame pacing. Instead we group updates by the frequency each
 * subsystem actually needs:
 *
 *   • Render tier   (every frame)   — camera, façade easing/interpolation, cursor.
 *   • High freq     (~20–30 Hz)     — solar/weather recompute, target resolution,
 *                                     animated city elements.
 *   • Medium freq   (~2–10 Hz)      — PBIF, metrics, engineering-inspector data.
 *   • Low freq      (~1 Hz / dirty) — labels, diagnostics, panel summaries.
 *
 * `RateLimiter` is the tiny primitive that expresses a tier: feed it the frame
 * delta and it tells you, at most once per interval, how much wall-clock time
 * elapsed since it last fired (so the throttled subsystem can step with the
 * correct dt). This is the standard fixed-timestep / accumulator pattern used by
 * simulation and game engines, and it scales cleanly as future twin features
 * (solar obstruction, reflected irradiance, wind flow) are added.
 */

/** Fires at most once per `interval` seconds, reporting the true elapsed time. */
export class RateLimiter {
  private acc = 0
  constructor(private readonly interval: number) {}

  /**
   * Advance by one frame. Returns the elapsed seconds since the previous fire
   * when the tier is due this frame, or `0` when it is not (so callers can
   * `if (const dt = limiter.tick(frameDt))`). Under heavy load (frame time ≥
   * interval) it fires every frame — i.e. it never accumulates unbounded lag.
   */
  tick(frameDt: number): number {
    this.acc += frameDt
    if (this.acc >= this.interval) {
      const elapsed = this.acc
      this.acc = 0
      return elapsed
    }
    return 0
  }

  /** Force the next `tick` to fire (e.g. after a config change needs an update). */
  trigger(): void {
    this.acc = this.interval
  }
}

/** Convenience: a limiter expressed in Hz rather than seconds. */
export function rateHz(hz: number): RateLimiter {
  return new RateLimiter(1 / hz)
}
