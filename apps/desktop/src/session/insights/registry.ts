import { graphExtension } from "./extensions/graph";
import {
  hasCompleteGraphMetadata,
  hasRequiredExtensionContractFields,
  type ExtensionContext,
  type ExtensionRunResult,
  type SessionExtensionDefinition,
} from "./types";

const registry: SessionExtensionDefinition[] = [];

const stubRun = async (extensionId: string): Promise<ExtensionRunResult> => ({
  status: "failed",
  extensionId,
});

const builtInExtensions: SessionExtensionDefinition[] = [
  graphExtension,
  {
    id: "flashcards",
    title: "Flashcards",
    description: "Create study cards from transcript highlights.",
    icon: "cards",
    capabilities: ["study"],
    inputRequirements: ["transcript", "graph"],
    canRun: () => false,
    run: () => stubRun("flashcards"),
    openResult: () => {},
  },
  {
    id: "homework",
    title: "Homework",
    description: "Draft post-session tasks and practice work.",
    icon: "book-open",
    capabilities: ["action-items"],
    inputRequirements: ["transcript", "graph"],
    canRun: () => false,
    run: () => stubRun("homework"),
    openResult: () => {},
  },
  {
    id: "report",
    title: "Report",
    description: "Generate a compact session report.",
    icon: "file-text",
    capabilities: ["summary"],
    inputRequirements: ["transcript", "graph"],
    canRun: () => false,
    run: () => stubRun("report"),
    openResult: () => {},
  },
];

export function registerSessionExtension(definition: unknown): void {
  if (!hasRequiredExtensionContractFields(definition)) {
    throw new Error("Session extension is missing required contract fields");
  }

  if (!hasCompleteGraphMetadata(definition)) {
    throw new Error("Session extension graph metadata is incomplete");
  }

  if (registry.some((existing) => existing.id === definition.id)) {
    return;
  }

  registry.push(definition);
}

export function ensureBuiltInSessionExtensions(): void {
  builtInExtensions.forEach((extension) => {
    registerSessionExtension(extension);
  });
}

export function listSessionExtensions(): SessionExtensionDefinition[] {
  ensureBuiltInSessionExtensions();
  return [...registry];
}

export function rankExtensions(
  extensions: SessionExtensionDefinition[],
  ctx: ExtensionContext,
): SessionExtensionDefinition[] {
  return [...extensions].sort((a, b) => {
    const aRunnable = a.canRun(ctx);
    const bRunnable = b.canRun(ctx);

    if (aRunnable !== bRunnable) {
      return aRunnable ? -1 : 1;
    }

    return a.title.localeCompare(b.title);
  });
}
