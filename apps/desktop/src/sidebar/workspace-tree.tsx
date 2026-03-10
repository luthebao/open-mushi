import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  FolderOpenIcon,
  PlusIcon,
  StickyNoteIcon,
} from "lucide-react";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Button } from "@openmushi/ui/components/ui/button";
import { cn } from "@openmushi/utils";

import { useNativeContextMenu } from "~/shared/hooks/useNativeContextMenu";
import { DEFAULT_WORKSPACE_NAME } from "~/store/tinybase/store/initialize";
import { sessionOps } from "~/store/tinybase/persister/session/ops";
import * as main from "~/store/tinybase/store/main";
import { useTabs } from "~/store/zustand/tabs";

function createNoteInWorkspace(
  store: ReturnType<(typeof main.UI)["useStore"]>,
  workspaceId: string,
): string | null {
  if (!store) return null;
  const sessionId = crypto.randomUUID();
  const user_id = store.getValue("user_id");
  store.setRow("sessions", sessionId, {
    user_id,
    created_at: new Date().toISOString(),
    title: "",
    workspace_id: workspaceId || DEFAULT_WORKSPACE_NAME,
  });
  return sessionId;
}

// ── Root ─────────────────────────────────────────────────────────────────

export function WorkspaceTree() {
  const { topLevel, byParent } = useWorkspaceTree();
  const openNew = useTabs((state) => state.openNew);

  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(),
  );
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [newWorkspaceName, setNewWorkspaceName] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );

  const toggleExpanded = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setDraggedId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setDraggedId(null);
    const { active, over } = event;
    if (!over) return;

    const sessionId = active.id as string;
    const targetWorkspaceId = over.id as string;

    sessionOps.moveNoteToWorkspace(sessionId, targetWorkspaceId);
  }, []);

  const handleNewWorkspace = useCallback(() => {
    setNewWorkspaceName("");
  }, []);

  const handleNewWorkspaceCommit = useCallback(
    async (name: string) => {
      setNewWorkspaceName(null);
      if (name.trim()) {
        await sessionOps.createWorkspace(name.trim());
      }
    },
    [],
  );

  const handleOpenAll = useCallback(() => {
    openNew({ type: "workspaces", id: null });
  }, [openNew]);

  const isEmpty =
    topLevel.length === 0 &&
    newWorkspaceName === null;

  if (isEmpty) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 text-center">
        <FolderIcon className="h-8 w-8 text-neutral-300" />
        <p className="text-[13px] text-neutral-400">No workspaces yet</p>
        <Button
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={handleNewWorkspace}
        >
          Create your first workspace
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Section header */}
      <div className="flex items-center justify-between px-4 py-2">
        <button
          onClick={handleOpenAll}
          className="text-[11px] font-semibold tracking-wider text-neutral-400 uppercase hover:text-neutral-600"
        >
          WORKSPACES
        </button>
        <Button
          variant="ghost"
          size="icon"
          className="h-5 w-5 text-neutral-400 hover:text-neutral-600"
          onClick={handleNewWorkspace}
        >
          <PlusIcon className="h-3 w-3" />
        </Button>
      </div>

      {/* Tree */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 overflow-y-auto px-1 pb-2">
          {topLevel.map((workspaceId) => (
            <WorkspaceNode
              key={workspaceId}
              workspaceId={workspaceId}
              byParent={byParent}
              depth={0}
              expanded={expanded}
              onToggle={toggleExpanded}
              renamingId={renamingId}
              onStartRename={setRenamingId}
              onFinishRename={() => setRenamingId(null)}
            />
          ))}

          {/* Inline new-workspace input */}
          {newWorkspaceName !== null && (
            <InlineNameInput
              initialValue=""
              depth={0}
              icon={<FolderIcon className="h-4 w-4 shrink-0 text-neutral-400" />}
              placeholder="Workspace name"
              onCommit={handleNewWorkspaceCommit}
              onCancel={() => setNewWorkspaceName(null)}
            />
          )}

        </div>
        <DragOverlay>
          {draggedId ? <DraggedNotePreview sessionId={draggedId} /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

// ── InlineNameInput ──────────────────────────────────────────────────────

function InlineNameInput({
  initialValue,
  depth,
  icon,
  placeholder,
  onCommit,
  onCancel,
}: {
  initialValue: string;
  depth: number;
  icon: React.ReactNode;
  placeholder: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue);

  useLayoutEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onCommit(value);
      } else if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    },
    [value, onCommit, onCancel],
  );

  const mountedAt = useRef(Date.now());

  const handleBlur = useCallback(() => {
    if (Date.now() - mountedAt.current < 100) {
      onCancel();
      return;
    }
    onCommit(value);
  }, [value, onCommit, onCancel]);

  return (
    <div
      className="flex w-full items-center gap-1.5 rounded-md bg-neutral-100 py-[3px] pr-2"
      style={{ paddingLeft: `${depth * 16 + 12}px` }}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-transparent">
        <ChevronRightIcon className="h-3.5 w-3.5" />
      </span>
      {icon}
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[13px] text-neutral-700 outline-none placeholder:text-neutral-400"
      />
    </div>
  );
}

// ── WorkspaceNode ────────────────────────────────────────────────────────

function WorkspaceNode({
  workspaceId,
  byParent,
  depth,
  expanded,
  onToggle,
  renamingId,
  onStartRename,
  onFinishRename,
}: {
  workspaceId: string;
  byParent: Record<string, string[]>;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  renamingId: string | null;
  onStartRename: (id: string) => void;
  onFinishRename: () => void;
}) {
  const openNew = useTabs((state) => state.openNew);
  const currentTab = useTabs((state) => state.currentTab);
  const store = main.UI.useStore(main.STORE_ID);

  const { setNodeRef, isOver } = useDroppable({
    id: workspaceId,
    data: { type: "workspace" },
  });

  const name = useMemo(() => {
    const parts = workspaceId.split("/");
    return parts[parts.length - 1] || "Untitled";
  }, [workspaceId]);

  const sessionIds = main.UI.useSliceRowIds(
    main.INDEXES.sessionsByWorkspace,
    workspaceId,
    main.STORE_ID,
  );

  const childWorkspaceIds = byParent[workspaceId] || [];
  const hasChildren =
    childWorkspaceIds.length > 0 || (sessionIds?.length ?? 0) > 0;
  const isExpanded = expanded.has(workspaceId);
  const isRenaming = renamingId === workspaceId;

  const isActive =
    currentTab?.type === "workspaces" && currentTab.id === workspaceId;

  const handleClick = useCallback(() => {
    openNew({ type: "workspaces", id: workspaceId });
  }, [openNew, workspaceId]);

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onToggle(workspaceId);
    },
    [onToggle, workspaceId],
  );

  const handleRenameCommit = useCallback(
    (newName: string) => {
      onFinishRename();
      if (newName.trim() && newName.trim() !== name) {
        const parts = workspaceId.split("/");
        parts[parts.length - 1] = newName.trim();
        sessionOps.renameWorkspace(workspaceId, parts.join("/"));
      }
    },
    [name, workspaceId, onFinishRename],
  );

  const contextMenuItems = useMemo(
    () => [
      {
        id: "rename-workspace",
        text: "Rename",
        action: () => {
          onStartRename(workspaceId);
        },
      },
      {
        id: "new-note-in-workspace",
        text: "New Note",
        action: () => {
          const sessionId = createNoteInWorkspace(store, workspaceId);
          if (sessionId) {
            openNew({ type: "sessions", id: sessionId });
          }
        },
      },
      {
        id: "open-as-graph",
        text: "Open as Graph",
        action: () => {
          openNew({
            type: "graph",
            scope: { scope: "workspace", workspaceId },
          });
        },
      },
      { separator: true as const },
      {
        id: "delete-workspace",
        text: "Delete",
        action: () => {
          sessionOps.deleteWorkspace(workspaceId);
        },
      },
    ],
    [workspaceId, openNew, onStartRename, store],
  );

  const showContextMenu = useNativeContextMenu(contextMenuItems);

  if (isRenaming) {
    return (
      <div ref={setNodeRef}>
        <InlineNameInput
          initialValue={name}
          depth={depth}
          icon={
            <FolderOpenIcon className="h-4 w-4 shrink-0 text-neutral-400" />
          }
          placeholder="Workspace name"
          onCommit={handleRenameCommit}
          onCancel={onFinishRename}
        />
      </div>
    );
  }

  return (
    <div ref={setNodeRef}>
      <button
        onClick={handleClick}
        onContextMenu={showContextMenu}
        className={cn([
          "group flex w-full items-center gap-1.5 py-[3px] pr-2 text-left",
          "rounded-md",
          "hover:bg-neutral-100",
          isActive && "bg-neutral-200/50 font-medium",
          isOver && "bg-blue-50 ring-1 ring-blue-200",
        ])}
        style={{ paddingLeft: `${depth * 16 + 12}px` }}
      >
        <span
          onClick={hasChildren ? handleToggle : undefined}
          className={cn([
            "flex h-4 w-4 shrink-0 items-center justify-center",
            hasChildren
              ? "cursor-pointer text-neutral-400 hover:text-neutral-600"
              : "text-transparent",
          ])}
        >
          {hasChildren &&
            (isExpanded ? (
              <ChevronDownIcon className="h-3.5 w-3.5" />
            ) : (
              <ChevronRightIcon className="h-3.5 w-3.5" />
            ))}
        </span>
        {isExpanded ? (
          <FolderOpenIcon className="h-4 w-4 shrink-0 text-neutral-400" />
        ) : (
          <FolderIcon className="h-4 w-4 shrink-0 text-neutral-400" />
        )}
        <span className="truncate text-[13px] text-neutral-700">{name}</span>
      </button>

      {isExpanded && (
        <div>
          {childWorkspaceIds.map((childId) => (
            <WorkspaceNode
              key={childId}
              workspaceId={childId}
              byParent={byParent}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              renamingId={renamingId}
              onStartRename={onStartRename}
              onFinishRename={onFinishRename}
            />
          ))}
          {sessionIds?.map((sessionId) => (
            <NoteItem
              key={sessionId}
              sessionId={sessionId}
              depth={depth + 1}
              workspaceId={workspaceId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── NoteItem ─────────────────────────────────────────────────────────────

function NoteItem({
  sessionId,
  depth,
  workspaceId,
}: {
  sessionId: string;
  depth: number;
  workspaceId: string;
}) {
  const title = main.UI.useCell(
    "sessions",
    sessionId,
    "title",
    main.STORE_ID,
  );
  const openNew = useTabs((state) => state.openNew);
  const currentTab = useTabs((state) => state.currentTab);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: sessionId,
    data: { type: "note", sessionId, sourceWorkspaceId: workspaceId },
  });

  const isActive =
    currentTab?.type === "sessions" && currentTab.id === sessionId;

  const handleClick = useCallback(() => {
    openNew({ type: "sessions", id: sessionId });
  }, [openNew, sessionId]);

  const contextMenuItems = useMemo(
    () => [
      {
        id: "open-note",
        text: "Open",
        action: () => openNew({ type: "sessions", id: sessionId }),
      },
    ],
    [openNew, sessionId],
  );

  const showContextMenu = useNativeContextMenu(contextMenuItems);

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={handleClick}
      onContextMenu={showContextMenu}
      className={cn([
        "flex w-full items-center gap-1.5 py-[3px] pr-2 text-left",
        "rounded-md",
        "hover:bg-neutral-100",
        isActive && "bg-neutral-200/50 font-medium",
        isDragging && "opacity-30",
      ])}
      style={{ paddingLeft: `${depth * 16 + 12 + 20}px` }}
    >
      <StickyNoteIcon className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
      <span className="truncate text-[13px] text-neutral-600">
        {(title as string) || "Untitled"}
      </span>
    </button>
  );
}

// ── DragOverlay preview ──────────────────────────────────────────────────

function DraggedNotePreview({ sessionId }: { sessionId: string }) {
  const title = main.UI.useCell(
    "sessions",
    sessionId,
    "title",
    main.STORE_ID,
  );

  return (
    <div className="flex items-center gap-1.5 rounded-md bg-white px-3 py-1.5 shadow-lg ring-1 ring-neutral-200">
      <StickyNoteIcon className="h-3.5 w-3.5 text-neutral-400" />
      <span className="text-[13px] text-neutral-700">
        {(title as string) || "Untitled"}
      </span>
    </div>
  );
}

// ── useWorkspaceTree hook ────────────────────────────────────────────────

function useWorkspaceTree() {
  const workspaceSliceIds = main.UI.useSliceIds(
    main.INDEXES.sessionsByWorkspace,
    main.STORE_ID,
  );
  const workspaceRowIds = main.UI.useRowIds("workspaces", main.STORE_ID);
  const store = main.UI.useStore(main.STORE_ID);

  return useMemo(() => {
    if (!store)
      return {
        topLevel: [] as string[],
        byParent: {} as Record<string, string[]>,
      };

    const allWorkspaces = new Set<string>();

    // Collect workspaces from the index slices (reactive to workspace_id changes)
    if (workspaceSliceIds) {
      for (const sliceId of workspaceSliceIds) {
        if (sliceId) {
          const parts = sliceId.split("/");
          for (let i = 1; i <= parts.length; i++) {
            allWorkspaces.add(parts.slice(0, i).join("/"));
          }
        }
      }
    }

    // Also collect workspaces from the workspaces table (empty ones too)
    if (workspaceRowIds) {
      for (const rowId of workspaceRowIds) {
        const name = store.getCell("workspaces", rowId, "name") as string;
        if (name) {
          allWorkspaces.add(name);
        }
      }
    }

    const topLevel: string[] = [];
    const byParent: Record<string, string[]> = {};

    for (const workspace of allWorkspaces) {
      const parts = workspace.split("/");
      if (parts.length === 1) {
        topLevel.push(workspace);
      } else {
        const parent = parts.slice(0, -1).join("/");
        byParent[parent] = byParent[parent] || [];
        byParent[parent].push(workspace);
      }
    }

    return {
      topLevel: topLevel.sort(),
      byParent,
    };
  }, [workspaceSliceIds, workspaceRowIds, store]);
}
