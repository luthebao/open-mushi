import type { Edge, Node } from "@xyflow/react";
import { useMemo, useRef } from "react";

import type { GraphData, GraphEdge } from "./types";
import { MAX_CONNECTIONS_PER_NODE, MAX_EDGES } from "./types";

export function nodeSize(frequency: number, maxFrequency: number): number {
  if (maxFrequency <= 1) return 60;
  const t = Math.min(frequency / maxFrequency, 1);
  return 40 + t * 60;
}

export function edgeStroke(weight: number, maxWeight: number): number {
  if (maxWeight <= 1) return 1;
  const t = Math.min(weight / maxWeight, 1);
  return 1 + t * 3;
}

export function filterEdges(edges: GraphEdge[]): GraphEdge[] {
  let filtered = edges;

  // Drop weight-1 edges when there are many, but only if higher-weight edges exist
  if (filtered.length > 15) {
    const hasStronger = filtered.some((e) => e.weight >= 2);
    if (hasStronger) {
      filtered = filtered.filter((e) => e.weight >= 2);
    }
  }

  // Limit each node to max N strongest connections
  const connectionCount = new Map<string, number>();
  const sorted = [...filtered].sort((a, b) => b.weight - a.weight);
  const kept: GraphEdge[] = [];

  for (const edge of sorted) {
    const srcCount = connectionCount.get(edge.source) ?? 0;
    const tgtCount = connectionCount.get(edge.target) ?? 0;

    if (srcCount < MAX_CONNECTIONS_PER_NODE && tgtCount < MAX_CONNECTIONS_PER_NODE) {
      kept.push(edge);
      connectionCount.set(edge.source, srcCount + 1);
      connectionCount.set(edge.target, tgtCount + 1);
    }
  }

  return kept.slice(0, MAX_EDGES);
}

export function useForceLayout(data: GraphData): {
  flowNodes: Node[];
  flowEdges: Edge[];
} {
  const positionCache = useRef<Map<string, { x: number; y: number }>>(
    new Map(),
  );

  return useMemo(() => {
    const { nodes, edges } = data;

    if (nodes.length === 0) {
      return { flowNodes: [], flowEdges: [] };
    }

    const maxFrequency = Math.max(...nodes.map((n) => n.frequency));

    const filteredEdges = filterEdges(edges);
    const maxWeight =
      filteredEdges.length > 0 ? Math.max(...filteredEdges.map((e) => e.weight)) : 1;

    const n = nodes.length;
    const radius = Math.max(300, n * 18);

    const flowNodes: Node[] = nodes.map((node, i) => {
      let pos = positionCache.current.get(node.id);
      if (!pos) {
        const angle = (i / n) * 2 * Math.PI;
        pos = {
          x: radius * Math.cos(angle),
          y: radius * Math.sin(angle),
        };
        positionCache.current.set(node.id, pos);
      }

      const size = nodeSize(node.frequency, maxFrequency);

      return {
        id: node.id,
        type: "keyword",
        position: pos,
        data: {
          label: node.label,
          frequency: node.frequency,
          size,
          maxFrequency,
        },
        style: { width: size, height: size },
      };
    });

    const flowEdges: Edge[] = filteredEdges.map((edge) => ({
      id: `${edge.source}--${edge.target}`,
      source: edge.source,
      target: edge.target,
      type: "smoothstep",
      style: {
        strokeWidth: edgeStroke(edge.weight, maxWeight),
        stroke: "#d4d4d4",
      },
      animated: false,
    }));

    // Clean up stale positions
    const currentIds = new Set(nodes.map((n) => n.id));
    for (const key of positionCache.current.keys()) {
      if (!currentIds.has(key)) {
        positionCache.current.delete(key);
      }
    }

    return { flowNodes, flowEdges };
  }, [data]);
}
