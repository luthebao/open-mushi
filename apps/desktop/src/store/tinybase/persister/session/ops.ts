import { commands as fsSyncCommands } from "@openmushi/plugin-fs-sync";

import type { Store } from "~/store/tinybase/store/main";
import { DEFAULT_WORKSPACE_NAME } from "~/store/tinybase/store/initialize";

export interface SessionOpsConfig {
  store: Store;
  reloadSessions: () => Promise<void>;
}

let config: SessionOpsConfig | null = null;

export function initSessionOps(cfg: SessionOpsConfig) {
  config = cfg;
}

function getConfig(): SessionOpsConfig {
  if (!config) {
    throw new Error("[SessionOps] Not initialized. Call initSessionOps first.");
  }
  return config;
}

export async function moveNoteToWorkspace(
  sessionId: string,
  targetWorkspaceId: string,
): Promise<{ status: "ok" } | { status: "error"; error: string }> {
  const { store, reloadSessions } = getConfig();

  store.setCell("sessions", sessionId, "workspace_id", targetWorkspaceId);

  const result = await fsSyncCommands.moveSession(sessionId, targetWorkspaceId);

  if (result.status === "error") {
    console.error("[SessionOps] moveSession failed:", result.error);
    await reloadSessions();
    return { status: "error", error: result.error };
  }

  return { status: "ok" };
}

export async function renameWorkspace(
  oldPath: string,
  newPath: string,
): Promise<{ status: "ok" } | { status: "error"; error: string }> {
  const { store } = getConfig();

  const result = await fsSyncCommands.renameFolder(oldPath, newPath);

  if (result.status === "error") {
    console.error("[SessionOps] renameWorkspace failed:", result.error);
    return { status: "error", error: result.error };
  }

  store.transaction(() => {
    // Update session workspace_id values
    const sessionIds = store.getRowIds("sessions");
    for (const id of sessionIds) {
      const workspaceId = store.getCell("sessions", id, "workspace_id");
      if (workspaceId === oldPath) {
        store.setCell("sessions", id, "workspace_id", newPath);
      } else if (workspaceId?.startsWith(oldPath + "/")) {
        store.setCell(
          "sessions",
          id,
          "workspace_id",
          workspaceId.replace(oldPath, newPath),
        );
      }
    }

    // Update the workspace row's name to match
    const wsRowIds = store.getRowIds("workspaces");
    for (const rowId of wsRowIds) {
      const name = store.getCell("workspaces", rowId, "name") as string;
      if (name === oldPath) {
        store.setCell("workspaces", rowId, "name", newPath);
      } else if (name?.startsWith(oldPath + "/")) {
        store.setCell("workspaces", rowId, "name", name.replace(oldPath, newPath));
      }
    }
  });

  return { status: "ok" };
}

export async function createWorkspace(name: string): Promise<string> {
  const { store } = getConfig();
  const id = crypto.randomUUID();

  await fsSyncCommands.createFolder(name);

  store.setRow("workspaces", id, {
    user_id: store.getValue("user_id") ?? "",
    created_at: new Date().toISOString(),
    name,
  });
  return id;
}

export async function deleteWorkspace(
  workspaceId: string,
): Promise<{ status: "ok" } | { status: "error"; error: string }> {
  const { store } = getConfig();

  // Collect session IDs that need to be moved to the default workspace
  const sessionsToMove: string[] = [];
  const sessionIds = store.getRowIds("sessions");
  for (const id of sessionIds) {
    const wsId = store.getCell("sessions", id, "workspace_id") as string;
    if (wsId === workspaceId || wsId?.startsWith(workspaceId + "/")) {
      sessionsToMove.push(id);
    }
  }

  // Move each session to the default workspace on disk
  for (const sessionId of sessionsToMove) {
    const result = await fsSyncCommands.moveSession(sessionId, DEFAULT_WORKSPACE_NAME);
    if (result.status === "error") {
      console.error("[SessionOps] moveSession failed during deleteWorkspace:", result.error);
    }
  }

  // Delete the workspace folder on disk
  const folderResult = await fsSyncCommands.deleteFolder(workspaceId);
  if (folderResult.status === "error") {
    console.error("[SessionOps] deleteFolder failed:", folderResult.error);
  }

  // Update TinyBase
  store.transaction(() => {
    // Delete workspace rows by matching on name
    const wsRowIds = store.getRowIds("workspaces");
    for (const rowId of wsRowIds) {
      const name = store.getCell("workspaces", rowId, "name") as string;
      if (name === workspaceId || name?.startsWith(workspaceId + "/")) {
        store.delRow("workspaces", rowId);
      }
    }

    // Move all sessions in this workspace to the default workspace
    for (const id of sessionsToMove) {
      store.setCell("sessions", id, "workspace_id", DEFAULT_WORKSPACE_NAME);
    }
  });

  return { status: "ok" };
}

/**
 * Ensures a workspace has a row in the workspaces table.
 * Call this to prevent a workspace from disappearing when its last session is deleted.
 */
export function ensureWorkspaceEntry(workspaceId: string): void {
  if (!workspaceId) return;
  const { store } = getConfig();

  // Check if a workspaces table entry already exists for this name
  const wsRowIds = store.getRowIds("workspaces");
  for (const rowId of wsRowIds) {
    const name = store.getCell("workspaces", rowId, "name") as string;
    if (name === workspaceId) {
      return; // Already exists
    }
  }

  // Create one so the workspace persists even when empty
  const id = crypto.randomUUID();
  store.setRow("workspaces", id, {
    user_id: store.getValue("user_id") ?? "",
    created_at: new Date().toISOString(),
    name: workspaceId,
  });
}

export const sessionOps = {
  moveNoteToWorkspace,
  renameWorkspace,
  createWorkspace,
  deleteWorkspace,
  ensureWorkspaceEntry,
};
