import { describe, expect, it } from 'vitest'
import {
  focusCameraOnPoint,
  focusDistanceForNodeSize,
} from '@/lib/graph/unity-camera-controls'

describe('unity-camera-controls 3D focus', () => {
  it('pulls camera along origin→node ray looking at the node', () => {
    const pose = focusCameraOnPoint({ x: 10, y: 0, z: 0 }, 40)
    expect(pose.lookAt).toEqual({ x: 10, y: 0, z: 0 })
    expect(pose.position.x).toBeGreaterThan(10)
    expect(pose.position.y).toBeCloseTo(0)
    expect(pose.position.z).toBeCloseTo(0)
  })

  it('handles a node at the origin', () => {
    const pose = focusCameraOnPoint({ x: 0, y: 0, z: 0 }, 50)
    expect(pose.lookAt).toEqual({ x: 0, y: 0, z: 0 })
    expect(pose.position).toEqual({ x: 0, y: 0, z: 50 })
  })

  it('scales focus distance from node size', () => {
    expect(focusDistanceForNodeSize(5)).toBe(40)
    expect(focusDistanceForNodeSize(20)).toBe(160)
    expect(focusDistanceForNodeSize(10)).toBe(80)
  })
})
