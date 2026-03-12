import { describe, expect, it } from "vitest";

import { toPersistableContextRefs } from "./use-chat-context-pipeline";

describe("toPersistableContextRefs", () => {
  it("persists manual refs for session/workspace/all and excludes tool/auto-current", () => {
    const refs = toPersistableContextRefs([
      {
        kind: "session",
        key: "session:manual:1",
        source: "manual",
        sessionId: "1",
        removable: true,
      },
      {
        kind: "workspace",
        key: "workspace:manual:ws/a",
        source: "manual",
        workspaceId: "ws/a",
        workspaceName: "a",
        removable: true,
      },
      {
        kind: "all",
        key: "all:manual",
        source: "manual",
        removable: true,
      },
      {
        kind: "session",
        key: "session:search:2",
        source: "tool",
        sessionId: "2",
        removable: true,
      },
      {
        kind: "session",
        key: "session:current",
        source: "auto-current",
        sessionId: "3",
        removable: false,
      },
    ]);

    expect(refs).toEqual([
      {
        kind: "session",
        key: "session:manual:1",
        source: "manual",
        sessionId: "1",
      },
      {
        kind: "workspace",
        key: "workspace:manual:ws/a",
        source: "manual",
        workspaceId: "ws/a",
        workspaceName: "a",
      },
      {
        kind: "all",
        key: "all:manual",
        source: "manual",
      },
    ]);
  });
});
