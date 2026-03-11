import { StickyNoteIcon, XIcon } from "lucide-react";

import { useSession } from "~/store/tinybase/hooks";
import { useTabs } from "~/store/zustand/tabs";

import type { GraphNode, GraphSessionArtifact } from "./types";

type NodeDetailPanelProps = {
  node: GraphNode;
  onClose: () => void;
};

export function NodeDetailPanel({ node, onClose }: NodeDetailPanelProps) {
  return (
    <div className="flex h-full flex-col border-l border-neutral-200 bg-white">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-neutral-900">
            {node.label}
          </h3>
          <p className="text-xs text-neutral-500">
            {node.frequency} occurrence{node.frequency !== 1 ? "s" : ""} in{" "}
            {node.noteIds.length} note{node.noteIds.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-600"
        >
          <XIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        <div className="flex flex-col gap-1">
          {node.noteIds.map((noteId) => (
            <NoteItem
              key={noteId}
              sessionId={noteId}
              artifact={node.sessionArtifacts?.[noteId]}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function NoteItem({
  sessionId,
  artifact,
}: {
  sessionId: string;
  artifact?: GraphSessionArtifact;
}) {
  const session = useSession(sessionId);
  const openNew = useTabs((state) => state.openNew);

  const provenanceParts = [
    artifact?.hasSummary ? "summary" : null,
    artifact?.hasTranscript ? "transcript" : null,
  ].filter((value): value is string => Boolean(value));

  const metadataParts = [
    artifact?.hasTimestamps ? "time" : null,
    artifact?.hasSpeakerMetadata ? "speaker" : null,
  ].filter((value): value is string => Boolean(value));

  return (
    <button
      className="flex w-full flex-col items-start gap-1 rounded-md px-3 py-2 text-left transition-colors hover:bg-neutral-100"
      onClick={() => openNew({ type: "sessions", id: sessionId })}
    >
      <div className="flex w-full items-center gap-2">
        <StickyNoteIcon className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
        <span className="truncate text-xs text-neutral-700">
          {session.title || "Untitled"}
        </span>
      </div>
      {artifact && (
        <div className="flex flex-wrap gap-1 pl-5">
          <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600">
            from {provenanceParts.join("+") || "raw"}
          </span>
          {metadataParts.length > 0 && (
            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] text-neutral-600">
              metadata: {metadataParts.join("+")}
            </span>
          )}
        </div>
      )}
    </button>
  );
}
