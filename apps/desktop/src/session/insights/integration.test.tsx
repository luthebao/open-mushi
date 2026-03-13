import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async () => [
    {
      id: "skill.summary",
      title: "Session Summary",
      description: "Summarize transcript",
      icon: "file-text",
      capabilities: ["summary"],
      inputRequirements: ["transcript"],
      template: "Summary for {{session.id}}",
      skillPath: "/tmp/skills/skill.summary/SKILL.md",
    },
  ]),
}));

vi.mock("@openmushi/plugin-template", () => ({
  commands: {
    renderCustom: vi.fn(async () => ({ status: "ok", data: "Rendered output" })),
  },
}));

vi.mock("./extensions/graph", () => ({
  graphExtension: {
    id: "graph",
    source: { kind: "built_in" },
    title: "Knowledge Graph",
    description: "Generate and open a graph view from transcript context.",
    icon: "network",
    capabilities: ["graph"],
    inputRequirements: ["transcript"],
    canRun: () => true,
    run: async () => ({ status: "succeeded", extensionId: "graph" }),
    openResult: () => {},
  },
}));

import { listDiscoveredSkillManifests } from "./loader";
import { createSkillSessionExtension } from "./extensions/skill";
import { listSessionExtensions, registerSessionExtension } from "./registry";

describe("insights integration", () => {
  it("discovers skill manifests and surfaces runnable extension", async () => {
    vi.resetModules();

    const manifests = await listDiscoveredSkillManifests();
    manifests.forEach((manifest) => {
      registerSessionExtension(createSkillSessionExtension(manifest));
    });

    const extension = listSessionExtensions().find((item) => item.id === "skill.summary");

    expect(extension).toBeDefined();
    expect(extension?.source.kind).toBe("skill");
    expect(
      extension?.canRun({
        sessionId: "session-1",
        transcriptWordCount: 12,
      }),
    ).toBe(true);
  });
});
