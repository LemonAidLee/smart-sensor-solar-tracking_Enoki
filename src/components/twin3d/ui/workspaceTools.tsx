'use client'

import { Cloud, Sun, Compass, Brain, type LucideIcon } from 'lucide-react'
import type { WindowId } from '@/lib/dt/windowStore'
import { WeatherPanelBody } from './MetricsHUD'
import { SolarGeometryBody } from './SolarGeometry'
import { KinematicsBody } from './KinematicsInspector'
import { PbifDecisionBody } from './PbifPanel'

/**
 * The single registry of engineering tools available in the Digital Twin
 * workspace. Both the Tool Dock (which toggles windows) and the window host
 * (which renders them) read from here, so a tool is defined exactly once:
 * its icon, label, accent colour, default placement/size, and its body content.
 *
 * Default positions are staggered from the right edge inward so that opening
 * several tools produces a tidy, cascading layout rather than a stack.
 */
export interface WorkspaceTool {
  id: WindowId
  label: string
  icon: LucideIcon
  accent: string
  /** Default on-screen placement (px from the left/top of the viewport). */
  defaultX: number
  defaultY: number
  defaultW: number
  Body: React.ComponentType
}

/** Windows open toward the left of the dock; each default X steps further in. */
export const WORKSPACE_TOOLS: WorkspaceTool[] = [
  {
    id: 'weather',
    // The panel now presents both solar geometry AND atmospheric loads (the full
    // environmental state PBIF evaluates), so it reads as "Environmental
    // Conditions" rather than the narrower "Weather · Solar".
    label: 'Environmental Conditions',
    icon: Cloud,
    accent: '#38bdf8',
    defaultX: 0, // resolved at mount from viewport width (see resolveDefaultX)
    defaultY: 112,
    defaultW: 288,
    Body: WeatherPanelBody,
  },
  {
    id: 'solar',
    label: 'Solar Geometry',
    icon: Sun,
    accent: '#fbbf24',
    defaultX: 0,
    defaultY: 150,
    defaultW: 300,
    Body: SolarGeometryBody,
  },
  {
    id: 'kinematics',
    label: 'Panel Kinematics',
    icon: Compass,
    accent: '#34d399',
    defaultX: 0,
    defaultY: 188,
    defaultW: 300,
    Body: KinematicsBody,
  },
  {
    id: 'pbif',
    label: 'PBIF Decision',
    icon: Brain,
    accent: '#a78bfa',
    defaultX: 0,
    defaultY: 226,
    defaultW: 300,
    Body: PbifDecisionBody,
  },
]

/**
 * Compute a default X for a tool so its window opens just left of the dock,
 * cascading further left for each subsequent tool. Falls back gracefully during
 * SSR (no `window`) to a fixed inset.
 */
export function resolveDefaultX(index: number, width: number): number {
  const viewport = typeof window !== 'undefined' ? window.innerWidth : 1280
  const dockGutter = 92 // clears the right-edge Tool Dock
  const base = viewport - dockGutter - width
  return Math.max(16, base - index * 36)
}
