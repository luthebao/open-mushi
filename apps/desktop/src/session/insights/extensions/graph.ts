import { createGraphOpenTarget, type GraphRunResult } from "~/graph/useGraphData";

import {
  runExtensionWithArtifactPersistence,
  type PersistedExtensionArtifactRow,
} from "../state";
import type {
  ExtensionContext,
  ExtensionRunResult,
  SessionExtensionDefinition,
} from "../types";

type GraphExtensionRunResult = ExtensionRunResult & {
  artifactRef: string;
  result: GraphRunResult;
};

function resolveSessionId(ctx: ExtensionContext): string {
  if (!ctx.sessionId) {
    throw new Error("Graph extension requires transcript session id");
  }

  return ctx.sessionId;
}

async function runGraphExtension(
  ctx: ExtensionContext,
): Promise<GraphExtensionRunResult> {
  const sessionId = resolveSessionId(ctx);

  return {
    status: "succeeded",
    extensionId: "graph",
    artifactRef: `graph:${sessionId}`,
    result: createGraphOpenTarget(sessionId),
  };
}

const graphExtensionDefinition: SessionExtensionDefinition = {
  id: "graph",
  title: "Knowledge Graph",
  description: "Generate and open a graph view from transcript context.",
  icon: "network",
  capabilities: ["graph"],
  inputRequirements: ["transcript"],
  canRun: (ctx) => Boolean(ctx.sessionId),
  run: runGraphExtension,
  openResult: () => {},
};

export const graphExtension: SessionExtensionDefinition = {
  ...graphExtensionDefinition,
  run: (context) => {
    if (!context.persistArtifactRow) {
      return runGraphExtension(context);
    }

    return runGraphExtensionWithArtifactPersistence({
      context,
      persistArtifactRow: context.persistArtifactRow,
    });
  },
};

type RunGraphExtensionWithPersistenceParams = {
  context: ExtensionContext;
  persistArtifactRow: (artifactId: string, row: PersistedExtensionArtifactRow) => void;
  now?: () => string;
  createArtifactId?: () => string;
};

export function runGraphExtensionWithArtifactPersistence(
  params: RunGraphExtensionWithPersistenceParams,
): Promise<ExtensionRunResult> {
  return runExtensionWithArtifactPersistence({
    extension: graphExtensionDefinition,
    context: params.context,
    persistArtifactRow: params.persistArtifactRow,
    now: params.now,
    createArtifactId: params.createArtifactId,
  });
}
