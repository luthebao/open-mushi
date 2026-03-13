export type SessionMode = "active" | "inactive";

export type InsightEligibilityInput = {
  hasTranscript: boolean;
  transcriptWordCount: number;
  sessionMode: SessionMode;
};

export type InsightEligibility = {
  eligible: boolean;
  transcriptReady: boolean;
  sessionInactive: boolean;
};

export function deriveInsightEligibility(
  input: InsightEligibilityInput,
): InsightEligibility {
  const transcriptReady =
    input.hasTranscript && Number.isFinite(input.transcriptWordCount) && input.transcriptWordCount > 0;
  const sessionInactive = input.sessionMode === "inactive";

  return {
    eligible: transcriptReady && sessionInactive,
    transcriptReady,
    sessionInactive,
  };
}
