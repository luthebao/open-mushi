import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type NodeTypes,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo } from "react";

import { KeywordNode } from "./nodes/KeywordNode";

const nodeTypes: NodeTypes = {
  keyword: KeywordNode,
};

type GraphCanvasProps = {
  flowNodes: Node[];
  flowEdges: Edge[];
  onNodeClick?: (nodeId: string) => void;
  selectedNodeId: string | null;
};

export function GraphCanvas({
  flowNodes: inputNodes,
  flowEdges: inputEdges,
  onNodeClick,
  selectedNodeId,
}: GraphCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(inputNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(inputEdges);

  useEffect(() => {
    setNodes(inputNodes);
  }, [inputNodes, setNodes]);

  useEffect(() => {
    setEdges(inputEdges);
  }, [inputEdges, setEdges]);

  // Find nodes connected to the selected node
  const connectedNodeIds = useMemo(() => {
    if (!selectedNodeId) return null;
    const ids = new Set<string>();
    ids.add(selectedNodeId);
    for (const e of edges) {
      if (e.source === selectedNodeId) ids.add(e.target);
      if (e.target === selectedNodeId) ids.add(e.source);
    }
    return ids;
  }, [edges, selectedNodeId]);

  const nodesWithSelection = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        selected: n.id === selectedNodeId,
        style: {
          ...n.style,
          opacity: connectedNodeIds && !connectedNodeIds.has(n.id) ? 0.2 : 1,
          transition: "opacity 0.2s",
        },
      })),
    [nodes, selectedNodeId, connectedNodeIds],
  );

  const edgesWithSelection = useMemo(
    () =>
      edges.map((e) => {
        const connected =
          selectedNodeId &&
          (e.source === selectedNodeId || e.target === selectedNodeId);
        return {
          ...e,
          style: {
            ...e.style,
            stroke: connected ? "#6366f1" : (e.style?.stroke ?? "#d4d4d4"),
            strokeWidth: connected
              ? ((e.style?.strokeWidth as number) ?? 1) + 1.5
              : (e.style?.strokeWidth ?? 1),
            opacity: selectedNodeId ? (connected ? 1 : 0.1) : 1,
            transition: "opacity 0.2s, stroke 0.2s",
          },
          animated: !!connected,
        };
      }),
    [edges, selectedNodeId],
  );

  const handleNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      onNodeClick?.(node.id);
    },
    [onNodeClick],
  );

  const handlePaneClick = useCallback(() => {
    onNodeClick?.(null!);
  }, [onNodeClick]);

  return (
    <ReactFlow
      nodes={nodesWithSelection}
      edges={edgesWithSelection}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={handleNodeClick}
      onPaneClick={handlePaneClick}
      nodeTypes={nodeTypes}
      fitView
      minZoom={0.1}
      maxZoom={2}
      proOptions={{ hideAttribution: true }}
    >
      <Background gap={20} size={1} color="#f5f5f5" />
      <Controls showInteractive={false} />
      <MiniMap
        nodeStrokeWidth={3}
        pannable
        zoomable
        className="bottom-2! right-2!"
      />
    </ReactFlow>
  );
}
