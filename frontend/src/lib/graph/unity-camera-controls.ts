/**
 * Unity Scene View–style camera math for Sigma.js (2D + perspective tilt).
 *
 * RMB orbit axes (screen space):
 * - Horizontal drag → Z rotation (Sigma camera `angle`, spin in the graph plane)
 * - Vertical drag → X rotation (CSS perspective pitch for a 3D tumble feel)
 *
 * Pivot policy:
 * - If a node is selected and present in the graph → orbit around that node.
 * - Otherwise → orbit around the viewport center (camera x/y; angle-only).
 */

export type UnityDragMode = 'none' | 'orbit' | 'pan' | 'dolly'

export interface GraphPoint {
  x: number
  y: number
}

export interface CameraXYAngle {
  x: number
  y: number
  angle: number
}

/** Dual-axis orbit deltas from a single RMB drag sample. */
export interface OrbitDragDeltas {
  /** Radians — applied to Sigma camera angle (Z). */
  yawZ: number
  /** Degrees — applied to CSS rotateX pitch (X). */
  pitchX: number
}

/** Soft clamp so foreshortening stays readable and clicks stay usable. */
export const ORBIT_PITCH_MIN_DEG = -58
export const ORBIT_PITCH_MAX_DEG = 58

/** Rotate `point` around `pivot` by `deltaAngle` radians. */
export function rotatePointAround(
  point: GraphPoint,
  pivot: GraphPoint,
  deltaAngle: number
): GraphPoint {
  const cos = Math.cos(deltaAngle)
  const sin = Math.sin(deltaAngle)
  const dx = point.x - pivot.x
  const dy = point.y - pivot.y
  return {
    x: pivot.x + dx * cos - dy * sin,
    y: pivot.y + dx * sin + dy * cos,
  }
}

/**
 * Orbit the camera around `pivot` by `deltaAngle` (Z-axis / in-plane spin).
 * Keeps the pivot fixed on screen while updating camera angle.
 */
export function applyOrbit(
  camera: CameraXYAngle,
  pivot: GraphPoint,
  deltaAngle: number
): CameraXYAngle {
  const nextCenter = rotatePointAround(
    { x: camera.x, y: camera.y },
    pivot,
    deltaAngle
  )
  return {
    x: nextCenter.x,
    y: nextCenter.y,
    angle: camera.angle + deltaAngle,
  }
}

/**
 * Map horizontal drag to Z-orbit angle (full canvas width ≈ 180°).
 * @deprecated Prefer `orbitDeltasFromDrag` for dual-axis RMB orbit.
 */
export function orbitDeltaFromDrag(
  dx: number,
  viewportWidth: number
): number {
  const w = Math.max(viewportWidth, 1)
  return (dx / w) * Math.PI
}

/**
 * Map RMB drag to Z yaw (radians) + X pitch (degrees).
 * Full width ≈ 180° Z; full height ≈ 120° X pitch.
 */
export function orbitDeltasFromDrag(
  dx: number,
  dy: number,
  viewportWidth: number,
  viewportHeight: number
): OrbitDragDeltas {
  const w = Math.max(viewportWidth, 1)
  const h = Math.max(viewportHeight, 1)
  return {
    yawZ: (dx / w) * Math.PI,
    pitchX: (dy / h) * 120,
  }
}

/** Clamp pitch so the graph stays readable under perspective tilt. */
export function clampOrbitPitch(pitchDeg: number): number {
  return Math.min(
    ORBIT_PITCH_MAX_DEG,
    Math.max(ORBIT_PITCH_MIN_DEG, pitchDeg)
  )
}

/**
 * CSS transform for X-axis pitch (perspective tumble).
 * Z spin stays on Sigma's camera angle so hit-testing remains correct in-plane.
 */
export function orbitPitchTransform(pitchDeg: number): string {
  if (pitchDeg === 0) return ''
  return `perspective(1200px) rotateX(${pitchDeg}deg)`
}

/**
 * Alt+RMB vertical dolly. Positive dy (drag down) zooms out (larger ratio).
 * Exponential so feel stays consistent across ratio scales.
 */
export function applyDollyRatio(
  ratio: number,
  dy: number,
  viewportHeight: number,
  minRatio: number,
  maxRatio: number
): number {
  const h = Math.max(viewportHeight, 1)
  const next = ratio * Math.exp((dy / h) * 2.2)
  return Math.min(maxRatio, Math.max(minRatio, next))
}

/**
 * Resolve orbit pivot: selected node in graph space, else viewport center.
 */
export function resolveOrbitPivot(
  selectedNodeId: string | null,
  hasNode: (id: string) => boolean,
  getNodePosition: (id: string) => GraphPoint,
  viewportCenter: GraphPoint
): GraphPoint {
  if (selectedNodeId && hasNode(selectedNodeId)) {
    return getNodePosition(selectedNodeId)
  }
  return viewportCenter
}
