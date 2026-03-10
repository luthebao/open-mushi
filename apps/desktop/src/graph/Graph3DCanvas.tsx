import ForceGraph3D from "react-force-graph-3d";
import type { NodeObject, LinkObject } from "react-force-graph-3d";
import * as THREE from "three";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { GraphData } from "./types";
import { filterEdges, nodeSize } from "./useForceLayout";

type Graph3DNode = NodeObject<{ label: string; frequency: number }>;
type Graph3DLink = LinkObject<
  { label: string; frequency: number },
  { weight: number }
>;

function getLinkId(
  node: string | number | Graph3DNode | undefined,
): string {
  if (node == null) return "";
  if (typeof node === "object") return String(node.id ?? "");
  return String(node);
}

type Graph3DCanvasProps = {
  data: GraphData;
  onNodeClick?: (nodeId: string | null) => void;
  selectedNodeId: string | null;
};

export function Graph3DCanvas({
  data,
  onNodeClick,
  selectedNodeId,
}: Graph3DCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const filteredEdges = useMemo(() => filterEdges(data.edges), [data.edges]);

  const graphData = useMemo(() => {
    const nodes = data.nodes.map((n) => ({
      id: n.id,
      label: n.label,
      frequency: n.frequency,
    }));
    const links = filteredEdges.map((e) => ({
      source: e.source,
      target: e.target,
      weight: e.weight,
    }));
    return { nodes, links };
  }, [data.nodes, filteredEdges]);

  const maxFrequency = useMemo(
    () => Math.max(1, ...data.nodes.map((n) => n.frequency)),
    [data.nodes],
  );

  const connectedIds = useMemo(() => {
    if (!selectedNodeId) return null;
    const ids = new Set<string>();
    ids.add(selectedNodeId);
    for (const e of filteredEdges) {
      if (e.source === selectedNodeId) ids.add(e.target);
      if (e.target === selectedNodeId) ids.add(e.source);
    }
    return ids;
  }, [selectedNodeId, filteredEdges]);

  const handleNodeClick = useCallback(
    (node: Graph3DNode) => {
      onNodeClick?.(node.id != null ? String(node.id) : null);
    },
    [onNodeClick],
  );

  const handleBackgroundClick = useCallback(() => {
    onNodeClick?.(null);
  }, [onNodeClick]);

  const nodeThreeObject = useCallback(
    (node: Graph3DNode) => {
      const id = String(node.id ?? "");
      const freq = node.frequency ?? 1;
      const size2d = nodeSize(freq, maxFrequency);
      const radius = 3 + ((size2d - 40) / 60) * 6; // Map 40-100 → 3-9

      const isSelected = id === selectedNodeId;
      const isConnected = connectedIds?.has(id) ?? true;
      const dimmed = connectedIds != null && !isConnected;

      // Sphere
      const geometry = new THREE.SphereGeometry(radius, 16, 12);
      const material = new THREE.MeshLambertMaterial({
        color: isSelected ? "#4f46e5" : isConnected && connectedIds ? "#6366f1" : "#a5b4fc",
        transparent: dimmed,
        opacity: dimmed ? 0.15 : 1,
      });
      const sphere = new THREE.Mesh(geometry, material);

      // Label sprite
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      const label = node.label ?? id;
      const fontSize = 48;
      ctx.font = `${fontSize}px sans-serif`;
      const textWidth = ctx.measureText(label).width;
      canvas.width = textWidth + 16;
      canvas.height = fontSize + 16;
      ctx.font = `${fontSize}px sans-serif`;
      ctx.fillStyle = dimmed ? "rgba(115,115,115,0.3)" : "#404040";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, canvas.width / 2, canvas.height / 2);

      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      const spriteMaterial = new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
      });
      const sprite = new THREE.Sprite(spriteMaterial);
      const spriteScale = canvas.width / canvas.height;
      sprite.scale.set(spriteScale * 4, 4, 1);
      sprite.position.set(0, radius + 3, 0);

      const group = new THREE.Group();
      group.add(sphere);
      group.add(sprite);
      return group;
    },
    [maxFrequency, selectedNodeId, connectedIds],
  );

  const linkColor = useCallback(
    (link: Graph3DLink) => {
      if (!selectedNodeId) return "#d4d4d4";
      const src = getLinkId(link.source);
      const tgt = getLinkId(link.target);
      if (src === selectedNodeId || tgt === selectedNodeId) return "#6366f1";
      return "rgba(212,212,212,0.1)";
    },
    [selectedNodeId],
  );

  const linkWidth = useCallback(
    (link: Graph3DLink) => {
      if (!selectedNodeId) return 1;
      const src = getLinkId(link.source);
      const tgt = getLinkId(link.target);
      if (src === selectedNodeId || tgt === selectedNodeId) return 2.5;
      return 0.5;
    },
    [selectedNodeId],
  );

  return (
    <div ref={containerRef} className="h-full w-full">
      <ForceGraph3D
        graphData={graphData}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="#fafafa"
        nodeThreeObject={nodeThreeObject}
        nodeLabel=""
        linkColor={linkColor}
        linkWidth={linkWidth}
        linkOpacity={0.8}
        onNodeClick={handleNodeClick}
        onBackgroundClick={handleBackgroundClick}
        showNavInfo={false}
        enableNodeDrag={true}
        cooldownTicks={100}
        d3AlphaDecay={0.05}
        d3VelocityDecay={0.3}
      />
    </div>
  );
}
