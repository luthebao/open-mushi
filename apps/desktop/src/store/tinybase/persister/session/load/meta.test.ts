import { beforeEach, describe, expect, test, vi } from "vitest";

import { extractSessionIdAndWorkspace, processMetaFile } from "./meta";
import { createEmptyLoadedSessionData, type LoadedSessionData } from "./types";

describe("extractSessionIdAndWorkspace", () => {
  describe("standard paths", () => {
    test("extracts session id and empty folder from root session path", () => {
      const result = extractSessionIdAndWorkspace(
        "/data/openmushi/workspaces/session-123/_meta.json",
      );
      expect(result).toEqual({
        sessionId: "session-123",
        workspacePath: "/data/openmushi/workspaces",
      });
    });

    test("extracts session id and folder from nested path", () => {
      const result = extractSessionIdAndWorkspace(
        "/data/openmushi/workspaces/work/session-123/_meta.json",
      );
      expect(result).toEqual({
        sessionId: "session-123",
        workspacePath: "/data/openmushi/workspaces/work",
      });
    });

    test("extracts session id and folder from deeply nested path", () => {
      const result = extractSessionIdAndWorkspace(
        "/data/openmushi/workspaces/work/project-a/meetings/session-123/_meta.json",
      );
      expect(result).toEqual({
        sessionId: "session-123",
        workspacePath: "/data/openmushi/workspaces/work/project-a/meetings",
      });
    });
  });

  describe("uuid session ids", () => {
    test("extracts uuid session id", () => {
      const result = extractSessionIdAndWorkspace(
        "/data/workspaces/550e8400-e29b-41d4-a716-446655440000/_meta.json",
      );
      expect(result).toEqual({
        sessionId: "550e8400-e29b-41d4-a716-446655440000",
        workspacePath: "/data/workspaces",
      });
    });
  });

  describe("different file types", () => {
    test("works with transcript.json files", () => {
      const result = extractSessionIdAndWorkspace(
        "/data/workspaces/session-123/transcript.json",
      );
      expect(result).toEqual({
        sessionId: "session-123",
        workspacePath: "/data/workspaces",
      });
    });

    test("works with markdown files", () => {
      const result = extractSessionIdAndWorkspace(
        "/data/workspaces/session-123/_summary.md",
      );
      expect(result).toEqual({
        sessionId: "session-123",
        workspacePath: "/data/workspaces",
      });
    });
  });

  describe("edge cases", () => {
    test("returns empty session id for root path", () => {
      const result = extractSessionIdAndWorkspace("/_meta.json");
      expect(result.sessionId).toBe("");
    });

    test("handles path with single segment", () => {
      const result = extractSessionIdAndWorkspace("_meta.json");
      expect(result.sessionId).toBe("");
      expect(result.workspacePath).toBe("");
    });

    test("handles empty path", () => {
      const result = extractSessionIdAndWorkspace("");
      expect(result.sessionId).toBe("");
      expect(result.workspacePath).toBe("");
    });

    test("handles path with only directory", () => {
      const result = extractSessionIdAndWorkspace("/data/workspaces/session-123/");
      expect(result.sessionId).toBe("session-123");
      expect(result.workspacePath).toBe("/data/workspaces");
    });

    test("handles relative path from base (root session)", () => {
      const result = extractSessionIdAndWorkspace(
        "workspaces/session-123/_meta.json",
      );
      expect(result.sessionId).toBe("session-123");
      expect(result.workspacePath).toBe("");
    });

    test("handles relative path from base (nested folder)", () => {
      const result = extractSessionIdAndWorkspace(
        "workspaces/work/session-123/_meta.json",
      );
      expect(result.sessionId).toBe("session-123");
      expect(result.workspacePath).toBe("work");
    });

    test("handles relative path from base (deeply nested folder)", () => {
      const result = extractSessionIdAndWorkspace(
        "workspaces/work/project-a/session-123/_meta.json",
      );
      expect(result.sessionId).toBe("session-123");
      expect(result.workspacePath).toBe("work/project-a");
    });
  });
});

describe("processMetaFile", () => {
  let result: LoadedSessionData;

  beforeEach(() => {
    result = createEmptyLoadedSessionData();
  });

  test("parses meta JSON and creates session entry", () => {
    const eventObj = { tracking_id: "event-1", title: "Test" };
    const content = JSON.stringify({
      id: "session-1",
      user_id: "user-1",
      created_at: "2024-01-01T00:00:00Z",
      title: "Test Session",
      event: eventObj,
      participants: [],
    });

    processMetaFile("/data/workspaces/session-1/_meta.json", content, result);

    expect(result.sessions["session-1"]).toEqual({
      user_id: "user-1",
      created_at: "2024-01-01T00:00:00Z",
      title: "Test Session",
      workspace_id: "/data/workspaces",
      event_json: JSON.stringify(eventObj),
      raw_md: "",
    });
  });

  test("creates mapping_session_participant entries", () => {
    const content = JSON.stringify({
      id: "session-1",
      user_id: "user-1",
      created_at: "2024-01-01T00:00:00Z",
      title: "Test Session",
      participants: [
        {
          id: "participant-1",
          user_id: "user-1",
          created_at: "2024-01-01T00:00:00Z",
          human_id: "human-1",
          source: "manual",
        },
      ],
    });

    processMetaFile("/data/workspaces/session-1/_meta.json", content, result);

    expect(result.mapping_session_participant["participant-1"]).toEqual({
      user_id: "user-1",
      session_id: "session-1",
      human_id: "human-1",
      source: "manual",
    });
  });

  test("creates tags and mapping_tag_session entries", () => {
    const content = JSON.stringify({
      id: "session-1",
      user_id: "user-1",
      created_at: "2024-01-01T00:00:00Z",
      title: "Test Session",
      participants: [],
      tags: ["work", "important"],
    });

    processMetaFile("/data/workspaces/session-1/_meta.json", content, result);

    expect(result.tags["work"]).toEqual({
      user_id: "user-1",
      name: "work",
    });
    expect(result.tags["important"]).toEqual({
      user_id: "user-1",
      name: "important",
    });
    expect(result.mapping_tag_session["session-1:work"]).toEqual({
      user_id: "user-1",
      tag_id: "work",
      session_id: "session-1",
    });
  });

  test("handles parse errors gracefully", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    processMetaFile(
      "/data/workspaces/session-1/_meta.json",
      "invalid json",
      result,
    );

    expect(Object.keys(result.sessions)).toHaveLength(0);
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
