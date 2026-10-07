export function becameActive(
  wasActive: boolean,
  isActive: boolean,
): boolean {
  return !wasActive && isActive
}

export function usesDocumentVisibility(nativeClient: boolean): boolean {
  return !nativeClient
}
/** Background work keeps only an already requested native audio connection alive. */
export function mayReconnectForPlayback(native: boolean, foreground: boolean, speech: boolean, liveVoice: boolean, autoSpeakTurn: boolean): boolean {
  return foreground || (native && (speech || liveVoice || autoSpeakTurn))
}
