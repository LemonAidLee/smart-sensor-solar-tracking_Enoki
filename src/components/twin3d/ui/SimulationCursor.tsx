'use client'

import { useEffect, useRef, useState } from 'react'
import './SimulationCursor.css'

export function SimulationCursor() {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const ghostRef = useRef<HTMLDivElement>(null)
  const haloRef = useRef<HTMLDivElement>(null)
  
  const [disabled, setDisabled] = useState(true)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const isTouch = window.matchMedia('(pointer: coarse)').matches
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (isTouch || prefersReducedMotion) return
    setDisabled(false)

    // Apply global body class to hide default cursor in DT only
    document.body.classList.add('dt-cursor-active')

    let targetX = -100
    let targetY = -100
    
    let inX = -100, inY = -100
    let outX = -100, outY = -100
    let gX = -100, gY = -100
    let hX = -100, hY = -100

    let state = 'default'
    let magX: number | null = null
    let magY: number | null = null
    let magStrength = 0

    const lerp = (a: number, b: number, n: number) => (1 - n) * a + n * b

    const handleMouseMove = (e: MouseEvent) => {
      targetX = e.clientX
      targetY = e.clientY

      const target = e.target as HTMLElement
      
      const btn = target.closest('button, a, .cursor-pointer')
      const input = target.closest('input[type="range"], .wx-range')
      const isTimeline = target.closest('.timeline-scrubber')
      const isCamera = e.buttons > 0
      
      let newState = 'default'
      magX = null
      magY = null
      magStrength = 0

      if (isTimeline) {
        newState = 'dragging-timeline'
      } else if (input) {
        newState = 'slider-hover'
      } else if (btn) {
        const rect = btn.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        const dist = Math.hypot(targetX - cx, targetY - cy)
        
        // Only trigger full hover when the pointer is genuinely over the visual core.
        // Assume visual icons are around 20-32px (10-16px radius).
        const coreRadius = Math.min(rect.width / 2, rect.height / 2, 16)
        
        if (dist <= coreRadius) {
          newState = 'button-hover'
          magX = cx
          magY = cy
          magStrength = 0.04 // extremely subtle precise snap
        } else {
          newState = 'proximity'
          magX = cx
          magY = cy
          magStrength = 0.01 // negligible, almost pure 1:1
        }
      } else if (isCamera && !target.closest('.dt-ui-layer')) {
        newState = 'camera-orbit'
      }

      const canvasState = document.body.getAttribute('data-canvas-cursor')
      if (canvasState && newState === 'default') {
        newState = canvasState
      }

      if (newState !== state) {
        state = newState
        outerRef.current?.setAttribute('data-state', state)
        innerRef.current?.setAttribute('data-state', state)
        haloRef.current?.setAttribute('data-state', state)
      }
    }

    const handleCustomState = (e: CustomEvent) => {
      if (e.detail) {
        document.body.setAttribute('data-canvas-cursor', e.detail)
      } else {
        document.body.removeAttribute('data-canvas-cursor')
      }
    }

    const handleMouseDown = () => {
      outerRef.current?.classList.add('clicking')
      innerRef.current?.classList.add('clicking')
      haloRef.current?.classList.add('clicking')
    }
    const handleMouseUp = () => {
      outerRef.current?.classList.remove('clicking')
      innerRef.current?.classList.remove('clicking')
      haloRef.current?.classList.remove('clicking')
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('dt-cursor-state', handleCustomState as EventListener)

    let reqId: number

    const render = () => {
      let finalX = targetX
      let finalY = targetY

      if (magX !== null && magY !== null) {
        finalX = lerp(targetX, magX, magStrength)
        finalY = lerp(targetY, magY, magStrength)
      }

      // spring physics
      inX = lerp(inX, finalX, 0.45)
      inY = lerp(inY, finalY, 0.45)

      outX = lerp(outX, finalX, 0.2)
      outY = lerp(outY, finalY, 0.2)

      gX = lerp(gX, finalX, 0.08)
      gY = lerp(gY, finalY, 0.08)

      hX = lerp(hX, finalX, 0.15)
      hY = lerp(hY, finalY, 0.15)

      if (innerRef.current) {
        innerRef.current.style.setProperty('--cx', `${inX}px`)
        innerRef.current.style.setProperty('--cy', `${inY}px`)
      }
      if (outerRef.current) {
        outerRef.current.style.setProperty('--cx', `${outX}px`)
        outerRef.current.style.setProperty('--cy', `${outY}px`)
      }
      if (ghostRef.current) {
        ghostRef.current.style.setProperty('--cx', `${gX}px`)
        ghostRef.current.style.setProperty('--cy', `${gY}px`)
      }
      if (haloRef.current) {
        haloRef.current.style.setProperty('--cx', `${hX}px`)
        haloRef.current.style.setProperty('--cy', `${hY}px`)
      }

      reqId = requestAnimationFrame(render)
    }
    
    reqId = requestAnimationFrame(render)

    return () => {
      document.body.classList.remove('dt-cursor-active')
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('dt-cursor-state', handleCustomState as EventListener)
      cancelAnimationFrame(reqId)
    }
  }, [])

  if (disabled) return null

  return (
    <div className="pointer-events-none fixed inset-0 z-[99999] overflow-hidden">
      {/* Halo Layer */}
      <div 
        ref={haloRef}
        className="sim-cursor-halo"
      />
      {/* Ghost Trail */}
      <div 
        ref={ghostRef}
        className="sim-cursor-ghost"
      />
      {/* Outer Geometric Ring */}
      <div 
        ref={outerRef}
        className="sim-cursor-outer"
      >
        <div className="sim-cursor-crosshair horizontal" />
        <div className="sim-cursor-crosshair vertical" />
      </div>
      {/* Inner Precision Dot */}
      <div 
        ref={innerRef}
        className="sim-cursor-inner"
      />
    </div>
  )
}
