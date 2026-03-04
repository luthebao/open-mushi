import {
  FolderIcon,
  LayoutGridIcon,
  PlusIcon,
  StickyNoteIcon,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import { Button } from "@openmushi/ui/components/ui/button";
import { Kbd } from "@openmushi/ui/components/ui/kbd";
import { cn } from "@openmushi/utils";

import { Section } from "./shared";

import { StandardTabWrapper } from "~/shared/main";
import { useNewNote } from "~/shared/main/useNewNote";
import { OpenNoteDialog } from "~/shared/main/empty/open-note-dialog";
import { type TabItem, TabItemBase } from "~/shared/tabs";
import {
  WorkspaceBreadcrumb,
  useWorkspaceChain,
} from "~/shared/ui/workspace-breadcrumb";
import { useSession } from "~/store/tinybase/hooks";
import { sessionOps } from "~/store/tinybase/persister/session/ops";
import * as main from "~/store/tinybase/store/main";
import { type Tab, useTabs } from "~/store/zustand/tabs";

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

    // Also collect workspaces from the workspaces table (includes empty ones)
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

    return { topLevel: topLevel.sort(), byParent };
  }, [workspaceSliceIds, workspaceRowIds, store]);
}

function useWorkspaceName(workspaceId: string) {
  return useMemo(() => {
    const parts = workspaceId.split("/");
    return parts[parts.length - 1] || "Untitled";
  }, [workspaceId]);
}

export const TabItemWorkspace: TabItem<
  Extract<Tab, { type: "workspaces" }>
> = (props) => {
  if (props.tab.type === "workspaces" && props.tab.id === null) {
    return <TabItemWorkspaceAll {...props} />;
  }

  if (props.tab.type === "workspaces" && props.tab.id !== null) {
    return <TabItemWorkspaceSpecific {...props} />;
  }

  return null;
};

const TabItemWorkspaceAll: TabItem<Extract<Tab, { type: "workspaces" }>> = ({
  tab,
  tabIndex,
  handleCloseThis,
  handleSelectThis,
  handleCloseAll,
  handleCloseOthers,
  handlePinThis,
  handleUnpinThis,
}) => {
  return (
    <TabItemBase
      icon={<LayoutGridIcon className="h-4 w-4" />}
      title={"Workspaces"}
      selected={tab.active}
      pinned={tab.pinned}
      tabIndex={tabIndex}
      handleCloseThis={() => handleCloseThis(tab)}
      handleSelectThis={() => handleSelectThis(tab)}
      handleCloseOthers={handleCloseOthers}
      handleCloseAll={handleCloseAll}
      handlePinThis={() => handlePinThis(tab)}
      handleUnpinThis={() => handleUnpinThis(tab)}
    />
  );
};

const TabItemWorkspaceSpecific: TabItem<
  Extract<Tab, { type: "workspaces" }>
> = ({
  tab,
  tabIndex,
  handleCloseThis,
  handleSelectThis,
  handleCloseOthers,
  handleCloseAll,
  handlePinThis,
  handleUnpinThis,
}) => {
  const workspaceId = tab.id!;
  const workspaces = useWorkspaceChain(workspaceId);
  const name = useWorkspaceName(workspaceId);
  const repeatCount = Math.max(0, workspaces.length - 1);
  const title = " .. / ".repeat(repeatCount) + name;

  return (
    <TabItemBase
      icon={<FolderIcon className="h-4 w-4" />}
      title={title}
      selected={tab.active}
      pinned={tab.pinned}
      tabIndex={tabIndex}
      handleCloseThis={() => handleCloseThis(tab)}
      handleSelectThis={() => handleSelectThis(tab)}
      handleCloseOthers={handleCloseOthers}
      handleCloseAll={handleCloseAll}
      handlePinThis={() => handlePinThis(tab)}
      handleUnpinThis={() => handleUnpinThis(tab)}
    />
  );
};

export function TabContentWorkspace({ tab }: { tab: Tab }) {
  if (tab.type !== "workspaces") {
    return null;
  }

  return (
    <StandardTabWrapper>
      {tab.id === null ? (
        <TabContentWorkspaceTopLevel />
      ) : (
        <TabContentWorkspaceSpecific workspaceId={tab.id} />
      )}
    </StandardTabWrapper>
  );
}

function QuickActions({ workspaceId }: { workspaceId?: string }) {
  const newNote = useNewNote({ behavior: "current", workspaceId });
  const openCurrent = useTabs((state) => state.openCurrent);
  const [openNoteDialogOpen, setOpenNoteDialogOpen] = useState(false);

  const openContacts = useCallback(
    () => openCurrent({ type: "contacts" }),
    [openCurrent],
  );
  const openCalendar = useCallback(
    () => openCurrent({ type: "calendar" }),
    [openCurrent],
  );
  const openAdvancedSearch = useCallback(
    () => openCurrent({ type: "search" }),
    [openCurrent],
  );
  const openGraph = useCallback(
    () =>
      openCurrent({
        type: "graph",
        scope: workspaceId
          ? { scope: "workspace", workspaceId }
          : { scope: "all" },
      }),
    [openCurrent, workspaceId],
  );

  return (
    <>
      <div className="flex items-center gap-1 text-neutral-600">
        <QuickActionButton label="New Note" shortcut={["⌘", "N"]} onClick={newNote} />
        <QuickActionButton
          label="Open Note"
          shortcut={["⌘", "O"]}
          onClick={() => setOpenNoteDialogOpen(true)}
        />
        <div className="mx-1 h-4 w-px bg-neutral-200" />
        <QuickActionButton label="Contacts" shortcut={["⌘", "⇧", "O"]} onClick={openContacts} />
        <QuickActionButton label="Calendar" shortcut={["⌘", "⇧", "C"]} onClick={openCalendar} />
        <QuickActionButton label="Search" shortcut={["⌘", "⇧", "F"]} onClick={openAdvancedSearch} />
        <QuickActionButton label="Graph" shortcut={["⌘", "⇧", "G"]} onClick={openGraph} />
      </div>
      <OpenNoteDialog open={openNoteDialogOpen} onOpenChange={setOpenNoteDialogOpen} />
    </>
  );
}

function QuickActionButton({
  label,
  shortcut,
  onClick,
}: {
  label: string;
  shortcut?: string[];
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn([
        "group",
        "flex items-center gap-2",
        "text-xs",
        "rounded-md px-3 py-1.5",
        "cursor-pointer transition-colors hover:bg-neutral-100",
      ])}
    >
      <span>{label}</span>
      {shortcut && (
        <Kbd
          className={cn([
            "text-[10px]",
            "transition-all duration-100",
            "group-hover:-translate-y-0.5 group-hover:shadow-[0_2px_0_0_rgba(0,0,0,0.15),inset_0_1px_0_0_rgba(255,255,255,0.8)]",
            "group-active:translate-y-0.5 group-active:shadow-none",
          ])}
        >
          {shortcut.join(" ")}
        </Kbd>
      )}
    </button>
  );
}

function TabContentWorkspaceTopLevel() {
  const { topLevel: topLevelWorkspaceIds } = useWorkspaceTree();

  const handleNewWorkspace = useCallback(async () => {
    const name = prompt("Workspace name:");
    if (name?.trim()) {
      await sessionOps.createWorkspace(name.trim());
    }
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <QuickActions />

      <Section
        icon={<LayoutGridIcon className="h-4 w-4" />}
        title="Workspaces"
        action={
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-xs text-neutral-500 hover:text-neutral-700"
            onClick={handleNewWorkspace}
          >
            <PlusIcon className="h-3 w-3" />
            New
          </Button>
        }
      >
        {topLevelWorkspaceIds.length > 0 ? (
          <div className="grid grid-cols-4 gap-4 px-3">
            {topLevelWorkspaceIds.map((workspaceId) => (
              <WorkspaceCard key={workspaceId} workspaceId={workspaceId} />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <FolderIcon className="h-10 w-10 text-neutral-200" />
            <div>
              <p className="text-sm font-medium text-neutral-400">No workspaces yet</p>
              <p className="text-xs text-neutral-300">Create one to organize your notes</p>
            </div>
          </div>
        )}
      </Section>
    </div>
  );
}

function WorkspaceCard({ workspaceId }: { workspaceId: string }) {
  const name = useWorkspaceName(workspaceId);
  const openCurrent = useTabs((state) => state.openCurrent);
  const { byParent } = useWorkspaceTree();

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(name);

  const childWorkspaceIds = byParent[workspaceId] || [];

  const sessionIds = main.UI.useSliceRowIds(
    main.INDEXES.sessionsByWorkspace,
    workspaceId,
    main.STORE_ID,
  );

  const childCount = childWorkspaceIds.length + (sessionIds?.length ?? 0);

  const handleRename = useCallback(async () => {
    const trimmed = editValue.trim();
    if (!trimmed || trimmed === name) {
      setEditValue(name);
      setIsEditing(false);
      return;
    }

    const parts = workspaceId.split("/");
    parts[parts.length - 1] = trimmed;
    const newWorkspaceId = parts.join("/");

    const result = await sessionOps.renameWorkspace(workspaceId, newWorkspaceId);
    if (result.status === "error") {
      setEditValue(name);
    }
    setIsEditing(false);
  }, [editValue, name, workspaceId]);

  return (
    <div
      className={cn([
        "flex flex-col items-center justify-center",
        "cursor-pointer gap-1.5 rounded-lg border border-neutral-200 p-5",
        "transition-colors hover:border-neutral-300 hover:bg-neutral-50",
      ])}
      onClick={() => {
        if (!isEditing) {
          openCurrent({ type: "workspaces", id: workspaceId });
        }
      }}
    >
      <FolderIcon className="h-8 w-8 text-neutral-300" />
      {isEditing ? (
        <input
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              handleRename();
            } else if (e.key === "Escape") {
              setEditValue(name);
              setIsEditing(false);
            }
          }}
          onClick={(e) => e.stopPropagation()}
          autoFocus
          className={cn([
            "w-full text-center text-sm font-medium text-neutral-700",
            "border-none bg-transparent focus:underline focus:outline-hidden",
          ])}
        />
      ) : (
        <span
          className="text-center text-sm font-medium text-neutral-700"
          onClick={(e) => {
            e.stopPropagation();
            setEditValue(name);
            setIsEditing(true);
          }}
        >
          {name}
        </span>
      )}
      <span className="text-xs text-neutral-400">
        {childCount > 0 ? `${childCount} item${childCount !== 1 ? "s" : ""}` : "Empty"}
      </span>
    </div>
  );
}

function TabContentWorkspaceSpecific({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const { byParent } = useWorkspaceTree();
  const childWorkspaceIds = byParent[workspaceId] || [];

  const sessionIds = main.UI.useSliceRowIds(
    main.INDEXES.sessionsByWorkspace,
    workspaceId,
    main.STORE_ID,
  );

  const hasChildren = childWorkspaceIds.length > 0;
  const hasNotes = (sessionIds?.length ?? 0) > 0;
  const isEmpty = !hasChildren && !hasNotes;

  return (
    <div className="flex flex-col gap-6">
      <TabContentWorkspaceBreadcrumb workspaceId={workspaceId} />
      <QuickActions workspaceId={workspaceId} />

      {hasChildren && (
        <Section icon={<FolderIcon className="h-4 w-4" />} title="Workspaces">
          <div className="grid grid-cols-4 gap-4">
            {childWorkspaceIds.map((childId) => (
              <WorkspaceCard key={childId} workspaceId={childId} />
            ))}
          </div>
        </Section>
      )}

      {hasNotes && (
        <Section icon={<StickyNoteIcon className="h-4 w-4" />} title="Notes">
          <div className="flex flex-col gap-1">
            {sessionIds!.map((sessionId) => (
              <WorkspaceNoteItem key={sessionId} sessionId={sessionId} />
            ))}
          </div>
        </Section>
      )}

      {isEmpty && (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <FolderIcon className="h-10 w-10 text-neutral-200" />
          <div>
            <p className="text-sm font-medium text-neutral-400">This workspace is empty</p>
            <p className="text-xs text-neutral-300">Create a new note or drag one here</p>
          </div>
        </div>
      )}
    </div>
  );
}

function TabContentWorkspaceBreadcrumb({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const openCurrent = useTabs((state) => state.openCurrent);

  return (
    <WorkspaceBreadcrumb
      workspaceId={workspaceId}
      renderBefore={() => (
        <button
          onClick={() => openCurrent({ type: "workspaces", id: null })}
          className="hover:text-foreground"
        >
          <LayoutGridIcon className="h-4 w-4" />
        </button>
      )}
      renderCrumb={({ id, name, isLast }) => (
        <button
          onClick={() =>
            !isLast && openCurrent({ type: "workspaces", id })
          }
          className={
            isLast ? "text-foreground font-medium" : "hover:text-foreground"
          }
        >
          {name}
        </button>
      )}
    />
  );
}

function WorkspaceNoteItem({ sessionId }: { sessionId: string }) {
  const session = useSession(sessionId);
  const openCurrent = useTabs((state) => state.openCurrent);

  return (
    <button
      className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors hover:bg-neutral-100"
      onClick={() => openCurrent({ type: "sessions", id: sessionId })}
    >
      <StickyNoteIcon className="h-4 w-4 shrink-0 text-neutral-400" />
      <span className="truncate text-sm text-neutral-700">{session.title || "Untitled"}</span>
    </button>
  );
}
