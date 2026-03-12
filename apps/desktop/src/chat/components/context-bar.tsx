import {
  ChevronUpIcon,
  FolderIcon,
  GlobeIcon,
  PlusIcon,
  StickyNoteIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@openmushi/ui/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@openmushi/ui/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@openmushi/ui/components/ui/tooltip";
import { cn } from "@openmushi/utils";

import type { ContextEntity, ContextRef } from "~/chat/context-item";
import { type ContextChipProps, renderChip } from "~/chat/context/registry";
import { useSearchEngine } from "~/search/contexts/engine";
import * as main from "~/store/tinybase/store/main";

function ContextChip({
  chip,
  onRemove,
}: {
  chip: ContextChipProps;
  onRemove?: (key: string) => void;
}) {
  const Icon = chip.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn([
            "group max-w-48 cursor-default rounded-md bg-neutral-500/10 px-1.5 py-0.5 text-xs text-neutral-600",
            "inline-flex items-center gap-1",
          ])}
        >
          {Icon && <Icon className="size-3 shrink-0 text-neutral-400" />}
          <span className="truncate">{chip.label}</span>
          {chip.removable && onRemove && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(chip.key);
              }}
              className="ml-0.5 hidden items-center justify-center rounded-sm group-hover:inline-flex hover:bg-neutral-500/20"
            >
              <XIcon className="size-2.5" />
            </button>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="z-110 max-w-64 whitespace-pre-wrap">
        {chip.tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

type PickerSession = {
  id: string;
  title: string;
  created_at: number;
  workspace?: string | null;
};

type PickerWorkspace = {
  id: string;
  name: string;
};

export function mapTimelineSessionsForPicker(
  sessions?: Record<string, { title: string; created_at: string; workspace_id: string }>,
): PickerSession[] {
  if (!sessions) {
    return [];
  }

  return Object.entries(sessions)
    .map(([id, row]) => ({
      id,
      title: row.title || "Untitled",
      created_at: Date.parse(row.created_at) || 0,
      workspace: row.workspace_id || null,
    }))
    .sort((a, b) => b.created_at - a.created_at)
    .slice(0, 8);
}

export function resolveSessionPickerResults({
  query,
  searchResults,
  timelineResults,
}: {
  query: string;
  searchResults: PickerSession[];
  timelineResults: PickerSession[];
}): PickerSession[] {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return timelineResults;
  }

  if (searchResults.length > 0) {
    return searchResults;
  }

  return timelineResults.filter((result) => {
    const title = result.title.toLowerCase();
    const workspace = result.workspace?.toLowerCase() ?? "";
    return title.includes(normalizedQuery) || workspace.includes(normalizedQuery);
  });
}

export function mapTimelineWorkspacesForPicker(
  sessions?: Record<string, { title: string; created_at: string; workspace_id: string }>,
): PickerWorkspace[] {
  if (!sessions) {
    return [];
  }

  const seen = new Set<string>();
  const workspaces: PickerWorkspace[] = [];

  for (const row of Object.values(sessions)) {
    const workspaceId = row.workspace_id || "";
    if (!workspaceId || seen.has(workspaceId)) continue;

    seen.add(workspaceId);
    const parts = workspaceId.split("/");
    const name = parts[parts.length - 1] || workspaceId;
    workspaces.push({ id: workspaceId, name });
  }

  return workspaces.sort((a, b) => a.id.localeCompare(b.id));
}

export function resolveWorkspacePickerResults({
  query,
  workspaceResults,
}: {
  query: string;
  workspaceResults: PickerWorkspace[];
}): PickerWorkspace[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return workspaceResults;
  }

  return workspaceResults.filter((workspace) => {
    const id = workspace.id.toLowerCase();
    const name = workspace.name.toLowerCase();
    return id.includes(normalizedQuery) || name.includes(normalizedQuery);
  });
}

function NoteScopePicker({
  onSelect,
  onClose,
}: {
  onSelect: (sessionId: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickerSession[]>([]);
  const { search } = useSearchEngine();
  const timelineSessions = main.UI.useResultTable(
    main.QUERIES.timelineSessions,
    main.STORE_ID,
  ) as Record<
    string,
    { title: string; created_at: string; workspace_id: string }
  >;

  useEffect(() => {
    const timelineResults = mapTimelineSessionsForPicker(timelineSessions);

    search(query, { created_at: undefined }).then((hits) => {
      const searchResults = hits
        .filter((h) => h.document.type === "session")
        .slice(0, 8)
        .map((h) => ({
          id: h.document.id,
          title: h.document.title,
          created_at: h.document.created_at,
          workspace: null,
        }));

      setResults(
        resolveSessionPickerResults({
          query,
          searchResults,
          timelineResults,
        }),
      );
    });
  }, [query, search, timelineSessions]);

  return (
    <div className="flex flex-col gap-2">
      <input
        autoFocus
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search notes..."
        className="w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-neutral-400"
      />
      <div className="flex max-h-48 flex-col gap-0.5 overflow-y-auto">
        {results.map((result) => (
          <button
            key={result.id}
            type="button"
            onClick={() => {
              onSelect(result.id);
              onClose();
            }}
            className="flex flex-col items-start rounded-md px-2 py-1.5 text-left transition-colors hover:bg-neutral-100"
          >
            <span className="w-full truncate text-xs font-medium text-neutral-700">
              {result.title || "Untitled"}
            </span>
            <span className="text-[10px] text-neutral-400">
              {new Date(result.created_at).toLocaleDateString()}
              {result.workspace ? ` · ${result.workspace}` : ""}
            </span>
          </button>
        ))}
        {results.length === 0 && (
          <span className="px-2 py-1.5 text-xs text-neutral-400">No notes found</span>
        )}
      </div>
    </div>
  );
}

function WorkspaceScopePicker({
  onSelect,
  onClose,
}: {
  onSelect: (workspace: PickerWorkspace) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const timelineSessions = main.UI.useResultTable(
    main.QUERIES.timelineSessions,
    main.STORE_ID,
  ) as Record<
    string,
    { title: string; created_at: string; workspace_id: string }
  >;

  const results = useMemo(() => {
    const workspaceResults = mapTimelineWorkspacesForPicker(timelineSessions);
    return resolveWorkspacePickerResults({ query, workspaceResults });
  }, [query, timelineSessions]);

  return (
    <Command>
      <CommandInput
        autoFocus
        value={query}
        onValueChange={setQuery}
        placeholder="Search workspaces..."
        className="h-9"
      />
      <CommandList>
        <CommandEmpty>No workspaces found.</CommandEmpty>
        <CommandGroup>
          {results.map((workspace) => (
            <CommandItem
              key={workspace.id}
              value={workspace.name}
              onSelect={() => {
                onSelect(workspace);
                onClose();
              }}
            >
              <FolderIcon className="size-4" />
              {workspace.name}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}

function ScopePicker({
  onSelectNote,
  onSelectWorkspace,
  onSelectAll,
  onClose,
}: {
  onSelectNote: (sessionId: string) => void;
  onSelectWorkspace: (workspace: PickerWorkspace) => void;
  onSelectAll: () => void;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<"note" | "workspace" | "all">("note");

  return (
    <div className="flex flex-col gap-2">
      <div className="flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5">
        <button
          type="button"
          onClick={() => setScope("note")}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs",
            scope === "note" ? "bg-white text-neutral-900" : "text-neutral-500",
          )}
        >
          <StickyNoteIcon className="size-3.5" />
          Note
        </button>
        <button
          type="button"
          onClick={() => setScope("workspace")}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs",
            scope === "workspace"
              ? "bg-white text-neutral-900"
              : "text-neutral-500",
          )}
        >
          <FolderIcon className="size-3.5" />
          Workspace
        </button>
        <button
          type="button"
          onClick={() => setScope("all")}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs",
            scope === "all" ? "bg-white text-neutral-900" : "text-neutral-500",
          )}
        >
          <GlobeIcon className="size-3.5" />
          All notes
        </button>
      </div>

      {scope === "note" ? (
        <NoteScopePicker onSelect={onSelectNote} onClose={onClose} />
      ) : null}
      {scope === "workspace" ? (
        <WorkspaceScopePicker onSelect={onSelectWorkspace} onClose={onClose} />
      ) : null}
      {scope === "all" ? (
        <button
          type="button"
          className="rounded-md border border-neutral-200 px-2.5 py-2 text-left text-xs text-neutral-700 hover:bg-neutral-50"
          onClick={() => {
            onSelectAll();
            onClose();
          }}
        >
          Attach all notes
        </button>
      ) : null}
    </div>
  );
}

export function ContextBar({
  entities,
  onRemoveEntity,
  onAddEntity,
}: {
  entities: ContextEntity[];
  onRemoveEntity?: (key: string) => void;
  onAddEntity?: (ref: ContextRef) => void;
}) {
  const chips = useMemo(
    () =>
      entities.map(renderChip).filter((c): c is ContextChipProps => c !== null),
    [entities],
  );

  const innerRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState(chips.length);
  const [expanded, setExpanded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    setVisibleCount(chips.length);
  }, [chips.length]);

  useEffect(() => {
    if (expanded) return;

    const inner = innerRef.current;
    if (!inner || chips.length === 0) return;

    const measure = () => {
      const children = Array.from(inner.children) as HTMLElement[];
      if (children.length === 0) return;

      const containerRight = inner.getBoundingClientRect().right;
      const gap = 6;
      const expandButtonWidth = 28;

      let count = 0;
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        const childRight = child.getBoundingClientRect().right;

        if (i < chips.length) {
          const needsOverflow = i < chips.length - 1;
          const threshold = needsOverflow
            ? containerRight - expandButtonWidth - gap
            : containerRight;

          if (childRight <= threshold) {
            count++;
          } else {
            break;
          }
        }
      }

      if (count < chips.length && count === 0) {
        count = 1;
      }

      setVisibleCount(count);
    };

    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    measure();

    return () => observer.disconnect();
  }, [chips, expanded]);

  useEffect(() => {
    setExpanded(false);
  }, [chips.length]);

  if (chips.length === 0 && !onAddEntity) return null;

  const hasOverflow = visibleCount < chips.length;
  const displayChips = chips.slice(0, visibleCount);

  const handleSelectSession = (sessionId: string) => {
    if (!onAddEntity) return;
    onAddEntity({
      kind: "session",
      key: `session:manual:${sessionId}`,
      source: "manual",
      sessionId,
    });
  };

  const handleSelectWorkspace = (workspace: PickerWorkspace) => {
    if (!onAddEntity) return;
    onAddEntity({
      kind: "workspace",
      key: `workspace:manual:${workspace.id}`,
      source: "manual",
      workspaceId: workspace.id,
      workspaceName: workspace.name,
    });
  };

  const handleSelectAll = () => {
    if (!onAddEntity) return;
    onAddEntity({
      kind: "all",
      key: "all:manual",
      source: "manual",
    });
  };

  return (
    <div className="relative mx-2 rounded-t-xl border-t border-r border-l border-neutral-200 bg-neutral-100">
      {expanded && (
        <div className="absolute right-0 bottom-full left-0 max-h-40 overflow-y-auto rounded-t-lg border-b border-neutral-200/60 bg-neutral-100 px-2.5 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {chips.slice(visibleCount).map((chip) => (
              <ContextChip
                key={chip.key}
                chip={chip}
                onRemove={onRemoveEntity}
              />
            ))}
          </div>
        </div>
      )}
      <div
        ref={innerRef}
        className="flex items-center gap-1.5 overflow-hidden px-2.5 py-2"
      >
        {displayChips.map((chip) => (
          <ContextChip key={chip.key} chip={chip} onRemove={onRemoveEntity} />
        ))}
        {hasOverflow && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className={cn([
              "inline-flex shrink-0 items-center justify-center rounded-md bg-neutral-500/10 px-1 py-0.5 text-xs text-neutral-400 transition-colors hover:bg-neutral-500/20 hover:text-neutral-600",
            ])}
          >
            {expanded ? (
              <ChevronUpIcon className="size-3.5 rotate-180" />
            ) : (
              <span className="inline-flex items-center gap-0.5">
                +{chips.length - visibleCount}
                <ChevronUpIcon className="size-3" />
              </span>
            )}
          </button>
        )}
        {onAddEntity && (
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn([
                  "inline-flex shrink-0 items-center justify-center rounded-md bg-neutral-500/10 p-0.5 text-neutral-400 transition-colors hover:bg-neutral-500/20 hover:text-neutral-600",
                ])}
              >
                <PlusIcon className="size-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-72 p-3">
              <ScopePicker
                onSelectNote={handleSelectSession}
                onSelectWorkspace={handleSelectWorkspace}
                onSelectAll={handleSelectAll}
                onClose={() => setPickerOpen(false)}
              />
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}
