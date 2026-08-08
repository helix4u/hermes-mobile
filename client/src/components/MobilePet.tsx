import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import {
  petFrameCount,
  petRowForState,
  petShouldTravel,
  type MobilePetInfo,
  type MobilePetState,
} from '../pet'

interface MobilePetProps {
  bubble: string
  connectionId: string
  info: MobilePetInfo
  roam: boolean
  sidechatAvailable: boolean
  speaking: boolean
  state: MobilePetState
  onClick: () => void
  onSidechat: () => void
}

export interface Point {
  x: number
  y: number
}

export interface PetViewport {
  height: number
  left: number
  top: number
  width: number
}

type PetGestureInput = 'pointer' | 'touch'

const PET_SIZE = 72
const DRAG_SLOP = 4
export const MIN_PET_ROAM_SPEED = 64
export const MAX_PET_ROAM_SPEED = 128
export const PET_ROAM_BORDER_INSET = 18
const PET_ROAM_EDGE_TURN_ZONE = 64
const PET_ROAM_EDGE_ARRIVAL_GAP = 10
const MIN_PET_ROAM_LEG = 48
export const MAX_PET_JUMP_HORIZONTAL = 110
export const MAX_PET_JUMP_VERTICAL = 96
export const MAX_PET_JUMP_DURATION_MS = 720
const MIN_PET_JUMP_VERTICAL = 14
const BUBBLE_GAP = 8
const BUBBLE_MARGIN = 12
const BUBBLE_MAX_WIDTH = 224
const positionKey = (connectionId: string) =>
  `hermes-mobile.pet-position.v1.${connectionId || 'default'}`

export interface PetPerch {
  left: number
  right: number
  top: number
}

export type PetRoamMotion = 'walk' | 'jump'

export function petWalkSpeed(loopMs = 600): number {
  const cadence = (PET_SIZE * 0.8) / (Math.max(240, loopMs) / 1_000)
  return Math.max(MIN_PET_ROAM_SPEED, Math.min(MAX_PET_ROAM_SPEED, cadence))
}

export function petPerchesFromRects(
  rects: Array<{ left: number; right: number; top: number; bottom: number; width: number }>,
  viewport: PetViewport,
): PetPerch[] {
  return rects
    .filter(
      rect =>
        rect.width >= PET_SIZE * 1.25 &&
        rect.right > viewport.left &&
        rect.left < viewport.left + viewport.width &&
        rect.top > viewport.top + PET_SIZE &&
        rect.top < viewport.top + viewport.height - 12,
    )
    .map(rect => ({
      left: Math.max(0, rect.left - viewport.left),
      right: Math.min(viewport.width, rect.right - viewport.left),
      top: rect.top - viewport.top,
    }))
}

function snapshotPetPerches(viewport: PetViewport): PetPerch[] {
  if (typeof document === 'undefined') return []
  return petPerchesFromRects(
    [...document.querySelectorAll<HTMLElement>('[data-pet-perch]')]
      .filter(element => element.offsetParent !== null)
      .map(element => element.getBoundingClientRect()),
    viewport,
  )
}

export function resolvePetViewport({
  documentHeight,
  documentWidth,
  innerHeight,
  innerWidth,
  visualViewport,
}: {
  documentHeight: number
  documentWidth: number
  innerHeight: number
  innerWidth: number
  visualViewport?: {
    height: number
    offsetLeft: number
    offsetTop: number
    width: number
  } | null
}): PetViewport {
  return {
    height: Math.max(
      PET_SIZE,
      visualViewport?.height || documentHeight || innerHeight || PET_SIZE,
    ),
    left: visualViewport?.offsetLeft || 0,
    top: visualViewport?.offsetTop || 0,
    width: Math.max(
      PET_SIZE,
      visualViewport?.width || documentWidth || innerWidth || PET_SIZE,
    ),
  }
}

function readPetViewport(): PetViewport {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return { height: 640, left: 0, top: 0, width: 360 }
  }
  return resolvePetViewport({
    documentHeight: document.documentElement.clientHeight,
    documentWidth: document.documentElement.clientWidth,
    innerHeight: window.innerHeight,
    innerWidth: window.innerWidth,
    visualViewport: window.visualViewport,
  })
}

export function clampPetBubbleLeft(
  petCenter: number,
  viewportWidth: number,
  bubbleWidth: number,
  margin = BUBBLE_MARGIN,
): number {
  const half = bubbleWidth / 2
  return Math.max(
    margin + half,
    Math.min(viewportWidth - margin - half, petCenter),
  )
}

export function petPositionFromPointer(
  pointer: Point,
  stageOrigin: Point,
  dragOffset: Point,
): Point {
  return {
    x: pointer.x - stageOrigin.x - dragOffset.x,
    y: pointer.y - stageOrigin.y - dragOffset.y,
  }
}

export function petPositionAtAnimationTime(
  from: Point,
  destination: Point,
  elapsedMs: number,
  durationMs: number,
): Point {
  const progress = Math.max(
    0,
    Math.min(1, durationMs > 0 ? elapsedMs / durationMs : 1),
  )
  return {
    x: from.x + (destination.x - from.x) * progress,
    y: from.y + (destination.y - from.y) * progress,
  }
}

export function settlePetRoamAnimation(
  animation: Pick<Animation, 'cancel' | 'onfinish'>,
  destination: Point,
  commit: (point: Point) => void,
) {
  /*
   * A finished Web Animation with fill: "forwards" continues to override the
   * element's inline transform. Commit the destination first, then remove that
   * filled animation so a direct drag during the following rest window can
   * visibly update the pet instead of only changing persisted coordinates.
   */
  animation.onfinish = null
  commit(destination)
  animation.cancel()
}

export function nextPetRoamStep(
  current: Point,
  bounds: { width: number; height: number },
  random = Math.random,
  perches: PetPerch[] = [],
  speedPxS = MIN_PET_ROAM_SPEED,
) {
  const rawMaxX = Math.max(0, bounds.width - PET_SIZE)
  const rawMaxY = Math.max(0, bounds.height - PET_SIZE)
  const horizontalInset = Math.min(PET_ROAM_BORDER_INSET, rawMaxX / 2)
  const verticalInset = Math.min(PET_ROAM_BORDER_INSET, rawMaxY / 2)
  const minX = horizontalInset
  const maxX = Math.max(minX, rawMaxX - horizontalInset)
  const minY = verticalInset
  const maxY = Math.max(minY, rawMaxY - verticalInset)
  const longWalk = random() > 0.68
  const rangeX = Math.max(0, maxX - minX)
  const rangeY = Math.max(0, maxY - minY)
  const xSpan = longWalk
    ? rangeX * (0.55 + random() * 0.35)
    : 55 + random() * 130
  const ySpan = longWalk
    ? rangeY * (0.28 + random() * 0.42)
    : 30 + random() * 105

  const destinationOnAxis = (
    value: number,
    min: number,
    max: number,
    requestedSpan: number,
    preferredSign: 1 | -1,
  ) => {
    const range = Math.max(0, max - min)
    const origin = Math.max(min, Math.min(max, value))
    const turnZone = Math.min(PET_ROAM_EDGE_TURN_ZONE, range / 3)
    let sign = preferredSign
    if (origin <= min + turnZone) sign = 1
    else if (origin >= max - turnZone) sign = -1

    const room = (direction: 1 | -1) =>
      direction > 0 ? max - origin : origin - min
    if (room(sign) < MIN_PET_ROAM_LEG && room(sign === 1 ? -1 : 1) > room(sign)) {
      sign = sign === 1 ? -1 : 1
    }
    const available = Math.max(0, room(sign) - PET_ROAM_EDGE_ARRIVAL_GAP)
    let travel = Math.min(Math.max(MIN_PET_ROAM_LEG, requestedSpan), available)
    if (travel < MIN_PET_ROAM_LEG && range >= MIN_PET_ROAM_LEG) {
      const opposite = sign === 1 ? -1 : 1
      const oppositeAvailable = Math.max(
        0,
        room(opposite) - PET_ROAM_EDGE_ARRIVAL_GAP,
      )
      if (oppositeAvailable > available) {
        sign = opposite
        travel = Math.min(
          Math.max(MIN_PET_ROAM_LEG, requestedSpan),
          oppositeAvailable,
        )
      }
    }
    return Math.max(min, Math.min(max, origin + travel * sign))
  }

  let x = destinationOnAxis(
    current.x,
    minX,
    maxX,
    xSpan,
    random() > 0.5 ? 1 : -1,
  )
  let y = destinationOnAxis(
    current.y,
    minY,
    maxY,
    ySpan,
    random() > 0.5 ? 1 : -1,
  )
  const reachablePerches = perches.filter(perch => {
    const perchY = perch.top - PET_SIZE
    return perch.right - perch.left >= PET_SIZE && perchY >= minY && perchY <= maxY
  })
  const nearbyPerches = reachablePerches.filter(perch => {
    const perchMinX = Math.max(minX, perch.left + 8)
    const perchMaxX = Math.min(maxX, perch.right - PET_SIZE - 8)
    if (perchMaxX < perchMinX) return false
    const nearestLandingX = Math.max(perchMinX, Math.min(perchMaxX, current.x))
    const horizontalTravel = Math.abs(nearestLandingX - current.x)
    const verticalTravel = Math.abs(perch.top - PET_SIZE - current.y)
    return (
      verticalTravel > MIN_PET_JUMP_VERTICAL &&
      verticalTravel <= MAX_PET_JUMP_VERTICAL &&
      horizontalTravel <= MAX_PET_JUMP_HORIZONTAL
    )
  })
  let motion: PetRoamMotion = 'walk'
  if (nearbyPerches.length && random() > 0.46) {
    const perch =
      nearbyPerches[
        Math.min(nearbyPerches.length - 1, Math.floor(random() * nearbyPerches.length))
      ]
    const perchMinX = Math.max(minX, perch.left + 8)
    const perchMaxX = Math.min(maxX, perch.right - PET_SIZE - 8)
    if (perchMaxX >= perchMinX) {
      const jumpMinX = Math.max(perchMinX, current.x - MAX_PET_JUMP_HORIZONTAL)
      const jumpMaxX = Math.min(perchMaxX, current.x + MAX_PET_JUMP_HORIZONTAL)
      x = jumpMinX + random() * (jumpMaxX - jumpMinX)
      y = Math.max(minY, Math.min(maxY, perch.top - PET_SIZE))
      motion = 'jump'
    }
  }
  const distance = Math.hypot(x - current.x, y - current.y)
  const travelMs = Math.round(
    Math.max(250, (distance / Math.max(MIN_PET_ROAM_SPEED, speedPxS)) * 1_000),
  )
  return {
    destination: { x, y },
    durationMs:
      motion === 'jump' ? Math.min(MAX_PET_JUMP_DURATION_MS, travelMs) : travelMs,
    motion,
    restMs: Math.round(1_200 + random() * 3_600),
  }
}

function loadPosition(connectionId: string): Point | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(positionKey(connectionId)) || '')
    return typeof parsed?.x === 'number' && typeof parsed?.y === 'number'
      ? parsed
      : null
  } catch {
    return null
  }
}

function PetCanvas({
  direction,
  info,
  state,
}: {
  direction: 'left' | 'right'
  info: MobilePetInfo
  state: MobilePetState
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const imageSource = info.spritesheetUrl
      ? info.spritesheetUrl
      : info.spritesheetBase64
        ? `data:${info.mime || 'image/png'};base64,${info.spritesheetBase64}`
        : ''
    if (!canvas || !imageSource) return
    const context = canvas.getContext('2d')
    if (!context) return

    const image = new Image()
    let frameRequest = 0
    let startedAt = performance.now()
    const row = petRowForState(info, state, direction)
    const rowIndex = Math.max(0, (info.stateRows ?? []).indexOf(row))
    const frameWidth = Math.max(1, info.frameW ?? 32)
    const frameHeight = Math.max(1, info.frameH ?? 32)
    const frameCount = petFrameCount(info, row, state)
    const loopMs = Math.max(250, info.loopMs ?? 900)

    canvas.width = frameWidth
    canvas.height = frameHeight
    context.imageSmoothingEnabled = false

    const draw = (now: number) => {
      const frame = Math.floor(((now - startedAt) % loopMs) / (loopMs / frameCount))
      context.clearRect(0, 0, frameWidth, frameHeight)
      context.imageSmoothingEnabled = false
      context.drawImage(
        image,
        frame * frameWidth,
        rowIndex * frameHeight,
        frameWidth,
        frameHeight,
        0,
        0,
        frameWidth,
        frameHeight,
      )
      frameRequest = requestAnimationFrame(draw)
    }
    const resume = () => {
      if (document.visibilityState !== 'visible' || !image.complete) return
      cancelAnimationFrame(frameRequest)
      startedAt = performance.now()
      frameRequest = requestAnimationFrame(draw)
    }
    image.onload = resume
    image.src = imageSource
    document.addEventListener('visibilitychange', resume)
    return () => {
      cancelAnimationFrame(frameRequest)
      document.removeEventListener('visibilitychange', resume)
    }
  }, [direction, info, state])

  return <canvas aria-hidden="true" className="mobile-pet-canvas" ref={canvasRef} />
}

function PetBubble({
  petRef,
  speaking,
  text,
}: {
  petRef: RefObject<HTMLDivElement | null>
  speaking: boolean
  text: string
}) {
  const bubbleRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let frame = 0
    const position = () => {
      const bubble = bubbleRef.current
      const pet = petRef.current
      if (!bubble || !pet) return
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const width = Math.max(
        120,
        Math.min(BUBBLE_MAX_WIDTH, viewportWidth - BUBBLE_MARGIN * 2),
      )
      bubble.style.width = `${width}px`
      const bubbleHeight = bubble.getBoundingClientRect().height
      const petRect = pet.getBoundingClientRect()
      const left = clampPetBubbleLeft(
        petRect.left + petRect.width / 2,
        viewportWidth,
        width,
      )
      const above = petRect.top - BUBBLE_GAP - bubbleHeight
      const below = petRect.bottom + BUBBLE_GAP
      const top =
        above >= BUBBLE_MARGIN
          ? above
          : Math.min(
              viewportHeight - BUBBLE_MARGIN - bubbleHeight,
              Math.max(BUBBLE_MARGIN, below),
            )
      bubble.style.left = `${left}px`
      bubble.style.top = `${Math.max(BUBBLE_MARGIN, top)}px`
      frame = window.requestAnimationFrame(position)
    }
    frame = window.requestAnimationFrame(position)
    return () => window.cancelAnimationFrame(frame)
  }, [petRef, text])

  if (typeof document === 'undefined') return null
  return createPortal(
    <div
      className={`mobile-pet-bubble ${speaking ? 'is-speaking' : ''}`}
      ref={bubbleRef}
      role="status"
    >
      {text}
    </div>,
    document.body,
  )
}

export function MobilePet({
  bubble,
  connectionId,
  info,
  onClick,
  onSidechat,
  roam,
  sidechatAvailable,
  speaking,
  state,
}: MobilePetProps) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const petRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef<PetViewport>(readPetViewport())
  const pointRef = useRef<Point>({ x: 12, y: 220 })
  const animationRef = useRef<{
    animation: Animation
    destination: Point
    durationMs: number
    from: Point
    startedAtMs: number
  } | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const actionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragRef = useRef<{
    action: 'interact' | 'sidechat'
    id: number
    input: PetGestureInput
    moved: boolean
    offsetX: number
    offsetY: number
    startX: number
    startY: number
  } | null>(null)
  const [direction, setDirection] = useState<'left' | 'right'>('right')
  const [walking, setWalking] = useState(false)
  const [jumping, setJumping] = useState(false)
  const [roamRevision, setRoamRevision] = useState(0)
  const [sidechatVisible, setSidechatVisible] = useState(false)
  const [viewport, setViewport] = useState(viewportRef.current)
  const movingAllowed = petShouldTravel(roam, state)

  const revealSidechat = useCallback(() => {
    if (!sidechatAvailable) return
    setSidechatVisible(true)
    if (actionTimerRef.current) clearTimeout(actionTimerRef.current)
    actionTimerRef.current = setTimeout(() => {
      setSidechatVisible(false)
      actionTimerRef.current = null
    }, 6_000)
  }, [sidechatAvailable])

  useEffect(() => {
    if (!sidechatAvailable) setSidechatVisible(false)
  }, [sidechatAvailable])

  useEffect(
    () => () => {
      if (actionTimerRef.current) clearTimeout(actionTimerRef.current)
    },
    [],
  )

  const bounds = useCallback(() => {
    return {
      height: viewportRef.current.height,
      width: viewportRef.current.width,
    }
  }, [])

  const setPoint = useCallback((point: Point, persist = false) => {
    const area = bounds()
    const next = {
      x: Math.max(0, Math.min(area.width - PET_SIZE, point.x)),
      y: Math.max(0, Math.min(area.height - PET_SIZE, point.y)),
    }
    pointRef.current = next
    if (petRef.current) {
      petRef.current.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)`
    }
    if (persist) {
      try {
        localStorage.setItem(positionKey(connectionId), JSON.stringify(next))
      } catch {
        // A storage failure must not break direct manipulation of the pet.
      }
    }
  }, [bounds, connectionId])

  const freezeAtRenderedPosition = useCallback(() => {
    const active = animationRef.current
    if (!active) {
      /*
       * Defensively clear any completed fill-forwards animation left by an
       * interrupted render. The committed inline transform already contains
       * its destination, while the stale animation would mask finger drags.
       */
      petRef.current
        ?.getAnimations()
        .filter(animation => animation.playState === 'finished')
        .forEach(animation => animation.cancel())
      setWalking(false)
      setJumping(false)
      return
    }
    const animationTime = Number(active.animation.currentTime)
    const elapsedMs =
      Number.isFinite(animationTime) && animationTime >= 0
        ? animationTime
        : Math.max(0, performance.now() - active.startedAtMs)
    const rendered = petPositionAtAnimationTime(
      active.from,
      active.destination,
      elapsedMs,
      active.durationMs,
    )
    active.animation.onfinish = null
    active.animation.cancel()
    animationRef.current = null
    setPoint(rendered)
    setWalking(false)
    setJumping(false)
  }, [setPoint])

  const finishDrag = useCallback(
    (input: PetGestureInput, pointerId: number, cancelled: boolean) => {
      const drag = dragRef.current
      if (!drag || drag.input !== input || drag.id !== pointerId) return
      dragRef.current = null
      if (input === 'pointer' && petRef.current?.hasPointerCapture(pointerId)) {
        petRef.current.releasePointerCapture(pointerId)
      }
      setPoint(pointRef.current, true)
      setRoamRevision(current => current + 1)
      if (!cancelled && !drag.moved) {
        if (drag.action === 'sidechat' && sidechatAvailable) {
          setSidechatVisible(false)
          onSidechat()
        } else {
          revealSidechat()
          onClick()
        }
      }
    },
    [onClick, onSidechat, revealSidechat, setPoint, sidechatAvailable],
  )

  const beginDrag = useCallback(
    (
      input: PetGestureInput,
      pointerId: number,
      clientX: number,
      clientY: number,
      target: EventTarget | null,
    ) => {
      if (dragRef.current) return false
      freezeAtRenderedPosition()
      const rect = petRef.current?.getBoundingClientRect()
      dragRef.current = {
        action:
          sidechatAvailable &&
          target instanceof Element &&
          target.closest('.mobile-pet-chat-button')
            ? 'sidechat'
            : 'interact',
        id: pointerId,
        input,
        moved: false,
        offsetX: clientX - (rect?.left ?? clientX),
        offsetY: clientY - (rect?.top ?? clientY),
        startX: clientX,
        startY: clientY,
      }
      return true
    },
    [freezeAtRenderedPosition, sidechatAvailable],
  )

  const moveDrag = useCallback(
    (
      input: PetGestureInput,
      pointerId: number,
      clientX: number,
      clientY: number,
    ) => {
      const drag = dragRef.current
      const stage = stageRef.current
      if (
        !drag ||
        drag.input !== input ||
        drag.id !== pointerId ||
        !stage
      ) {
        return false
      }
      if (Math.hypot(clientX - drag.startX, clientY - drag.startY) > DRAG_SLOP) {
        drag.moved = true
      }
      setPoint(
        petPositionFromPointer(
          { x: clientX, y: clientY },
          {
            x: viewportRef.current.left,
            y: viewportRef.current.top,
          },
          { x: drag.offsetX, y: drag.offsetY },
        ),
      )
      return true
    },
    [setPoint],
  )

  useEffect(() => {
    const pet = petRef.current
    if (!pet) return

    const findTouch = (touches: TouchList, identifier: number) => {
      for (let index = 0; index < touches.length; index += 1) {
        const touch = touches.item(index)
        if (touch?.identifier === identifier) return touch
      }
      return null
    }
    const onTouchStart = (event: TouchEvent) => {
      const touch = event.changedTouches.item(0)
      if (!touch) return
      event.preventDefault()
      beginDrag(
        'touch',
        touch.identifier,
        touch.clientX,
        touch.clientY,
        event.target,
      )
    }
    const onTouchMove = (event: TouchEvent) => {
      const drag = dragRef.current
      if (!drag || drag.input !== 'touch') return
      const touch = findTouch(event.touches, drag.id)
      if (!touch) return
      event.preventDefault()
      moveDrag('touch', drag.id, touch.clientX, touch.clientY)
    }
    const finishTouch = (event: TouchEvent, cancelled: boolean) => {
      const drag = dragRef.current
      if (!drag || drag.input !== 'touch') return
      const touch = findTouch(event.changedTouches, drag.id)
      if (!touch) return
      event.preventDefault()
      finishDrag('touch', drag.id, cancelled)
    }
    const onTouchEnd = (event: TouchEvent) => finishTouch(event, false)
    const onTouchCancel = (event: TouchEvent) => finishTouch(event, true)

    pet.addEventListener('touchstart', onTouchStart, { passive: false })
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onTouchEnd, { passive: false })
    window.addEventListener('touchcancel', onTouchCancel, { passive: false })
    return () => {
      pet.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('touchcancel', onTouchCancel)
    }
  }, [beginDrag, finishDrag, moveDrag])

  useEffect(() => {
    const saved = loadPosition(connectionId)
    const area = bounds()
    setPoint(saved ?? { x: 12, y: Math.max(0, area.height - PET_SIZE - 12) })
  }, [bounds, connectionId, setPoint])

  useEffect(() => {
    const reconcileViewport = () => {
      /*
       * Rotation, split-screen resizing, and the Android keyboard all change
       * the fixed overlay's usable bounds. Commit any in-flight position,
       * clamp it into the new viewport, and restart roaming from that real
       * point so the pet never becomes unreachable or snaps back later.
      */
      freezeAtRenderedPosition()
      const nextViewport = readPetViewport()
      viewportRef.current = nextViewport
      setViewport(nextViewport)
      setPoint(pointRef.current, true)
      setRoamRevision(current => current + 1)
    }
    window.addEventListener('resize', reconcileViewport)
    window.addEventListener('orientationchange', reconcileViewport)
    window.visualViewport?.addEventListener('resize', reconcileViewport)
    window.visualViewport?.addEventListener('scroll', reconcileViewport)
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(reconcileViewport)
    observer?.observe(document.documentElement)
    return () => {
      window.removeEventListener('resize', reconcileViewport)
      window.removeEventListener('orientationchange', reconcileViewport)
      window.visualViewport?.removeEventListener('resize', reconcileViewport)
      window.visualViewport?.removeEventListener('scroll', reconcileViewport)
      observer?.disconnect()
    }
  }, [freezeAtRenderedPosition, setPoint])

  useEffect(() => {
    let stopped = false
    const clear = () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
      /*
       * A completed drag updates the inline transform synchronously, then
       * bumps roamRevision so the next roaming timer starts fresh. Do not
       * re-read and rewrite layout during that effect cleanup when there is
       * no active animation. Android WebView can report the pre-gesture
       * composited rect for that cleanup frame, which made a successful
       * finger drag persist its new coordinates but visibly snap back.
       */
      if (animationRef.current) freezeAtRenderedPosition()
    }
    const schedule = (delay: number) => {
      timerRef.current = setTimeout(() => {
        if (stopped || !movingAllowed || dragRef.current) return
        const step = nextPetRoamStep(
          pointRef.current,
          bounds(),
          Math.random,
          snapshotPetPerches(viewportRef.current),
          petWalkSpeed(info.loopMs),
        )
        setDirection(step.destination.x >= pointRef.current.x ? 'right' : 'left')
        setWalking(true)
        setJumping(step.motion === 'jump')
        const from = pointRef.current
        const pet = petRef.current
        if (!pet) return
        const animation = pet.animate(
          [
            { transform: `translate3d(${from.x}px, ${from.y}px, 0)` },
            {
              transform: `translate3d(${step.destination.x}px, ${step.destination.y}px, 0)`,
            },
          ],
          { duration: step.durationMs, easing: 'linear', fill: 'forwards' },
        )
        animationRef.current = {
          animation,
          destination: step.destination,
          durationMs: step.durationMs,
          from,
          startedAtMs: performance.now(),
        }
        animation.onfinish = () => {
          if (animationRef.current?.animation !== animation) return
          animationRef.current = null
          settlePetRoamAnimation(animation, step.destination, setPoint)
          setWalking(false)
          setJumping(false)
          if (!stopped) schedule(step.restMs)
        }
      }, delay)
    }
    clear()
    if (movingAllowed) schedule(3_500 + Math.random() * 5_000)
    return () => {
      stopped = true
      clear()
    }
  }, [bounds, freezeAtRenderedPosition, info.loopMs, movingAllowed, roamRevision, setPoint])

  useEffect(() => {
    const cancelActiveDrag = () => {
      const drag = dragRef.current
      if (drag) finishDrag(drag.input, drag.id, true)
    }
    const onVisible = () => {
      if (document.visibilityState !== 'visible') {
        cancelActiveDrag()
        return
      }
      freezeAtRenderedPosition()
      setRoamRevision(current => current + 1)
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('blur', cancelActiveDrag)
    window.addEventListener('pagehide', cancelActiveDrag)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('blur', cancelActiveDrag)
      window.removeEventListener('pagehide', cancelActiveDrag)
    }
  }, [finishDrag, freezeAtRenderedPosition])

  if (!info.enabled || (!info.spritesheetBase64 && !info.spritesheetUrl)) return null

  const stage = (
    <div
      className="mobile-pet-stage"
      aria-label="Hermes pet companion"
      ref={stageRef}
      style={{
        height: `${viewport.height}px`,
        left: `${viewport.left}px`,
        top: `${viewport.top}px`,
        width: `${viewport.width}px`,
      }}
    >
      {bubble && (
        <PetBubble petRef={petRef} speaking={speaking} text={bubble} />
      )}
      <div
        aria-label={`Interact with ${info.displayName || 'your Hermes pet'}`}
        className="mobile-pet"
        onContextMenu={event => event.preventDefault()}
        onKeyDown={event => {
          if (event.key !== 'Enter' && event.key !== ' ') return
          event.preventDefault()
          revealSidechat()
          onClick()
        }}
        onLostPointerCapture={event =>
          finishDrag('pointer', event.pointerId, true)
        }
        onPointerCancel={event =>
          finishDrag('pointer', event.pointerId, true)
        }
        onPointerDown={event => {
          if (event.pointerType === 'touch' || event.button !== 0) return
          event.preventDefault()
          if (
            beginDrag(
              'pointer',
              event.pointerId,
              event.clientX,
              event.clientY,
              event.target,
            )
          ) {
            event.currentTarget.setPointerCapture(event.pointerId)
          }
        }}
        onPointerMove={event => {
          if (event.pointerType === 'touch') return
          moveDrag(
            'pointer',
            event.pointerId,
            event.clientX,
            event.clientY,
          )
        }}
        onPointerUp={event => {
          if (event.pointerType === 'touch') return
          finishDrag('pointer', event.pointerId, false)
        }}
        ref={petRef}
        role="button"
        style={{
          '--pet-scale': String(Math.max(1.8, Math.min(2.2, (info.scale ?? 0.33) * 5.5))),
        } as CSSProperties}
        tabIndex={0}
      >
        <PetCanvas direction={direction} info={info} state={walking ? (jumping ? 'jump' : 'run') : state} />
        {sidechatAvailable && sidechatVisible && (
          <button
            aria-label={`Open ${info.displayName || 'pet'} sidechat`}
            className="mobile-pet-chat-button"
            onClick={event => {
              event.stopPropagation()
              if (event.detail === 0) {
                setSidechatVisible(false)
                onSidechat()
              }
            }}
            type="button"
          >
            ✦
          </button>
        )}
      </div>
    </div>
  )
  return typeof document === 'undefined'
    ? stage
    : createPortal(stage, document.body)
}
