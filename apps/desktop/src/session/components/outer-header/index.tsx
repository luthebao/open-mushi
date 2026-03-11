import { FolderChain } from "./folder";
import { ListenButton } from "./listen";
import { MetadataButton } from "./metadata";
import { OverflowButton } from "./overflow";

import type { EditorView } from "~/store/zustand/tabs/schema";

export function OuterHeader({
  sessionId,
  currentView,
}: {
  sessionId: string;
  currentView: EditorView;
}) {
  return (
    <div className="w-full pt-1">
      <div className="flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50/70 px-2 py-1">
        <div className="min-w-0 flex-1">
          <FolderChain sessionId={sessionId} />
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <ListenButton sessionId={sessionId} />
          <MetadataButton sessionId={sessionId} />
          <OverflowButton sessionId={sessionId} currentView={currentView} />
        </div>
      </div>
    </div>
  );
}
