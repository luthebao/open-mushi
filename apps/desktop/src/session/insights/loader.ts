import { invoke } from "@tauri-apps/api/core";

import type {
  DiscoveredSkillManifest,
  DiscoveredSkillManifestEntry,
  ExtensionInputRequirement,
} from "./types";

function isInputRequirement(value: unknown): value is ExtensionInputRequirement {
  return value === "transcript" || value === "graph" || value === "notes";
}

function normalizeEntry(entry: unknown): DiscoveredSkillManifest | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const value = entry as DiscoveredSkillManifestEntry;

  if (
    typeof value.id !== "string" ||
    typeof value.title !== "string" ||
    typeof value.description !== "string" ||
    typeof value.skillPath !== "string" ||
    !Array.isArray(value.inputRequirements) ||
    !value.inputRequirements.every(isInputRequirement)
  ) {
    return null;
  }

  const icon = typeof value.icon === "string" && value.icon.length > 0 ? value.icon : null;
  const capabilities = Array.isArray(value.capabilities)
    ? value.capabilities.filter((item): item is string => typeof item === "string")
    : [];
  const template = typeof value.template === "string" && value.template.length > 0 ? value.template : null;

  return {
    id: value.id,
    title: value.title,
    description: value.description,
    icon,
    capabilities,
    inputRequirements: value.inputRequirements,
    template,
    templateContent: template,
    skillPath: value.skillPath,
  };
}

export async function listDiscoveredSkillManifests(): Promise<DiscoveredSkillManifest[]> {
  const entries = await invoke<unknown[]>("list_skills").catch(() => []);

  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => normalizeEntry(entry))
    .filter((entry): entry is DiscoveredSkillManifest => entry !== null);
}
