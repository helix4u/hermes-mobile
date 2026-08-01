import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  clampPetBubbleLeft,
  MIN_PET_ROAM_SPEED,
  MobilePet,
  nextPetRoamStep,
  PET_ROAM_BORDER_INSET,
  petPositionAtAnimationTime,
  petPositionFromPointer,
  resolvePetViewport,
  settlePetRoamAnimation,
} from './MobilePet'

describe('mobile pet roaming', () => {
  it('mixes distinct short and long walks at the configured speed floor', () => {
    const shortValues = [0.2, 0.2, 0.4, 0.9, 0.5, 0.25]
    const longValues = [0.9, 0.9, 0.7, 0.5, 0.5, 0.5]
    const shortStart = { x: 140, y: 220 }
    const longStart = { x: 40, y: 220 }
    const short = nextPetRoamStep(
      shortStart,
      { height: 500, width: 360 },
      () => shortValues.shift() ?? 0.5,
    )
    const long = nextPetRoamStep(
      longStart,
      { height: 500, width: 360 },
      () => longValues.shift() ?? 0.5,
    )
    const shortDistance = Math.hypot(
      short.destination.x - shortStart.x,
      short.destination.y - shortStart.y,
    )
    const longDistance = Math.hypot(
      long.destination.x - longStart.x,
      long.destination.y - longStart.y,
    )

    expect((shortDistance / short.durationMs) * 1_000).toBeGreaterThanOrEqual(
      MIN_PET_ROAM_SPEED - 0.01,
    )
    expect((longDistance / long.durationMs) * 1_000).toBeGreaterThanOrEqual(
      MIN_PET_ROAM_SPEED - 0.01,
    )
    expect(short.restMs).toBeGreaterThanOrEqual(4_000)
    expect(short.restMs).toBeLessThanOrEqual(15_000)
    expect(long.restMs).toBeGreaterThanOrEqual(4_000)
    expect(long.restMs).toBeLessThanOrEqual(15_000)
    expect(longDistance).toBeGreaterThan(shortDistance)
  })

  it('keeps automatic destinations inset from the transparent overlay border', () => {
    const values = [0.9, 0.9, 0.9, 0.9]
    const step = nextPetRoamStep(
      { x: 295, y: 435 },
      { height: 480, width: 360 },
      () => values.shift() ?? 0.9,
    )
    expect(step.destination.x).toBeGreaterThanOrEqual(PET_ROAM_BORDER_INSET)
    expect(step.destination.x).toBeLessThanOrEqual(
      288 - PET_ROAM_BORDER_INSET,
    )
    expect(step.destination.y).toBeGreaterThanOrEqual(PET_ROAM_BORDER_INSET)
    expect(step.destination.y).toBeLessThanOrEqual(
      408 - PET_ROAM_BORDER_INSET,
    )
  })

  it('turns inward instead of continuing to run into either side', () => {
    const left = nextPetRoamStep(
      { x: 0, y: 220 },
      { height: 500, width: 360 },
      () => 0,
    )
    const right = nextPetRoamStep(
      { x: 288, y: 220 },
      { height: 500, width: 360 },
      () => 1,
    )

    expect(left.destination.x).toBeGreaterThan(0)
    expect(right.destination.x).toBeLessThan(288)
  })

  it('steers vertical drift away from the nearest border', () => {
    const nearTop = nextPetRoamStep(
      { x: 140, y: 0 },
      { height: 500, width: 360 },
      () => 0,
    )
    const nearBottom = nextPetRoamStep(
      { x: 140, y: 428 },
      { height: 500, width: 360 },
      () => 1,
    )

    expect(nearTop.destination.y).toBeGreaterThanOrEqual(
      PET_ROAM_BORDER_INSET + 48,
    )
    expect(nearBottom.destination.y).toBeLessThanOrEqual(
      428 - PET_ROAM_BORDER_INSET - 48,
    )
  })

  it('uses the full phone-height roaming range instead of a middle-page box', () => {
    const start = { x: 140, y: 700 }
    const values = [0.9, 0.8, 0.9, 0.7, 0.1, 0.5]
    const step = nextPetRoamStep(
      start,
      { height: 800, width: 360 },
      () => values.shift() ?? 0.5,
    )

    expect(step.destination.y).toBeLessThan(400)
    expect(Math.abs(step.destination.y - start.y)).toBeGreaterThan(250)
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

  it('commits and removes a finished fill-forwards animation before the rest window', () => {
    const calls: string[] = []
    const animation = {
      cancel: () => calls.push('cancel'),
      onfinish: () => undefined,
    }
    const destination = { x: 164, y: 208 }

    settlePetRoamAnimation(animation, destination, point => {
      calls.push(`commit:${point.x},${point.y}`)
    })

    expect(calls).toEqual(['commit:164,208', 'cancel'])
    expect(animation.onfinish).toBeNull()
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
        speaking: false,
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
        speaking: false,
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

  it('uses the visual viewport as the pet coordinate authority', () => {
    expect(
      resolvePetViewport({
        documentHeight: 520,
        documentWidth: 360,
        innerHeight: 520,
        innerWidth: 360,
        visualViewport: {
          height: 780,
          offsetLeft: 3,
          offsetTop: 7,
          width: 412,
        },
      }),
    ).toEqual({ height: 780, left: 3, top: 7, width: 412 })
  })

  it('falls back to the document viewport when visual viewport is unavailable', () => {
    expect(
      resolvePetViewport({
        documentHeight: 760,
        documentWidth: 390,
        innerHeight: 700,
        innerWidth: 360,
        visualViewport: null,
      }),
    ).toEqual({ height: 760, left: 0, top: 0, width: 390 })
  })
})
