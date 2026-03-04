import { useMemo } from "react";

import { cn } from "@openmushi/utils";

import * as main from "~/store/tinybase/store/main";

import type { GraphScope } from "./types";

type ScopeSelectorProps = {
  scope: GraphScope;
  onScopeChange: (scope: GraphScope) => void;
};

export function ScopeSelector({ scope, onScopeChange }: ScopeSelectorProps) {
  const workspaceSliceIds = main.UI.useSliceIds(
    main.INDEXES.sessionsByWorkspace,
    main.STORE_ID,
  );
  const allSessionIds = main.UI.useRowIds("sessions", main.STORE_ID);
  const store = main.UI.useStore(main.STORE_ID);

  const workspaces = useMemo(() => {
    const set = new Set<string>();
    for (const id of workspaceSliceIds) {
      if (id) set.add(id);
    }
    return Array.from(set).sort();
  }, [workspaceSliceIds]);

  const sessions = useMemo(() => {
    if (!store) return [];
    return allSessionIds.map((id) => ({
      id,
      title:
        (store.getCell("sessions", id, "title") as string) || "Untitled",
    }));
  }, [allSessionIds, store]);

  const activeTab = scope.scope;

  return (
    <div className="flex items-center gap-2 px-4 py-2">
      <div className="flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5">
        <ScopeButton
          active={activeTab === "all"}
          onClick={() => onScopeChange({ scope: "all" })}
        >
          All
        </ScopeButton>
        <ScopeButton
          active={activeTab === "workspace"}
          onClick={() => {
            const first = workspaces[0];
            if (first) {
              onScopeChange({ scope: "workspace", workspaceId: first });
            }
          }}
          disabled={workspaces.length === 0}
        >
          Workspace
        </ScopeButton>
        <ScopeButton
          active={activeTab === "note"}
          onClick={() => {
            const first = sessions[0];
            if (first) {
              onScopeChange({ scope: "note", sessionId: first.id });
            }
          }}
          disabled={sessions.length === 0}
        >
          Note
        </ScopeButton>
      </div>

      {scope.scope === "workspace" && (
        <select
          className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-700"
          value={scope.workspaceId}
          onChange={(e) =>
            onScopeChange({ scope: "workspace", workspaceId: e.target.value })
          }
        >
          {workspaces.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      )}

      {scope.scope === "note" && (
        <select
          className="max-w-[200px] truncate rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-700"
          value={scope.sessionId}
          onChange={(e) =>
            onScopeChange({ scope: "note", sessionId: e.target.value })
          }
        >
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function ScopeButton({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-md px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-white text-neutral-900 shadow-sm"
          : "text-neutral-500 hover:text-neutral-700",
        disabled && "cursor-not-allowed opacity-40",
      )}
    >
      {children}
    </button>
  );
}
