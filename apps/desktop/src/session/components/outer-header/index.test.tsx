import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { reduceInsightState } from "~/session/insights/state";

import { Header } from "../note-input/header";
import { GenerateInsightsCta } from "~/session/insights/components/GenerateInsightsCta";

import { OuterHeader } from "./index";

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: [],
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("@openmushi/plugin-analytics", () => ({
  commands: {
    event: vi.fn(),
  },
}));

vi.mock("@openmushi/plugin-fs-sync", () => ({
  commands: {
    audioPath: vi.fn(async () => ({ status: "ok", data: "" })),
    attachmentList: vi.fn(async () => ({ status: "ok", data: [] })),
  },
}));

vi.mock("@openmushi/ui/components/ui/note-tab", () => ({
  NoteTab: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
    <button type="button" onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock("@openmushi/ui/components/ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@openmushi/ui/components/ui/scroll-fade", () => ({
  ScrollFadeOverlay: () => null,
  useScrollFade: () => ({ atStart: true, atEnd: true }),
}));

vi.mock("@openmushi/ui/components/ui/spinner", () => ({
  Spinner: () => <span data-testid="spinner" />,
}));

vi.mock("~/ai/hooks", () => ({
  useAITaskTask: () => ({
    isGenerating: false,
    isError: false,
    isIdle: true,
    error: null,
    start: vi.fn(),
    cancel: vi.fn(),
    currentStep: null,
  }),
  useLanguageModel: () => ({ provider: "mock" }),
  useLLMConnectionStatus: () => ({ status: "ready" }),
}));

vi.mock("~/audio-player", () => ({
  useAudioPlayer: () => ({ audioExists: false }),
}));

vi.mock("~/services/enhancer", () => ({
  getEnhancerService: () => null,
}));

vi.mock("~/session/components/shared", () => ({
  useHasTranscript: () => true,
}));

vi.mock("~/session/hooks/useEnhancedNotes", () => ({
  useEnsureDefaultSummary: () => undefined,
}));

const mockArtifacts: Record<string, { extension_id: string; status: string }> = {};

vi.mock("~/store/tinybase/store/main", () => ({
  STORE_ID: "main",
  INDEXES: {
    extensionArtifactsBySession: "extensionArtifactsBySession",
    enhancedNotesBySession: "enhancedNotesBySession",
  },
  QUERIES: {
    visibleTemplates: "visibleTemplates",
  },
  UI: {
    useResultTable: () => ({}),
    useSliceRowIds: (indexId: string) => {
      if (indexId === "extensionArtifactsBySession") {
        return Object.keys(mockArtifacts);
      }
      return [];
    },
    useCell: (
      tableId: string,
      rowId: string,
      cellId: string,
    ) => {
      if (tableId === "extension_artifacts") {
        const row = mockArtifacts[rowId];
        if (!row) return undefined;
        if (cellId === "extension_id") return row.extension_id;
        if (cellId === "status") return row.status;
      }
      return undefined;
    },
    useStore: () => ({
      getCell: (tableId: string, rowId: string, cellId: string) => {
        if (tableId !== "extension_artifacts") {
          return undefined;
        }
        const row = mockArtifacts[rowId];
        if (!row) {
          return undefined;
        }
        if (cellId === "extension_id") {
          return row.extension_id;
        }
        if (cellId === "status") {
          return row.status;
        }
        return undefined;
      },
    }),
  },
}));

vi.mock("~/store/zustand/ai-task/task-configs", () => ({
  createTaskId: () => "task-id",
}));

vi.mock("~/store/zustand/tabs", () => ({
  useTabs: () => ({
    openNew: vi.fn(),
  }),
}));

vi.mock("~/stt/contexts", () => ({
  useListener: (selector: (state: { getSessionMode: () => string }) => unknown) =>
    selector({ getSessionMode: () => "inactive" }),
}));

vi.mock("~/stt/useRunBatch", () => ({
  useRunBatch: () => vi.fn(async () => undefined),
}));

vi.mock("./listen", () => ({
  ListenButton: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="listen">listen-{sessionId}</div>
  ),
}));

vi.mock("./folder", () => ({
  FolderChain: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="folder">folder-{sessionId}</div>
  ),
}));

vi.mock("./metadata", () => ({
  MetadataButton: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="metadata">metadata-{sessionId}</div>
  ),
}));

vi.mock("./overflow", () => ({
  OverflowButton: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="overflow">overflow-{sessionId}</div>
  ),
}));

describe("OuterHeader", () => {
  it("prioritizes recording controls before workspace metadata", () => {
    const { getByTestId } = render(
      <OuterHeader sessionId="session-1" currentView={{ type: "raw" }} />,
    );

    const listen = getByTestId("listen");
    const folder = getByTestId("folder");

    expect(listen.compareDocumentPosition(folder)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});

describe("GenerateInsightsCta", () => {
  it("shows Generate insights when eligible", () => {
    render(
      <GenerateInsightsCta
        eligible
        phase="eligible"
        onGenerate={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Generate insights" }),
    ).toBeTruthy();
  });

  it("shows loading + retry states", () => {
    const { rerender } = render(
      <GenerateInsightsCta
        eligible
        phase="generating_graph"
        onGenerate={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Generating insights..." }),
    ).toBeTruthy();

    rerender(
      <GenerateInsightsCta
        eligible
        phase="eligible"
        error={{
          code: "timeout",
          userMessage: "Graph generation timed out.",
          retryable: true,
        }}
        onGenerate={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Retry generating insights" }),
    ).toBeTruthy();
  });

  it("allows hydrating graph_ready for existing artifacts", () => {
    const hydrated = reduceInsightState(
      { phase: "eligible" },
      { type: "GRAPH_READY_HYDRATED" },
    );

    expect(hydrated.phase).toBe("graph_ready");

    const preserved = reduceInsightState(
      { phase: "extensions_suggested" },
      { type: "GRAPH_READY_HYDRATED" },
    );

    expect(preserved.phase).toBe("extensions_suggested");
  });
});

describe("Header post-meeting action gating", () => {
  it("hides/de-emphasizes competing post-meeting actions before graph_ready", () => {
    Object.keys(mockArtifacts).forEach((key) => {
      delete mockArtifacts[key];
    });

    const { rerender } = render(
      <Header
        sessionId="session-1"
        editorTabs={[{ type: "raw" }, { type: "transcript" }]}
        currentTab={{ type: "raw" }}
        handleTabChange={vi.fn()}
        isEditing={false}
        setIsEditing={vi.fn()}
      />,
    );

    expect(screen.queryByText("Create other format")).toBeNull();

    mockArtifacts["artifact-1"] = {
      extension_id: "graph",
      status: "succeeded",
    };

    rerender(
      <Header
        sessionId="session-1"
        editorTabs={[{ type: "raw" }, { type: "transcript" }]}
        currentTab={{ type: "raw" }}
        handleTabChange={vi.fn()}
        isEditing={false}
        setIsEditing={vi.fn()}
      />,
    );

    expect(screen.getByText("Create other format")).toBeTruthy();
  });
});
