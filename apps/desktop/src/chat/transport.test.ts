import { describe, expect, it } from "vitest";

import { expandContextRefsForPrompt, MAX_EXPANDED_CONTEXTS } from "./transport";

describe("expandContextRefsForPrompt", () => {
  const sessionRows = [
    { id: "s1", created_at: 100, workspace_id: "ws/a" },
    { id: "s2", created_at: 300, workspace_id: "ws/a" },
    { id: "s3", created_at: 200, workspace_id: "ws/b" },
    { id: "s4", created_at: 400, workspace_id: "ws/c" },
  ];

  it("expands workspace refs into newest-first sessions", () => {
    const expanded = expandContextRefsForPrompt({
      refs: [
        {
          kind: "workspace",
          key: "workspace:manual:ws/a",
          source: "manual",
          workspaceId: "ws/a",
          workspaceName: "a",
        },
      ],
      sessionRows,
    });

    expect(expanded.map((s) => s.sessionId)).toEqual(["s2", "s1"]);
  });

  it("expands all refs with deterministic newest-first ordering", () => {
    const expanded = expandContextRefsForPrompt({
      refs: [{ kind: "all", key: "all:manual", source: "manual" }],
      sessionRows,
    });

    expect(expanded.map((s) => s.sessionId)).toEqual(["s4", "s2", "s3", "s1"]);
  });

  it("dedupes overlapping refs and applies cap", () => {
    const manyRows = Array.from({ length: 20 }, (_, index) => ({
      id: `s${index + 1}`,
      created_at: index + 1,
      workspace_id: index % 2 === 0 ? "ws/a" : "ws/b",
    }));

    const expanded = expandContextRefsForPrompt({
      refs: [
        { kind: "all", key: "all:manual", source: "manual" },
        {
          kind: "workspace",
          key: "workspace:manual:ws/a",
          source: "manual",
          workspaceId: "ws/a",
          workspaceName: "a",
        },
      ],
      sessionRows: manyRows,
      cap: MAX_EXPANDED_CONTEXTS,
    });

    expect(expanded).toHaveLength(MAX_EXPANDED_CONTEXTS);
    expect(new Set(expanded.map((s) => s.sessionId)).size).toBe(
      MAX_EXPANDED_CONTEXTS,
    );
  });
});
