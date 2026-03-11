import { describe, expect, it } from "vitest";

async function loadModule() {
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

  return import("./useGraphData");
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
