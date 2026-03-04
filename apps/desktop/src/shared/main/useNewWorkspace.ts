import { useCallback } from "react";

import { sessionOps } from "~/store/tinybase/persister/session/ops";
import { useTabs } from "~/store/zustand/tabs";

export function useNewWorkspace() {
  const openNew = useTabs((state) => state.openNew);

  return useCallback(async () => {
    const name = prompt("Workspace name:");
    if (name?.trim()) {
      await sessionOps.createWorkspace(name.trim());
      openNew({ type: "workspaces", id: null });
    }
  }, [openNew]);
}
