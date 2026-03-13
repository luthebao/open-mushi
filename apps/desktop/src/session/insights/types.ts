export type ExtensionInputRequirement = "transcript" | "graph" | "notes";

export type ExtensionContext = {
  sessionId?: string;
  persistArtifactRow?: (artifactId: string, row: Record<string, string>) => void;
};

export type ExtensionRunResult = {
  status: "succeeded" | "failed";
  extensionId: string;
};

export type SessionExtensionDefinition = {
  id: string;
  title: string;
  description: string;
  icon: string;
  capabilities: string[];
  inputRequirements: ExtensionInputRequirement[];
  canRun: (ctx: ExtensionContext) => boolean;
  run: (ctx: ExtensionContext) => Promise<ExtensionRunResult>;
  openResult: (result: ExtensionRunResult) => void;
};

export function hasCompleteGraphMetadata(
  definition: SessionExtensionDefinition,
): boolean {
  if (definition.id !== "graph") {
    return true;
  }

  return (
    definition.capabilities.includes("graph") &&
    definition.inputRequirements.includes("transcript")
  );
}

function isExtensionInputRequirement(
  value: unknown,
): value is ExtensionInputRequirement {
  return value === "transcript" || value === "graph" || value === "notes";
}

export function hasRequiredExtensionContractFields(
  definition: unknown,
): definition is SessionExtensionDefinition {
  if (!definition || typeof definition !== "object") {
    return false;
  }

  const candidate = definition as Record<string, unknown>;

  return Boolean(
    typeof candidate.id === "string" &&
      candidate.id.length > 0 &&
      typeof candidate.title === "string" &&
      candidate.title.length > 0 &&
      typeof candidate.description === "string" &&
      candidate.description.length > 0 &&
      typeof candidate.icon === "string" &&
      candidate.icon.length > 0 &&
      Array.isArray(candidate.capabilities) &&
      candidate.capabilities.every((capability) => typeof capability === "string") &&
      Array.isArray(candidate.inputRequirements) &&
      candidate.inputRequirements.every(isExtensionInputRequirement) &&
      typeof candidate.canRun === "function" &&
      typeof candidate.run === "function" &&
      typeof candidate.openResult === "function",
  );
}
