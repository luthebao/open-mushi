import {
  extractPlainText,
  flattenTranscript,
} from "~/search/contexts/engine/utils";
import * as main from "~/store/tinybase/store/main";
import { collectEnhancedNotesContent } from "~/store/tinybase/store/utils";

import {
  MAX_EDGES,
  MAX_GRAPH_NODES,
  type GraphData,
  type GraphEdge,
  type GraphNode,
  type GraphSessionArtifact,
} from "./types";

const MAX_NOTES_PER_BATCH = 20;
const MAX_TEXT_PER_NOTE = 1000;

export type SessionGraphArtifact = {
  id: string;
  text: string;
  provenance: GraphSessionArtifact;
};

export type GraphExtractionOutput = {
  keywords: Array<{ keyword: string; noteIndices: number[] }>;
};

function parseJsonOrNull(value: unknown): unknown | null {
  if (typeof value !== "string") {
    return value ?? null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function coerceFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function deriveTranscriptProvenance(
  words: unknown,
  speakerHints: unknown,
  startedAt: unknown,
  endedAt: unknown,
): Pick<
  GraphSessionArtifact,
  "hasTimestamps" | "hasSpeakerMetadata" | "startedAt" | "endedAt"
> {
  const parsedWords = parseJsonOrNull(words);
  const parsedHints = parseJsonOrNull(speakerHints);

  let hasWordTimestamps = false;
  if (Array.isArray(parsedWords)) {
    hasWordTimestamps = parsedWords.some((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const record = entry as Record<string, unknown>;
      return (
        coerceFiniteNumber(record.start_ms) !== null ||
        coerceFiniteNumber(record.end_ms) !== null
      );
    });
  }

  const startedAtValue = coerceFiniteNumber(startedAt);
  const endedAtValue = coerceFiniteNumber(endedAt);

  const hasSpeakerMetadata =
    Array.isArray(parsedHints) &&
    parsedHints.some((hint) => hint && typeof hint === "object");

  return {
    hasTimestamps:
      hasWordTimestamps || startedAtValue !== null || endedAtValue !== null,
    hasSpeakerMetadata,
    startedAt: startedAtValue,
    endedAt: endedAtValue,
  };
}

export function collectSessionArtifact(
  store: main.Store,
  sessionId: string,
  rawMd: unknown,
): SessionGraphArtifact | null {
  const parts: string[] = [];

  let hasSummary = false;
  let hasTranscript = false;
  let hasTimestamps = false;
  let hasSpeakerMetadata = false;
  let startedAt: number | null = null;
  let endedAt: number | null = null;

  try {
    const noteText = extractPlainText(rawMd);
    if (noteText) parts.push(noteText);
  } catch {
    // skip malformed raw_md
  }

  try {
    const enhancedText = extractPlainText(
      collectEnhancedNotesContent(store, sessionId),
    );
    if (enhancedText) {
      hasSummary = true;
      parts.push(enhancedText);
    }
  } catch {
    // skip malformed enhanced notes
  }

  try {
    const transcriptIds = store.getRowIds("transcripts").filter((id) => {
      return store.getCell("transcripts", id, "session_id") === sessionId;
    });

    hasTranscript = transcriptIds.length > 0;

    for (const tid of transcriptIds) {
      const words = store.getCell("transcripts", tid, "words");
      const text = flattenTranscript(words);
      if (text) parts.push(text);

      const transcriptProvenance = deriveTranscriptProvenance(
        words,
        store.getCell("transcripts", tid, "speaker_hints"),
        store.getCell("transcripts", tid, "started_at"),
        store.getCell("transcripts", tid, "ended_at"),
      );

      hasTimestamps ||= transcriptProvenance.hasTimestamps;
      hasSpeakerMetadata ||= transcriptProvenance.hasSpeakerMetadata;

      if (transcriptProvenance.startedAt !== null) {
        startedAt =
          startedAt === null
            ? transcriptProvenance.startedAt
            : Math.min(startedAt, transcriptProvenance.startedAt);
      }

      if (transcriptProvenance.endedAt !== null) {
        endedAt =
          endedAt === null
            ? transcriptProvenance.endedAt
            : Math.max(endedAt, transcriptProvenance.endedAt);
      }
    }
  } catch {
    // skip transcript errors
  }

  const text = parts.join(" ").trim();
  if (!text) {
    return null;
  }

  return {
    id: sessionId,
    text,
    provenance: {
      hasSummary,
      hasTranscript,
      hasTimestamps,
      hasSpeakerMetadata,
      startedAt,
      endedAt,
    },
  };
}

export function buildPrompt(sessionArtifacts: SessionGraphArtifact[]): string {
  const notes = sessionArtifacts
    .slice(0, MAX_NOTES_PER_BATCH)
    .map((artifact, i) => {
      const sources = [
        artifact.provenance.hasSummary ? "summary" : null,
        artifact.provenance.hasTranscript ? "transcript" : null,
      ]
        .filter((value): value is string => Boolean(value))
        .join("+");

      return [
        `[Note ${i}]`,
        `sources=${sources || "raw"}`,
        `timestamps=${artifact.provenance.hasTimestamps ? "yes" : "no"}`,
        `speakerMetadata=${artifact.provenance.hasSpeakerMetadata ? "yes" : "no"}`,
        artifact.text.slice(0, MAX_TEXT_PER_NOTE),
      ].join("\n");
    })
    .join("\n\n---\n\n");

  return notes;
}

export function buildGraphFromLLMOutput(
  output: GraphExtractionOutput,
  sessionArtifacts: SessionGraphArtifact[],
): GraphData {
  const capped = sessionArtifacts.slice(0, MAX_NOTES_PER_BATCH);
  const artifactBySessionId = new Map(
    capped.map((artifact) => [artifact.id, artifact.provenance]),
  );
  const nodeMap = new Map<string, { noteIds: Set<string> }>();

  for (const kw of output.keywords.slice(0, MAX_GRAPH_NODES)) {
    const keyword = kw.keyword.toLowerCase().trim();
    if (!keyword) continue;

    let noteIds: Set<string>;
    if (capped.length === 1) {
      noteIds = new Set([capped[0].id]);
    } else {
      noteIds = new Set(
        kw.noteIndices
          .filter((i) => i >= 0 && i < capped.length)
          .map((i) => capped[i].id),
      );
      if (noteIds.size === 0 && capped.length > 0) {
        noteIds = new Set([capped[0].id]);
      }
    }

    if (noteIds.size === 0) continue;

    const existing = nodeMap.get(keyword);
    if (existing) {
      for (const id of noteIds) existing.noteIds.add(id);
    } else {
      nodeMap.set(keyword, { noteIds });
    }
  }

  const nodes: GraphNode[] = Array.from(nodeMap.entries()).map(
    ([keyword, data]) => {
      const noteIds = Array.from(data.noteIds);
      const sessionArtifactsMap = Object.fromEntries(
        noteIds
          .map((noteId) => {
            const artifact = artifactBySessionId.get(noteId);
            return artifact ? [noteId, artifact] : null;
          })
          .filter(
            (
              entry,
            ): entry is [string, GraphSessionArtifact] => entry !== null,
          ),
      );

      return {
        id: keyword,
        label: keyword,
        frequency: data.noteIds.size,
        noteIds,
        sessionArtifacts: sessionArtifactsMap,
      };
    },
  );

  const edgeMap = new Map<string, number>();
  const nodeList = Array.from(nodeMap.entries());

  for (let i = 0; i < nodeList.length; i++) {
    for (let j = i + 1; j < nodeList.length; j++) {
      const [a, dataA] = nodeList[i];
      const [b, dataB] = nodeList[j];
      let shared = 0;
      for (const id of dataA.noteIds) {
        if (dataB.noteIds.has(id)) shared++;
      }
      if (shared > 0) {
        const key = a < b ? `${a}::${b}` : `${b}::${a}`;
        edgeMap.set(key, shared);
      }
    }
  }

  const edges: GraphEdge[] = Array.from(edgeMap.entries())
    .map(([key, weight]) => {
      const [source, target] = key.split("::");
      return { source, target, weight };
    })
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_EDGES);

  return { nodes, edges };
}
