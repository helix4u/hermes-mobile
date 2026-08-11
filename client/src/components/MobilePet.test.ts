import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  clampPetBubbleLeft,
  MAX_PET_JUMP_DURATION_MS,
  MIN_PET_ROAM_SPEED,
  MobilePet,
  nextPetRoamStep,
  PET_ROAM_BORDER_INSET,
  petPositionAtAnimationTime,
  petPositionFromPointer,
  petPerchesFromRects,
  petWalkSpeed,
  resolvePetViewport,
  settlePetRoamAnimation,
  stationaryPetVisualState,
} from './MobilePet'

describe('mobile pet roaming', () => {
  it('never uses a locomotion pose while the pet is stationary during a turn', () => {
    expect(stationaryPetVisualState('run', false, false)).toBe('review')
    expect(stationaryPetVisualState('run', true, false)).toBe('run')
    expect(stationaryPetVisualState('run', true, true)).toBe('jump')
  })
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
    expect(short.restMs).toBeGreaterThanOrEqual(1_200)
    expect(short.restMs).toBeLessThanOrEqual(4_800)
    expect(long.restMs).toBeGreaterThanOrEqual(1_200)
    expect(long.restMs).toBeLessThanOrEqual(4_800)
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

  it('paces every walk to the sprite cadence while retaining a normal speed floor', () => {
    expect(petWalkSpeed(2_000)).toBe(MIN_PET_ROAM_SPEED)
    expect(petWalkSpeed(600)).toBeCloseTo(96)
    expect(petWalkSpeed(100)).toBe(128)
  })

  it('discovers visible element tops as walkable perches', () => {
    expect(
      petPerchesFromRects(
        [
          { left: 20, right: 340, top: 520, bottom: 600, width: 320 },
          { left: 10, right: 50, top: 400, bottom: 440, width: 40 },
          { left: 20, right: 340, top: 30, bottom: 90, width: 320 },
        ],
        { height: 700, left: 0, top: 0, width: 360 },
      ),
    ).toEqual([{ left: 20, right: 340, top: 520 }])
  })

  it('can land flush on a discovered UI perch', () => {
    const values = [0.2, 0.4, 0.8, 0.6, 0.8, 0.5, 0.5]
    const step = nextPetRoamStep(
      { x: 80, y: 400 },
      { height: 700, width: 360 },
      () => values.shift() ?? 0.8,
      [{ left: 40, right: 320, top: 540 }],
      80,
    )
    expect(step.destination.y).toBe(540 - 72)
    expect(step.destination.x).toBeGreaterThanOrEqual(48)
    expect(step.destination.x).toBeLessThanOrEqual(190)
    expect(step.motion).toBe('jump')
    expect(step.durationMs).toBeLessThanOrEqual(MAX_PET_JUMP_DURATION_MS)
  })

  it('walks ordinary vertical roaming instead of looping the jump sprite', () => {
    const values = [0.9, 0.8, 0.9, 0.7, 0.1, 0.5]
    const step = nextPetRoamStep(
      { x: 140, y: 700 },
      { height: 800, width: 360 },
      () => values.shift() ?? 0.5,
    )

    expect(Math.abs(step.destination.y - 700)).toBeGreaterThan(250)
    expect(step.motion).toBe('walk')
  })

  it('ignores a distant perch until normal roaming brings the pet near it', () => {
    const values = [0.2, 0.4, 0.8, 0.6, 0.8, 0.5, 0.5]
    const step = nextPetRoamStep(
      { x: 40, y: 180 },
      { height: 700, width: 360 },
      () => values.shift() ?? 0.8,
      [{ left: 40, right: 320, top: 540 }],
      80,
    )

    expect(step.destination.y).not.toBe(540 - 72)
    expect(step.motion).toBe('walk')
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
