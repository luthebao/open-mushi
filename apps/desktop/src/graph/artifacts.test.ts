import { describe, expect, it } from "vitest";

import {
  buildGraphFromLLMOutput,
  deriveTranscriptProvenance,
  type SessionGraphArtifact,
} from "./artifacts";

describe("deriveTranscriptProvenance", () => {
  it("detects timestamps and speaker metadata from transcript artifacts", () => {
    const result = deriveTranscriptProvenance(
      JSON.stringify([{ text: "hello", start_ms: 1000, end_ms: 1300 }]),
      JSON.stringify([{ word_id: "w1", type: "provider_speaker_index" }]),
      1000,
      1300,
    );

    expect(result.hasTimestamps).toBe(true);
    expect(result.hasSpeakerMetadata).toBe(true);
    expect(result.startedAt).toBe(1000);
    expect(result.endedAt).toBe(1300);
  });

  it("returns false metadata flags when transcript has no timing/speaker info", () => {
    const result = deriveTranscriptProvenance("plain text", "[]", undefined, null);

    expect(result.hasTimestamps).toBe(false);
    expect(result.hasSpeakerMetadata).toBe(false);
    expect(result.startedAt).toBeNull();
    expect(result.endedAt).toBeNull();
  });
});

describe("buildGraphFromLLMOutput", () => {
  it("attaches per-session provenance to graph nodes", () => {
    const sessionArtifacts: SessionGraphArtifact[] = [
      {
        id: "session-1",
        text: "Alice reviewed architecture decisions",
        provenance: {
          hasSummary: true,
          hasTranscript: true,
          hasTimestamps: true,
          hasSpeakerMetadata: true,
          startedAt: 1000,
          endedAt: 5000,
        },
      },
    ];

    const data = buildGraphFromLLMOutput(
      {
        keywords: [{ keyword: "architecture", noteIndices: [0] }],
      },
      sessionArtifacts,
    );

    expect(data.nodes).toHaveLength(1);
    expect(data.nodes[0]?.sessionArtifacts?.["session-1"]).toEqual({
      hasSummary: true,
      hasTranscript: true,
      hasTimestamps: true,
      hasSpeakerMetadata: true,
      startedAt: 1000,
      endedAt: 5000,
    });
  });
});
