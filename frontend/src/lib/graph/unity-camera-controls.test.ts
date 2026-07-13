import { describe, expect, it } from 'vitest'
import {
  ORBIT_PITCH_MAX_DEG,
  ORBIT_PITCH_MIN_DEG,
  applyOrbit,
  clampOrbitPitch,
  orbitDeltasFromDrag,
  orbitPitchTransform,
  rotatePointAround,
} from '@/lib/graph/unity-camera-controls'

describe('unity-camera-controls dual-axis orbit', () => {
  it('rotates a point around a pivot', () => {
    const next = rotatePointAround({ x: 2, y: 0 }, { x: 0, y: 0 }, Math.PI / 2)
    expect(next.x).toBeCloseTo(0)
    expect(next.y).toBeCloseTo(2)
  })

  it('maps horizontal drag to Z yaw and vertical drag to X pitch', () => {
    const onlyX = orbitDeltasFromDrag(100, 0, 200, 200)
    expect(onlyX.yawZ).toBeCloseTo(Math.PI / 2)
    expect(onlyX.pitchX).toBe(0)

    const onlyY = orbitDeltasFromDrag(0, 100, 200, 200)
    expect(onlyY.yawZ).toBe(0)
    expect(onlyY.pitchX).toBeCloseTo(60)
  })

  it('clamps pitch to readable bounds', () => {
    expect(clampOrbitPitch(90)).toBe(ORBIT_PITCH_MAX_DEG)
    expect(clampOrbitPitch(-90)).toBe(ORBIT_PITCH_MIN_DEG)
    expect(clampOrbitPitch(12)).toBe(12)
  })

  it('builds a perspective rotateX transform only when pitched', () => {
    expect(orbitPitchTransform(0)).toBe('')
    expect(orbitPitchTransform(20)).toBe('perspective(1200px) rotateX(20deg)')
  })

  it('orbits camera Z angle around the pivot', () => {
    const next = applyOrbit(
      { x: 1, y: 0, angle: 0 },
      { x: 0, y: 0 },
      Math.PI / 2
    )
    expect(next.x).toBeCloseTo(0)
    expect(next.y).toBeCloseTo(1)
    expect(next.angle).toBeCloseTo(Math.PI / 2)
  })
})
