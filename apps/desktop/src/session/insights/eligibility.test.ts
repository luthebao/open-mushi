import { describe, expect, it } from "vitest";
import { deriveInsightEligibility } from "./eligibility";

describe("deriveInsightEligibility", () => {
  it("eligible only when transcript ready and session inactive", () => {
    expect(
      deriveInsightEligibility({
        hasTranscript: true,
        transcriptWordCount: 200,
        sessionMode: "inactive",
      }).eligible,
    ).toBe(true);

    expect(
      deriveInsightEligibility({
        hasTranscript: true,
        transcriptWordCount: 200,
        sessionMode: "active",
      }).eligible,
    ).toBe(false);
  });

  it("is ineligible when session is active", () => {
    expect(
      deriveInsightEligibility({
        hasTranscript: true,
        transcriptWordCount: 1,
        sessionMode: "active",
      }).eligible,
    ).toBe(false);
  });

  it("is ineligible when transcript is not ready", () => {
    expect(
      deriveInsightEligibility({
        hasTranscript: false,
        transcriptWordCount: 200,
        sessionMode: "inactive",
      }).eligible,
    ).toBe(false);

    expect(
      deriveInsightEligibility({
        hasTranscript: true,
        transcriptWordCount: 0,
        sessionMode: "inactive",
      }).eligible,
    ).toBe(false);
  });
});
