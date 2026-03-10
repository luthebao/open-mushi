import {
  AlertCircleIcon,
  Loader2Icon,
  NetworkIcon,
  SettingsIcon,
  ShareIcon,
  SparklesIcon,
} from "lucide-react";
import { ReactFlowProvider } from "@xyflow/react";
import { useCallback, useMemo, useState } from "react";

import { Button } from "@openmushi/ui/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@openmushi/ui/components/ui/resizable";

import { StandardTabWrapper } from "~/shared/main";
import { type TabItem, TabItemBase } from "~/shared/tabs";
import { type Tab } from "~/store/zustand/tabs";

import { Graph3DCanvas } from "./Graph3DCanvas";
import { GraphCanvas } from "./GraphCanvas";
import { NodeDetailPanel } from "./NodeDetailPanel";
import { ScopeSelector } from "./ScopeSelector";
import { ViewModeToggle, type ViewMode } from "./ViewModeToggle";
import type { GraphScope } from "./types";
import { useForceLayout } from "./useForceLayout";
import { useGraphData } from "./useGraphData";

export const TabItemGraph: TabItem<Extract<Tab, { type: "graph" }>> = ({
  tab,
  tabIndex,
  handleCloseThis,
  handleSelectThis,
  handleCloseOthers,
  handleCloseAll,
  handlePinThis,
  handleUnpinThis,
}) => {
  return (
    <TabItemBase
      icon={<ShareIcon className="h-4 w-4" />}
      title="Graph"
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

export function TabContentGraph({
  tab,
}: {
  tab: Extract<Tab, { type: "graph" }>;
}) {
  const [scope, setScope] = useState<GraphScope>(tab.scope);
  const [viewMode, setViewMode] = useState<ViewMode>("2d");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const { data, loading, error, progress, modelReady, generate } = useGraphData(scope);
  const { flowNodes, flowEdges } = useForceLayout(data);

  const selectedNode = useMemo(
    () => data.nodes.find((n) => n.id === selectedNodeId) ?? null,
    [data.nodes, selectedNodeId],
  );

  const handleNodeClick = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId);
  }, []);

  const isEmpty = data.nodes.length === 0 && !loading;

  return (
    <StandardTabWrapper>
      <div className="flex items-center justify-between border-b border-neutral-200">
        <ScopeSelector scope={scope} onScopeChange={setScope} />
        <div className="flex items-center gap-2 px-4 py-2">
          <ViewModeToggle mode={viewMode} onChange={setViewMode} />
          {data.nodes.length > 0 && (
            <span className="text-xs text-neutral-400">
              {data.nodes.length} keywords, {data.edges.length} connections
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={generate}
            disabled={loading || !modelReady}
          >
            {loading ? (
              <Loader2Icon className="h-3 w-3 animate-spin" />
            ) : (
              <SparklesIcon className="h-3 w-3" />
            )}
            {loading ? (progress || "Generating...") : "Generate with AI"}
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">
        {!modelReady ? (
          <NoModelState />
        ) : loading && isEmpty ? (
          <LoadingState progress={progress} />
        ) : error ? (
          <ErrorState message={error} onRetry={generate} />
        ) : isEmpty ? (
          <EmptyState onGenerate={generate} />
        ) : (
          <ResizablePanelGroup direction="horizontal">
            <ResizablePanel defaultSize={selectedNode ? 70 : 100} minSize={40}>
              {viewMode === "2d" ? (
                <ReactFlowProvider>
                  <GraphCanvas
                    flowNodes={flowNodes}
                    flowEdges={flowEdges}
                    onNodeClick={handleNodeClick}
                    selectedNodeId={selectedNodeId}
                  />
                </ReactFlowProvider>
              ) : (
                <Graph3DCanvas
                  data={data}
                  onNodeClick={handleNodeClick}
                  selectedNodeId={selectedNodeId}
                />
              )}
            </ResizablePanel>
            {selectedNode && (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
                  <NodeDetailPanel
                    node={selectedNode}
                    onClose={() => setSelectedNodeId(null)}
                  />
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        )}
      </div>
    </StandardTabWrapper>
  );
}

function NoModelState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <SettingsIcon className="h-12 w-12 text-neutral-200" />
      <div>
        <p className="text-sm font-medium text-neutral-400">
          No LLM configured
        </p>
        <p className="text-xs text-neutral-300">
          Go to Settings → AI to set up a provider, then generate the graph
        </p>
      </div>
    </div>
  );
}

function LoadingState({ progress }: { progress: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <Loader2Icon className="h-8 w-8 animate-spin text-neutral-300" />
      <p className="text-sm text-neutral-400">
        {progress || "Asking AI to extract keywords from your notes..."}
      </p>
    </div>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <AlertCircleIcon className="h-10 w-10 text-red-300" />
      <div>
        <p className="text-sm font-medium text-neutral-500">
          Failed to generate graph
        </p>
        <p className="mt-1 text-xs text-neutral-400">{message}</p>
      </div>
      <Button variant="outline" size="sm" onClick={onRetry} className="mt-2">
        Try Again
      </Button>
    </div>
  );
}

function EmptyState({ onGenerate }: { onGenerate: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <NetworkIcon className="h-12 w-12 text-neutral-200" />
      <div>
        <p className="text-sm font-medium text-neutral-400">
          Knowledge Graph
        </p>
        <p className="text-xs text-neutral-300">
          Click Generate to extract keywords from your notes using AI
        </p>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={onGenerate}
        className="mt-2 gap-1.5"
      >
        <SparklesIcon className="h-3.5 w-3.5" />
        Generate with AI
      </Button>
    </div>
  );
}
