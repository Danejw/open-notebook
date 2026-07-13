/**
 * 3D orbit-camera helpers for the knowledge graph (Unity/Maya-style focus).
 *
 * Camera always orbits a focus point. Clicking a node re-aims lookAt at that
 * node and pulls the camera to a comfortable distance so subsequent orbit
 * gestures pivot around the selection.
 */

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface FocusCameraPose {
  /** New camera world position. */
  position: Vec3
  /** Point the camera (and orbit controls) should look at / orbit around. */
  lookAt: Vec3
}

const DEFAULT_FOCUS_DISTANCE = 80

/**
 * Place the camera along the ray from origin→node (or current view if at
 * origin) at `distance` from the node, looking at the node.
 */
export function focusCameraOnPoint(
  target: Vec3,
  distance: number = DEFAULT_FOCUS_DISTANCE,
  from?: Vec3 | null
): FocusCameraPose {
  const lookAt = { x: target.x, y: target.y, z: target.z }
  const origin = from ?? { x: 0, y: 0, z: 0 }
  const dx = target.x - origin.x
  const dy = target.y - origin.y
  const dz = target.z - origin.z
  const len = Math.hypot(dx, dy, dz)

  if (len < 1e-6) {
    // Target at (or too near) origin — pull back along +Z.
    return {
      position: { x: lookAt.x, y: lookAt.y, z: lookAt.z + distance },
      lookAt,
    }
  }

  // Prefer viewing from outside the node along the vector from world origin
  // through the node (classic 3d-force-graph click-to-focus).
  const hypot = Math.hypot(target.x, target.y, target.z)
  if (hypot < 1e-6) {
    return {
      position: { x: 0, y: 0, z: distance },
      lookAt,
    }
  }

  const distRatio = 1 + distance / hypot
  return {
    position: {
      x: target.x * distRatio,
      y: target.y * distRatio,
      z: target.z * distRatio,
    },
    lookAt,
  }
}

/** Distance scale for focusing based on node visual size. */
export function focusDistanceForNodeSize(size: number): number {
  const s = Number.isFinite(size) && size > 0 ? size : 8
  return Math.max(40, Math.min(160, s * 8))
}
