'use client'

/**
 * reducedMotion — a cached `prefers-reduced-motion` flag readable from inside the
 * render loop (no React state, no per-frame matchMedia calls).
 *
 * Decorative, ambient motion (tree sway, drifting clouds, star rotation, passing
 * traffic) is paused for users who ask for reduced motion — WITHOUT touching any
 * engineering behaviour (the façade still tracks and eases, the simulation still
 * runs, every panel still reports live data). It simply removes non-essential
 * eye-candy animation, which is also a small performance win for those users.
 */

let reduced = false
let initialised = false

function ensure() {
  if (initialised || typeof window === 'undefined' || !window.matchMedia) return
  initialised = true
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
  reduced = mq.matches
  const onChange = (e: MediaQueryListEvent) => {
    reduced = e.matches
  }
  // `addEventListener` on MediaQueryList is the modern API; guard for older Safari.
  if (mq.addEventListener) mq.addEventListener('change', onChange)
  else mq.addListener(onChange)
}

/** True when the user prefers reduced motion. Safe on the server (returns false). */
export function prefersReducedMotion(): boolean {
  ensure()
  return reduced
}
