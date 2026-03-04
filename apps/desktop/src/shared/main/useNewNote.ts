import { useRouteContext } from "@tanstack/react-router";
import { useCallback } from "react";
import { useShallow } from "zustand/shallow";

import { commands as analyticsCommands } from "@openmushi/plugin-analytics";

import { id } from "~/shared/utils";
import { DEFAULT_WORKSPACE_NAME } from "~/store/tinybase/store/initialize";
import { useTabs } from "~/store/zustand/tabs";

export function useNewNote({
  behavior = "new",
  workspaceId,
}: {
  behavior?: "new" | "current";
  workspaceId?: string;
}) {
  const { persistedStore, internalStore } = useRouteContext({
    from: "__root__",
  });
  const { openNew, openCurrent } = useTabs(
    useShallow((state) => ({
      openNew: state.openNew,
      openCurrent: state.openCurrent,
    })),
  );

  const handler = useCallback(() => {
    const user_id = internalStore?.getValue("user_id");
    const sessionId = id();

    persistedStore?.setRow("sessions", sessionId, {
      user_id,
      created_at: new Date().toISOString(),
      title: "",
      workspace_id: workspaceId ?? DEFAULT_WORKSPACE_NAME,
    });

    void analyticsCommands.event({
      event: "note_created",
      has_event_id: false,
    });

    const ff = behavior === "new" ? openNew : openCurrent;
    ff({ type: "sessions", id: sessionId });
  }, [persistedStore, internalStore, openNew, openCurrent, behavior, workspaceId]);

  return handler;
}

export function useNewNoteAndListen() {
  const { persistedStore, internalStore } = useRouteContext({
    from: "__root__",
  });
  const openNew = useTabs((state) => state.openNew);

  const handler = useCallback(() => {
    const user_id = internalStore?.getValue("user_id");
    const sessionId = id();

    persistedStore?.setRow("sessions", sessionId, {
      user_id,
      created_at: new Date().toISOString(),
      title: "",
      workspace_id: DEFAULT_WORKSPACE_NAME,
    });

    void analyticsCommands.event({
      event: "note_created",
      has_event_id: false,
    });

    openNew({
      type: "sessions",
      id: sessionId,
      state: { view: null, autoStart: true },
    });
  }, [persistedStore, internalStore, openNew]);

  return handler;
}
