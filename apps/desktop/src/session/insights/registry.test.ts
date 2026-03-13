import { describe, expect, it, vi } from "vitest";
import type { SessionExtensionDefinition } from "./types";

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

const makeDefinition = (
  id: string,
  overrides: Partial<SessionExtensionDefinition> = {},
): SessionExtensionDefinition => ({
  id,
  source: { kind: "built_in" },
  title: id,
  description: `${id} description`,
  icon: `${id}-icon`,
  capabilities: [id],
  inputRequirements: ["transcript"],
  canRun: () => true,
  run: async () => ({ status: "succeeded", extensionId: id }),
  openResult: () => {},
  ...overrides,
});

describe("session insights registry", () => {
  it("prefers built-in over discovered duplicates", async () => {
    vi.resetModules();
    const { registerSessionExtension, listSessionExtensions } = await import("./registry");

    registerSessionExtension(
      makeDefinition("report", {
        source: {
          kind: "skill",
          skillPath: "/tmp/skills/report/SKILL.md",
        },
        title: "Report from Skill",
      }),
    );

    const report = listSessionExtensions().find((extension) => extension.id === "report");

    expect(report?.source.kind).toBe("built_in");
    expect(report?.title).toBe("Report");
  });

  it("registers built-ins and keeps graph metadata complete", async () => {
    vi.resetModules();
    const { listSessionExtensions, registerSessionExtension } = await import("./registry");

    const graph = makeDefinition("graph", {
      title: "Knowledge Graph",
      capabilities: ["graph"],
      inputRequirements: ["transcript"],
    });

    const flashcards = makeDefinition("flashcards", {
      title: "Flashcards",
      inputRequirements: ["transcript", "graph"],
    });

    registerSessionExtension(graph);
    registerSessionExtension(flashcards);

    expect(listSessionExtensions().map((extension) => extension.id)).toEqual([
      "graph",
      "flashcards",
      "homework",
      "report",
    ]);

    expect(() =>
      registerSessionExtension({
        ...graph,
        icon: "",
      }),
    ).toThrow(/required contract fields/i);

    expect(() =>
      registerSessionExtension({
        ...graph,
        capabilities: [],
      }),
    ).toThrow(/graph metadata is incomplete/i);
  });

  it("ranks runnable extensions above blocked", async () => {
    vi.resetModules();
    const {
      listSessionExtensions,
      rankExtensions,
      registerSessionExtension,
    } = await import("./registry");

    registerSessionExtension(makeDefinition("blocked-a", { canRun: () => false }));
    registerSessionExtension(makeDefinition("runnable", { canRun: () => true }));
    registerSessionExtension(makeDefinition("blocked-b", { canRun: () => false }));

    const ranked = rankExtensions(listSessionExtensions(), { sessionId: "session-1" });

    expect(ranked.map((extension) => extension.id)).toEqual([
      "graph",
      "runnable",
      "blocked-a",
      "blocked-b",
      "flashcards",
      "homework",
      "report",
    ]);
  });
});
