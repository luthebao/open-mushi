# StenoAI Recording Integration Plan (Open Mushi)

Date: 2026-03-11
Owner: Open Mushi core
Reference repo studied: <https://github.com/ruzin/stenoai>

## Goal

Adopt proven recording and processing patterns from StenoAI, then adapt them to Open Mushi's Tauri v2 + Rust actor architecture without regressing local-first privacy or current plugin boundaries.

## What StenoAI Does Well (Recording Path)

1. Mixed capture path for virtual meetings.

- Captures loopback/system audio and microphone, then mixes both streams before writing output.
- Keeps a single persisted artifact per session for downstream transcription.

1. Explicit processing queue.

- Queues post-recording work to avoid concurrent heavy jobs (transcription + summarization overlap).
- Protects UX from resource contention and race conditions.

1. Strong lifecycle state handling.

- Distinguishes UI recording state from backend recording state.
- Has recovery paths for stale state and interrupted recording sessions.

1. Practical preflight and diagnostics.

- Verifies dependencies and permissions, then reports issues early.
- Includes clear debug logs and lightweight health checks.

1. Format normalization before STT.

- Converts captured audio to STT-friendly format (sample rate/channels) before transcription.

## Open Mushi Mapping

Open Mushi already has stronger long-term architecture (Rust crates/plugins, actor model, local STT plugin), so we should copy patterns, not implementation details.

### Existing Open Mushi strengths to preserve

- Rust-native audio pipeline (`crates/audio`, `crates/listener-core`, `crates/vad*`, `plugins/listener`).
- Local STT plugin pathway (`plugins/local-stt`, sherpa-onnx).
- Workspace/session model and persisted store design.

### Gaps where StenoAI patterns help

- Unified "mixed capture" control surface for loopback + mic session capture behavior.
- Centralized processing queue contract across STT and LLM stages.
- Startup and runtime reconciliation when UI and recorder state diverge.
- Operator-grade diagnostics for permissions, devices, and throughput.

## Proposed Design Updates

## 1) Recording Session State Machine (Required)

Introduce a strict state machine in Rust (listener/root supervisor boundary):

- `Idle`
- `Starting`
- `Recording`
- `Stopping`
- `QueuedForSTT`
- `Transcribing`
- `QueuedForLLM`
- `Summarizing`
- `Completed`
- `Failed`

Rules:

- Disallow second start while `Starting|Recording|Stopping`.
- Persist state transitions to DB so app restart can recover safely.
- UI must subscribe to backend state as source of truth.

## 2) Single Consumer Processing Queue (Required)

Create a queue at the supervisor/plugin boundary:

- Enqueue completed recording jobs with metadata (session id, audio path, capture mode, timestamps).
- Process STT jobs serially by default (configurable parallelism later).
- Only enqueue LLM work after STT success; retry policy with capped backoff.

Rationale:

- Prevent model/device thrashing under back-to-back meetings.
- Keep deterministic ordering and easier recovery.

## 3) Capture Mode Contract (Required)

Add explicit capture mode metadata:

- `mic_only`
- `system_only`
- `mixed_system_mic`

For `mixed_system_mic`:

- Persist channel/source provenance in metadata even if final waveform is mixed.
- Track device ids and sample formats used for reproducibility.

## 4) Audio Normalization Stage (Required)

Before STT submission, normalize audio into a canonical format expected by sherpa path:

- target sample rate
- channel strategy
- consistent container/codec for deterministic decode

Store both:

- raw capture artifact
- normalized artifact path + transform metadata

## 5) Reconciliation + Recovery (Required)

On startup:

- Reconcile active sessions with process reality.
- If capture is no longer active but session is marked recording, transition to `Failed` with reason `abrupt_exit`.
- If audio artifact exists and is complete, auto-enqueue for STT.

At runtime:

- Expose `clear_stale_recording_state` admin/debug command.
- Keep idempotent stop behavior.

## 6) Preflight + Diagnostics (High Value)

Add a `listener preflight` command/API:

- permission checks (mic/system audio)
- input/output device availability
- write-path validation
- model availability checks for STT/LLM pipeline

Add structured debug stream:

- capture start/stop reasons
- queue depth and job latency
- STT/LLM stage timings and failures

## 7) UX Adjustments (Incremental)

- Show immediate "Queued" status when stop is pressed.
- Show active stage (`Transcribing`, `Summarizing`) and queue position.
- Show clear remediation text for permission/device failures.

## Implementation Targets in Open Mushi

Likely touchpoints:

- `crates/listener-core` (state machine + queue hooks)
- `crates/audio` and related capture crates (capture mode metadata + normalization handoff)
- `plugins/listener` and `plugins/local-stt` (commands/events for queue + status)
- Desktop frontend session/transcript store slices (status display and recovery UX)

## Rollout Plan

1. Land state machine + persisted transitions.
2. Add serial processing queue with metrics.
3. Add normalization stage and metadata persistence.
4. Implement startup reconciliation + stale-state cleanup command.
5. Add preflight endpoint and UI diagnostics.
6. Iterate on queue/stage UX.

## Acceptance Criteria

- No duplicate concurrent recording sessions from UI races.
- No concurrent STT+LLM processing for the same queue worker unless explicitly configured.
- Safe restart: interrupted recording sessions are reconciled deterministically.
- Every processed session has traceable capture metadata and stage timings.
- Users can identify and resolve permission/device failures without logs.

## Notes

- This plan intentionally adapts behavior patterns from StenoAI and does not copy source code.
- Open Mushi should keep Rust-native capture and transcription pipeline as the implementation baseline.

## Implementation Status

- 2026-03-11: Initial scaffold landed in `crates/listener-core` and `plugins/listener`.
- Added `RecordingState` + `RecordingStatus` public types.
- Added root-level serial processing queue skeleton with lifecycle transitions.
- Upgraded queue to async staged processing messages (`TranscriptionFinished`, `SummarizationFinished`) with strict single-consumer semantics.
- Added `get_recording_status` command and `SessionRecordingEvent` emission path.
- Added `clear_stale_recording_state` command and root-level queue reset handling.
- Queue now runs real STT jobs via runtime hook (`run_stt_job`) using local-stt batch Sherpa.
- Desktop listener Zustand slice now subscribes to `sessionRecordingEvent` and tracks queue/stage state from backend.
- Queue now runs real LLM jobs via runtime hook (`run_llm_job`) by ensuring local-llm server and calling `/v1/chat/completions`.
- Track B Milestone 3 complete: LLM job now builds a transcript-aware prompt from persisted transcript artifacts (including speaker and timestamp formatting when present), errors deterministically when transcript content is unavailable/empty, and persists generated summary output through fs-db enhanced note wiring (`_summary.md`).
- Added `preflight` listener command/API to check microphone availability, STT models directory accessibility, Sherpa default model availability, and local LLM default model availability.
- Added structured `recording_diagnostic` event emission for queue/dequeue diagnostics and STT/LLM stage completion/failure reporting.
- Track A UI refit (Milestone 4): session header is now recording-first with backend-driven recording status chip + prominent listen control; timeline rows were densified for steno-style scanning; summary-first defaulting now prefers enhanced notes when available while preserving transcript view continuity.
