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

import { invoke } from "@tauri-apps/api/core";

import { listDiscoveredSkillManifests } from "./loader";

describe("insights skill loader", () => {
  it("loads and normalizes discovered skills", async () => {
    const manifests = await listDiscoveredSkillManifests();

    expect(invoke).toHaveBeenCalledWith("list_skills");
    expect(manifests).toEqual([
      {
        id: "skill.summary",
        title: "Session Summary",
        description: "Summarize transcript",
        icon: "file-text",
        capabilities: ["summary"],
        inputRequirements: ["transcript"],
        template: "Summary for {{session.id}}",
        templateContent: "Summary for {{session.id}}",
        skillPath: "/tmp/skills/skill.summary/SKILL.md",
      },
    ]);
  });
});
