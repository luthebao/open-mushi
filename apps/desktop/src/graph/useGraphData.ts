import { useCallback, useEffect, useRef, useState } from "react";
import { generateText, type LanguageModel, Output } from "ai";
import { z } from "zod";
import { sep } from "@tauri-apps/api/path";

import { useLanguageModel } from "~/ai/hooks";
import {
  extractPlainText,
  flattenTranscript,
} from "~/search/contexts/engine/utils";
import { collectEnhancedNotesContent } from "~/store/tinybase/store/utils";
import * as main from "~/store/tinybase/store/main";
import { commands as fs2Commands } from "@openmushi/plugin-fs2";
import { commands as settingsCommands } from "@openmushi/plugin-settings";

import {
  MAX_EDGES,
  MAX_GRAPH_NODES,
  type GraphData,
  type GraphEdge,
  type GraphNode,
  type GraphScope,
} from "./types";

const EMPTY: GraphData = { nodes: [], edges: [] };

const MAX_TEXT_PER_NOTE = 1000;
const MAX_NOTES_PER_BATCH = 20;
const LLM_TIMEOUT_MS = 120_000;
const STRUCTURED_ATTEMPT_MS = 15_000;

const graphExtractionSchema = z.object({
  keywords: z.array(
    z.object({
      keyword: z.string(),
      noteIndices: z.array(z.number()),
    }),
  ),
});

function scopeKey(scope: GraphScope): string {
  switch (scope.scope) {
    case "all":
      return "graph-all";
    case "workspace":
      return `graph-workspace-${scope.workspaceId}`;
    case "note":
      return `graph-note-${scope.sessionId}`;
  }
}

async function saveGraphData(scope: GraphScope, data: GraphData): Promise<void> {
  try {
    const baseResult = await settingsCommands.vaultBase();
    if (baseResult.status === "error") return;
    const path = [baseResult.data, "graphs", `${scopeKey(scope)}.json`].join(sep());
    await fs2Commands.writeTextFile(path, JSON.stringify(data));
  } catch (e) {
    console.warn("[Graph] Failed to save graph data:", e);
  }
}

async function loadGraphData(scope: GraphScope): Promise<GraphData | null> {
  try {
    const baseResult = await settingsCommands.vaultBase();
    if (baseResult.status === "error") return null;
    const path = [baseResult.data, "graphs", `${scopeKey(scope)}.json`].join(sep());
    const result = await fs2Commands.readTextFile(path);
    if (result.status === "error") return null;
    return JSON.parse(result.data) as GraphData;
  } catch {
    return null;
  }
}

function collectSessionText(
  store: main.Store,
  sessionId: string,
  rawMd: unknown,
): string {
  const parts: string[] = [];

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
    if (enhancedText) parts.push(enhancedText);
  } catch {
    // skip malformed enhanced notes
  }

  try {
    const transcriptIds = store.getRowIds("transcripts").filter((id) => {
      return store.getCell("transcripts", id, "session_id") === sessionId;
    });
    for (const tid of transcriptIds) {
      const words = store.getCell("transcripts", tid, "words");
      const text = flattenTranscript(words);
      if (text) parts.push(text);
    }
  } catch {
    // skip transcript errors
  }

  return parts.join(" ");
}

function buildPrompt(
  sessionTexts: { id: string; text: string }[],
): string {
  const notes = sessionTexts
    .slice(0, MAX_NOTES_PER_BATCH)
    .map(
      (s, i) =>
        `[Note ${i}]:\n${s.text.slice(0, MAX_TEXT_PER_NOTE)}`,
    )
    .join("\n\n---\n\n");

  return notes;
}

const SYSTEM_PROMPT = `You extract knowledge graph nodes from meeting notes. Output raw JSON only — no thinking, no explanation, no markdown fences.

Output format: {"keywords":[{"keyword":"topic","noteIndices":[0,1]}]}

Extraction guidelines:
- Extract up to ${MAX_GRAPH_NODES} keywords, ordered by importance
- Focus on: people names, organizations, projects, technical concepts, decisions made, action items, domain-specific terms
- Use canonical forms: "machine learning" not "ML", "John Smith" not "john"
- Each keyword should be 1-3 words — specific enough to be meaningful
- Merge synonyms into one keyword (e.g. "customer churn" and "user attrition" → pick one)
- noteIndices: array of note indices where the keyword appears or is discussed
- Prefer keywords that connect multiple notes — these create the most useful graph edges
- Exclude generic words: "meeting", "discussion", "update", "notes", "today", "team"

Your output MUST start with { and end with }`;



async function extractWithLLM(
  model: LanguageModel,
  prompt: string,
  signal: AbortSignal,
): Promise<z.infer<typeof graphExtractionSchema>> {
  // Try structured output with a short timeout — many local models don't support it well
  try {
    const structuredController = new AbortController();
    const structuredTimeout = setTimeout(() => structuredController.abort(), STRUCTURED_ATTEMPT_MS);

    // Abort the structured attempt if the parent signal fires
    const onParentAbort = () => structuredController.abort();
    signal.addEventListener("abort", onParentAbort, { once: true });

    try {
      const result = await generateText({
        model,
        system: SYSTEM_PROMPT,
        temperature: 0,
        maxOutputTokens: 4096,
        output: Output.object({ schema: graphExtractionSchema }),
        abortSignal: structuredController.signal,
        prompt,
      });
      if (result.output) {
        return result.output as z.infer<typeof graphExtractionSchema>;
      }
    } finally {
      clearTimeout(structuredTimeout);
      signal.removeEventListener("abort", onParentAbort);
    }
  } catch (e) {
    // Re-throw if the parent signal (overall timeout) aborted
    if (signal.aborted) throw e;
    console.warn("[Graph] Structured output failed/timed out, trying fallback:", e);
  }

  // Fallback: plain text generation + JSON extraction
  const fallback = await generateText({
    model,
    system: SYSTEM_PROMPT,
    temperature: 0,
    maxOutputTokens: 4096,
    abortSignal: signal,
    prompt,
  });

  // Clean the response text: strip thinking blocks, code fences, then extract JSON
  // Search text first, only fall back to reasoning field if needed
  const reasoningVal = (fallback as any).reasoning;
  const candidates = [
    fallback.text,
    typeof reasoningVal === "string" ? reasoningVal : undefined,
  ].filter((s): s is string => typeof s === "string" && s.length > 0);

  for (const raw of candidates) {
    let cleaned = raw
      .replace(/<think>[\s\S]*?<\/think>/gi, "")  // strip thinking blocks
      .replace(/```(?:json)?\s*/gi, "")             // strip opening code fences
      .replace(/```/g, "")                          // strip closing code fences
      .trim();

    // Cut to the first { to skip any untagged reasoning/preamble
    const braceIdx = cleaned.indexOf("{");
    if (braceIdx === -1) continue;
    cleaned = cleaned.slice(braceIdx);

    const jsonMatch = cleaned.match(/\{\s*"keywords"\s*:[\s\S]*\}/);
    if (!jsonMatch) continue;

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return graphExtractionSchema.parse(parsed);
    } catch {
      // try next candidate
    }
  }

  throw new Error(
    "LLM did not return valid JSON. Response: " +
      fallback.text.slice(0, 200),
  );
}

function buildGraphFromLLMOutput(
  output: z.infer<typeof graphExtractionSchema>,
  sessionTexts: { id: string; text: string }[],
): GraphData {
  const capped = sessionTexts.slice(0, MAX_NOTES_PER_BATCH);
  const nodeMap = new Map<string, { noteIds: Set<string> }>();

  for (const kw of output.keywords.slice(0, MAX_GRAPH_NODES)) {
    const keyword = kw.keyword.toLowerCase().trim();
    if (!keyword) continue;

    let noteIds: Set<string>;
    if (capped.length === 1) {
      // Single note: all keywords belong to it
      noteIds = new Set([capped[0].id]);
    } else {
      noteIds = new Set(
        kw.noteIndices
          .filter((i) => i >= 0 && i < capped.length)
          .map((i) => capped[i].id),
      );
      // If LLM returned no valid indices, assign to first note as fallback
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
    ([keyword, data]) => ({
      id: keyword,
      label: keyword,
      frequency: data.noteIds.size,
      noteIds: Array.from(data.noteIds),
    }),
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

export type GraphDataState = {
  data: GraphData;
  loading: boolean;
  error: string | null;
  progress: string;
  modelReady: boolean;
  generate: () => void;
};

export function useGraphData(scope: GraphScope): GraphDataState {
  const sessionsTable = main.UI.useTable("sessions", main.STORE_ID);
  const allRowIds = main.UI.useRowIds("sessions", main.STORE_ID);
  const store = main.UI.useStore(main.STORE_ID);
  const model = useLanguageModel();

  main.UI.useTable("transcripts", main.STORE_ID);
  main.UI.useTable("enhanced_notes", main.STORE_ID);

  const workspaceSliceRowIds = main.UI.useSliceRowIds(
    main.INDEXES.sessionsByWorkspace,
    scope.scope === "workspace" ? scope.workspaceId : "",
    main.STORE_ID,
  );

  const [data, setData] = useState<GraphData>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  // Auto-load cached graph data on mount / scope change
  const currentScopeKey = scopeKey(scope);
  useEffect(() => {
    loadGraphData(scope).then((cached) => {
      if (cached && cached.nodes.length > 0) {
        setData(cached);
      }
    });
  }, [currentScopeKey]);

  const generate = useCallback(async () => {
    if (!store) {
      setError("Store not ready");
      return;
    }
    if (!model) {
      setError(
        "No LLM configured. Go to Settings → AI to set up a provider.",
      );
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Set up timeout
    const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

    let sessionIds: string[];
    switch (scope.scope) {
      case "all":
        sessionIds = allRowIds;
        break;
      case "workspace":
        sessionIds = workspaceSliceRowIds;
        break;
      case "note":
        sessionIds = [scope.sessionId];
        break;
    }

    if (sessionIds.length === 0) {
      setData(EMPTY);
      setError("No notes found. Create some notes first.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setProgress("Collecting notes...");

    try {
      const sessionTexts: { id: string; text: string }[] = [];
      for (const sessionId of sessionIds) {
        const row = sessionsTable[sessionId];
        if (!row) continue;
        const text = collectSessionText(
          store as main.Store,
          sessionId,
          row.raw_md,
        );
        if (text.trim()) {
          sessionTexts.push({ id: sessionId, text });
        }
      }

      console.log(
        `[Graph] Found ${sessionIds.length} sessions, ${sessionTexts.length} with text content`,
      );

      if (sessionTexts.length === 0) {
        setData(EMPTY);
        setError(
          `Found ${sessionIds.length} notes but none have text content. Add some content to your notes first.`,
        );
        setLoading(false);
        setProgress("");
        return;
      }

      const prompt = buildPrompt(sessionTexts);

      setProgress(`Sending to AI (${sessionTexts.length} notes)...`);

      console.log(
        `[Graph] Sending ${sessionTexts.length} notes to LLM for keyword extraction`,
      );

      const output = await extractWithLLM(model, prompt, controller.signal);

      if (controller.signal.aborted) return;

      console.log(
        `[Graph] LLM extracted ${output.keywords.length} keywords`,
      );

      if (output.keywords.length === 0) {
        setError("No keywords found in your notes.");
        setData(EMPTY);
        setLoading(false);
        setProgress("");
        return;
      }

      setProgress("Building graph...");

      const graphData = buildGraphFromLLMOutput(output, sessionTexts);

      if (controller.signal.aborted) return;
      setData(graphData);
      setError(null);

      // Persist to disk
      await saveGraphData(scope, graphData);
    } catch (e) {
      if (controller.signal.aborted) {
        // Check if it was a timeout
        setError("Generation timed out. Try again or use a faster model.");
        setLoading(false);
        setProgress("");
        return;
      }
      console.error("[Graph] Generation failed:", e);
      setError(e instanceof Error ? e.message : "Failed to generate graph");
      setData(EMPTY);
    } finally {
      clearTimeout(timeoutId);
      if (!controller.signal.aborted) {
        setLoading(false);
        setProgress("");
      }
    }
  }, [scope, sessionsTable, allRowIds, workspaceSliceRowIds, store, model]);

  return { data, loading, error, progress, modelReady: !!model, generate };
}
