import type { RecordingState } from "@openmushi/plugin-listener";

export type ChipTone = "live" | "working" | "error" | "neutral";

export function getRecordingStatusChipLabel(
  state: RecordingState,
  queueDepth: number,
  currentJobSessionId: string | null,
): string {
  if (state === "starting") return "Starting";
  if (state === "recording") return "Recording";
  if (state === "stopping") return "Stopping";
  if (state === "queuedForStt" || state === "queuedForLlm") {
    return queueDepth > 0 ? `Queued · ${queueDepth}` : "Queued";
  }
  if (state === "transcribing") {
    return currentJobSessionId ? "Transcribing · active" : "Transcribing";
  }
  if (state === "summarizing") {
    return currentJobSessionId ? "Summarizing · active" : "Summarizing";
  }
  if (state === "completed") return "Completed";
  if (state === "failed") return "Failed";
  return "Ready";
}

export function getRecordingStatusChipTone(state: RecordingState): ChipTone {
  if (state === "recording" || state === "starting") return "live";
  if (
    state === "stopping" ||
    state === "queuedForStt" ||
    state === "queuedForLlm" ||
    state === "transcribing" ||
    state === "summarizing"
  ) {
    return "working";
  }
  if (state === "failed") return "error";
  return "neutral";
}
