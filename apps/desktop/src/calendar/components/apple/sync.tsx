import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@openmushi/ui/components/ui/tooltip";
import { cn } from "@openmushi/utils";

import { useSync } from "./context";

export function SyncIndicator() {
  const { status } = useSync();

  const statusText =
    status === "syncing"
      ? "Syncing"
      : status === "scheduled"
        ? "Sync scheduled"
        : "Idle";

  return (
    <Tooltip delayDuration={0}>
      <TooltipTrigger asChild>
        <span
          className={cn([
            "size-2.5 rounded-full",
            status === "syncing" && "animate-pulse bg-blue-500",
            status === "scheduled" && "bg-amber-500",
            status === "idle" && "bg-neutral-300",
          ])}
        />
      </TooltipTrigger>
      <TooltipContent side="bottom">{statusText}</TooltipContent>
    </Tooltip>
  );
}
