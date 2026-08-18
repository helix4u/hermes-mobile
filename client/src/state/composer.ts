export function canSubmitComposer(
  connected: boolean,
  busy: boolean,
  turnActive: boolean,
  text: string,
): boolean {
  return connected && Boolean(text.trim()) && (!busy || turnActive)
}
