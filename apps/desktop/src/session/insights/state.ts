import type {
  ExtensionContext,
  ExtensionRunResult,
  SessionExtensionDefinition,
} from "./types";

export type InsightPhase =
  | "idle"
  | "eligible"
  | "generating_graph"
  | "graph_ready"
  | "extensions_suggested";

export type InsightErrorEnvelope = {
  code: string;
  userMessage: string;
  retryable: boolean;
  debugMeta?: Record<string, unknown>;
};

export type InsightState = {
  phase: InsightPhase;
  error?: InsightErrorEnvelope;
};

export type InsightEvent =
  | { type: "INSIGHTS_ELIGIBLE" }
  | { type: "GRAPH_GENERATION_STARTED" }
  | { type: "GRAPH_GENERATION_SUCCEEDED" }
  | { type: "GRAPH_READY_HYDRATED" }
  | { type: "EXTENSIONS_SUGGESTED" }
  | { type: "GRAPH_GENERATION_FAILED"; error: InsightErrorEnvelope };

export function reduceInsightState(
  state: InsightState,
  event: InsightEvent,
): InsightState {
  switch (event.type) {
    case "INSIGHTS_ELIGIBLE":
      return {
        phase: "eligible",
      };

    case "GRAPH_GENERATION_STARTED":
      if (state.phase !== "eligible") {
        return state;
      }

      return {
        phase: "generating_graph",
      };

    case "GRAPH_GENERATION_SUCCEEDED":
      if (state.phase !== "generating_graph") {
        return state;
      }

      return {
        phase: "graph_ready",
      };

    case "GRAPH_READY_HYDRATED":
      if (state.phase === "graph_ready" || state.phase === "extensions_suggested") {
        return state;
      }

      return {
        phase: "graph_ready",
      };

    case "EXTENSIONS_SUGGESTED":
      if (state.phase !== "graph_ready") {
        return state;
      }

      return {
        phase: "extensions_suggested",
      };

    case "GRAPH_GENERATION_FAILED":
      if (state.phase !== "generating_graph") {
        return state;
      }

      return {
        phase: "eligible",
        error: event.error,
      };

    default:
      return state;
  }
}

export type PersistedExtensionArtifactRow = {
  user_id: string;
  session_id: string;
  extension_id: string;
  status: "started" | "succeeded" | "failed";
  created_at: string;
  updated_at: string;
  artifact_json: string;
  error_code: string;
};

type RunExtensionWithArtifactPersistenceParams = {
  extension: SessionExtensionDefinition;
  context: ExtensionContext;
  persistArtifactRow: (artifactId: string, row: PersistedExtensionArtifactRow) => void;
  now?: () => string;
  createArtifactId?: () => string;
};

export function createTinyBaseArtifactRowPersister(store: {
  setRow: (
    tableId: string,
    rowId: string,
    row: PersistedExtensionArtifactRow,
  ) => unknown;
}): (artifactId: string, row: PersistedExtensionArtifactRow) => void {
  return (artifactId, row) => {
    store.setRow("extension_artifacts", artifactId, row);
  };
}

function normalizeErrorCode(error: unknown): string {
  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return "unknown_error";
}

export async function runExtensionWithArtifactPersistence({
  extension,
  context,
  persistArtifactRow,
  now = () => new Date().toISOString(),
  createArtifactId = () => `${extension.id}-${Date.now()}`,
}: RunExtensionWithArtifactPersistenceParams): Promise<ExtensionRunResult> {
  const timestamp = now();
  const artifactId = createArtifactId();
  const sessionId = context.sessionId ?? "";

  persistArtifactRow(artifactId, {
    user_id: "",
    session_id: sessionId,
    extension_id: extension.id,
    status: "started",
    created_at: timestamp,
    updated_at: timestamp,
    artifact_json: "",
    error_code: "",
  });

  try {
    const result = await extension.run(context);

    persistArtifactRow(artifactId, {
      user_id: "",
      session_id: sessionId,
      extension_id: extension.id,
      status: result.status,
      created_at: timestamp,
      updated_at: now(),
      artifact_json: JSON.stringify(result),
      error_code: result.status === "failed" ? "extension_failed" : "",
    });

    return result;
  } catch (error) {
    const code = normalizeErrorCode(error);

    persistArtifactRow(artifactId, {
      user_id: "",
      session_id: sessionId,
      extension_id: extension.id,
      status: "failed",
      created_at: timestamp,
      updated_at: now(),
      artifact_json: "",
      error_code: code,
    });

    const persistedError = new Error(code) as Error & { code: string };
    persistedError.code = code;
    throw persistedError;
  }
}
