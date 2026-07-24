'use client'

import * as THREE from 'three'

let cachedTexture: THREE.CanvasTexture | null = null

export function getWindowTexture(): THREE.CanvasTexture {
  if (cachedTexture) return cachedTexture

  const canvas = document.createElement('canvas')
  // Use a 512x512 canvas for the emissive window map
  canvas.width = 512
  canvas.height = 512
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('No 2d context')

  // Base background is black (no emissive light)
  ctx.fillStyle = '#000000'
  ctx.fillRect(0, 0, 512, 512)

  const rows = 16
  const cols = 16
  const w = 512 / cols
  const h = 512 / rows
  const paddingX = w * 0.15
  const paddingY = h * 0.25

  // Cyberpunk + Realistic Skyscraper color palette
  // Warm office whites, cool fluorescents, and splashes of neon pink/cyan
  const colors = [
    '#ffebb3', // Warm tungsten
    '#ffffff', // Bright white
    '#c4e8ff', // Cool fluorescent
    '#c4e8ff', 
    '#08f7fe', // Neon cyan
    '#fe53bb', // Neon pink
    '#00ff41', // Matrix green
  ]

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // 35% chance a window is lit
      if (Math.random() > 0.65) {
        const color = colors[Math.floor(Math.random() * colors.length)]
        ctx.fillStyle = color
        
        // Randomly dim some windows for variety
        ctx.globalAlpha = Math.random() > 0.5 ? Math.random() * 0.4 + 0.1 : 1.0

        ctx.fillRect(c * w + paddingX, r * h + paddingY, w - paddingX * 2, h - paddingY * 2)
        ctx.globalAlpha = 1.0
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  
  // NearestFilter keeps the window edges sharp and crisp instead of blurry
  texture.magFilter = THREE.NearestFilter 
  texture.minFilter = THREE.NearestMipmapLinearFilter
  texture.colorSpace = THREE.SRGBColorSpace

  cachedTexture = texture
  return texture
}
