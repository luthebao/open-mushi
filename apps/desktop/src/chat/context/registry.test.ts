import { describe, expect, it } from "vitest";

import { renderChip } from "./registry";

describe("renderChip", () => {
  it("keeps manual attached session visible even with empty session context", () => {
    const chip = renderChip({
      kind: "session",
      key: "session:manual:123",
      source: "manual",
      sessionId: "123",
      removable: true,
      sessionContext: {
        title: null,
        date: null,
        rawContent: null,
        enhancedContent: null,
        transcript: null,
        participants: [],
        event: null,
      },
    });

    expect(chip).not.toBeNull();
    expect(chip?.label).toBe("Session");
  });

  it("renders workspace chip using workspace name", () => {
    const chip = renderChip({
      kind: "workspace",
      key: "workspace:manual:eng/core",
      workspaceId: "eng/core",
      workspaceName: "core",
      source: "manual",
      removable: true,
    });

    expect(chip).not.toBeNull();
    expect(chip?.label).toBe("core");
    expect(chip?.removable).toBe(true);
  });

  it("renders all-scope chip", () => {
    const chip = renderChip({
      kind: "all",
      key: "all:manual",
      source: "manual",
      removable: true,
    });

    expect(chip).not.toBeNull();
    expect(chip?.label).toBe("All notes");
  });
});
