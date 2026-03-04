import { FolderIcon } from "lucide-react";
import { type ReactNode, useCallback, useMemo, useState } from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@openmushi/ui/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSubContent,
  DropdownMenuTrigger,
} from "@openmushi/ui/components/ui/dropdown-menu";

import { sessionOps } from "~/store/tinybase/persister/session/ops";
import * as main from "~/store/tinybase/store/main";

function useWorkspaces() {
  const sessionIds = main.UI.useRowIds("sessions", main.STORE_ID);
  const store = main.UI.useStore(main.STORE_ID);

  return useMemo(() => {
    if (!store || !sessionIds) return {};

    const workspaces: Record<string, { name: string }> = {};
    for (const id of sessionIds) {
      const workspaceId = store.getCell(
        "sessions",
        id,
        "workspace_id",
      ) as string;
      if (workspaceId && !workspaces[workspaceId]) {
        const parts = workspaceId.split("/");
        workspaces[workspaceId] = { name: parts[parts.length - 1] };
      }
    }
    return workspaces;
  }, [sessionIds, store]);
}

export function SearchableWorkspaceDropdown({
  sessionId,
  trigger,
}: {
  sessionId: string;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const workspaces = useWorkspaces();

  const handleSelectWorkspace = useMoveNoteToWorkspace(sessionId);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-50 p-0">
        {Object.keys(workspaces).length ? (
          <SearchableWorkspaceContent
            workspaces={workspaces}
            onSelectWorkspace={handleSelectWorkspace}
            setOpen={setOpen}
          />
        ) : (
          <div className="text-muted-foreground py-6 text-center text-sm">
            No workspaces available
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SearchableWorkspaceSubmenuContent({
  sessionId,
  setOpen,
}: {
  sessionId: string;
  setOpen?: (open: boolean) => void;
}) {
  const workspaces = useWorkspaces();

  const handleSelectWorkspace = useMoveNoteToWorkspace(sessionId);

  return (
    <DropdownMenuSubContent className="w-50 p-0">
      {Object.keys(workspaces).length ? (
        <SearchableWorkspaceContent
          workspaces={workspaces}
          onSelectWorkspace={handleSelectWorkspace}
          setOpen={setOpen}
        />
      ) : (
        <div className="text-muted-foreground py-6 text-center text-sm">
          No workspaces available
        </div>
      )}
    </DropdownMenuSubContent>
  );
}

function SearchableWorkspaceContent({
  workspaces,
  onSelectWorkspace,
  setOpen,
}: {
  workspaces: Record<string, { name: string }>;
  onSelectWorkspace: (workspaceId: string) => Promise<void>;
  setOpen?: (open: boolean) => void;
}) {
  const handleSelect = async (workspaceId: string) => {
    await onSelectWorkspace(workspaceId);
    setOpen?.(false);
  };

  return (
    <Command>
      <CommandInput
        placeholder="Search workspaces..."
        autoFocus
        className="h-9"
      />
      <CommandList>
        <CommandEmpty>No workspaces found.</CommandEmpty>
        <CommandGroup>
          {Object.entries(workspaces).map(([workspaceId, workspace]) => (
            <CommandItem
              key={workspaceId}
              value={workspace.name}
              onSelect={() => handleSelect(workspaceId)}
            >
              <FolderIcon />
              {workspace.name}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

function useMoveNoteToWorkspace(sessionId: string) {
  return useCallback(
    async (targetWorkspaceId: string) => {
      const result = await sessionOps.moveNoteToWorkspace(
        sessionId,
        targetWorkspaceId,
      );
      if (result.status === "error") {
        console.error("[MoveNote] Failed:", result.error);
      }
    },
    [sessionId],
  );
}
