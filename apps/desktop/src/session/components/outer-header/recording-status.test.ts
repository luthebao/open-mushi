import { describe, expect, it } from "vitest";

import {
  getRecordingStatusChipLabel,
  getRecordingStatusSummary,
} from "./recording-status";

describe("getRecordingStatusChipLabel", () => {
  it("shows queue depth for queued states", () => {
    expect(getRecordingStatusChipLabel("queuedForStt", 3, null)).toBe(
      "Queued · 3",
    );
    expect(getRecordingStatusChipLabel("queuedForLlm", 1, null)).toBe(
      "Queued · 1",
    );
  });

  it("shows active marker for current transcribing job", () => {
    expect(
      getRecordingStatusChipLabel("transcribing", 2, "session-123"),
    ).toBe("Transcribing · active");
  });

  it("shows active marker for current summarizing job", () => {
    expect(
      getRecordingStatusChipLabel("summarizing", 2, "session-123"),
    ).toBe("Summarizing · active");
  });

  it("falls back to base stage labels when no active job is present", () => {
    expect(getRecordingStatusChipLabel("transcribing", 2, null)).toBe(
      "Transcribing",
    );
    expect(getRecordingStatusChipLabel("summarizing", 2, null)).toBe(
      "Summarizing",
    );
  });
});

describe("getRecordingStatusSummary", () => {
  it("returns queue summary text for queued/transcribing/summarizing states", () => {
    expect(getRecordingStatusSummary("queuedForStt", 2)).toEqual({
      title: "Recording pipeline",
      stage: "Queued for transcription",
      queue: "Queue depth: 2",
    });

    expect(getRecordingStatusSummary("transcribing", 0)).toEqual({
      title: "Recording pipeline",
      stage: "Transcribing",
      queue: "Queue depth: 0",
    });

    expect(getRecordingStatusSummary("summarizing", 1)).toEqual({
      title: "Recording pipeline",
      stage: "Summarizing",
      queue: "Queue depth: 1",
    });
  });

  it("returns null for non-pipeline states", () => {
    expect(getRecordingStatusSummary("idle", 0)).toBeNull();
    expect(getRecordingStatusSummary("recording", 0)).toBeNull();
    expect(getRecordingStatusSummary("failed", 0)).toBeNull();
  });
});
