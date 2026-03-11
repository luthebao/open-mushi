import { describe, expect, it } from "vitest";

import { getRecordingStatusChipLabel } from "./recording-status";

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
