export const TRANSCRIPT_FOLLOW_DISTANCE = 48
export const TRANSCRIPT_SCROLL_EPSILON = 1

export interface TranscriptScrollMetrics {
  clientHeight: number
  scrollHeight: number
  scrollTop: number
}

export interface TranscriptFollowDecision extends TranscriptScrollMetrics {
  manualScroll: boolean
  previousScrollTop: number
  wasFollowing: boolean
}

export interface TranscriptScrollTarget extends TranscriptScrollMetrics {
  scrollTop: number
}

export function transcriptDistanceFromBottom({
  clientHeight,
  scrollHeight,
  scrollTop,
}: TranscriptScrollMetrics): number {
  return Math.max(0, scrollHeight - clientHeight - scrollTop)
}

export function shouldFollowTranscriptAfterScroll({
  manualScroll,
  previousScrollTop,
  scrollTop,
  wasFollowing,
  ...metrics
}: TranscriptFollowDecision): boolean {
  if (
    transcriptDistanceFromBottom({
      ...metrics,
      scrollTop,
    }) <= TRANSCRIPT_FOLLOW_DISTANCE
  ) {
    return true
  }
  if (!wasFollowing) return false

  // A streaming row can grow by hundreds of pixels while scrollTop remains
  // unchanged. That is layout growth, not an upward user gesture, and must not
  // release follow mode. Only explicit interaction plus upward movement owns
  // the decision to stop following.
  return !(
    manualScroll &&
    scrollTop < previousScrollTop - TRANSCRIPT_SCROLL_EPSILON
  )
}

export function pinTranscriptToBottom(
  target: TranscriptScrollTarget,
): number {
  const bottom = Math.max(0, target.scrollHeight - target.clientHeight)
  target.scrollTop = bottom
  return bottom
}
