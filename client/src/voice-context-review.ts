/** App-owned approval capability. Never exposed as a model-callable tool. */
export interface VoiceContextReview {
  identity: string
  text: string
}

export function sameVoiceReview(left: VoiceContextReview | null, right: VoiceContextReview | null): boolean {
  return Boolean(left && right && left.identity === right.identity && left.text === right.text)
}
