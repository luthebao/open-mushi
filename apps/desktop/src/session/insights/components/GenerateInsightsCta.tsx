import { Spinner } from "@openmushi/ui/components/ui/spinner";

import type { InsightErrorEnvelope, InsightPhase } from "../state";

type GenerateInsightsCtaProps = {
  eligible: boolean;
  phase: InsightPhase;
  error?: InsightErrorEnvelope;
  onGenerate: () => void;
  onRetry: () => void;
};

export function GenerateInsightsCta({
  eligible,
  phase,
  error,
  onGenerate,
  onRetry,
}: GenerateInsightsCtaProps) {
  if (!eligible && phase === "idle") {
    return null;
  }

  const isGenerating = phase === "generating_graph";
  const showRetry = phase === "eligible" && Boolean(error?.retryable);

  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2" data-testid="generate-insights-cta">
      <div className="flex items-center gap-2">
        {isGenerating ? (
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white opacity-80"
          >
            <Spinner size={14} />
            Generating insights...
          </button>
        ) : showRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white"
          >
            Retry generating insights
          </button>
        ) : (
          <button
            type="button"
            onClick={onGenerate}
            disabled={!eligible}
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Generate insights
          </button>
        )}

        {error?.userMessage && phase === "eligible" && (
          <span className="text-xs text-red-500">{error.userMessage}</span>
        )}
      </div>
    </div>
  );
}
