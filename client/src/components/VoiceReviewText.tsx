import { useLayoutEffect, useRef, type ComponentProps } from 'react'

/** Grow into available review space before introducing an inner scrollbar. */
export function VoiceReviewText(props: ComponentProps<'textarea'>) {
  const editor = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const fit = () => {
      const node = editor.current
      if (!node) return
      node.style.height = 'auto'
      node.style.height = Math.min(node.scrollHeight + 2,
        Math.max(80, (window.visualViewport?.height || window.innerHeight) - 220)) + 'px'
    }
    const frame = requestAnimationFrame(fit)
    const dialog = editor.current?.closest('dialog')
    dialog?.addEventListener('toggle', fit)
    window.visualViewport?.addEventListener('resize', fit)
    window.addEventListener('resize', fit)
    return () => {
      cancelAnimationFrame(frame)
      dialog?.removeEventListener('toggle', fit)
      window.visualViewport?.removeEventListener('resize', fit)
      window.removeEventListener('resize', fit)
    }
  }, [props.value])
  return <textarea {...props} ref={editor} />
}
