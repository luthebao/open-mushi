import { describe, expect, it } from "vitest";

import { graphExtension } from "./extensions/graph";
import {
  createTinyBaseArtifactRowPersister,
  reduceInsightState,
  runExtensionWithArtifactPersistence,
} from "./state";
import type { SessionExtensionDefinition } from "./types";
import { hasRequiredExtensionContractFields } from "./types";

describe("SessionExtensionDefinition contract", () => {
  const validDefinition = {
    id: "graph",
    title: "Knowledge Graph",
    description: "...",
    icon: "network",
    capabilities: ["graph"],
    inputRequirements: ["transcript"],
    canRun: () => true,
    run: async () => ({ status: "succeeded" as const, extensionId: "graph" }),
    openResult: () => {},
  };

  it("requires day-1 metadata and behaviors", () => {
    expect(hasRequiredExtensionContractFields(validDefinition)).toBe(true);
  });

  it("rejects missing required fields", () => {
    const { id: _id, ...missingId } = validDefinition;
    expect(hasRequiredExtensionContractFields(missingId)).toBe(false);
  });

  it("rejects wrong field types", () => {
    expect(
      hasRequiredExtensionContractFields({
        ...validDefinition,
        capabilities: "graph",
      }),
    ).toBe(false);
  });

  it("rejects invalid inputRequirements values", () => {
    expect(
      hasRequiredExtensionContractFields({
        ...validDefinition,
        inputRequirements: ["transcript", "invalid"],
      }),
    ).toBe(false);
  });

  it("rejects non-function handlers", () => {
    expect(
      hasRequiredExtensionContractFields({
        ...validDefinition,
        run: "not-a-function",
      }),
    ).toBe(false);
  });
});

describe("reduceInsightState", () => {
  it("eligible -> generating_graph -> graph_ready -> extensions_suggested", () => {
    const eligible = reduceInsightState(
      { phase: "idle" },
      { type: "INSIGHTS_ELIGIBLE" },
    );
    expect(eligible.phase).toBe("eligible");

    const generating = reduceInsightState(eligible, { type: "GRAPH_GENERATION_STARTED" });
    expect(generating.phase).toBe("generating_graph");

    const graphReady = reduceInsightState(generating, { type: "GRAPH_GENERATION_SUCCEEDED" });
    expect(graphReady.phase).toBe("graph_ready");

    const suggested = reduceInsightState(graphReady, {
      type: "EXTENSIONS_SUGGESTED",
    });
    expect(suggested.phase).toBe("extensions_suggested");
  });

  it("generation_failed returns to eligible with error envelope", () => {
    const generating = reduceInsightState(
      { phase: "eligible" },
      { type: "GRAPH_GENERATION_STARTED" },
    );

    const next = reduceInsightState(generating, {
      type: "GRAPH_GENERATION_FAILED",
      error: {
        code: "timeout",
        userMessage: "Graph generation timed out.",
        retryable: true,
      },
    });

    expect(next.phase).toBe("eligible");
    expect(next.error).toEqual({
      code: "timeout",
      userMessage: "Graph generation timed out.",
      retryable: true,
    });
  });
});

describe("createTinyBaseArtifactRowPersister", () => {
  it("writes rows into extension_artifacts table", () => {
    const setRow = (tableId: string, rowId: string, row: Record<string, string>) => {
      writes.push({ tableId, rowId, row });
      return undefined;
    };
    const writes: Array<{
      tableId: string;
      rowId: string;
      row: Record<string, string>;
    }> = [];

    const persist = createTinyBaseArtifactRowPersister({ setRow });
    persist("artifact-123", {
      user_id: "",
      session_id: "session-1",
      extension_id: "graph",
      status: "started",
      created_at: "2026-03-13T10:00:00.000Z",
      updated_at: "2026-03-13T10:00:00.000Z",
      artifact_json: "",
      error_code: "",
    });

    expect(writes).toEqual([
      {
        tableId: "extension_artifacts",
        rowId: "artifact-123",
        row: {
          user_id: "",
          session_id: "session-1",
          extension_id: "graph",
          status: "started",
          created_at: "2026-03-13T10:00:00.000Z",
          updated_at: "2026-03-13T10:00:00.000Z",
          artifact_json: "",
          error_code: "",
        },
      },
    ]);
  });
});

describe("runExtensionWithArtifactPersistence", () => {
  it("writes started then succeeded artifacts for graph", async () => {
    const writes: Array<{ id: string; row: Record<string, string> }> = [];

    const result = await runExtensionWithArtifactPersistence({
      extension: graphExtension,
      context: { sessionId: "session-1" },
      persistArtifactRow: (id, row) => {
        writes.push({ id, row });
      },
      now: () => "2026-03-13T10:00:00.000Z",
      createArtifactId: () => "artifact-1",
    });

    expect(result.status).toBe("succeeded");
    expect(writes).toEqual([
      {
        id: "artifact-1",
        row: {
          user_id: "",
          session_id: "session-1",
          extension_id: "graph",
          status: "started",
          created_at: "2026-03-13T10:00:00.000Z",
          updated_at: "2026-03-13T10:00:00.000Z",
          artifact_json: "",
          error_code: "",
        },
      },
      {
        id: "artifact-1",
        row: {
          user_id: "",
          session_id: "session-1",
          extension_id: "graph",
          status: "succeeded",
          created_at: "2026-03-13T10:00:00.000Z",
          updated_at: "2026-03-13T10:00:00.000Z",
          artifact_json: JSON.stringify({
            artifactRef: "graph:session-1",
            status: "succeeded",
            extensionId: "graph",
            result: {
              action: "open_graph",
              sessionId: "session-1",
            },
          }),
          error_code: "",
        },
      },
    ]);
  });

  it("writes failed artifact when extension returns failed status", async () => {
    const writes: Array<{ id: string; row: Record<string, string> }> = [];
    const failedResultExtension: SessionExtensionDefinition = {
      ...graphExtension,
      run: async () => ({
        status: "failed",
        extensionId: "graph",
      }),
    };

    const result = await runExtensionWithArtifactPersistence({
      extension: failedResultExtension,
      context: { sessionId: "session-1" },
      persistArtifactRow: (id, row) => {
        writes.push({ id, row });
      },
      now: () => "2026-03-13T10:00:00.000Z",
      createArtifactId: () => "artifact-failed-result",
    });

    expect(result).toEqual({
      status: "failed",
      extensionId: "graph",
    });
    expect(writes).toEqual([
      {
        id: "artifact-failed-result",
        row: {
          user_id: "",
          session_id: "session-1",
          extension_id: "graph",
          status: "started",
          created_at: "2026-03-13T10:00:00.000Z",
          updated_at: "2026-03-13T10:00:00.000Z",
          artifact_json: "",
          error_code: "",
        },
      },
      {
        id: "artifact-failed-result",
        row: {
          user_id: "",
          session_id: "session-1",
          extension_id: "graph",
          status: "failed",
          created_at: "2026-03-13T10:00:00.000Z",
          updated_at: "2026-03-13T10:00:00.000Z",
          artifact_json: JSON.stringify({
            status: "failed",
            extensionId: "graph",
          }),
          error_code: "extension_failed",
        },
      },
    ]);
  });

  it("writes failed artifact with error code", async () => {
    const writes: Array<{ id: string; row: Record<string, string> }> = [];
    const failingExtension: SessionExtensionDefinition = {
      ...graphExtension,
      run: async () => {
        throw new Error("missing_model");
      },
    };

    await expect(
      runExtensionWithArtifactPersistence({
        extension: failingExtension,
        context: { sessionId: "session-1" },
        persistArtifactRow: (id, row) => {
          writes.push({ id, row });
        },
        now: () => "2026-03-13T10:00:00.000Z",
        createArtifactId: () => "artifact-2",
      }),
    ).rejects.toMatchObject({
      code: "missing_model",
    });

    expect(writes).toEqual([
      {
        id: "artifact-2",
        row: {
          user_id: "",
          session_id: "session-1",
          extension_id: "graph",
          status: "started",
          created_at: "2026-03-13T10:00:00.000Z",
          updated_at: "2026-03-13T10:00:00.000Z",
          artifact_json: "",
          error_code: "",
        },
      },
      {
        id: "artifact-2",
        row: {
          user_id: "",
          session_id: "session-1",
          extension_id: "graph",
          status: "failed",
          created_at: "2026-03-13T10:00:00.000Z",
          updated_at: "2026-03-13T10:00:00.000Z",
          artifact_json: "",
          error_code: "missing_model",
        },
      },
    ]);
  });
});
