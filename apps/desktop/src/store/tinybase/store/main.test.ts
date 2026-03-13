import { createMergeableStore } from "tinybase/with-schemas";
import { describe, expect, it } from "vitest";

import { SCHEMA } from "@openmushi/store";

import { createMainIndexes, INDEXES, type Store } from "./main";

describe("main tinybase store wiring", () => {
  it("defines extension_artifacts table", () => {
    expect(SCHEMA.table).toHaveProperty("extension_artifacts");
    expect(SCHEMA.table.extension_artifacts).toMatchObject({
      user_id: { type: "string" },
      session_id: { type: "string" },
      extension_id: { type: "string" },
      status: { type: "string" },
      created_at: { type: "string" },
      updated_at: { type: "string" },
      artifact_json: { type: "string" },
      error_code: { type: "string" },
    });
  });

  it("defines indexes extensionArtifactsBySession and extensionArtifactsByExtension", () => {
    const store = createMergeableStore()
      .setTablesSchema(SCHEMA.table)
      .setValuesSchema(SCHEMA.value) as Store;
    const indexes = createMainIndexes(store);

    store.setRow("extension_artifacts", "artifact-1", {
      user_id: "user-1",
      session_id: "session-1",
      extension_id: "graph",
      status: "succeeded",
      created_at: "2026-03-13T10:00:00.000Z",
      updated_at: "2026-03-13T10:00:01.000Z",
      artifact_json: "{}",
      error_code: "",
    });

    expect(indexes.getSliceRowIds(INDEXES.extensionArtifactsBySession, "session-1")).toContain("artifact-1");
    expect(indexes.getSliceRowIds(INDEXES.extensionArtifactsByExtension, "graph")).toContain("artifact-1");
  });
});
