import type { ComponentProps } from 'react'

interface TranscriptViewportProps extends Omit<ComponentProps<'div'>, 'className'> {
  selectionEpoch: number
}

/**
 * Replace the scroll host at an intentional session boundary. A long-lived
 * transcript can contain DOM nodes left behind by earlier tool-card renders;
 * clearing React's current items alone cannot remove nodes it no longer owns.
 * Replacing the host removes the complete old DOM subtree without disturbing
 * ordinary streaming or reconnect updates within the same session.
 */
export function TranscriptViewport({ selectionEpoch, ...props }: TranscriptViewportProps) {
  return <div {...props} className="transcript" key={selectionEpoch} />
}
