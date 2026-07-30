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
  state: MobilePetState
  onClick: () => void
  onSidechat: () => void
}

interface Point {
  x: number
  y: number
}

type PetGestureInput = 'pointer' | 'touch'

const PET_SIZE = 72
const DRAG_SLOP = 4
export const MIN_PET_ROAM_SPEED = 7
const BUBBLE_GAP = 8
const BUBBLE_MARGIN = 12
const BUBBLE_MAX_WIDTH = 224
const positionKey = (connectionId: string) =>
  `hermes-mobile.pet-position.v1.${connectionId || 'default'}`

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

export function nextPetRoamStep(
  current: Point,
  bounds: { width: number; height: number },
  random = Math.random,
) {
  const maxX = Math.max(0, bounds.width - PET_SIZE)
  const maxY = Math.max(0, bounds.height - PET_SIZE)
  const longWalk = random() > 0.68
  const span = longWalk ? Math.max(90, maxX * 0.7) : 45 + random() * 95
  const sign = random() > 0.5 ? 1 : -1
  const x = Math.max(0, Math.min(maxX, current.x + span * sign))
  const y = Math.max(0, Math.min(maxY, current.y + (random() - 0.5) * 42))
  const distance = Math.hypot(x - current.x, y - current.y)
  const plannedDuration =
    (longWalk ? 10_000 : 7_000) + random() * 6_000
  return {
    destination: { x, y },
    durationMs: Math.round(
      Math.max(
        250,
        Math.min(
          plannedDuration,
          (distance / MIN_PET_ROAM_SPEED) * 1_000,
        ),
      ),
    ),
    restMs: Math.round(4_500 + random() * 10_500),
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
  text,
}: {
  petRef: RefObject<HTMLDivElement | null>
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
    <div className="mobile-pet-bubble" ref={bubbleRef} role="status">
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
  state,
}: MobilePetProps) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const petRef = useRef<HTMLDivElement | null>(null)
  const pointRef = useRef<Point>({ x: 12, y: 220 })
  const animationRef = useRef<Animation | null>(null)
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
  const [roamRevision, setRoamRevision] = useState(0)
  const [sidechatVisible, setSidechatVisible] = useState(false)
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
    const stage = stageRef.current
    return {
      height: Math.max(PET_SIZE, stage?.clientHeight ?? 0),
      width: Math.max(PET_SIZE, stage?.clientWidth ?? 0),
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
    const stage = stageRef.current
    const pet = petRef.current
    if (!stage || !pet) return
    const stageRect = stage.getBoundingClientRect()
    const petRect = pet.getBoundingClientRect()
    animationRef.current?.cancel()
    animationRef.current = null
    setPoint({ x: petRect.left - stageRect.left, y: petRect.top - stageRect.top })
    setWalking(false)
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
      const rect = stage.getBoundingClientRect()
      setPoint(
        petPositionFromPointer(
          { x: clientX, y: clientY },
          { x: rect.left, y: rect.top },
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
        const step = nextPetRoamStep(pointRef.current, bounds())
        setDirection(step.destination.x >= pointRef.current.x ? 'right' : 'left')
        setWalking(true)
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
        animationRef.current = animation
        animation.onfinish = () => {
          animationRef.current = null
          setPoint(step.destination)
          setWalking(false)
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
  }, [bounds, freezeAtRenderedPosition, movingAllowed, roamRevision, setPoint])

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
    <div className="mobile-pet-stage" aria-label="Hermes pet companion" ref={stageRef}>
      {bubble && <PetBubble petRef={petRef} text={bubble} />}
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
        <PetCanvas direction={direction} info={info} state={walking ? 'run' : state} />
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
