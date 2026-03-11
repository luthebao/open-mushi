import { useCallback, useMemo } from "react";

import { Button } from "@openmushi/ui/components/ui/button";

import { computeCurrentNoteTab } from "./compute-note-tab";

import { useAITaskTask } from "~/ai/hooks";
import { useNetwork } from "~/contexts/network";
import * as main from "~/store/tinybase/store/main";
import { createTaskId } from "~/store/zustand/ai-task/task-configs";
import type { Tab } from "~/store/zustand/tabs/schema";
import { type EditorView } from "~/store/zustand/tabs/schema";
import { useListener } from "~/stt/contexts";
import { useSTTConnection } from "~/stt/useSTTConnection";

function getPreflightRemediation(
  message: string,
): { message: string; actionLabel: string } {
  const lower = message.toLowerCase();

  if (lower.includes("microphone")) {
    return {
      message:
        "No microphone detected. Connect/select a microphone and allow Open Mushi microphone access in system settings.",
      actionLabel: "Open settings",
    };
  }

  if (lower.includes("stt") || lower.includes("model")) {
    return {
      message:
        "Speech model is unavailable. Download the required STT model in AI settings before starting recording.",
      actionLabel: "Open settings",
    };
  }

  if (lower.includes("llm")) {
    return {
      message:
        "Summary model is unavailable. Download the default local LLM model or switch to an available one.",
      actionLabel: "Open settings",
    };
  }

  if (lower.includes("permission") || lower.includes("denied")) {
    return {
      message:
        "Permissions are blocking recording. Grant microphone/audio permissions in system settings, then retry.",
      actionLabel: "Open settings",
    };
  }

  return {
    message: `Recording preflight failed: ${message}`,
    actionLabel: "Open settings",
  };
}

function getRecordingFailureRemediation(
  message: string,
): { message: string; actionLabel: string } {
  const lower = message.toLowerCase();

  if (lower.includes("audio_artifact_not_found")) {
    return {
      message:
        "Recorded audio artifact was not found. Try stale-state recovery, then record again.",
      actionLabel: "Recover",
    };
  }

  if (lower.includes("transcription_failed") || lower.includes("stt")) {
    return {
      message:
        "Transcription failed. Verify microphone input and STT model availability, then retry recording.",
      actionLabel: "Open settings",
    };
  }

  if (lower.includes("summarization_failed") || lower.includes("llm")) {
    return {
      message:
        "Summarization failed. Check local LLM model/server readiness, then retry.",
      actionLabel: "Open settings",
    };
  }

  if (lower.includes("permission") || lower.includes("denied")) {
    return {
      message:
        "Permission failure detected. Grant required OS permissions for microphone/audio capture.",
      actionLabel: "Open settings",
    };
  }

  return {
    message: `Recording failed: ${message}`,
    actionLabel: "Open settings",
  };
}

export { computeCurrentNoteTab } from "./compute-note-tab";

export function useHasTranscript(sessionId: string): boolean {
  const transcriptIds = main.UI.useSliceRowIds(
    main.INDEXES.transcriptBySession,
    sessionId,
    main.STORE_ID,
  );

  return !!transcriptIds && transcriptIds.length > 0;
}

export function useCurrentNoteTab(
  tab: Extract<Tab, { type: "sessions" }>,
): EditorView {
  const sessionMode = useListener((state) => state.getSessionMode(tab.id));
  const isListenerStarting = useListener(
    (state) =>
      state.live.loading &&
      state.live.sessionId === tab.id &&
      state.live.status === "inactive",
  );
  const isListenerActive =
    sessionMode === "active" ||
    sessionMode === "finalizing" ||
    isListenerStarting;

  const enhancedNoteIds = main.UI.useSliceRowIds(
    main.INDEXES.enhancedNotesBySession,
    tab.id,
    main.STORE_ID,
  );
  const firstEnhancedNoteId = enhancedNoteIds?.[0];

  return useMemo(
    () =>
      computeCurrentNoteTab(
        tab.state.view ?? null,
        isListenerActive,
        firstEnhancedNoteId,
      ),
    [tab.state.view, isListenerActive, firstEnhancedNoteId],
  );
}

export function RecordingIcon() {
  return <div className="size-2 rounded-full bg-red-500" />;
}

export function useListenButtonState(sessionId: string) {
  const {
    sessionMode,
    lastError,
    recordingLastError,
    preflightReport,
    preflightLoading,
    runPreflight,
    clearStaleRecordingState,
    getPreflightFailureSummary,
  } = useListener((state) => ({
    sessionMode: state.getSessionMode(sessionId),
    lastError: state.live.lastError,
    recordingLastError: state.live.recording.lastError,
    preflightReport: state.live.recording.preflight.report,
    preflightLoading: state.live.recording.preflight.loading,
    runPreflight: state.runPreflight,
    clearStaleRecordingState: state.clearStaleRecordingState,
    getPreflightFailureSummary: state.getPreflightFailureSummary,
  }));

  const active = sessionMode === "active" || sessionMode === "finalizing";
  const batching = sessionMode === "running_batch";

  const taskId = createTaskId(sessionId, "enhance");
  const { status } = useAITaskTask(taskId, "enhance");
  const generating = status === "generating";
  const { conn: sttConnection, local, isLocalModel } = useSTTConnection();
  const { isOnline } = useNetwork();

  const localServerStatus = local.data?.status ?? "unavailable";
  const isLocalServerLoading = localServerStatus === "loading";
  const isLocalModelNotDownloaded = localServerStatus === "not_downloaded";

  const isOfflineWithCloudModel = !isOnline && !isLocalModel;

  const { blockingFailures, warningFailures } = getPreflightFailureSummary();

  const runPreflightBeforeStart = useCallback(async () => {
    const report = await runPreflight();
    if (!report) {
      return {
        ok: false,
        message: "Could not run recording preflight checks.",
        actionLabel: "Open settings",
      };
    }

    if (!report.ok) {
      const firstFailure = report.checks.find((check) => check.status === "error");
      if (firstFailure) {
        return {
          ok: false,
          ...getPreflightRemediation(firstFailure.message),
        };
      }
    }

    return { ok: true, message: "", actionLabel: "" };
  }, [runPreflight]);

  const recoverStaleState = useCallback(async () => {
    const recovered = await clearStaleRecordingState();
    if (!recovered) {
      return {
        ok: false,
        message:
          "No stale state was cleared. If this persists, retry after restarting Open Mushi.",
      };
    }

    return {
      ok: true,
      message: "Stale recording state cleared. You can try starting again.",
    };
  }, [clearStaleRecordingState]);

  const shouldRender = !active && !generating;
  const isPreflightBlocked = blockingFailures.length > 0;
  const isDisabled =
    !sttConnection ||
    batching ||
    isLocalServerLoading ||
    isLocalModelNotDownloaded ||
    isOfflineWithCloudModel ||
    preflightLoading;

  let warningMessage = "";
  let warningAction: { label: string; handleClick: () => void } | undefined;

  if (recordingLastError) {
    const remediation = getRecordingFailureRemediation(recordingLastError);
    warningMessage = remediation.message;

    if (remediation.actionLabel === "Recover") {
      warningAction = {
        label: "Recover",
        handleClick: () => {
          void recoverStaleState();
        },
      };
    }
  } else if (lastError === "preflight_failed" && preflightReport && !preflightReport.ok) {
    const firstFailure = preflightReport.checks.find(
      (check) => check.status === "error",
    );

    if (firstFailure) {
      const remediation = getPreflightRemediation(firstFailure.message);
      warningMessage = remediation.message;
    }
  } else if (isLocalModelNotDownloaded) {
    warningMessage = "Selected model is not downloaded.";
  } else if (isLocalServerLoading || preflightLoading) {
    warningMessage = "Running recording readiness checks...";
  } else if (isOfflineWithCloudModel) {
    warningMessage = "You're offline. Use on-device models to continue.";
  } else if (!sttConnection) {
    warningMessage = "Transcription model not available.";
  } else if (batching) {
    warningMessage = "Batch transcription in progress.";
  } else if (isPreflightBlocked) {
    const remediation = getPreflightRemediation(blockingFailures[0]?.message ?? "unknown");
    warningMessage = remediation.message;
  } else if (warningFailures.length > 0) {
    warningMessage = warningFailures[0]?.message ?? "Some checks need attention.";
  }

  return {
    shouldRender,
    isDisabled,
    warningMessage,
    warningAction,
    runPreflightBeforeStart,
  };
}

export function ActionableTooltipContent({
  message,
  action,
}: {
  message: string;
  action?: {
    label: string;
    handleClick: () => void;
  };
}) {
  return (
    <div className="flex flex-row items-center gap-3">
      <p className="text-xs">{message}</p>
      {action && (
        <Button
          size="sm"
          variant="outline"
          className="rounded-md text-black"
          onClick={action.handleClick}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
