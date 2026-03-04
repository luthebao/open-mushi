import { useEffect } from "react";

import { commands as fsSyncCommands } from "@openmushi/plugin-fs-sync";

import type { Store } from "./main";

import { DEFAULT_USER_ID } from "~/shared/utils";

export function useInitializeStore(
  store: Store,
  persisters: { session: unknown; human: unknown; values: unknown },
): void {
  const { session, human, values } = persisters;

  useEffect(() => {
    if (!store || !session || !human || !values) {
      return;
    }

    initializeStore(store);
    populateWorkspacesFromFolders(store).then(() => {
      ensureDefaultWorkspace(store);
    });
  }, [store, session, human, values]);
}
function initializeStore(store: Store): void {
  store.transaction(() => {
    if (!store.hasValue("user_id")) {
      store.setValue("user_id", DEFAULT_USER_ID);
    }

    const userId = store.getValue("user_id") as string;
    if (!store.hasRow("humans", userId)) {
      store.setRow("humans", userId, {
        user_id: userId,
        name: "",
        email: "",
        org_id: "",
      });
    }

    if (
      !store.getTableIds().includes("sessions") ||
      store.getRowIds("sessions").length === 0
    ) {
      const sessionId = crypto.randomUUID();
      const now = new Date().toISOString();

      store.setRow("sessions", sessionId, {
        user_id: DEFAULT_USER_ID,
        created_at: now,
        title: "Welcome to Open Mushi",
        raw_md: "",
      });
    }
  });
}

async function populateWorkspacesFromFolders(store: Store): Promise<void> {
  const result = await fsSyncCommands.listFolders();
  if (result.status === "error") {
    return;
  }

  const { folders } = result.data;
  if (!folders) return;

  const existingNames = new Set<string>();
  for (const rowId of store.getRowIds("workspaces")) {
    const name = store.getCell("workspaces", rowId, "name") as string;
    if (name) existingNames.add(name);
  }

  const userId = (store.getValue("user_id") as string) ?? "";

  store.transaction(() => {
    for (const folderPath of Object.keys(folders)) {
      if (!existingNames.has(folderPath)) {
        const id = crypto.randomUUID();
        store.setRow("workspaces", id, {
          user_id: userId,
          created_at: new Date().toISOString(),
          name: folderPath,
        });
      }
    }
  });
}

export const DEFAULT_WORKSPACE_NAME = "default";

async function ensureDefaultWorkspace(store: Store): Promise<void> {
  const existingNames = new Set<string>();
  for (const rowId of store.getRowIds("workspaces")) {
    const name = store.getCell("workspaces", rowId, "name") as string;
    if (name) existingNames.add(name);
  }

  if (existingNames.size > 0) {
    return;
  }

  // Create the "default" folder on disk
  await fsSyncCommands.createFolder(DEFAULT_WORKSPACE_NAME);

  const userId = (store.getValue("user_id") as string) ?? "";
  const workspaceId = crypto.randomUUID();

  store.setRow("workspaces", workspaceId, {
    user_id: userId,
    created_at: new Date().toISOString(),
    name: DEFAULT_WORKSPACE_NAME,
  });

  // Move any inbox sessions into the default workspace
  for (const sessionId of store.getRowIds("sessions")) {
    const wsId = store.getCell("sessions", sessionId, "workspace_id") as string;
    if (!wsId) {
      store.setCell("sessions", sessionId, "workspace_id", DEFAULT_WORKSPACE_NAME);
    }
  }
}
