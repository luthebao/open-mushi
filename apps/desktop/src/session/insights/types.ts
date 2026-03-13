export type ExtensionInputRequirement = "transcript" | "graph" | "notes";

export type SessionExtensionSource =
  | {
      kind: "built_in";
    }
  | {
      kind: "skill";
      skillPath: string;
    };

export type ExtensionContext = {
  sessionId?: string;
  transcriptWordCount?: number;
  graphArtifactCount?: number;
  notesWordCount?: number;
  persistArtifactRow?: (artifactId: string, row: Record<string, string>) => void;
};

export type ExtensionRunResult = {
  status: "succeeded" | "failed";
  extensionId: string;
};

export type SessionExtensionDefinition = {
  id: string;
  source: SessionExtensionSource;
  title: string;
  description: string;
  icon: string;
  capabilities: string[];
  inputRequirements: ExtensionInputRequirement[];
  canRun: (ctx: ExtensionContext) => boolean;
  run: (ctx: ExtensionContext) => Promise<ExtensionRunResult>;
  openResult: (result: ExtensionRunResult) => void;
};

export type DiscoveredSkillManifestEntry = {
  id: string;
  title: string;
  description: string;
  icon?: string | null;
  capabilities?: string[];
  inputRequirements: ExtensionInputRequirement[];
  template?: string | null;
  skillPath: string;
};

export type DiscoveredSkillManifest = {
  id: string;
  title: string;
  description: string;
  icon: string | null;
  capabilities: string[];
  inputRequirements: ExtensionInputRequirement[];
  template: string | null;
  templateContent: string | null;
  skillPath: string;
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

function hasValidExtensionSource(source: unknown): source is SessionExtensionSource {
  if (!source || typeof source !== "object") {
    return false;
  }

  const candidate = source as Record<string, unknown>;

  if (candidate.kind === "built_in") {
    return true;
  }

  return candidate.kind === "skill" && typeof candidate.skillPath === "string";
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
      hasValidExtensionSource(candidate.source) &&
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
