import { describe, expect, it } from "vitest";

import {
  mapTimelineSessionsForPicker,
  resolveSessionPickerResults,
} from "./context-bar";

describe("resolveSessionPickerResults", () => {
  it("handles missing timeline data without crashing", () => {
    expect(() => mapTimelineSessionsForPicker(undefined as never)).not.toThrow();
    expect(mapTimelineSessionsForPicker(undefined as never)).toEqual([]);
  });

  it("returns timeline sessions when query is empty", () => {
    const timeline = mapTimelineSessionsForPicker({
      s2: { title: "Sprint Retro", created_at: "2026-03-10T08:00:00.000Z", workspace_id: "Eng" },
      s1: { title: "Roadmap", created_at: "2026-03-12T08:00:00.000Z", workspace_id: "Product" },
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
      s1: { title: "Customer call", created_at: "2026-03-12T08:00:00.000Z", workspace_id: "Sales" },
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
      s1: { title: "Roadmap", created_at: "2026-03-12T08:00:00.000Z", workspace_id: "Product" },
      s2: { title: "Customer call", created_at: "2026-03-11T08:00:00.000Z", workspace_id: "Sales" },
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
