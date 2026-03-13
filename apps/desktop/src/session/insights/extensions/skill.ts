import { commands as templateCommands } from "@openmushi/plugin-template";

import {
  runExtensionWithArtifactPersistence,
  type PersistedExtensionArtifactRow,
} from "../state";
import type {
  DiscoveredSkillManifest,
  ExtensionContext,
  ExtensionInputRequirement,
  ExtensionRunResult,
  SessionExtensionDefinition,
} from "../types";

type SkillExtensionRunResult = ExtensionRunResult & {
  artifactRef: string;
  rendered: string;
  source: {
    kind: "skill";
    skillPath: string;
  };
};

type SessionTemplateContext = {
  session: {
    id: string;
  };
  insights: {
    transcriptWordCount: number;
    graphArtifactCount: number;
    notesWordCount: number;
  };
};

function getRequirementValue(
  requirement: ExtensionInputRequirement,
  context: ExtensionContext,
): number {
  if (requirement === "transcript") {
    return context.transcriptWordCount ?? 0;
  }

  if (requirement === "graph") {
    return context.graphArtifactCount ?? 0;
  }

  return context.notesWordCount ?? 0;
}

function hasRequiredInputs(
  requirements: ExtensionInputRequirement[],
  context: ExtensionContext,
): boolean {
  if (!context.sessionId) {
    return false;
  }

  return requirements.every((requirement) => getRequirementValue(requirement, context) > 0);
}

function buildTemplateContext(context: ExtensionContext): SessionTemplateContext {
  if (!context.sessionId) {
    throw new Error("Skill extension requires session id");
  }

  return {
    session: {
      id: context.sessionId,
    },
    insights: {
      transcriptWordCount: context.transcriptWordCount ?? 0,
      graphArtifactCount: context.graphArtifactCount ?? 0,
      notesWordCount: context.notesWordCount ?? 0,
    },
  };
}

async function runSkillExtension(
  manifest: DiscoveredSkillManifest,
  context: ExtensionContext,
): Promise<SkillExtensionRunResult> {
  const templateContent = manifest.templateContent;

  if (!templateContent || templateContent.trim().length === 0) {
    return {
      status: "failed",
      extensionId: manifest.id,
      artifactRef: `skill:${manifest.id}`,
      rendered: "",
      source: {
        kind: "skill",
        skillPath: manifest.skillPath,
      },
    };
  }

  const rendered = await templateCommands.renderCustom(
    templateContent,
    buildTemplateContext(context) as never,
  );

  if (rendered.status === "error") {
    return {
      status: "failed",
      extensionId: manifest.id,
      artifactRef: `skill:${manifest.id}`,
      rendered: "",
      source: {
        kind: "skill",
        skillPath: manifest.skillPath,
      },
    };
  }

  return {
    status: "succeeded",
    extensionId: manifest.id,
    artifactRef: `skill:${manifest.id}`,
    rendered: rendered.data,
    source: {
      kind: "skill",
      skillPath: manifest.skillPath,
    },
  };
}

type RunSkillExtensionWithPersistenceParams = {
  extension: SessionExtensionDefinition;
  context: ExtensionContext;
  persistArtifactRow: (artifactId: string, row: PersistedExtensionArtifactRow) => void;
  now?: () => string;
  createArtifactId?: () => string;
};

function runSkillExtensionWithArtifactPersistence({
  extension,
  context,
  persistArtifactRow,
  now,
  createArtifactId,
}: RunSkillExtensionWithPersistenceParams): Promise<ExtensionRunResult> {
  return runExtensionWithArtifactPersistence({
    extension,
    context,
    persistArtifactRow,
    now,
    createArtifactId,
  });
}

export function createSkillSessionExtension(
  manifest: DiscoveredSkillManifest,
): SessionExtensionDefinition {
  const definition: SessionExtensionDefinition = {
    id: manifest.id,
    source: {
      kind: "skill",
      skillPath: manifest.skillPath,
    },
    title: manifest.title,
    description: manifest.description,
    icon: manifest.icon ?? "sparkles",
    capabilities: manifest.capabilities,
    inputRequirements: manifest.inputRequirements,
    canRun: (context) => hasRequiredInputs(manifest.inputRequirements, context),
    run: (context) => runSkillExtension(manifest, context),
    openResult: () => {},
  };

  return {
    ...definition,
    run: (context) => {
      if (!context.persistArtifactRow) {
        return runSkillExtension(manifest, context);
      }

      return runSkillExtensionWithArtifactPersistence({
        extension: definition,
        context,
        persistArtifactRow: context.persistArtifactRow,
      });
    },
  };
}
