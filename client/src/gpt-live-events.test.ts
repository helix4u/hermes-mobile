import { describe, expect, it } from "vitest";
import {
  GPT_LIVE_APPEND_MAX_TOKENS,
  gptLiveAppendChunks,
  gptLiveAppendEvent,
  gptLiveClientEventAllowed,
  gptLiveDelegation,
  gptLiveDelegationId,
  gptLiveTranscriptDelta,
} from "./gpt-live-events";

describe("GPT-Live events", () => {
  it("extracts transcript deltas and opaque client delegation ids", () => {
    expect(
      gptLiveTranscriptDelta({
        type: "session.input_transcript.delta",
        delta: "do it",
        start_ms: 10,
        end_ms: 40,
      }),
    ).toEqual({ endMs: 40, role: "user", startMs: 10, text: "do it" });
    expect(
      gptLiveDelegation({
        type: "session.delegation.created",
        offset_ms: 50,
        delegation: { id: "item_opaque", target: "client" },
      }),
    ).toEqual({ id: "item_opaque", offsetMs: 50 });
    expect(
      gptLiveDelegationId({
        type: "session.delegation.created",
        delegation: { id: "item_opaque", target: "client" },
      }),
    ).toBe("item_opaque");
  });


  it("allows only GPT-Live client events on a GPT-Live session", () => {
    expect(gptLiveClientEventAllowed({ type: "session.thinking.append" })).toBe(
      true,
    );
    expect(gptLiveClientEventAllowed({ type: "session.close" })).toBe(true);
    expect(gptLiveClientEventAllowed({ type: "response.cancel" })).toBe(false);
    expect(
      gptLiveClientEventAllowed({ type: "output_audio_buffer.clear" }),
    ).toBe(false);
    expect(
      gptLiveClientEventAllowed({ type: "conversation.item.create" }),
    ).toBe(false);
  });

  it("builds bounded appends with an explicit delegation id", () => {
    expect(
      gptLiveAppendEvent("thinking", " context ", null, "event_1"),
    ).toEqual({
      type: "session.thinking.append",
      event_id: "event_1",
      delegation_id: null,
      content: "context",
    });
    expect(
      String(
        gptLiveAppendEvent("commentary", "x".repeat(2000), "item_1", "event_2")
          .content,
      ),
    ).toHaveLength(500);
  });

  it("splits complete append text into chunks that cannot exceed 500 tokens", () => {
    const content = `${"x".repeat(1001)}${"🍌".repeat(200)}`;
    const chunks = gptLiveAppendChunks(content);

    expect(chunks.join("")).toBe(content);
    expect(chunks.length).toBeGreaterThan(1);
    expect(
      chunks.every(
        (chunk) =>
          new TextEncoder().encode(chunk).byteLength <=
          GPT_LIVE_APPEND_MAX_TOKENS,
      ),
    ).toBe(true);
  });
});
