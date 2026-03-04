export type GraphScope =
  | { scope: "all" }
  | { scope: "workspace"; workspaceId: string }
  | { scope: "note"; sessionId: string };

export type GraphNode = {
  id: string;
  label: string;
  frequency: number;
  noteIds: string[];
};

export type GraphEdge = {
  source: string;
  target: string;
  weight: number;
};

export type GraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export const MAX_GRAPH_NODES = 25;
export const MIN_KEYWORD_LENGTH = 3;
export const MIN_FREQUENCY_ALL = 2;
export const MIN_FREQUENCY_SINGLE = 1;
export const MAX_EDGES = 30;
export const MAX_CONNECTIONS_PER_NODE = 4;
