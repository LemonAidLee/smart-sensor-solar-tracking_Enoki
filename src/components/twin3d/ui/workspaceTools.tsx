'use client'

import { Cloud, Brain, FlaskConical, Flame, Lightbulb, ShieldCheck, Sparkles, Workflow, Zap, MessageSquare, type LucideIcon } from 'lucide-react'
import type { WindowId } from '@/lib/dt/windowStore'
import { CyberPhysicalPipelineBody } from './CyberPhysicalPipeline'
import { WeatherPanelBody } from './MetricsHUD'
import { PbifDecisionBody } from './PbifPanel'
import { RooftopPvBody } from './RooftopPvPanel'
import { BuildingThermalBody } from './BuildingThermalPanel'
import { BuildingLightingBody } from './BuildingLightingPanel'
import { AiPredictionBody } from './AiPredictionPanel'
import { AiWhatIfBody } from './AiWhatIfPanel'
import { AiAssistantBody } from './AiAssistantPanel'
import { AiFddBody } from './AiFddPanel'

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
    // The primary lens: the whole Environment → Sensor → Controller → Servo →
    // Façade signal path as one guided, top-to-bottom story (see
    // CyberPhysicalPipeline). The subsystem tools below remain as power-user
    // shortcuts to the same engineering bodies it embeds.
    id: 'pipeline',
    label: 'Cyber-Physical Pipeline',
    icon: Workflow,
    accent: '#22d3ee',
    defaultX: 0, // resolved at mount from viewport width (see resolveDefaultX)
    defaultY: 96,
    defaultW: 340,
    Body: CyberPhysicalPipelineBody,
  },
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
    id: 'pbif',
    label: 'PBIF Decision',
    icon: Brain,
    accent: '#a78bfa',
    defaultX: 0,
    defaultY: 226,
    defaultW: 300,
    Body: PbifDecisionBody,
  },
  {
    // The Rooftop PV plant is an independent engineering subsystem, not part of
    // the building's adaptive-façade story — its engines (`pvArray`,
    // `pvElectrical`, `pvInverter`) are siblings of the adaptive skin on
    // `Simulation`, and Stage 7.1.5 deliberately excluded the array from the
    // Cyber-Physical Façade pipeline. It therefore gets its own top-level tool
    // rather than living inside the Building panel.
    id: 'pv',
    label: 'Rooftop PV',
    icon: Zap,
    accent: '#fb923c',
    defaultX: 0,
    defaultY: 264,
    defaultW: 320,
    Body: RooftopPvBody,
  },
  {
    // Building Thermal Response (Stage 7.9) — the bridge between the Adaptive
    // Façade and the BEMS. Its own tool because it is a distinct engineering
    // subsystem (`buildingThermal.ts`), not a sub-view of either the façade or
    // the PV/BEMS panel — exactly the same reasoning that gave Rooftop PV its
    // own top-level tool above.
    id: 'thermal',
    label: 'Building Thermal Response',
    icon: Flame,
    accent: '#f97316',
    defaultX: 0,
    defaultY: 302,
    defaultW: 320,
    Body: BuildingThermalBody,
  },
  {
    // Building Lighting Response (Stage 7.10) — the second Building Physics
    // Layer subsystem, sibling to Building Thermal Response. Its own tool for
    // the same reason Building Thermal got one: a distinct engineering
    // subsystem (`buildingLighting.ts`), not a sub-view of the façade or the
    // PV/BEMS panel.
    id: 'lighting',
    label: 'Building Lighting Response',
    icon: Lightbulb,
    accent: '#facc15',
    defaultX: 0,
    defaultY: 340,
    defaultW: 320,
    Body: BuildingLightingBody,
  },
]

export const AI_TOOLS: WorkspaceTool[] = [
  {
    // The AI Prediction Layer (Stage 8.1) is an ADVISOR, not a subsystem of the
    // twin: it observes what the engines published and projects it forward.
    // PBIF remains the sole controller of the façade, so this tool sits beside
    // the engineering panels rather than inside the pipeline. Its accent is
    // deliberately unlike any subsystem's — nothing here is a live actuator.
    id: 'ai',
    label: 'AI Prediction',
    icon: Sparkles,
    accent: '#10b981', // Emerald/teal to distinguish AI tools
    defaultX: 0,
    defaultY: 302,
    defaultW: 340,
    Body: AiPredictionBody,
  },
  {
    // AI What-If Analysis (Stage 8.2) — decision support rather than telemetry.
    // It shares the AI accent with the Prediction panel because it is the same
    // advisory layer asking a different question, and like it, controls nothing:
    // studies run in a throwaway sandbox on the operator's command alone.
    id: 'whatif',
    label: 'AI What-If Analysis',
    icon: FlaskConical,
    accent: '#10b981',
    defaultX: 0,
    defaultY: 340,
    defaultW: 348,
    Body: AiWhatIfBody,
  },
  {
    id: 'assistant',
    label: 'Engineering Assistant',
    icon: MessageSquare,
    accent: '#10b981',
    defaultX: 0,
    defaultY: 378,
    defaultW: 360,
    Body: AiAssistantBody,
  },
  {
    // AI Fault Detection & Diagnosis (Stage 8.5) — a read-only MONITOR, not a
    // controller: it re-derives each subsystem's expected behaviour from
    // published values and reports where the twin agrees or disagrees with
    // its own physics. Shares the AI accent for the same reason the other
    // advisory tools do — it commands nothing.
    id: 'fdd',
    label: 'AI Fault Detection & Diagnosis',
    icon: ShieldCheck,
    accent: '#10b981',
    defaultX: 0,
    defaultY: 416,
    defaultW: 360,
    Body: AiFddBody,
  },
]

/**
 * Compute a default X for a tool so its window opens just left of the dock,
 * cascading further left for each subsequent tool. Falls back gracefully during
 * SSR (no `window`) to a fixed inset.
 */
export function resolveDefaultX(index: number, width: number, isAiTool: boolean = false): number {
  const viewport = typeof window !== 'undefined' ? window.innerWidth : 1280
  // AiDock is placed further left than ToolDock, so its windows need more clearance
  const dockGutter = isAiTool ? 144 : 92
  const base = viewport - dockGutter - width
  return Math.max(16, base - index * 36)
}
