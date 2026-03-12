import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  type ContextEntity,
  type ContextRef,
  CURRENT_SESSION_CONTEXT_KEY,
  dedupeByKey,
  extractToolContextEntities,
} from "~/chat/context-item";
import { hydrateSessionContextFromFs } from "~/chat/session-context-hydrator";
import type { AppUIMessage } from "~/chat/types";
import type * as main from "~/store/tinybase/store/main";

type UseChatContextPipelineParams = {
  sessionId: string;
  chatGroupId?: string;
  messages: AppUIMessage[];
  sessionEntity: Extract<ContextEntity, { kind: "session" }> | null;
  persistedRefs: ContextRef[];
  persistContext: (groupId: string, refs: ContextRef[]) => void;
  store: ReturnType<typeof main.UI.useStore>;
};

type WorkspaceEntity = Extract<ContextEntity, { kind: "workspace" }>;
type AllEntity = Extract<ContextEntity, { kind: "all" }>;


function mapWorkspaceEntity(ref: Extract<ContextRef, { kind: "workspace" }>): WorkspaceEntity {
  return {
    ...ref,
    removable: ref.source !== "auto-current",
  };
}

function mapAllEntity(ref: Extract<ContextRef, { kind: "all" }>): AllEntity {
  return {
    ...ref,
    removable: ref.source !== "auto-current",
  };
}

export function toPersistableContextRefs(
  contextEntities: ContextEntity[],
): ContextRef[] {
  return contextEntities
    .filter((e) => e.source !== "tool" && e.key !== CURRENT_SESSION_CONTEXT_KEY)
    .flatMap((e): ContextRef[] => {
      if (e.kind === "session") {
        return [
          {
            kind: "session",
            key: e.key,
            source: e.source,
            sessionId: e.sessionId,
          },
        ];
      }

      if (e.kind === "workspace") {
        return [
          {
            kind: "workspace",
            key: e.key,
            source: e.source,
            workspaceId: e.workspaceId,
            workspaceName: e.workspaceName,
          },
        ];
      }

      if (e.kind === "all") {
        return [
          {
            kind: "all",
            key: e.key,
            source: e.source,
          },
        ];
      }

      return [];
    });
}

export function useChatContextPipeline({
  sessionId,
  chatGroupId,
  messages,
  sessionEntity,
  persistedRefs,
  persistContext,
  store,
}: UseChatContextPipelineParams): {
  contextEntities: ContextEntity[];
  onRemoveContextEntity: (key: string) => void;
} {
  const toolEntities = useMemo(
    () => extractToolContextEntities(messages),
    [messages],
  );

  const [removedKeys, setRemovedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    setRemovedKeys(new Set());
  }, [sessionId, chatGroupId]);

  const onRemoveContextEntity = useCallback((key: string) => {
    setRemovedKeys((prev) => new Set(prev).add(key));
  }, []);

  // Hydrate persisted refs that aren't already provided by session/tool sources
  const liveKeys = useMemo(() => {
    const keys = new Set<string>();
    if (sessionEntity) keys.add(sessionEntity.key);
    for (const e of toolEntities) keys.add(e.key);
    return keys;
  }, [sessionEntity, toolEntities]);

  const [hydratedEntities, setHydratedEntities] = useState<
    Record<string, Extract<ContextEntity, { kind: "session" }>>
  >({});

  useEffect(() => {
    setHydratedEntities({});
  }, [sessionId, chatGroupId]);

  useEffect(() => {
    const toHydrate = persistedRefs.filter(
      (ref): ref is Extract<ContextRef, { kind: "session" }> =>
        ref.kind === "session" &&
        !liveKeys.has(ref.key) &&
        !hydratedEntities[ref.key],
    );
    if (!store || toHydrate.length === 0) return;

    let stale = false;
    (async () => {
      const next: typeof hydratedEntities = {};
      for (const ref of toHydrate) {
        const sc = await hydrateSessionContextFromFs(store, ref.sessionId);
        if (sc) {
          next[ref.key] = {
            ...ref,
            sessionContext: sc,
            removable: ref.source !== "auto-current",
          };
        }
      }
      if (!stale && Object.keys(next).length > 0) {
        setHydratedEntities((prev) => ({ ...prev, ...next }));
      }
    })();
    return () => {
      stale = true;
    };
  }, [persistedRefs, liveKeys, hydratedEntities, store]);

  const contextEntities = useMemo(() => {
    const sessionEntities: ContextEntity[] = sessionEntity ? [sessionEntity] : [];

    const hydrated: ContextEntity[] = persistedRefs
      .filter((ref) => !liveKeys.has(ref.key))
      .map((ref) => {
        if (ref.kind === "session") {
          return hydratedEntities[ref.key] ?? { ...ref, removable: true };
        }
        if (ref.kind === "workspace") {
          return mapWorkspaceEntity(ref);
        }
        return mapAllEntity(ref);
      });

    return dedupeByKey([
      sessionEntities,
      toolEntities,
      hydrated,
    ]).filter((e) => !removedKeys.has(e.key));
  }, [
    sessionEntity,
    toolEntities,
    persistedRefs,
    liveKeys,
    hydratedEntities,
    removedKeys,
  ]);

  // Persist manual context refs on change
  const lastPersisted = useRef<string>("");

  useEffect(() => {
    if (!chatGroupId) {
      lastPersisted.current = "";
      return;
    }

    const persistable = toPersistableContextRefs(contextEntities);

    const fingerprint = JSON.stringify(persistable);
    if (fingerprint === lastPersisted.current) return;

    lastPersisted.current = fingerprint;
    persistContext(chatGroupId, persistable);
  }, [chatGroupId, contextEntities, persistContext]);

  return { contextEntities, onRemoveContextEntity };
}
