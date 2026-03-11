import { beforeEach, describe, expect, test, vi } from "vitest";

const listenerEventUnlisteners = [
  vi.fn(),
  vi.fn(),
  vi.fn(),
  vi.fn(),
  vi.fn(),
];

const lifecycleListeners: Array<(event: { payload: unknown }) => void> = [];
const listenerRecordingListeners: Array<
  (event: { payload: unknown }) => void
> = [];

let preflightResult: { status: "ok"; data: { ok: boolean; checks: unknown[] } } | {
  status: "error";
  error: string;
} = {
  status: "ok",
  data: { ok: true, checks: [] },
};

vi.mock("@tauri-apps/api/app", () => ({
  getIdentifier: vi.fn().mockResolvedValue("com.openmushi.test"),
}));

vi.mock("@openmushi/plugin-settings", () => ({
  commands: {
    vaultBase: vi.fn().mockResolvedValue({ status: "ok", data: "/tmp" }),
  },
}));

vi.mock("@openmushi/plugin-detect", () => ({
  commands: {
    listMicUsingApplications: vi
      .fn()
      .mockResolvedValue({ status: "ok", data: [] }),
  },
}));

vi.mock("@openmushi/plugin-hooks", () => ({
  commands: {
    runEventHooks: vi.fn().mockResolvedValue({ status: "ok", data: null }),
  },
}));

vi.mock("@openmushi/plugin-icon", () => ({
  commands: {
    setRecordingIndicator: vi.fn().mockResolvedValue({ status: "ok", data: null }),
  },
}));

vi.mock("@openmushi/plugin-listener", () => ({
  commands: {
    startSession: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    stopSession: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    preflight: vi.fn().mockImplementation(async () => preflightResult),
    getRecordingStatus: vi.fn().mockResolvedValue({
      status: "ok",
      data: {
        state: "idle",
        queueDepth: 0,
        activeSessionId: null,
        currentJobSessionId: null,
        lastError: null,
      },
    }),
    setMicMuted: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    clearStaleRecordingState: vi.fn().mockResolvedValue({ status: "ok", data: null }),
  },
  events: {
    sessionLifecycleEvent: {
      listen: vi.fn().mockImplementation(async (handler) => {
        lifecycleListeners.push(handler);
        return listenerEventUnlisteners[0];
      }),
    },
    sessionProgressEvent: {
      listen: vi.fn().mockImplementation(async () => listenerEventUnlisteners[1]),
    },
    sessionErrorEvent: {
      listen: vi.fn().mockImplementation(async () => listenerEventUnlisteners[2]),
    },
    sessionDataEvent: {
      listen: vi.fn().mockImplementation(async () => listenerEventUnlisteners[3]),
    },
    sessionRecordingEvent: {
      listen: vi.fn().mockImplementation(async (handler) => {
        listenerRecordingListeners.push(handler);
        return listenerEventUnlisteners[4];
      }),
    },
  },
  __mock: {
    emitRecordingEvent: (payload: unknown) => {
      const handler = listenerRecordingListeners[0];
      if (handler) {
        handler({ payload });
      }
    },
  },
}));

import { createListenerStore } from ".";

let store: ReturnType<typeof createListenerStore>;

describe("General Listener Slice", () => {
  beforeEach(async () => {
    preflightResult = {
      status: "ok",
      data: { ok: true, checks: [] },
    };
    listenerEventUnlisteners.forEach((fn) => fn.mockClear());
    lifecycleListeners.length = 0;
    listenerRecordingListeners.length = 0;

    const listenerPlugin = await import("@openmushi/plugin-listener");
    vi.mocked(listenerPlugin.commands.startSession).mockResolvedValue({
      status: "ok",
      data: null,
    });

    store = createListenerStore();
  });

  describe("Initial State", () => {
    test("initializes with correct default values", () => {
      const state = store.getState();
      expect(state.live.status).toBe("inactive");
      expect(state.live.loading).toBe(false);
      expect(state.live.amplitude).toEqual({ mic: 0, speaker: 0 });
      expect(state.live.seconds).toBe(0);
      expect(state.live.eventUnlisteners).toBeUndefined();
      expect(state.live.intervalId).toBeUndefined();
      expect(state.batch).toEqual({});
    });
  });

  describe("Amplitude Updates", () => {
    test("amplitude state is initialized to zero", () => {
      const state = store.getState();
      expect(state.live.amplitude).toEqual({ mic: 0, speaker: 0 });
    });
  });

  describe("Session Mode Helpers", () => {
    test("getSessionMode defaults to inactive", () => {
      const state = store.getState();
      expect(state.getSessionMode("session-123")).toBe("inactive");
    });

    test("getSessionMode returns running_batch when session is in batch", () => {
      const sessionId = "session-456";
      const { handleBatchResponseStreamed, getSessionMode } = store.getState();

      const mockResponse = {
        type: "Results" as const,
        start: 0,
        duration: 5,
        is_final: false,
        speech_final: false,
        from_finalize: false,
        channel: {
          alternatives: [
            {
              transcript: "test",
              words: [],
              confidence: 0.9,
            },
          ],
        },
        metadata: {
          request_id: "test-request",
          model_info: {
            name: "test-model",
            version: "1.0",
            arch: "test-arch",
          },
          model_uuid: "test-uuid",
        },
        channel_index: [0],
      };

      handleBatchResponseStreamed(sessionId, mockResponse, 0.5);
      expect(getSessionMode(sessionId)).toBe("running_batch");
    });
  });

  describe("Batch State", () => {
    test("handleBatchResponseStreamed tracks progress per session", () => {
      const sessionId = "session-progress";
      const { handleBatchResponseStreamed, clearBatchSession } =
        store.getState();

      const mockResponse = {
        type: "Results" as const,
        start: 0,
        duration: 5,
        is_final: false,
        speech_final: false,
        from_finalize: false,
        channel: {
          alternatives: [
            {
              transcript: "test",
              words: [],
              confidence: 0.9,
            },
          ],
        },
        metadata: {
          request_id: "test-request",
          model_info: {
            name: "test-model",
            version: "1.0",
            arch: "test-arch",
          },
          model_uuid: "test-uuid",
        },
        channel_index: [0],
      };

      handleBatchResponseStreamed(sessionId, mockResponse, 0.5);
      expect(store.getState().batch[sessionId]).toEqual({
        percentage: 0.5,
        isComplete: false,
        phase: "transcribing",
      });

      clearBatchSession(sessionId);
      expect(store.getState().batch[sessionId]).toBeUndefined();
    });
  });

  describe("Stop Action", () => {
    test("stop action exists and is callable", () => {
      const stop = store.getState().stop;
      expect(typeof stop).toBe("function");
    });
  });

  describe("Stale Recording Recovery", () => {
    test("treats completed to idle normalization as successful clear", async () => {
      const listenerPlugin = await import("@openmushi/plugin-listener");
      vi.mocked(listenerPlugin.commands.getRecordingStatus)
        .mockResolvedValueOnce({
          status: "ok",
          data: {
            state: "completed",
            queueDepth: 0,
            activeSessionId: "session-completed",
            currentJobSessionId: null,
            lastError: null,
          },
        })
        .mockResolvedValueOnce({
          status: "ok",
          data: {
            state: "idle",
            queueDepth: 0,
            activeSessionId: null,
            currentJobSessionId: null,
            lastError: null,
          },
        });

      const recovered = await store.getState().clearStaleRecordingState();

      expect(recovered).toBe(true);
      expect(store.getState().live.recording.state).toBe("idle");
    });
  });

  describe("Start Action", () => {
    test("start action exists and is callable", () => {
      const start = store.getState().start;
      expect(typeof start).toBe("function");
    });

    test("does not set live active when backend rejects start", async () => {
      const listenerPlugin = await import("@openmushi/plugin-listener");
      vi.mocked(listenerPlugin.commands.startSession).mockResolvedValueOnce({
        status: "error",
        error: "start session failed",
      });

      store.getState().start({
        session_id: "session-start-rejected",
        languages: ["en"],
        onboarding: false,
        record_enabled: true,
        model: "sherpa-whisper-small",
        base_url: "sherpa://local",
        api_key: "",
        keywords: [],
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      const state = store.getState();
      expect(state.live.status).toBe("inactive");
      expect(state.live.loading).toBe(false);
      expect(state.live.sessionId).toBeNull();
      expect(state.live.eventUnlisteners).toBeUndefined();
      expect(state.live.lastError).toContain("start session failed");
    });

    test("records durable lastCompletedSessionId from recording completion event", async () => {
      const listenerPlugin = await import("@openmushi/plugin-listener");
      const emitRecordingEvent = (listenerPlugin as unknown as {
        __mock: { emitRecordingEvent: (payload: unknown) => void };
      }).__mock.emitRecordingEvent;

      store.getState().start({
        session_id: "session-completion-marker",
        languages: ["en"],
        onboarding: false,
        record_enabled: true,
        model: "sherpa-whisper-small",
        base_url: "sherpa://local",
        api_key: "",
        keywords: [],
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      emitRecordingEvent({
        type: "recording_state_changed",
        state: "completed",
        session_id: "session-completion-marker",
        queue_depth: 0,
        current_job_session_id: null,
        reason: null,
      });

      expect(store.getState().live.recording.lastCompletedSessionId).toBe(
        "session-completion-marker",
      );
    });

    test("clears interval when inactive lifecycle arrives", async () => {
      const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");

      store.getState().start({
        session_id: "session-inactive-interval-cleanup",
        languages: ["en"],
        onboarding: false,
        record_enabled: true,
        model: "sherpa-whisper-small",
        base_url: "sherpa://local",
        api_key: "",
        keywords: [],
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      const intervalId = setInterval(() => {}, 1000);
      store.setState((state) => ({
        ...state,
        live: {
          ...state.live,
          intervalId,
          sessionId: "session-inactive-interval-cleanup",
        },
      }));

      const lifecycleHandler = lifecycleListeners[0];
      expect(lifecycleHandler).toBeDefined();

      lifecycleHandler?.({
        payload: {
          type: "inactive",
          session_id: "session-inactive-interval-cleanup",
          error: null,
        },
      });

      expect(clearIntervalSpy).toHaveBeenCalledWith(intervalId);
      expect(store.getState().live.intervalId).toBeUndefined();

      clearIntervalSpy.mockRestore();
    });

    test("cleans up event listeners when preflight command errors", async () => {
      preflightResult = { status: "error", error: "boom" };

      store.getState().start({
        session_id: "session-preflight-error",
        languages: ["en"],
        onboarding: false,
        record_enabled: true,
        model: "sherpa-whisper-small",
        base_url: "sherpa://local",
        api_key: "",
        keywords: [],
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      listenerEventUnlisteners.forEach((fn) => {
        expect(fn).toHaveBeenCalledTimes(1);
      });
      expect(store.getState().live.eventUnlisteners).toBeUndefined();
    });

    test("cleans up event listeners when preflight returns not ok", async () => {
      preflightResult = {
        status: "ok",
        data: {
          ok: false,
          checks: [
            { key: "microphone", status: "error", message: "missing microphone" },
          ],
        },
      };

      store.getState().start({
        session_id: "session-preflight-not-ok",
        languages: ["en"],
        onboarding: false,
        record_enabled: true,
        model: "sherpa-whisper-small",
        base_url: "sherpa://local",
        api_key: "",
        keywords: [],
      });

      await new Promise((resolve) => setTimeout(resolve, 0));

      listenerEventUnlisteners.forEach((fn) => {
        expect(fn).toHaveBeenCalledTimes(1);
      });
      expect(store.getState().live.eventUnlisteners).toBeUndefined();
    });
  });
});
