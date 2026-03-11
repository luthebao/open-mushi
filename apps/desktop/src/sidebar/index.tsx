import { useQuery } from "@tanstack/react-query";
import { platform } from "@tauri-apps/plugin-os";
import { AxeIcon, PanelLeftCloseIcon } from "lucide-react";
import { lazy, Suspense, useState } from "react";

import { Button } from "@openmushi/ui/components/ui/button";
import { Kbd } from "@openmushi/ui/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@openmushi/ui/components/ui/tooltip";
import { cn } from "@openmushi/utils";

import { ProfileSection } from "./profile";
import { ToastArea } from "./toast";
import { WorkspaceTree } from "./workspace-tree";

import { useShell } from "~/contexts/shell";
import { SearchResults } from "~/search/components/sidebar";
import { useSearch } from "~/search/contexts/ui";
import { TrafficLights } from "~/shared/ui/traffic-lights";
import { useListener } from "~/stt/contexts";
import { commands } from "~/types/tauri.gen";

const DevtoolView = lazy(() =>
  import("./devtool").then((m) => ({ default: m.DevtoolView })),
);

function RecordingQueueStatus() {
  const { state, queueDepth, currentJobSessionId, diagnostics } = useListener(
    (store) => ({
      state: store.live.recording.state,
      queueDepth: store.live.recording.queueDepth,
      currentJobSessionId: store.live.recording.currentJobSessionId,
      diagnostics: store.live.recording.diagnostics,
    }),
  );

  const show =
    state === "queuedForStt" ||
    state === "transcribing" ||
    state === "queuedForLlm" ||
    state === "summarizing";

  if (!show) {
    return null;
  }

  const stageText =
    state === "queuedForStt"
      ? "Queued for transcription"
      : state === "transcribing"
        ? "Transcribing"
        : state === "queuedForLlm"
          ? "Queued for summary"
          : "Summarizing";

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      <div className="font-medium">Recording pipeline</div>
      <div className="mt-1">Stage: {stageText}</div>
      <div>Queue depth: {queueDepth}</div>
      <div>Current job: {currentJobSessionId ?? "none"}</div>
      {diagnostics?.message && <div className="mt-1">{diagnostics.message}</div>}
    </div>
  );
}

export function LeftSidebar() {
  const { leftsidebar } = useShell();
  const { query } = useSearch();
  const [isProfileExpanded, setIsProfileExpanded] = useState(false);
  const isLinux = platform() === "linux";

  const { data: showDevtoolButton = false } = useQuery({
    queryKey: ["show_devtool"],
    queryFn: () => commands.showDevtool(),
  });

  const showSearchResults = query.trim() !== "";

  return (
    <div className="flex h-full w-70 shrink-0 flex-col gap-1 overflow-hidden">
      <header
        data-tauri-drag-region
        className={cn([
          "flex flex-row items-center",
          "h-9 w-full py-1",
          isLinux ? "justify-between pl-3" : "justify-end pl-20",
          "shrink-0",
          "rounded-xl bg-neutral-50",
        ])}
      >
        {isLinux && <TrafficLights />}
        <div className="flex items-center">
          {showDevtoolButton && (
            <Button
              size="icon"
              variant="ghost"
              onClick={leftsidebar.toggleDevtool}
            >
              <AxeIcon size={16} />
            </Button>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                onClick={leftsidebar.toggleExpanded}
              >
                <PanelLeftCloseIcon size={16} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="flex items-center gap-2">
              <span>Toggle sidebar</span>
              <Kbd className="animate-kbd-press">⌘ \</Kbd>
            </TooltipContent>
          </Tooltip>
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-1 overflow-hidden">
        <RecordingQueueStatus />
        <div className="relative min-h-0 flex-1 overflow-hidden">
          {leftsidebar.showDevtool ? (
            <Suspense fallback={null}>
              <DevtoolView />
            </Suspense>
          ) : showSearchResults ? (
            <SearchResults />
          ) : (
            <div className="flex h-full flex-col overflow-hidden rounded-xl bg-neutral-50">
              <WorkspaceTree />
            </div>
          )}
          {!leftsidebar.showDevtool && (
            <ToastArea isProfileExpanded={isProfileExpanded} />
          )}
        </div>
        <div className="relative z-30">
          <ProfileSection onExpandChange={setIsProfileExpanded} />
        </div>
      </div>
    </div>
  );
}
