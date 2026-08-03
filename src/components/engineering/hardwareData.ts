export interface HardwareModel {
  id: string
  modelSrc: string
  name: string
  description: string
  developmentStatus: string
  designer: string
  revision: string
  fileFormat: string
  interactiveNotes: string
}

export const HARDWARE_MODELS: HardwareModel[] = [
  {
    id: "adaptive-facade-module",
    modelSrc: "/models/facade-module.glb",
    name: "Adaptive Façade Module",
    description:
      "3D hardware model of the kinetic façade panel assembly that the SOLIS AI Digital Twin drives — the physical counterpart to the AdaptiveSkinEngine's simulated panels.",
    developmentStatus: "To be documented",
    designer: "To be documented",
    revision: "To be documented",
    fileFormat: "GLB (glTF Binary)",
    interactiveNotes: "Drag to orbit · Scroll to zoom · Auto-rotation enabled",
  },
  {
    id: "independent-sensor-tower",
    modelSrc: "/models/independent-sensor-tower.glb",
    name: "Independent Sensor Tower",
    description:
      "3D hardware model of the standalone environmental sensor mast used to validate the Virtual Sensor Engine against real-world readings.",
    developmentStatus: "To be documented",
    designer: "To be documented",
    revision: "To be documented",
    fileFormat: "GLB (glTF Binary)",
    interactiveNotes: "Drag to orbit · Scroll to zoom · Auto-rotation enabled",
  },
]
