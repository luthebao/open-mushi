import { describe, expect, it, vi } from "vitest";

vi.mock("@openmushi/plugin-template", () => ({
  commands: {
    renderCustom: vi.fn(async () => ({
      status: "ok",
      data: "Rendered output",
    })),
  },
}));

import { commands as templateCommands } from "@openmushi/plugin-template";

import { createSkillSessionExtension } from "./skill";
import type { DiscoveredSkillManifest } from "../types";

const makeManifest = (
  overrides: Partial<DiscoveredSkillManifest> = {},
): DiscoveredSkillManifest => ({
  id: "skill.summary",
  title: "Session Summary",
  description: "Summarize the transcript",
  icon: "file-text",
  capabilities: ["summary"],
  inputRequirements: ["transcript"],
  template: null,
  templateContent: "Summary for {{session.id}}",
  skillPath: "/tmp/skills/skill.summary/SKILL.md",
  ...overrides,
});

describe("skill session extension adapter", () => {
  it("enforces input requirement gating in canRun", () => {
    const extension = createSkillSessionExtension(makeManifest());

    expect(
      extension.canRun({
        sessionId: "session-1",
        transcriptWordCount: 0,
      }),
    ).toBe(false);

    expect(
      extension.canRun({
        sessionId: "session-1",
        transcriptWordCount: 10,
      }),
    ).toBe(true);
  });

  it("renders template and persists lifecycle rows on success", async () => {
    const writes: Array<{ id: string; row: Record<string, string> }> = [];
    const extension = createSkillSessionExtension(
      makeManifest({ inputRequirements: ["transcript", "graph"] }),
    );

    const result = await extension.run({
      sessionId: "session-1",
      transcriptWordCount: 42,
      graphArtifactCount: 1,
      persistArtifactRow: (id, row) => {
        writes.push({ id, row });
      },
    });

    expect(result.status).toBe("succeeded");
    expect(templateCommands.renderCustom).toHaveBeenCalledTimes(1);
    expect(writes).toHaveLength(2);
    expect(writes[0]?.row.status).toBe("started");
    expect(writes[1]?.row.status).toBe("succeeded");
  });

  it("returns failed when renderer fails", async () => {
    vi.mocked(templateCommands.renderCustom).mockResolvedValueOnce({
      status: "error",
      error: "render_failed",
    } as never);

    const extension = createSkillSessionExtension(makeManifest());
    const result = await extension.run({
      sessionId: "session-1",
      transcriptWordCount: 42,
    });

    expect(result.status).toBe("failed");
  });
});
