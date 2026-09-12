export type GptLiveAppendKind = "commentary" | "instructions" | "thinking";

export interface GptLiveTranscriptFragment {
  endMs: number | null;
  role: "assistant" | "user";
  startMs: number | null;
  text: string;
}

export interface GptLiveDelegation {
  id: string;
  offsetMs: number | null;
}

interface LiveRecord {
  [key: string]: unknown;
}

export const GPT_LIVE_APPEND_MAX_TOKENS = 500;

const utf8 = new TextEncoder();
const GPT_LIVE_CLIENT_EVENT_TYPES = new Set([
  "response.create",
  "response.item.create",
  "session.close",
  "session.commentary.append",
  "session.input_audio.append",
  "session.input_audio.mute",
  "session.input_audio.unmute",
  "session.instructions.append",
  "session.start",
  "session.thinking.append",
  "session.update",
]);

function record(value: unknown): LiveRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as LiveRecord)
    : {};
}

export function gptLiveEventType(value: unknown): string {
  return String(record(value).type ?? "");
}

/** Fail closed before a Realtime-only command reaches a GPT-Live session. */
export function gptLiveClientEventAllowed(value: unknown): boolean {
  return GPT_LIVE_CLIENT_EVENT_TYPES.has(gptLiveEventType(value));
}

function timestamp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function gptLiveTranscriptDelta(
  value: unknown,
): GptLiveTranscriptFragment | null {
  const event = record(value);
  const type = String(event.type ?? "");
  const text = typeof event.delta === "string" ? event.delta : "";
  if (!text) return null;
  if (type === "session.input_transcript.delta")
    return {
      endMs: timestamp(event.end_ms),
      role: "user",
      startMs: timestamp(event.start_ms),
      text,
    };
  if (type === "session.output_transcript.delta")
    return {
      endMs: timestamp(event.end_ms),
      role: "assistant",
      startMs: timestamp(event.start_ms),
      text,
    };
  return null;
}

export function gptLiveDelegation(value: unknown): GptLiveDelegation | null {
  const event = record(value);
  if (event.type !== "session.delegation.created") return null;
  const delegation = record(event.delegation);
  return delegation.target === "client" && typeof delegation.id === "string"
    ? { id: delegation.id, offsetMs: timestamp(event.offset_ms) }
    : null;
}

export function gptLiveDelegationId(value: unknown): string {
  return gptLiveDelegation(value)?.id ?? "";
}


/**
 * Split append text at a conservative upper bound for the provider's 500-token
 * limit. A tokenizer token cannot represent less than one UTF-8 byte, so a
 * chunk of at most 500 bytes cannot exceed 500 tokens. Iterating code points
 * keeps surrogate pairs intact, and callers can send every returned chunk
 * without dropping the remainder of a long context update.
 */
export function gptLiveAppendChunks(content: string): string[] {
  const clean = content.trim();
  if (!clean) return [];

  const chunks: string[] = [];
  let chunk = "";
  let chunkBytes = 0;

  for (const character of clean) {
    const characterBytes = utf8.encode(character).byteLength;
    if (chunk && chunkBytes + characterBytes > GPT_LIVE_APPEND_MAX_TOKENS) {
      chunks.push(chunk);
      chunk = "";
      chunkBytes = 0;
    }
    chunk += character;
    chunkBytes += characterBytes;
  }

  if (chunk) chunks.push(chunk);
  return chunks;
}

export function gptLiveAppendEvent(
  kind: GptLiveAppendKind,
  content: string,
  delegationId: null | string,
  eventId: string,
): Record<string, unknown> {
  return {
    type: `session.${kind}.append`,
    event_id: eventId,
    delegation_id: delegationId,
    content: gptLiveAppendChunks(content)[0] ?? "",
  };
}
