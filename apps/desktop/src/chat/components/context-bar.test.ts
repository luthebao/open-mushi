import { describe, expect, it } from "vitest";

import {
  mapTimelineSessionsForPicker,
  mapTimelineWorkspacesForPicker,
  resolveSessionPickerResults,
  resolveWorkspacePickerResults,
} from "./context-bar";

describe("resolveSessionPickerResults", () => {
  it("handles missing timeline data without crashing", () => {
    expect(() => mapTimelineSessionsForPicker(undefined as never)).not.toThrow();
    expect(mapTimelineSessionsForPicker(undefined as never)).toEqual([]);
  });

  it("returns timeline sessions when query is empty", () => {
    const timeline = mapTimelineSessionsForPicker({
      s2: {
        title: "Sprint Retro",
        created_at: "2026-03-10T08:00:00.000Z",
        workspace_id: "Eng",
      },
      s1: {
        title: "Roadmap",
        created_at: "2026-03-12T08:00:00.000Z",
        workspace_id: "Product",
      },
    });

    const results = resolveSessionPickerResults({
      query: "",
      searchResults: [],
      timelineResults: timeline,
    });

    expect(results.map((r) => r.id)).toEqual(["s1", "s2"]);
  });

  it("falls back to timeline sessions when search returns no hits", () => {
    const timeline = mapTimelineSessionsForPicker({
      s1: {
        title: "Customer call",
        created_at: "2026-03-12T08:00:00.000Z",
        workspace_id: "Sales",
      },
    });

    const results = resolveSessionPickerResults({
      query: "customer",
      searchResults: [],
      timelineResults: timeline,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("s1");
    expect(results[0]?.workspace).toBe("Sales");
  });

  it("filters timeline fallback by workspace name when searching", () => {
    const timeline = mapTimelineSessionsForPicker({
      s1: {
        title: "Roadmap",
        created_at: "2026-03-12T08:00:00.000Z",
        workspace_id: "Product",
      },
      s2: {
        title: "Customer call",
        created_at: "2026-03-11T08:00:00.000Z",
        workspace_id: "Sales",
      },
    });

    const results = resolveSessionPickerResults({
      query: "sales",
      searchResults: [],
      timelineResults: timeline,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("s2");
    expect(results[0]?.workspace).toBe("Sales");
  });
});

describe("resolveWorkspacePickerResults", () => {
  it("maps unique workspaces from timeline sessions", () => {
    const workspaces = mapTimelineWorkspacesForPicker({
      s1: {
        title: "A",
        created_at: "2026-03-12T08:00:00.000Z",
        workspace_id: "eng/core",
      },
      s2: {
        title: "B",
        created_at: "2026-03-11T08:00:00.000Z",
        workspace_id: "eng/core",
      },
      s3: {
        title: "C",
        created_at: "2026-03-10T08:00:00.000Z",
        workspace_id: "sales/field",
      },
    });

    expect(workspaces.map((w) => w.id)).toEqual(["eng/core", "sales/field"]);
    expect(workspaces.map((w) => w.name)).toEqual(["core", "field"]);
  });

  it("returns all workspaces when query is empty", () => {
    const workspaces = [
      { id: "eng/core", name: "core" },
      { id: "sales/field", name: "field" },
    ];

    const results = resolveWorkspacePickerResults({
      query: "",
      workspaceResults: workspaces,
    });

    expect(results).toEqual(workspaces);
  });

  it("filters workspace results by id and name", () => {
    const workspaces = [
      { id: "eng/core", name: "core" },
      { id: "sales/field", name: "field" },
    ];

    expect(
      resolveWorkspacePickerResults({ query: "core", workspaceResults: workspaces }),
    ).toEqual([{ id: "eng/core", name: "core" }]);

    expect(
      resolveWorkspacePickerResults({ query: "sales", workspaceResults: workspaces }),
    ).toEqual([{ id: "sales/field", name: "field" }]);
  });
});
