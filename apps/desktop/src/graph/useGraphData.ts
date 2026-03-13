import { useCallback, useEffect, useRef, useState } from "react";
import { generateText, type LanguageModel, Output } from "ai";
import { z } from "zod";
import { sep } from "@tauri-apps/api/path";

import { useLanguageModel } from "~/ai/hooks";
import * as main from "~/store/tinybase/store/main";
import { commands as fs2Commands } from "@openmushi/plugin-fs2";
import { commands as settingsCommands } from "@openmushi/plugin-settings";

import {
  buildGraphFromLLMOutput,
  buildPrompt,
  collectSessionArtifact,
  type SessionGraphArtifact,
} from "./artifacts";
import { MAX_GRAPH_NODES, type GraphData, type GraphScope } from "./types";
import { useListener } from "~/stt/contexts";
import type { GraphTabInput } from "~/store/zustand/tabs";

const EMPTY: GraphData = { nodes: [], edges: [] };

export function resolveScopedCacheData(cached: GraphData | null): GraphData {
  if (!cached || cached.nodes.length === 0) {
    return EMPTY;
  }

  return cached;
}

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
    const writeResult = await fs2Commands.writeTextFile(path, JSON.stringify(data));
    if (writeResult.status === "error") {
      throw writeResult;
    }
  } catch (e) {
    console.warn("[Graph] Failed to save graph data:", e);
  }
}

async function loadGraphDataByScopeKey(
  currentScopeKey: string,
): Promise<GraphData | null> {
  try {
    const baseResult = await settingsCommands.vaultBase();
    if (baseResult.status === "error") return null;
    const path = [baseResult.data, "graphs", `${currentScopeKey}.json`].join(sep());
    const result = await fs2Commands.readTextFile(path);
    if (result.status === "error") return null;
    return JSON.parse(result.data) as GraphData;
  } catch {
    return null;
  }
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

export type GraphDataState = {
  data: GraphData;
  loading: boolean;
  error: string | null;
  progress: string;
  modelReady: boolean;
  generate: () => void;
};

export type GraphOpenTarget = GraphTabInput;

export type GraphRunResult = {
  tabType: "graph";
  scope: GraphScope;
};

export function createGraphOpenTarget(
  sessionId: string,
): GraphOpenTarget & GraphRunResult {
  return {
    type: "graph",
    tabType: "graph",
    scope: {
      scope: "note",
      sessionId,
    },
  };
}

type GenerateAbortCause = "superseded" | "timeout";

function scopeIncludesSession(
  scope: GraphScope,
  sessionId: string,
  workspaceSessionIds: string[],
): boolean {
  if (scope.scope === "all") {
    return true;
  }
  if (scope.scope === "workspace") {
    return workspaceSessionIds.includes(sessionId);
  }
  return scope.sessionId === sessionId;
}

export function resolveAbortMessage(cause: GenerateAbortCause | undefined): string | null {
  if (cause === "timeout") {
    return "Generation timed out. Try again or use a faster model.";
  }
  return null;
}

export function abortInFlightGeneration(params: {
  abortRef: { current: AbortController | null };
  activeRunIdRef: { current: number };
}): void {
  const { abortRef, activeRunIdRef } = params;
  const controller = abortRef.current;

  if (controller) {
    controller.abort();
    abortRef.current = null;
  }

  activeRunIdRef.current += 1;
}

export function resetTransientGenerationState(params: {
  setLoading: (loading: boolean) => void;
  setProgress: (progress: string) => void;
}): void {
  const { setLoading, setProgress } = params;
  setLoading(false);
  setProgress("");
}

export function abortInFlightGenerationForScopeChange(params: {
  abortRef: { current: AbortController | null };
  activeRunIdRef: { current: number };
  setLoading: (loading: boolean) => void;
  setProgress: (progress: string) => void;
}): void {
  const { abortRef, activeRunIdRef, setLoading, setProgress } = params;
  abortInFlightGeneration({ abortRef, activeRunIdRef });
  resetTransientGenerationState({ setLoading, setProgress });
}

export function shouldAutoAttemptCompletedSession(params: {
  completedSessionId: string | null;
  attemptedSessionId: string | null;
  inScope: boolean;
  loading: boolean;
  alreadyRepresented: boolean;
}): boolean {
  const {
    completedSessionId,
    attemptedSessionId,
    inScope,
    loading,
    alreadyRepresented,
  } = params;

  if (!completedSessionId) return false;
  if (!inScope) return false;
  if (loading) return false;
  if (alreadyRepresented) return false;
  if (attemptedSessionId === completedSessionId) return false;

  return true;
}

export function useGraphData(scope: GraphScope): GraphDataState {
  const sessionsTable = main.UI.useTable("sessions", main.STORE_ID);
  const allRowIds = main.UI.useRowIds("sessions", main.STORE_ID);
  const store = main.UI.useStore(main.STORE_ID);
  const model = useLanguageModel();
  const recording = useListener((state) => state.live.recording);

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
  const [autoAttemptedCompletedSessionId, setAutoAttemptedCompletedSessionId] =
    useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const activeRunIdRef = useRef(0);
  const loadVersionRef = useRef(0);

  // Auto-load cached graph data on mount / scope change
  const currentScopeKey = scopeKey(scope);
  useEffect(() => {
    const loadVersion = ++loadVersionRef.current;
    let cancelled = false;

    abortInFlightGenerationForScopeChange({
      abortRef,
      activeRunIdRef,
      setLoading,
      setProgress,
    });

    void loadGraphDataByScopeKey(currentScopeKey).then((cached) => {
      if (cancelled || loadVersion !== loadVersionRef.current) {
        return;
      }

      setData(resolveScopedCacheData(cached));
    });

    return () => {
      cancelled = true;
      abortInFlightGenerationForScopeChange({
        abortRef,
        activeRunIdRef,
        setLoading,
        setProgress,
      });
    };
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

    const previousController = abortRef.current;
    if (previousController) {
      previousController.abort();
    }

    const runId = activeRunIdRef.current + 1;
    activeRunIdRef.current = runId;

    const controller = new AbortController();
    abortRef.current = controller;

    let abortCause: GenerateAbortCause | undefined;
    const timeoutId = setTimeout(() => {
      abortCause = "timeout";
      controller.abort();
    }, LLM_TIMEOUT_MS);

    const isCurrentRun = () =>
      activeRunIdRef.current === runId && abortRef.current === controller;

    try {
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
        if (!isCurrentRun()) return;
        setData(EMPTY);
        setError("No notes found. Create some notes first.");
        return;
      }

      if (!isCurrentRun()) return;
      setLoading(true);
      setError(null);
      setProgress("Collecting notes...");

      const sessionArtifacts: SessionGraphArtifact[] = [];
      for (const sessionId of sessionIds) {
        const row = sessionsTable[sessionId];
        if (!row) continue;
        const artifact = collectSessionArtifact(
          store as main.Store,
          sessionId,
          row.raw_md,
        );
        if (artifact) {
          sessionArtifacts.push(artifact);
        }
      }

      console.log(
        `[Graph] Found ${sessionIds.length} sessions, ${sessionArtifacts.length} with text content`,
      );

      if (sessionArtifacts.length === 0) {
        if (!isCurrentRun()) return;
        setData(EMPTY);
        setError(
          `Found ${sessionIds.length} notes but none have text content. Add some content to your notes first.`,
        );
        return;
      }

      const prompt = buildPrompt(sessionArtifacts);

      if (!isCurrentRun()) return;
      setProgress(`Sending to AI (${sessionArtifacts.length} notes)...`);

      console.log(
        `[Graph] Sending ${sessionArtifacts.length} notes to LLM for keyword extraction`,
      );

      const output = await extractWithLLM(model, prompt, controller.signal);

      if (!isCurrentRun() || controller.signal.aborted) return;

      console.log(
        `[Graph] LLM extracted ${output.keywords.length} keywords`,
      );

      if (output.keywords.length === 0) {
        if (!isCurrentRun()) return;
        setError("No keywords found in your notes.");
        setData(EMPTY);
        return;
      }

      if (!isCurrentRun()) return;
      setProgress("Building graph...");

      const graphData = buildGraphFromLLMOutput(output, sessionArtifacts);

      if (!isCurrentRun() || controller.signal.aborted) return;
      setData(graphData);
      setError(null);

      await saveGraphData(scope, graphData);
    } catch (e) {
      if (!isCurrentRun()) {
        return;
      }

      if (controller.signal.aborted) {
        const message = resolveAbortMessage(abortCause);
        if (message) {
          setError(message);
        }
        return;
      }

      console.error("[Graph] Generation failed:", e);
      setError(e instanceof Error ? e.message : "Failed to generate graph");
      setData(EMPTY);
    } finally {
      clearTimeout(timeoutId);
      if (isCurrentRun()) {
        setLoading(false);
        setProgress("");
      }
    }
  }, [scope, sessionsTable, allRowIds, workspaceSliceRowIds, store, model]);

  const completedSessionId = recording.lastCompletedSessionId;

  const inScope =
    completedSessionId !== null
      ? scopeIncludesSession(scope, completedSessionId, workspaceSliceRowIds)
      : false;

  const alreadyRepresented =
    completedSessionId !== null
      ? data.nodes.some((node) => node.noteIds.includes(completedSessionId))
      : false;

  const shouldAutoGenerate = shouldAutoAttemptCompletedSession({
    completedSessionId,
    attemptedSessionId: autoAttemptedCompletedSessionId,
    inScope,
    loading,
    alreadyRepresented,
  });

  useEffect(() => {
    if (!shouldAutoGenerate || !completedSessionId) {
      return;
    }

    setAutoAttemptedCompletedSessionId(completedSessionId);
    void generate();
  }, [shouldAutoGenerate, completedSessionId, generate]);

  useEffect(() => {
    if (
      completedSessionId &&
      autoAttemptedCompletedSessionId !== completedSessionId
    ) {
      setAutoAttemptedCompletedSessionId(null);
    }
  }, [completedSessionId, autoAttemptedCompletedSessionId]);

  return { data, loading, error, progress, modelReady: !!model, generate };
}
