import { describe, expect, it, vi } from "vitest";

import { ensureGroupIdForAction } from "./use-chat-actions";

describe("ensureGroupIdForAction", () => {
  it("returns existing group id without creating a new group", () => {
    const createGroup = vi.fn();
    const onGroupCreated = vi.fn();

    const id = ensureGroupIdForAction({
      groupId: "group-1",
      createGroup,
      onGroupCreated,
      generateId: () => "new-group",
      title: "Context",
    });

    expect(id).toBe("group-1");
    expect(createGroup).not.toHaveBeenCalled();
    expect(onGroupCreated).not.toHaveBeenCalled();
  });

  it("creates a new group and returns id when group id is missing", () => {
    const createGroup = vi.fn();
    const onGroupCreated = vi.fn();

    const id = ensureGroupIdForAction({
      groupId: undefined,
      createGroup,
      onGroupCreated,
      generateId: () => "new-group",
      title: "Context",
    });

    expect(id).toBe("new-group");
    expect(createGroup).toHaveBeenCalledWith({
      groupId: "new-group",
      title: "Context",
    });
    expect(onGroupCreated).toHaveBeenCalledWith("new-group");
  });
});
