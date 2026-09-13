export function shouldAutoplay(enabled: boolean, muteDuringVoice: boolean, voiceActive: boolean): boolean {
  return enabled && !(muteDuringVoice && voiceActive)
}
export function loadMuteAutoplayDuringVoice(connectionId: string): boolean {
  return typeof window === 'undefined' || window.localStorage.getItem(`hermes-mobile.voice.${connectionId}.mute-autoplay-during-voice`) !== 'false'
}
export function saveMuteAutoplayDuringVoice(connectionId: string, enabled: boolean): void {
  window.localStorage.setItem(`hermes-mobile.voice.${connectionId}.mute-autoplay-during-voice`, String(enabled))
}
