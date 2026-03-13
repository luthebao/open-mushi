import { describe, expect, it } from "vitest";

function ensureWindowStub() {
  const currentWindow = (globalThis as { window?: unknown }).window;
  if (
    !currentWindow ||
    typeof (currentWindow as { addEventListener?: unknown }).addEventListener !==
      "function"
  ) {
    (globalThis as any).window = {
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  }
}

async function loadModule() {
  ensureWindowStub();
  return import("./useGraphData");
}

async function loadGraphAdapter() {
  ensureWindowStub();
  return import("~/session/insights/extensions/graph");
}

describe("resolveAbortMessage", () => {
  it("returns timeout message only for timeout abort cause", async () => {
    const { resolveAbortMessage } = await loadModule();

    expect(resolveAbortMessage("timeout")).toBe(
      "Generation timed out. Try again or use a faster model.",
    );
    expect(resolveAbortMessage("superseded")).toBeNull();
    expect(resolveAbortMessage(undefined)).toBeNull();
  });
});

describe("abortInFlightGeneration", () => {
  it("aborts active controller, clears ref, and bumps run id", async () => {
    const { abortInFlightGeneration } = await loadModule();

    const controller = new AbortController();
    const abortRef = { current: controller };
    const activeRunIdRef = { current: 3 };

    abortInFlightGeneration({ abortRef, activeRunIdRef });

    expect(controller.signal.aborted).toBe(true);
    expect(abortRef.current).toBeNull();
    expect(activeRunIdRef.current).toBe(4);
  });

  it("still bumps run id when there is no active controller", async () => {
    const { abortInFlightGeneration } = await loadModule();

    const abortRef = { current: null as AbortController | null };
    const activeRunIdRef = { current: 7 };

    abortInFlightGeneration({ abortRef, activeRunIdRef });

    expect(abortRef.current).toBeNull();
    expect(activeRunIdRef.current).toBe(8);
  });

  it("resets loading/progress on scope-change abort", async () => {
    const { abortInFlightGenerationForScopeChange } = await loadModule();

    const controller = new AbortController();
    const abortRef = { current: controller };
    const activeRunIdRef = { current: 10 };

    let loading = true;
    let progress = "Sending to AI...";

    abortInFlightGenerationForScopeChange({
      abortRef,
      activeRunIdRef,
      setLoading: (next) => {
        loading = next;
      },
      setProgress: (next) => {
        progress = next;
      },
    });

    expect(controller.signal.aborted).toBe(true);
    expect(abortRef.current).toBeNull();
    expect(activeRunIdRef.current).toBe(11);
    expect(loading).toBe(false);
    expect(progress).toBe("");
  });
});

describe("resolveScopedCacheData", () => {
  it("resets to empty graph when cache is missing or empty", async () => {
    const { resolveScopedCacheData } = await loadModule();

    expect(resolveScopedCacheData(null)).toEqual({ nodes: [], edges: [] });
    expect(resolveScopedCacheData({ nodes: [], edges: [{ source: "a", target: "b", weight: 1 }] })).toEqual({
      nodes: [],
      edges: [],
    });
  });

  it("keeps cached data when cache has nodes", async () => {
    const { resolveScopedCacheData } = await loadModule();

    const cached = {
      nodes: [{ id: "n1", label: "n1", frequency: 1, noteIds: ["s1"] }],
      edges: [],
    };

    expect(resolveScopedCacheData(cached)).toEqual(cached);
  });
});

describe("shouldAutoAttemptCompletedSession", () => {
  it("allows first auto-attempt for completed in-scope session", async () => {
    const { shouldAutoAttemptCompletedSession } = await loadModule();

    expect(
      shouldAutoAttemptCompletedSession({
        completedSessionId: "session-1",
        attemptedSessionId: null,
        inScope: true,
        loading: false,
        alreadyRepresented: false,
      }),
    ).toBe(true);
  });

  it("blocks retry loop for same completed session id", async () => {
    const { shouldAutoAttemptCompletedSession } = await loadModule();

    expect(
      shouldAutoAttemptCompletedSession({
        completedSessionId: "session-1",
        attemptedSessionId: "session-1",
        inScope: true,
        loading: false,
        alreadyRepresented: false,
      }),
    ).toBe(false);
  });

  it("allows new completed session id after previous auto-attempt", async () => {
    const { shouldAutoAttemptCompletedSession } = await loadModule();

    expect(
      shouldAutoAttemptCompletedSession({
        completedSessionId: "session-2",
        attemptedSessionId: "session-1",
        inScope: true,
        loading: false,
        alreadyRepresented: false,
      }),
    ).toBe(true);
  });

  it("blocks when completed marker is missing", async () => {
    const { shouldAutoAttemptCompletedSession } = await loadModule();

    expect(
      shouldAutoAttemptCompletedSession({
        completedSessionId: null,
        attemptedSessionId: null,
        inScope: true,
        loading: false,
        alreadyRepresented: false,
      }),
    ).toBe(false);
  });

  it("blocks when out of scope, loading, or already represented", async () => {
    const { shouldAutoAttemptCompletedSession } = await loadModule();

    expect(
      shouldAutoAttemptCompletedSession({
        completedSessionId: "session-1",
        attemptedSessionId: null,
        inScope: false,
        loading: false,
        alreadyRepresented: false,
      }),
    ).toBe(false);

    expect(
      shouldAutoAttemptCompletedSession({
        completedSessionId: "session-1",
        attemptedSessionId: null,
        inScope: true,
        loading: true,
        alreadyRepresented: false,
      }),
    ).toBe(false);

    expect(
      shouldAutoAttemptCompletedSession({
        completedSessionId: "session-1",
        attemptedSessionId: null,
        inScope: true,
        loading: false,
        alreadyRepresented: true,
      }),
    ).toBe(false);
  });
});

describe("graph extension adapter", () => {
  it("graph canRun requires transcript", async () => {
    const { graphExtension } = await loadGraphAdapter();

    expect(graphExtension.canRun({ sessionId: "session-1" })).toBe(true);
    expect(graphExtension.canRun({})).toBe(false);
  });

  it("graph run returns succeeded artifact ref", async () => {
    const { graphExtension } = await loadGraphAdapter();

    const result = await graphExtension.run({ sessionId: "session-1" });

    expect(result).toEqual({
      status: "succeeded",
      extensionId: "graph",
      artifactRef: "graph:session-1",
      result: {
        type: "graph",
        tabType: "graph",
        scope: {
          scope: "note",
          sessionId: "session-1",
        },
      },
    });
  });
});
