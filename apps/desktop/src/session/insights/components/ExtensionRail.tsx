import { useMemo, useState } from "react";

import { rankExtensions } from "../registry";
import type { InsightPhase } from "../state";
import type { ExtensionContext, SessionExtensionDefinition } from "../types";
import { ExtensionCard } from "./ExtensionCard";
import { ExtensionDetailsPanel } from "./ExtensionDetailsPanel";

type ExtensionRailProps = {
  phase: InsightPhase;
  extensions: SessionExtensionDefinition[];
  context: ExtensionContext;
  onRunExtension: (extensionId: string) => void;
};

const RAIL_VISIBLE_PHASES: InsightPhase[] = ["graph_ready", "extensions_suggested"];

export function ExtensionRail({
  phase,
  extensions,
  context,
  onRunExtension,
}: ExtensionRailProps) {
  const [selectedExtensionId, setSelectedExtensionId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  const visible = RAIL_VISIBLE_PHASES.includes(phase);
  const rankedExtensions = useMemo(
    () => rankExtensions(extensions, context),
    [extensions, context],
  );

  const topThree = rankedExtensions.slice(0, 3);
  const hasMore = rankedExtensions.length > 3;
  const visibleCards = expanded ? rankedExtensions : topThree;

  const selectedExtension =
    selectedExtensionId
      ? rankedExtensions.find((extension) => extension.id === selectedExtensionId) ?? null
      : null;
  const selectedRunnable = selectedExtension ? selectedExtension.canRun(context) : false;

  if (!visible || rankedExtensions.length === 0) {
    return null;
  }

  return (
    <div className="rounded-md border border-neutral-200 bg-neutral-50 px-2 py-1.5" data-testid="extension-rail">
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-xs font-medium text-neutral-700">Suggested:</span>
        {visibleCards.map((extension) => (
          <ExtensionCard
            key={extension.id}
            extension={extension}
            runnable={extension.canRun(context)}
            selected={selectedExtension?.id === extension.id}
            onSelect={setSelectedExtensionId}
          />
        ))}
        {hasMore && !expanded && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="rounded-md px-2 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
          >
            +{rankedExtensions.length - topThree.length} more
          </button>
        )}
      </div>
      {selectedExtension && (
        <div className="mt-2">
          <ExtensionDetailsPanel
            extension={selectedExtension}
            runnable={selectedRunnable}
            onRun={onRunExtension}
          />
        </div>
      )}
    </div>
  );
}
