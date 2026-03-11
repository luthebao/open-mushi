import { useHover } from "@uidotdev/usehooks";
import { MicOff } from "lucide-react";
import { useCallback } from "react";

import type { RecordingState } from "@openmushi/plugin-listener";
import { DancingSticks } from "@openmushi/ui/components/ui/dancing-sticks";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@openmushi/ui/components/ui/tooltip";
import { cn } from "@openmushi/utils";

import {
  ActionableTooltipContent,
  RecordingIcon,
  useHasTranscript,
  useListenButtonState,
} from "~/session/components/shared";
import { useTabs } from "~/store/zustand/tabs";
import { useListener } from "~/stt/contexts";
import { useStartListening } from "~/stt/useStartListening";

type ChipTone = "live" | "working" | "error" | "neutral";

export function getRecordingStatusChipLabel(
  state: RecordingState,
  queueDepth: number,
): string {
  if (state === "starting") return "Starting";
  if (state === "recording") return "Recording";
  if (state === "stopping") return "Stopping";
  if (state === "queuedForStt" || state === "queuedForLlm") {
    return queueDepth > 0 ? `Queued · ${queueDepth}` : "Queued";
  }
  if (state === "transcribing") return "Transcribing";
  if (state === "summarizing") return "Summarizing";
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

function RecordingStatusChip({ sessionId }: { sessionId: string }) {
  const { state, queueDepth } = useListener((store) => ({
    state: store.live.recording.state,
    queueDepth: store.live.recording.queueDepth,
  }));

  const label = getRecordingStatusChipLabel(state, queueDepth);
  const tone = getRecordingStatusChipTone(state);

  return (
    <span
      className={cn([
        "inline-flex h-7 items-center rounded-md px-2 text-[11px] font-medium",
        tone === "live" && "bg-red-100 text-red-700",
        tone === "working" && "bg-amber-100 text-amber-700",
        tone === "error" && "bg-red-100 text-red-700",
        tone === "neutral" && "bg-neutral-200 text-neutral-700",
      ])}
      data-session-id={sessionId}
    >
      {label}
    </span>
  );
}

export function ListenButton({ sessionId }: { sessionId: string }) {
  const { shouldRender } = useListenButtonState(sessionId);

  return (
    <div className="flex items-center gap-1.5">
      <RecordingStatusChip sessionId={sessionId} />
      {shouldRender ? (
        <StartButton sessionId={sessionId} />
      ) : (
        <InMeetingIndicator sessionId={sessionId} />
      )}
    </div>
  );
}

function StartButton({ sessionId }: { sessionId: string }) {
  const { isDisabled, warningMessage } = useListenButtonState(sessionId);
  const hasTranscript = useHasTranscript(sessionId);
  const handleClick = useStartListening(sessionId);
  const openNew = useTabs((state) => state.openNew);

  const handleConfigureAction = useCallback(() => {
    openNew({ type: "ai", state: { tab: "transcription" } });
  }, [openNew]);

  const button = (
    <button
      type="button"
      onClick={handleClick}
      disabled={isDisabled}
      className={cn([
        "inline-flex items-center justify-center rounded-md text-xs font-semibold",
        "bg-red-600 text-white hover:bg-red-500",
        "gap-1.5",
        "h-8 px-3",
        "disabled:pointer-events-none disabled:opacity-50",
      ])}
    >
      <RecordingIcon />
      <span className="whitespace-nowrap">
        {hasTranscript ? "Resume listening" : "Start listening"}
      </span>
    </button>
  );

  if (!warningMessage) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-block">{button}</span>
        </TooltipTrigger>
        <TooltipContent side="bottom">Start recording this session</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <span className="inline-block">{button}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <ActionableTooltipContent
          message={warningMessage}
          action={{
            label: "Configure",
            handleClick: handleConfigureAction,
          }}
        />
      </TooltipContent>
    </Tooltip>
  );
}

function InMeetingIndicator({ sessionId }: { sessionId: string }) {
  const [ref, hovered] = useHover();

  const { mode, stop, amplitude, muted } = useListener((state) => ({
    mode: state.getSessionMode(sessionId),
    stop: state.stop,
    amplitude: state.live.amplitude,
    muted: state.live.muted,
  }));

  const active = mode === "active" || mode === "finalizing";
  const finalizing = mode === "finalizing";

  if (!active) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={ref}
          type="button"
          onClick={finalizing ? undefined : stop}
          disabled={finalizing}
          className={cn([
            "inline-flex items-center justify-center rounded-md text-sm font-medium",
            finalizing
              ? ["text-neutral-500", "bg-neutral-100", "cursor-wait"]
              : ["text-red-500 hover:text-red-600", "bg-red-50 hover:bg-red-100"],
            "h-8 w-22",
            "disabled:pointer-events-none disabled:opacity-50",
          ])}
          aria-label={finalizing ? "Finalizing" : "Stop listening"}
        >
          {finalizing ? (
            <div className="flex items-center gap-1.5">
              <span className="animate-pulse">...</span>
            </div>
          ) : (
            <>
              <div
                className={cn([
                  "flex items-center gap-1.5",
                  hovered ? "hidden" : "flex",
                ])}
              >
                {muted && <MicOff size={14} />}
                <DancingSticks
                  amplitude={Math.min((amplitude.mic + amplitude.speaker) / 2000, 1)}
                  color="#ef4444"
                  height={18}
                  width={60}
                />
              </div>
              <div
                className={cn([
                  "flex items-center gap-1.5",
                  hovered ? "flex" : "hidden",
                ])}
              >
                <span className="size-2 rounded-none bg-red-500" />
                <span className="text-xs">Stop</span>
              </div>
            </>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {finalizing ? "Finalizing..." : "Stop listening"}
      </TooltipContent>
    </Tooltip>
  );
}
