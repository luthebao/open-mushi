import { useQuery } from "@tanstack/react-query";
import { convertFileSrc } from "@tauri-apps/api/core";
import { StickyNoteIcon } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { commands as fsSyncCommands } from "@openmushi/plugin-fs-sync";
import { cn } from "@openmushi/utils";

import { CaretPositionProvider } from "./components/caret-position-context";
import { FloatingActionButton } from "./components/floating";
import { NoteInput } from "./components/note-input";
import { SearchProvider } from "./components/note-input/transcript/search-context";
import { OuterHeader } from "./components/outer-header";
import { SessionPreviewCard } from "./components/session-preview-card";
import { useCurrentNoteTab, useHasTranscript } from "./components/shared";
import { TitleInput } from "./components/title-input";
import { ExtensionRail } from "./insights/components/ExtensionRail";
import { GenerateInsightsCta } from "./insights/components/GenerateInsightsCta";
import { graphExtension } from "./insights/extensions/graph";
import { deriveInsightEligibility } from "./insights/eligibility";
import { createSkillSessionExtension } from "./insights/extensions/skill";
import { listDiscoveredSkillManifests } from "./insights/loader";
import { listSessionExtensions, registerSessionExtension } from "./insights/registry";
import { createTinyBaseArtifactRowPersister, reduceInsightState } from "./insights/state";
import type { ExtensionRunResult } from "./insights/types";
import { useAutoEnhance } from "./hooks/useAutoEnhance";
import { useIsSessionEnhancing } from "./hooks/useEnhancedNotes";

import { useTitleGeneration } from "~/ai/hooks";
import * as AudioPlayer from "~/audio-player";
import { useShell } from "~/contexts/shell";
import { StandardTabWrapper } from "~/shared/main";
import { type TabItem, TabItemBase } from "~/shared/tabs";
import * as main from "~/store/tinybase/store/main";
import { useSessionTitle } from "~/store/zustand/live-title";
import { type Tab, useTabs } from "~/store/zustand/tabs";
import { useListener } from "~/stt/contexts";
import { useStartListening } from "~/stt/useStartListening";
import { useSTTConnection } from "~/stt/useSTTConnection";

const SIDEBAR_WIDTH = 280;
const LAYOUT_PADDING = 4;

export const TabItemNote: TabItem<Extract<Tab, { type: "sessions" }>> = ({
  tab,
  tabIndex,
  handleCloseThis,
  handleSelectThis,
  handleCloseOthers,
  handleCloseAll,
  handlePinThis,
  handleUnpinThis,
  pendingCloseConfirmationTab,
  setPendingCloseConfirmationTab,
}) => {
  const storeTitle = main.UI.useCell(
    "sessions",
    tab.id,
    "title",
    main.STORE_ID,
  );
  const title = useSessionTitle(tab.id, storeTitle as string | undefined);
  const sessionMode = useListener((state) => state.getSessionMode(tab.id));
  const stop = useListener((state) => state.stop);
  const isEnhancing = useIsSessionEnhancing(tab.id);
  const isActive = sessionMode === "active" || sessionMode === "finalizing";
  const isFinalizing = sessionMode === "finalizing";
  const isBatching = sessionMode === "running_batch";
  const showSpinner =
    !tab.active && (isFinalizing || isEnhancing || isBatching);

  const showCloseConfirmation =
    pendingCloseConfirmationTab?.type === "sessions" &&
    pendingCloseConfirmationTab?.id === tab.id;

  const handleCloseConfirmationChange = (show: boolean) => {
    if (!show) {
      setPendingCloseConfirmationTab?.(null);
    }
  };

  const handleCloseWithStop = useCallback(() => {
    if (isActive) {
      stop();
    }
    handleCloseThis(tab);
  }, [isActive, stop, tab, handleCloseThis]);

  return (
    <SessionPreviewCard sessionId={tab.id} side="bottom" enabled={!tab.active}>
      <TabItemBase
        icon={<StickyNoteIcon className="h-4 w-4" />}
        title={title || "Untitled"}
        selected={tab.active}
        active={isActive}
        accent={isActive ? "red" : "neutral"}
        finalizing={showSpinner}
        pinned={tab.pinned}
        tabIndex={tabIndex}
        showCloseConfirmation={showCloseConfirmation}
        onCloseConfirmationChange={handleCloseConfirmationChange}
        handleCloseThis={handleCloseWithStop}
        handleSelectThis={() => handleSelectThis(tab)}
        handleCloseOthers={handleCloseOthers}
        handleCloseAll={handleCloseAll}
        handlePinThis={() => handlePinThis(tab)}
        handleUnpinThis={() => handleUnpinThis(tab)}
      />
    </SessionPreviewCard>
  );
};

export function TabContentNote({
  tab,
}: {
  tab: Extract<Tab, { type: "sessions" }>;
}) {
  const listenerStatus = useListener((state) => state.live.status);
  const sessionMode = useListener((state) => state.getSessionMode(tab.id));
  const updateSessionTabState = useTabs((state) => state.updateSessionTabState);
  const { conn } = useSTTConnection();
  const startListening = useStartListening(tab.id);
  const hasAttemptedAutoStart = useRef(false);

  useEffect(() => {
    if (
      sessionMode === "running_batch" &&
      tab.state.view?.type !== "transcript"
    ) {
      updateSessionTabState(tab, {
        ...tab.state,
        view: { type: "transcript" },
      });
    }
  }, [sessionMode, tab, updateSessionTabState]);

  useEffect(() => {
    if (!tab.state.autoStart) {
      hasAttemptedAutoStart.current = false;
      return;
    }

    if (hasAttemptedAutoStart.current) {
      return;
    }

    if (listenerStatus !== "inactive") {
      return;
    }

    if (!conn) {
      return;
    }

    hasAttemptedAutoStart.current = true;
    startListening();
    updateSessionTabState(tab, { ...tab.state, autoStart: null });
  }, [
    tab.id,
    tab.state,
    tab.state.autoStart,
    listenerStatus,
    conn,
    startListening,
    updateSessionTabState,
  ]);

  const { data: audioUrl } = useQuery({
    enabled: listenerStatus === "inactive",
    queryKey: ["audio", tab.id, "url"],
    queryFn: () => fsSyncCommands.audioPath(tab.id),
    select: (result) => {
      if (result.status === "error") {
        return null;
      }
      return convertFileSrc(result.data);
    },
  });

  const showTimeline =
    tab.state.view?.type === "transcript" &&
    Boolean(audioUrl) &&
    listenerStatus === "inactive";

  return (
    <CaretPositionProvider>
      <SearchProvider>
        <AudioPlayer.Provider sessionId={tab.id} url={audioUrl ?? ""}>
          <TabContentNoteInner tab={tab} showTimeline={showTimeline} />
        </AudioPlayer.Provider>
      </SearchProvider>
    </CaretPositionProvider>
  );
}

function TabContentNoteInner({
  tab,
  showTimeline,
}: {
  tab: Extract<Tab, { type: "sessions" }>;
  showTimeline: boolean;
}) {
  const titleInputRef = React.useRef<HTMLInputElement>(null);
  const noteInputRef = React.useRef<{
    editor: import("@openmushi/tiptap/editor").TiptapEditor | null;
  }>(null);

  const currentView = useCurrentNoteTab(tab);
  const { generateTitle } = useTitleGeneration(tab);
  const hasTranscript = useHasTranscript(tab.id);
  const openNew = useTabs((state) => state.openNew);

  const sessionId = tab.id;
  const rawMd = main.UI.useCell("sessions", sessionId, "raw_md", main.STORE_ID) as
    | string
    | undefined;
  const transcriptIds = main.UI.useSliceRowIds(
    main.INDEXES.transcriptBySession,
    sessionId,
    main.STORE_ID,
  );
  const transcriptWordCount = (transcriptIds ?? []).length;
  const { skipReason } = useAutoEnhance(tab);
  const [showConsentBanner, setShowConsentBanner] = useState(false);
  const [extensionsVersion, setExtensionsVersion] = useState(0);

  const sessionMode = useListener((state) => state.getSessionMode(sessionId));
  const normalizedSessionMode = sessionMode === "inactive" ? "inactive" : "active";
  const eligibility = useMemo(
    () =>
      deriveInsightEligibility({
        hasTranscript,
        transcriptWordCount,
        sessionMode: normalizedSessionMode,
      }),
    [hasTranscript, transcriptWordCount, normalizedSessionMode],
  );
  const [insightState, dispatchInsight] = useReducer(reduceInsightState, {
    phase: "idle",
  });
  const store = main.UI.useStore(main.STORE_ID);
  const graphReady = useIsGraphReady(sessionId);
  const graphArtifactCount = useGraphArtifactCount(sessionId);
  const notesWordCount = useMemo(() => {
    if (!rawMd) {
      return 0;
    }

    const trimmed = rawMd.trim();
    if (!trimmed) {
      return 0;
    }

    return trimmed.split(/\s+/).length;
  }, [rawMd]);
  const prevSessionMode = useRef<string | null>(sessionMode);

  useAutoFocusTitle({ sessionId, titleInputRef });

  useEffect(() => {
    const justStartedListening =
      prevSessionMode.current !== "active" && sessionMode === "active";
    const justStoppedListening =
      prevSessionMode.current === "active" && sessionMode !== "active";

    prevSessionMode.current = sessionMode;

    if (justStartedListening) {
      setShowConsentBanner(true);
    } else if (justStoppedListening) {
      setShowConsentBanner(false);
    }
  }, [sessionMode]);

  useEffect(() => {
    if (!showConsentBanner) {
      return;
    }

    const timer = setTimeout(() => {
      setShowConsentBanner(false);
    }, 5000);

    return () => clearTimeout(timer);
  }, [showConsentBanner]);

  useEffect(() => {
    if (eligibility.eligible) {
      dispatchInsight({ type: "INSIGHTS_ELIGIBLE" });
    }
  }, [eligibility.eligible]);

  useEffect(() => {
    if (graphReady) {
      dispatchInsight({ type: "GRAPH_READY_HYDRATED" });
    }
  }, [graphReady]);

  const runGraphGeneration = React.useCallback(async () => {
    dispatchInsight({ type: "GRAPH_GENERATION_STARTED" });

    try {
      const result = await graphExtension.run({
        sessionId,
        persistArtifactRow: store
          ? createTinyBaseArtifactRowPersister(store)
          : undefined,
      });

      if (result.status !== "succeeded") {
        dispatchInsight({
          type: "GRAPH_GENERATION_FAILED",
          error: {
            code: "extension_failed",
            userMessage: "Graph generation failed. Try again.",
            retryable: true,
          },
        });
        return;
      }

      const graphResult = result as typeof result & {
        result?: { type?: "graph"; scope?: { scope: "note"; sessionId: string } };
      };

      if (graphResult.result?.type === "graph") {
        openNew({
          type: "graph",
          scope: graphResult.result.scope ?? { scope: "note", sessionId },
        });
      }

      dispatchInsight({ type: "GRAPH_GENERATION_SUCCEEDED" });
      dispatchInsight({ type: "EXTENSIONS_SUGGESTED" });
    } catch (error) {
      dispatchInsight({
        type: "GRAPH_GENERATION_FAILED",
        error: {
          code: error instanceof Error && error.message ? error.message : "unknown_error",
          userMessage: "Graph generation failed. Try again.",
          retryable: true,
          debugMeta: error instanceof Error ? { message: error.message } : undefined,
        },
      });
    }
  }, [openNew, sessionId, store]);

  const handleGenerateInsights = React.useCallback(() => {
    void runGraphGeneration();
  }, [runGraphGeneration]);

  const handleRetryInsights = React.useCallback(() => {
    void runGraphGeneration();
  }, [runGraphGeneration]);

  const extensionContext = useMemo(
    () => ({
      sessionId,
      transcriptWordCount,
      graphArtifactCount,
      notesWordCount,
      persistArtifactRow: store ? createTinyBaseArtifactRowPersister(store) : undefined,
    }),
    [sessionId, transcriptWordCount, graphArtifactCount, notesWordCount, store],
  );

  useEffect(() => {
    let cancelled = false;

    void listDiscoveredSkillManifests().then((manifests) => {
      if (cancelled) {
        return;
      }

      manifests.forEach((manifest) => {
        registerSessionExtension(createSkillSessionExtension(manifest));
      });

      setExtensionsVersion((value) => value + 1);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const extensionDefinitions = useMemo(
    () => listSessionExtensions(),
    [extensionsVersion],
  );

  const handleRunExtension = React.useCallback(
    async (extensionId: string) => {
      const extension = extensionDefinitions.find((item) => item.id === extensionId);
      if (!extension || !extension.canRun(extensionContext)) {
        return;
      }

      try {
        const result = await extension.run(extensionContext);
        extension.openResult(result);

        const openTarget = (result as ExtensionRunResult & {
          result?: { type?: "graph"; scope?: { scope: "note"; sessionId: string } };
        }).result;

        if (openTarget?.type === "graph" && openTarget.scope) {
          openNew(openTarget);
        }
      } catch (error) {
        console.warn("[Insights] Extension run failed", {
          extensionId,
          error,
        });
      }
    },
    [extensionContext, extensionDefinitions, openNew],
  );

  const focusTitle = React.useCallback(() => {
    titleInputRef.current?.focus();
  }, []);

  const focusEditor = React.useCallback(() => {
    noteInputRef.current?.editor?.commands.focus();
  }, []);

  return (
    <>
      <StandardTabWrapper
        afterBorder={showTimeline && <AudioPlayer.Timeline />}
        floatingButton={<FloatingActionButton tab={tab} />}
        showTimeline={showTimeline}
      >
        <div className="flex h-full flex-col">
          <div className="pr-1 pl-2">
            <OuterHeader sessionId={tab.id} currentView={currentView} />
          </div>
          <div className="mt-2 shrink-0 px-3">
            <GenerateInsightsCta
              eligible={eligibility.eligible}
              phase={insightState.phase}
              error={insightState.error}
              onGenerate={handleGenerateInsights}
              onRetry={handleRetryInsights}
            />
          </div>
          <div className="mt-2 shrink-0 px-3">
            <ExtensionRail
              phase={insightState.phase}
              extensions={extensionDefinitions}
              context={extensionContext}
              onRunExtension={(extensionId) => {
                void handleRunExtension(extensionId);
              }}
            />
          </div>
          <div className="mt-2 shrink-0 px-3">
            <TitleInput
              ref={titleInputRef}
              tab={tab}
              onNavigateToEditor={focusEditor}
              onGenerateTitle={hasTranscript ? generateTitle : undefined}
            />
          </div>
          <div className="mt-2 min-h-0 flex-1 px-2">
            <NoteInput
              ref={noteInputRef}
              tab={tab}
              onNavigateToTitle={focusTitle}
            />
          </div>
        </div>
      </StandardTabWrapper>
      <StatusBanner
        skipReason={skipReason}
        showConsentBanner={showConsentBanner}
        showTimeline={showTimeline}
      />
    </>
  );
}

function StatusBanner({
  skipReason,
  showConsentBanner,
  showTimeline,
}: {
  skipReason: string | null;
  showConsentBanner: boolean;
  showTimeline: boolean;
}) {
  const { leftsidebar, chat } = useShell();
  const [chatPanelWidth, setChatPanelWidth] = useState(0);

  const isChatPanelOpen = chat.mode === "RightPanelOpen";

  useEffect(() => {
    if (!isChatPanelOpen) {
      setChatPanelWidth(0);
      return;
    }

    const updateChatWidth = () => {
      const panels = document.querySelectorAll("[data-panel-id]");
      const lastPanel = panels[panels.length - 1];
      if (lastPanel) {
        setChatPanelWidth(lastPanel.getBoundingClientRect().width);
      }
    };

    updateChatWidth();
    window.addEventListener("resize", updateChatWidth);

    // Use ResizeObserver on the specific panel instead of MutationObserver on document.body
    // MutationObserver on document.body with subtree:true causes high CPU usage
    const resizeObserver = new ResizeObserver(updateChatWidth);
    const panels = document.querySelectorAll("[data-panel-id]");
    const lastPanel = panels[panels.length - 1];
    if (lastPanel) {
      resizeObserver.observe(lastPanel);
    }

    return () => {
      window.removeEventListener("resize", updateChatWidth);
      resizeObserver.disconnect();
    };
  }, [isChatPanelOpen]);

  const leftOffset = leftsidebar.expanded
    ? (SIDEBAR_WIDTH + LAYOUT_PADDING) / 2
    : 0;
  const rightOffset = chatPanelWidth / 2;
  const totalOffset = leftOffset - rightOffset;

  return createPortal(
    <AnimatePresence>
      {(skipReason || showConsentBanner) && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          style={{ left: `calc(50% + ${totalOffset}px)` }}
          className={cn([
            "fixed z-50 -translate-x-1/2",
            "text-center text-xs whitespace-nowrap",
            skipReason ? "text-red-400" : "text-stone-300",
            showTimeline ? "bottom-[76px]" : "bottom-6",
          ])}
        >
          {skipReason || "Ask for consent when using Open Mushi"}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function useIsGraphReady(sessionId: string): boolean {
  return useGraphArtifactCount(sessionId) > 0;
}

function useGraphArtifactCount(sessionId: string): number {
  const store = main.UI.useStore(main.STORE_ID);
  const artifactIds = main.UI.useSliceRowIds(
    main.INDEXES.extensionArtifactsBySession,
    sessionId,
    main.STORE_ID,
  );

  if (!store || !artifactIds || artifactIds.length === 0) {
    return 0;
  }

  return artifactIds.reduce((count, artifactId) => {
    const extensionId = store.getCell(
      "extension_artifacts",
      artifactId,
      "extension_id",
    );
    const status = store.getCell("extension_artifacts", artifactId, "status");

    if (extensionId === "graph" && status === "succeeded") {
      return count + 1;
    }

    return count;
  }, 0);
}

function useAutoFocusTitle({
  sessionId,
  titleInputRef,
}: {
  sessionId: string;
  titleInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  // Prevent re-focusing when the user intentionally leaves the title empty.
  const didAutoFocus = useRef(false);

  const title = main.UI.useCell("sessions", sessionId, "title", main.STORE_ID);

  useEffect(() => {
    if (didAutoFocus.current) return;

    if (!title) {
      titleInputRef.current?.focus();
      didAutoFocus.current = true;
    }
  }, [sessionId, title]);
}
