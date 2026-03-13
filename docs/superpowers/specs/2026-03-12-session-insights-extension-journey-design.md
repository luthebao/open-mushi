# Session Insights Extension Journey — Design Spec

Date: 2026-03-12
Status: Draft (User-approved design)
Owner: Product/UX brainstorming output

## 1) Problem Statement

The current journey from recording/transcript to graph is too hard. Users face friction in finding and continuing into graph and follow-up outcomes. The graph is only one extension among upcoming ones (homework, flashcards, reports), so the flow must reduce confusion now and scale to more extensions without redesigning the session UI each time.

## 2) Goals and Non-Goals

### Goals

- Reduce confusion/drop-off in post-recording flow.
- Increase repeat usage of extensions in a session.
- Keep session page as the primary interaction surface.
- Establish a plugin/skill registry model for extension scalability.

### Non-Goals

- Implementing full personalization/ranking in v1.
- Reworking global navigation architecture.
- Replacing existing graph generation logic end-to-end.

## 3) Chosen Product Direction

Selected approach: **Session CTA + Plugin Registry + Progressive Reveal**.

### Core UX sequence

1. Transcript becomes eligible.
2. Session shows one clear CTA: **Generate insights**.
3. First click runs **Graph** by default.
4. On graph success, reveal extension rail (Flashcards, Homework, Report, etc.) using registry metadata and compatibility.

Principle: single decision at a time (first value first, then expansion).

## 4) Architecture

### 4.1 Session Insights Orchestrator (state machine)

Session-level orchestrator manages a strict state flow:

- `idle`
- `eligible`
- `generating_graph`
- `graph_ready`
- `extensions_suggested`

Only one primary CTA is emphasized per state.

### 4.2 Extension Plugin Registry

Introduce a frontend registry contract for built-ins and future plugins.

Required metadata:

- `id`
- `title`
- `description`
- `icon`
- `capabilities`
- `inputRequirements`

Required behaviors:

- `canRun(context)`
- `run(context)`
- `openResult(artifactRef)`

### 4.3 Two-layer interaction model

- **Layer A (Primary CTA):** session-level “Generate insights” (graph-first).
- **Layer B (Extension Rail):** post-graph cards/chips for next actions.

## 5) UI/UX Components

### 5.1 Session Header CTA Block

States:

- Default: actionable CTA
- Generating: progress/spinner + disabled duplicate trigger
- Success: confirmation + reveal extension rail
- Error: inline retry + clear message

### 5.2 Post-Graph Extension Rail

Displayed in session content area after graph readiness.
Each card shows:

- extension name
- short outcome description
- estimated effort
- recent/last-used signal

Show top 3 recommendations; provide “More” for full extension list.

### 5.3 Extension Detail Panel (lightweight)

On card click, show:

- required inputs
- output destination
- readiness/blockers

Preserve session context; avoid forced navigation except when opening result.

### 5.4 Result Routing

Consistent navigation contract:

- Graph → activate/open graph tab
- Other extensions → open standardized output destination with return affordance to session

## 6) Data Flow and Artifact Model

### 6.1 Eligibility

`insightEligible` is derived from transcript readiness + minimum content threshold.

### 6.2 Primary execution flow

1. User clicks CTA.
2. Orchestrator invokes graph plugin via registry.
3. Graph output persisted as artifact.
4. State transitions to `graph_ready` and extension rail appears.

### 6.3 Chained extension flow

Plugins declare accepted input artifact types (`transcript`, `graph`, `notes`, etc.).
Rail prioritizes plugins compatible with available artifacts.

### 6.4 Artifact index

Store extension outputs in a common artifact index keyed by:

- session id
- plugin id
- artifact type
- timestamps/status

Enables repeat usage, resume, and cross-plugin chaining.

## 7) Error Handling

Standardized plugin error envelope:

- `code`
- `userMessage`
- `retryable`
- `debugMeta`

UX behavior:

- Retryable → inline retry on CTA/card.
- Non-retryable → clear corrective action (e.g., missing model/config/input).
- Extension failures must not block core session editing.

## 8) Testing Strategy

### Unit

- Orchestrator state transitions.
- Registry gating and ranking logic.
- Plugin contract adherence (`canRun/run/openResult`).

### Integration

- Transcript complete → CTA visible.
- CTA → graph artifact generation.
- Graph artifact → extension rail availability.
- Failure paths preserve session usability.

## 9) KPI Instrumentation

Primary KPIs (user-selected priorities):

- **Lower confusion/drop-off**
  - Eligible sessions with no insight action within **10 minutes** of `insightEligible=true`.
  - Graph starts marked as abandoned if no `graph_ready` within **5 minutes** and no retry within **15 minutes**.
- **Higher repeat usage**
  - Sessions with 2+ extension runs.
  - Avg extension runs per eligible session.
  - Return usage window (e.g., 7-day repeat by extension type).

Required analytics events:

- `insight_eligible`
- `insight_cta_clicked`
- `graph_generation_started`
- `graph_generation_succeeded`
- `graph_generation_failed`
- `extension_run_started`
- `extension_run_succeeded`

## 10) Incremental Rollout

The plugin/skill registry contract is a **Day-1 dependency** and must exist before first release of this journey.

### Phase 1

- Session orchestrator + graph-first CTA implemented via plugin/skill registry + telemetry.

### Phase 2

- Extension rail UI driven by existing registry entries (graph/flashcards/homework/report).

### Phase 3

- Ranking improvements and personalization rules.

## 11) Implementation Notes (Codebase Fit)

- Keep session as UX anchor (`apps/desktop/src/session/*`).
- Reuse existing graph tab flow (`apps/desktop/src/graph/*`) via standardized `openResult`.
- Align state with existing Zustand patterns (`apps/desktop/src/store/zustand/*`).
- Keep architecture extensible without introducing unrelated subsystem rewrites.
