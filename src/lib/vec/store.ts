'use client'

/**
 * Digital Twin ⇄ VEC synchronisation layer (Zustand).
 *
 * This is the bidirectional bridge described in the architecture:
 *
 *   Website → Virtual Sensors → Controller → Virtual Actuators → Website
 *
 * A single non-React controller instance (like the Simulation singleton) is held
 * in module scope and driven imperatively. `sync()` runs on a fixed cadence
 * (matching the firmware's 200 ms loop): it builds a sensor packet from the live
 * simulation, pushes it to the active {@link VirtualEmbeddedController}, reads the
 * controller's actuator outputs, and applies them to Panel 0. Telemetry and
 * serial lines arrive asynchronously via controller callbacks. The store holds
 * only throttled, display-oriented state — never per-frame façade data.
 *
 * Switching `kind` swaps the backing controller (Simulated ⇄ Wokwi/MQTT ⇄ real
 * ESP32) with zero changes to this layer or anything above it.
 */

import { create } from 'zustand'
import { getSimulation } from '@/lib/engine/simulation'
import {
  applyActuator,
  buildSensorPacket,
  createController,
  vecPanelId,
  type ActuatorPacket,
  type ControllerKind,
  type ControllerStatus,
  type SensorOverrides,
  type TelemetryPacket,
  type VirtualEmbeddedController,
  type VirtualSensorPacket,
} from './index'
import { FW, isDebuggable, type ExecutionTrace, type FaultKind, type FaultReport } from './types'

const TELEMETRY_CAP = 60
const SERIAL_CAP = 240
const TRACE_CAP = 180

// -- Module-scoped controller (survives React re-renders) -------------------
let controller: VirtualEmbeddedController | null = null
let unsubs: Array<() => void> = []
let lastSyncAt = 0

function teardown() {
  unsubs.forEach((u) => u())
  unsubs = []
  controller?.disconnect().catch(() => {})
  controller = null
}

interface VecState {
  enabled: boolean
  kind: ControllerKind
  status: ControllerStatus | null
  overrides: SensorOverrides
  panelId: string | null

  lastSensors: VirtualSensorPacket | null
  lastActuator: ActuatorPacket | null
  telemetry: TelemetryPacket[]
  serial: string[]

  // execution-debugger state (observed, never owned)
  trace: ExecutionTrace | null
  traceHistory: ExecutionTrace[]
  faults: FaultReport[]

  // actions
  init: () => void
  setKind: (kind: ControllerKind) => Promise<void>
  setEnabled: (on: boolean) => void
  setMotion: (on: boolean) => void
  setPauseSwitch: (on: boolean) => void
  injectFault: (f: FaultKind) => void
  clearFault: (f: FaultKind) => void
  sync: () => void
}

function wire(set: (p: Partial<VecState> | ((s: VecState) => Partial<VecState>)) => void, ctrl: VirtualEmbeddedController) {
  unsubs.push(
    ctrl.onTelemetry((t) =>
      set((s) => ({ telemetry: [...s.telemetry, t].slice(-TELEMETRY_CAP) })),
    ),
  )
  unsubs.push(
    ctrl.onSerial((line) =>
      set((s) => ({ serial: [...s.serial, `${clock()}  ${line}`].slice(-SERIAL_CAP) })),
    ),
  )
}

function clock(): string {
  const d = new Date()
  const p = (n: number) => n.toString().padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export const useVecStore = create<VecState>((set, get) => ({
  enabled: true,
  kind: 'simulated',
  status: null,
  overrides: { motion: false, pauseSwitch: false },
  panelId: null,
  lastSensors: null,
  lastActuator: null,
  telemetry: [],
  serial: [],
  trace: null,
  traceHistory: [],
  faults: [],

  init: () => {
    if (controller) return
    const ctrl = createController(get().kind, { nowHours: () => getSimulation().clock.timeHours })
    controller = ctrl
    wire(set, ctrl)
    ctrl.connect().then(() => set({ status: ctrl.getStatus() }))
  },

  setKind: async (kind) => {
    teardown()
    set({ kind, telemetry: [], serial: [], lastActuator: null })
    const ctrl = createController(kind, { nowHours: () => getSimulation().clock.timeHours })
    controller = ctrl
    wire(set, ctrl)
    await ctrl.connect()
    set({ status: ctrl.getStatus() })
  },

  setEnabled: (on) => set({ enabled: on }),
  setMotion: (motion) => set((s) => ({ overrides: { ...s.overrides, motion } })),
  setPauseSwitch: (pauseSwitch) => set((s) => ({ overrides: { ...s.overrides, pauseSwitch } })),

  injectFault: (f) => {
    if (controller && isDebuggable(controller)) {
      controller.injectFault(f)
      set({ faults: controller.getFaults() })
    }
  },
  clearFault: (f) => {
    if (controller && isDebuggable(controller)) {
      controller.clearFault(f)
      set({ faults: controller.getFaults() })
    }
  },

  // Called by VECDriver on a fixed cadence (the "continuous, low-latency" loop).
  sync: () => {
    const s = get()
    if (!s.enabled || !controller) return
    const now = performance.now()
    if (now - lastSyncAt < FW.LOOP_MS) return
    lastSyncAt = now

    const sim = getSimulation()
    const packet = buildSensorPacket(sim, s.overrides)
    if (!packet) return

    controller.updateSensors(packet)
    const outputs = controller.readOutputs()
    const id = applyActuator(sim, outputs)

    const patch: Partial<VecState> = {
      lastSensors: packet,
      lastActuator: outputs,
      panelId: id ?? vecPanelId(sim),
      status: controller.getStatus(),
    }

    // Pull the execution trace (debugger) if the controller exposes one.
    if (isDebuggable(controller)) {
      const trace = controller.getDebugTrace()
      if (trace) {
        patch.trace = trace
        const hist = get().traceHistory
        if (hist.length === 0 || hist[hist.length - 1].loop !== trace.loop) {
          patch.traceHistory = [...hist, trace].slice(-TRACE_CAP)
        }
      }
      patch.faults = controller.getFaults()
    }

    set(patch)
  },
}))
