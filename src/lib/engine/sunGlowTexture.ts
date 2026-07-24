'use client'

import * as THREE from 'three'

let cachedTexture: THREE.CanvasTexture | null = null

/**
 * Soft radial-gradient glow sprite texture for the sun halo — used when cloud
 * cover obscures the crisp solar disc but the sun still shows through as a
 * diffuse glow. Generated once and cached, the same pattern as
 * `getWindowTexture()`; a cheap alternative to a bloom post-process pass.
 */
export function getSunGlowTexture(): THREE.CanvasTexture {
  if (cachedTexture) return cachedTexture

  const size = 256
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No 2d context')

  const c = size / 2
  const gradient = ctx.createRadialGradient(c, c, 0, c, c, c)
  gradient.addColorStop(0, 'rgba(255,255,255,0.95)')
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.55)')
  gradient.addColorStop(0.6, 'rgba(255,255,255,0.16)')
  gradient.addColorStop(1, 'rgba(255,255,255,0)')

  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  cachedTexture = texture
  return texture
}
