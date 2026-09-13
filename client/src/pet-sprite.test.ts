import { describe, expect, it, vi } from 'vitest'
import { PetSpritePainter } from './pet-sprite'

describe('pet sprite presentation', () => {
  it('does not clear while decoding or repeatedly resize during direction/state changes', () => {
    const context = { clearRect: vi.fn(), drawImage: vi.fn(), imageSmoothingEnabled: true }
    const resize = vi.fn()
    let width = 32, height = 32
    const canvas = { getContext: () => context,
      get width() { return width }, set width(value) { width = value; resize() },
      get height() { return height }, set height(value) { height = value; resize() },
    } as unknown as HTMLCanvasElement
    const painter = new PetSpritePainter()
    const image = { complete: false, naturalWidth: 0 } as HTMLImageElement
    const frame = { frame: 0, row: 0, width: 32, height: 32 }
    painter.paint(canvas, image, frame)
    expect(context.clearRect).not.toHaveBeenCalled()
    Object.assign(image, { complete: true, naturalWidth: 256 })
    painter.paint(canvas, image, frame)
    painter.paint(canvas, image, frame)
    expect(context.drawImage).toHaveBeenCalledTimes(1)
    painter.paint(canvas, image, { ...frame, row: 1 })
    expect(context.drawImage).toHaveBeenCalledTimes(2)
    expect(resize).not.toHaveBeenCalled()
    painter.paint(canvas, image, { ...frame, width: 48 })
    expect(resize).toHaveBeenCalledTimes(1)
  })
})
