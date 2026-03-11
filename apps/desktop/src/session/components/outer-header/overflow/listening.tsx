import { MicIcon, MicOffIcon } from "lucide-react";

import { DropdownMenuItem } from "@openmushi/ui/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@openmushi/ui/components/ui/tooltip";

import {
  ActionableTooltipContent,
  useListenButtonState,
} from "~/session/components/shared";
import { useTabs } from "~/store/zustand/tabs";
import { useListener } from "~/stt/contexts";
import { useStartListening } from "~/stt/useStartListening";

export function Listening({
  sessionId,
  hasTranscript,
}: {
  sessionId: string;
  hasTranscript: boolean;
}) {
  const { mode, stop } = useListener((state) => ({
    mode: state.getSessionMode(sessionId),
    stop: state.stop,
  }));
  const {
    isDisabled,
    warningMessage,
    warningAction,
    runPreflightBeforeStart,
  } = useListenButtonState(sessionId);
  const openNew = useTabs((state) => state.openNew);
  const isListening = mode === "active" || mode === "finalizing";
  const isFinalizing = mode === "finalizing";
  const isBatching = mode === "running_batch";
  const startListening = useStartListening(sessionId);

  const handleToggleListening = () => {
    if (isBatching || isDisabled) {
      return;
    }

    if (isListening) {
      stop();
    } else {
      void runPreflightBeforeStart().then((result) => {
        if (result.ok) {
          startListening();
        }
      });
    }
  };

  const startLabel = hasTranscript ? "Resume listening" : "Start listening";

  const remediationAction = warningAction
    ? {
        label: warningAction.label,
        handleClick: warningAction.handleClick,
      }
    : {
        label: "Configure",
        handleClick: () => {
          openNew({ type: "ai", state: { tab: "transcription" } });
        },
      };

  const item = (
    <DropdownMenuItem
      className="cursor-pointer"
      onClick={handleToggleListening}
      disabled={isFinalizing || isBatching || isDisabled}
    >
      {isListening ? <MicOffIcon /> : <MicIcon />}
      <span>
        {isBatching
          ? "Batch processing"
          : isListening
            ? "Stop listening"
            : startLabel}
      </span>
    </DropdownMenuItem>
  );

  if (!warningMessage) {
    return item;
  }

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <span className="w-full">{item}</span>
      </TooltipTrigger>
      <TooltipContent side="left">
        <ActionableTooltipContent
          message={warningMessage}
          action={remediationAction}
        />
      </TooltipContent>
    </Tooltip>
  );
}
