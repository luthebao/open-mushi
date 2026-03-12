import { beforeEach, describe, expect, it } from "vitest";

import { useChatContext } from "./chat-context";

describe("chat-context store", () => {
  beforeEach(() => {
    useChatContext.setState({ groupId: undefined, contexts: {} });
  });

  it("replaces prior manual scope when adding a new manual scope", () => {
    const groupId = "g1";

    useChatContext.getState().addRef(groupId, {
      kind: "session",
      key: "session:manual:s1",
      source: "manual",
      sessionId: "s1",
    });

    useChatContext.getState().addRef(groupId, {
      kind: "workspace",
      key: "workspace:manual:ws/a",
      source: "manual",
      workspaceId: "ws/a",
      workspaceName: "a",
    });

    const refs = useChatContext.getState().contexts[groupId]?.contextRefs ?? [];
    expect(refs).toEqual([
      {
        kind: "workspace",
        key: "workspace:manual:ws/a",
        source: "manual",
        workspaceId: "ws/a",
        workspaceName: "a",
      },
    ]);
  });

  it("keeps tool and auto-current refs when replacing manual scope", () => {
    const groupId = "g1";

    useChatContext.getState().persistContext(groupId, [
      {
        kind: "session",
        key: "session:current",
        source: "auto-current",
        sessionId: "current",
      },
      {
        kind: "session",
        key: "session:search:42",
        source: "tool",
        sessionId: "42",
      },
      {
        kind: "session",
        key: "session:manual:s1",
        source: "manual",
        sessionId: "s1",
      },
    ]);

    useChatContext.getState().addRef(groupId, {
      kind: "all",
      key: "all:manual",
      source: "manual",
    });

    const refs = useChatContext.getState().contexts[groupId]?.contextRefs ?? [];
    expect(refs).toEqual([
      {
        kind: "session",
        key: "session:current",
        source: "auto-current",
        sessionId: "current",
      },
      {
        kind: "session",
        key: "session:search:42",
        source: "tool",
        sessionId: "42",
      },
      {
        kind: "all",
        key: "all:manual",
        source: "manual",
      },
    ]);
  });
});
