import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'

/** Top-layer review preserves the current page and never starts a voice call. */
export function VoiceReviewDialog({ children, label }: { children: ReactNode; label: string }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [later, setLater] = useState(false)
  useEffect(() => {
    const node = dialog.current
    if (!node || later) return
    const resize = () => {
      const viewport = window.visualViewport
      node.style.setProperty('--review-viewport-height', (viewport?.height || window.innerHeight) + 'px')
      node.style.top = ((viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight) / 2) + 'px'
      node.style.left = ((viewport?.offsetLeft || 0) + (viewport?.width || window.innerWidth) / 2) + 'px'
    }
    resize()
    node.showModal()
    window.visualViewport?.addEventListener('resize', resize)
    window.visualViewport?.addEventListener('scroll', resize)
    window.addEventListener('resize', resize)
    node.querySelector<HTMLElement>('[data-review-heading]')?.focus()
    const listener = Capacitor.isNativePlatform()
      ? CapacitorApp.addListener('backButton', () => setLater(true)) : null
    return () => {
      node.close()
      window.visualViewport?.removeEventListener('resize', resize)
      window.visualViewport?.removeEventListener('scroll', resize)
      window.removeEventListener('resize', resize)
      void listener?.then(handle => handle.remove())
    }
  }, [later])
  return createPortal(later
    ? <aside className="voice-review-notice" role="status"><span>{label}</span>
        <button type="button" onClick={() => setLater(false)}>Review request</button></aside>
    : <dialog ref={dialog} className="voice-review-dialog" aria-label={label}
        onCancel={event => { event.preventDefault(); setLater(true) }}>
        <header><strong tabIndex={-1} data-review-heading>{label}</strong>
          <button type="button" onClick={() => setLater(true)}>Later</button></header>
        {children}
      </dialog>, document.body)
}
