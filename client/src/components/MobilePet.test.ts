import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  clampPetBubbleLeft,
  MIN_PET_ROAM_SPEED,
  MobilePet,
  nextPetRoamStep,
  petPositionAtAnimationTime,
  petPositionFromPointer,
} from './MobilePet'

describe('mobile pet roaming', () => {
  it('mixes distinct short and long walks with real rest windows', () => {
    const shortValues = [0.2, 0.2, 0.9, 0.5, 0.25]
    const longValues = [0.9, 0.9, 0.5, 0.5]
    const short = nextPetRoamStep(
      { x: 140, y: 220 },
      { height: 500, width: 360 },
      () => shortValues.shift() ?? 0.5,
    )
    const long = nextPetRoamStep(
      { x: 40, y: 220 },
      { height: 500, width: 360 },
      () => longValues.shift() ?? 0.5,
    )

    expect(short.durationMs).toBeGreaterThanOrEqual(3_000)
    expect(short.durationMs).toBeLessThanOrEqual(7_000)
    expect(short.restMs).toBeGreaterThanOrEqual(4_500)
    expect(long.durationMs).toBeGreaterThanOrEqual(10_000)
    expect(Math.abs(long.destination.x - 40)).toBeGreaterThan(
      Math.abs(short.destination.x - 140),
    )
  })

  it('clamps destinations inside the transparent overlay', () => {
    const values = [0.9, 0.9, 0.9, 0.9]
    const step = nextPetRoamStep(
      { x: 295, y: 435 },
      { height: 480, width: 360 },
      () => values.shift() ?? 0.9,
    )
    expect(step.destination.x).toBeLessThanOrEqual(288)
    expect(step.destination.y).toBeLessThanOrEqual(408)
  })

  it('does not let a short roaming leg drop below the faster speed floor', () => {
    const values = [0, 0, 0.9, 0.5, 1, 0.5]
    const start = { x: 120, y: 220 }
    const step = nextPetRoamStep(
      start,
      { height: 500, width: 360 },
      () => values.shift() ?? 0.5,
    )
    const distance = Math.hypot(
      step.destination.x - start.x,
      step.destination.y - start.y,
    )
    expect((distance / step.durationMs) * 1_000).toBeGreaterThanOrEqual(
      MIN_PET_ROAM_SPEED - 0.01,
    )
  })

  it('freezes an interrupted walk from animation time instead of a stale DOM rect', () => {
    expect(
      petPositionAtAnimationTime(
        { x: 20, y: 200 },
        { x: 220, y: 240 },
        2_500,
        10_000,
      ),
    ).toEqual({ x: 70, y: 210 })
    expect(
      petPositionAtAnimationTime(
        { x: 20, y: 200 },
        { x: 220, y: 240 },
        15_000,
        10_000,
      ),
    ).toEqual({ x: 220, y: 240 })
  })

  it('keeps the sidechat action hidden until the pet is tapped', () => {
    const html = renderToStaticMarkup(
      createElement(MobilePet, {
        bubble: '',
        connectionId: 'workstation',
        info: {
          enabled: true,
          frameH: 208,
          frameW: 192,
          framesPerState: 1,
          spritesheetUrl: '/alien.webp',
          stateRows: ['idle'],
        },
        onClick: () => undefined,
        onSidechat: () => undefined,
        roam: false,
        sidechatAvailable: true,
        state: 'idle',
      }),
    )

    expect(html).toContain('Interact with')
    expect(html).not.toContain('Open Alien Child sidechat')
  })

  it('keeps sidechat unavailable for a visual-only host', () => {
    const html = renderToStaticMarkup(
      createElement(MobilePet, {
        bubble: '',
        connectionId: 'cloud',
        info: {
          enabled: true,
          frameH: 208,
          frameW: 192,
          framesPerState: 1,
          spritesheetUrl: '/alien.webp',
          stateRows: ['idle'],
        },
        onClick: () => undefined,
        onSidechat: () => undefined,
        roam: false,
        sidechatAvailable: false,
        state: 'idle',
      }),
    )

    expect(html).toContain('Interact with')
    expect(html).not.toContain('sidechat')
  })

  it('clamps the commentary bubble inside both phone edges', () => {
    expect(clampPetBubbleLeft(20, 360, 272)).toBe(148)
    expect(clampPetBubbleLeft(180, 360, 272)).toBe(180)
    expect(clampPetBubbleLeft(345, 360, 272)).toBe(212)
  })

  it('maps drag movement into the transparent overlay coordinates', () => {
    expect(
      petPositionFromPointer(
        { x: 266, y: 410 },
        { x: 0, y: 126 },
        { x: 22, y: 28 },
      ),
    ).toEqual({ x: 244, y: 256 })
  })
})
