export interface SpriteFrame { width: number; height: number; row: number; frame: number }

/** Retain the last painted frame while loading. Resize only when dimensions change. */
export class PetSpritePainter {
  private last = ''
  paint(canvas: HTMLCanvasElement, image: HTMLImageElement, frame: SpriteFrame): void {
    if (!image.complete || !image.naturalWidth) return
    const context = canvas.getContext('2d')
    if (!context) return
    const signature = JSON.stringify(frame)
    if (signature === this.last) return
    this.last = signature
    if (canvas.width !== frame.width) canvas.width = frame.width
    if (canvas.height !== frame.height) canvas.height = frame.height
    context.imageSmoothingEnabled = false
    context.clearRect(0, 0, frame.width, frame.height)
    context.drawImage(image, frame.frame * frame.width, frame.row * frame.height,
      frame.width, frame.height, 0, 0, frame.width, frame.height)
  }
}
