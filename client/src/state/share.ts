import type { SharedContent } from '../transport/native-bridge'

export interface ShareDestination {
  connectionId: string
  sessionId: string
  cwd: string
  text: string
}

export function sharedPromptText(
  share: SharedContent,
  editedText: string,
): string {
  const text = editedText.trim()
  if (text) return text
  return share.kind === 'image'
    ? 'Take a look at this shared image.'
    : ''
}

export function sharedImageAttachParams(
  share: SharedContent,
  dataUrl: string,
  sessionId: string,
): Record<string, string> {
  return {
    session_id: sessionId,
    content_base64: dataUrl,
    filename: share.name || 'shared-image',
  }
}

export function canSendSharedContent(
  share: SharedContent,
  destination: ShareDestination,
  activeConnectionId: string,
  connected: boolean,
): boolean {
  if (!connected || destination.connectionId !== activeConnectionId) {
    return false
  }
  if (!destination.sessionId) return false
  if (destination.sessionId === 'new' && !destination.cwd.trim()) return false
  return share.kind === 'image' || Boolean(destination.text.trim())
}
