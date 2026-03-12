import { create } from "zustand";

import type { ContextRef } from "~/chat/context-item";

type PerGroupContext = {
  contextRefs: ContextRef[];
};

interface ChatContextState {
  groupId: string | undefined;
  contexts: Record<string, PerGroupContext>;
}

interface ChatContextActions {
  setGroupId: (groupId: string | undefined) => void;
  persistContext: (groupId: string, refs: ContextRef[]) => void;
  addRef: (groupId: string, ref: ContextRef) => void;
}

export const useChatContext = create<ChatContextState & ChatContextActions>(
  (set, get) => ({
    groupId: undefined,
    contexts: {},
    setGroupId: (groupId) => set({ groupId }),
    persistContext: (groupId, refs) => {
      set({
        contexts: {
          ...get().contexts,
          [groupId]: { contextRefs: refs },
        },
      });
    },
    addRef: (groupId, ref) => {
      const current = get().contexts[groupId]?.contextRefs ?? [];

      const isManualScopeRef =
        ref.source === "manual" &&
        (ref.kind === "session" || ref.kind === "workspace" || ref.kind === "all");

      const base = isManualScopeRef
        ? current.filter(
            (item) =>
              !(
                item.source === "manual" &&
                (item.kind === "session" ||
                  item.kind === "workspace" ||
                  item.kind === "all")
              ),
          )
        : current;

      if (base.some((v) => v.key === ref.key)) {
        return;
      }

      set({
        contexts: {
          ...get().contexts,
          [groupId]: { contextRefs: [...base, ref] },
        },
      });
    },
  }),
);
