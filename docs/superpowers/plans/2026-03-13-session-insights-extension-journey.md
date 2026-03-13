# Session Insights Extension Journey Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a session-first, graph-first “Generate insights” flow backed by a day-1 extension registry, then reveal post-graph extensions to increase repeat usage and reduce drop-off.

**Architecture:** Implement a session insights orchestrator state machine (`idle -> eligible -> generating_graph -> graph_ready -> extensions_suggested`) that enforces a single primary CTA until graph generation completes. Register Graph/Flashcards/Homework/Report in a shared extension contract, run Graph first by default, persist extension artifacts, and emit required KPI telemetry events. Keep existing recording/transcript controls stable and non-blocking.

**Tech Stack:** React 19, TypeScript, Zustand, TinyBase, TanStack Query, Vitest + Testing Library.

---

## File Structure and Responsibilities

### New files

- `apps/desktop/src/session/insights/types.ts`
  - Insights phases, error envelope, registry contract, extension run result, artifact DTOs.
- `apps/desktop/src/session/insights/eligibility.ts`
  - Pure eligibility derivation for showing primary CTA.
- `apps/desktop/src/session/insights/state.ts`
  - Orchestrator reducer + run helpers + telemetry dispatch wrappers.
- `apps/desktop/src/session/insights/registry.ts`
  - In-memory extension registry, discover/rank helpers.
- `apps/desktop/src/session/insights/extensions/graph.ts`
  - Graph adapter implementing registry contract.
- `apps/desktop/src/session/insights/extensions/flashcards.ts`
- `apps/desktop/src/session/insights/extensions/homework.ts`
- `apps/desktop/src/session/insights/extensions/report.ts`
  - Stub built-ins (registry-complete, non-implemented run path where needed).
- `apps/desktop/src/session/insights/components/GenerateInsightsCta.tsx`
  - Primary CTA UI with loading/error/retry states.
- `apps/desktop/src/session/insights/components/ExtensionRail.tsx`
  - Top 3 extension cards + More entry after graph readiness.
- `apps/desktop/src/session/insights/components/ExtensionCard.tsx`
- `apps/desktop/src/session/insights/components/ExtensionDetailsPanel.tsx`
- `apps/desktop/src/session/insights/index.ts`
- `apps/desktop/src/session/insights/state.test.ts`
- `apps/desktop/src/session/insights/eligibility.test.ts`
- `apps/desktop/src/session/insights/registry.test.ts`
- `apps/desktop/src/session/insights/integration.test.tsx`
- `apps/desktop/src/store/tinybase/store/main.test.ts`
  - Dedicated tests for `extension_artifacts` schema/index wiring.

### Modified files

- `packages/store/src/zod.ts`
  - Add `extensionArtifactSchema`.
- `packages/store/src/tinybase.ts`
  - Add `extension_artifacts` TinyBase table schema.
- `apps/desktop/src/store/tinybase/store/main.ts`
  - Add indexes for artifacts by session and extension.
- `apps/desktop/src/session/index.tsx`
  - Mount CTA + rail in session content.
- `apps/desktop/src/session/components/note-input/header.tsx`
  - Gate/de-emphasize competing post-meeting actions before `graph_ready`.
- `apps/desktop/src/graph/useGraphData.ts`
  - Expose reusable graph trigger/open integration for adapter.
- `apps/desktop/src/graph/useGraphData.test.ts`
- `apps/desktop/src/session/components/outer-header/index.test.tsx`
  - Verify header composition does not violate single primary CTA.

---

## Chunk 1: Day-1 Registry Contract + Orchestrator Core

### Task 1: Define insights contract types and required metadata

**Files:**

- Create: `apps/desktop/src/session/insights/types.ts`
- Test: `apps/desktop/src/session/insights/state.test.ts`

- [ ] **Step 1: Write failing test for required contract fields**

```ts
import { describe, expect, it } from "vitest";
import { hasRequiredExtensionContractFields } from "./types";

describe("SessionExtensionDefinition contract", () => {
  it("requires day-1 metadata and behaviors", () => {
    expect(
      hasRequiredExtensionContractFields({
        id: "graph",
        title: "Knowledge Graph",
        description: "...",
        icon: "network",
        capabilities: ["graph"],
        inputRequirements: ["transcript"],
        canRun: () => true,
        run: async () => ({ status: "succeeded", extensionId: "graph" }),
        openResult: () => {},
      }),
    ).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify fail**

Run: `pnpm -F @openmushi/desktop test -- src/session/insights/state.test.ts`
Expected: FAIL module/contract not found.

- [ ] **Step 3: Implement minimal types**

```ts
export type SessionExtensionDefinition = {
  id: string;
  title: string;
  description: string;
  icon: string;
  capabilities: string[];
  inputRequirements: Array<"transcript" | "graph" | "notes">;
  canRun: (ctx: ExtensionContext) => boolean;
  run: (ctx: ExtensionContext) => Promise<ExtensionRunResult>;
  openResult: (result: ExtensionRunResult) => void;
};
```

- [ ] **Step 4: Re-run test to verify pass**

Run: `pnpm -F @openmushi/desktop test -- src/session/insights/state.test.ts`
Expected: PASS

- [ ] **Step 5: Mark task complete in this plan checklist (no git commands in this repository)**

---

### Task 2: Implement eligibility derivation

**Files:**

- Create: `apps/desktop/src/session/insights/eligibility.ts`
- Create: `apps/desktop/src/session/insights/eligibility.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
it("eligible only when transcript ready and session inactive", () => {
  expect(deriveInsightEligibility({ hasTranscript: true, transcriptWordCount: 200, sessionMode: "inactive" }).eligible).toBe(true);
  expect(deriveInsightEligibility({ hasTranscript: true, transcriptWordCount: 200, sessionMode: "active" }).eligible).toBe(false);
});
```

- [ ] **Step 2: Run failing test**

Run: `pnpm -F @openmushi/desktop test -- src/session/insights/eligibility.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement minimal function**

```ts
export function deriveInsightEligibility(...) { ... }
```

- [ ] **Step 4: Re-run tests**

Run: `pnpm -F @openmushi/desktop test -- src/session/insights/eligibility.test.ts`
Expected: PASS

- [ ] **Step 5: Mark task complete in checklist**

---

### Task 3: Implement orchestrator reducer

**Files:**

- Create: `apps/desktop/src/session/insights/state.ts`
- Modify: `apps/desktop/src/session/insights/state.test.ts`

- [ ] **Step 1: Write failing transition tests**

```ts
it("eligible -> generating_graph -> graph_ready -> extensions_suggested", () => { ... });
it("generation_failed returns to eligible with error envelope", () => { ... });
```

- [ ] **Step 2: Run failing tests**

Run: `pnpm -F @openmushi/desktop test -- src/session/insights/state.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement reducer + event types**

```ts
export function reduceInsightState(state, event) { ... }
```

- [ ] **Step 4: Re-run tests**

Run: `pnpm -F @openmushi/desktop test -- src/session/insights/state.test.ts`
Expected: PASS

- [ ] **Step 5: Mark task complete in checklist**

---

### Task 4: Add registry + ranking helpers

**Files:**

- Create: `apps/desktop/src/session/insights/registry.ts`
- Create: `apps/desktop/src/session/insights/registry.test.ts`
- Modify: `apps/desktop/src/session/insights/types.ts`

- [ ] **Step 1: Write failing tests for registration/ranking + metadata completeness**

```ts
it("registers built-ins and keeps graph metadata complete", () => { ... });
it("ranks runnable extensions above blocked", () => { ... });
```

- [ ] **Step 2: Run failing tests**

Run: `pnpm -F @openmushi/desktop test -- src/session/insights/registry.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement minimal registry helpers**

```ts
registerSessionExtension(...)
listSessionExtensions()
rankExtensions(...)
```

- [ ] **Step 4: Re-run tests**

Run: `pnpm -F @openmushi/desktop test -- src/session/insights/registry.test.ts`
Expected: PASS

- [ ] **Step 5: Mark task complete in checklist**

---

## Chunk 2: Graph Adapter + Artifact Persistence

### Task 5: Add extension_artifacts table and indexes

**Files:**

- Modify: `packages/store/src/zod.ts`
- Modify: `packages/store/src/tinybase.ts`
- Modify: `apps/desktop/src/store/tinybase/store/main.ts`
- Create: `apps/desktop/src/store/tinybase/store/main.test.ts`

- [ ] **Step 1: Write failing dedicated schema/index tests**

```ts
it("defines extension_artifacts table", () => { ... });
it("defines indexes extensionArtifactsBySession and extensionArtifactsByExtension", () => { ... });
```

- [ ] **Step 2: Run failing tests**

Run: `pnpm -F @openmushi/desktop test -- src/store/tinybase/store/main.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement schema changes**

Add `extensionArtifactSchema` and `extension_artifacts` table mapping.

- [ ] **Step 4: Implement index wiring and re-run tests**

Run: `pnpm -F @openmushi/desktop test -- src/store/tinybase/store/main.test.ts`
Expected: PASS

- [ ] **Step 5: Mark task complete in checklist**

---

### Task 6: Add graph extension adapter

**Files:**

- Create: `apps/desktop/src/session/insights/extensions/graph.ts`
- Modify: `apps/desktop/src/graph/useGraphData.ts`
- Modify: `apps/desktop/src/graph/useGraphData.test.ts`

- [ ] **Step 1: Write failing adapter tests**

```ts
it("graph canRun requires transcript", () => { ... });
it("graph run returns succeeded artifact ref", async () => { ... });
```

- [ ] **Step 2: Run failing tests**

Run: `pnpm -F @openmushi/desktop test -- src/graph/useGraphData.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement graph adapter using existing generation/open behavior**

Graph remains first/default extension path.

- [ ] **Step 4: Re-run tests**

Run: `pnpm -F @openmushi/desktop test -- src/graph/useGraphData.test.ts`
Expected: PASS

- [ ] **Step 5: Mark task complete in checklist**

---

### Task 7: Persist started/succeeded/failed artifact rows per run

**Files:**

- Modify: `apps/desktop/src/session/insights/state.ts`
- Modify: `apps/desktop/src/session/insights/extensions/graph.ts`
- Modify: `apps/desktop/src/session/insights/state.test.ts`

- [ ] **Step 1: Write failing persistence lifecycle tests**

```ts
it("writes started then succeeded artifacts for graph", async () => { ... });
it("writes failed artifact with error code", async () => { ... });
```

- [ ] **Step 2: Run failing tests**

Run: `pnpm -F @openmushi/desktop test -- src/session/insights/state.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement persistence helper and integrate into run path**

- [ ] **Step 4: Re-run tests**

Run: `pnpm -F @openmushi/desktop test -- src/session/insights/state.test.ts`
Expected: PASS

- [ ] **Step 5: Mark task complete in checklist**

---

## Chunk 3: Session UI Flow (Single CTA, Then Rail)

### Task 8: Build primary Generate Insights CTA

**Files:**

- Create: `apps/desktop/src/session/insights/components/GenerateInsightsCta.tsx`
- Modify: `apps/desktop/src/session/index.tsx`
- Modify: `apps/desktop/src/session/components/note-input/header.tsx`
- Modify: `apps/desktop/src/session/components/outer-header/index.test.tsx`

- [ ] **Step 1: Write failing UI tests**

```tsx
it("shows Generate insights when eligible", () => { ... });
it("shows loading + retry states", () => { ... });
it("hides/de-emphasizes competing post-meeting actions before graph_ready", () => { ... });
```

- [ ] **Step 2: Run failing tests**

Run: `pnpm -F @openmushi/desktop test -- src/session/components/outer-header/index.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement CTA component and gating logic**

Before `graph_ready`, only one primary post-meeting action is visible.

- [ ] **Step 4: Re-run tests**

Run: `pnpm -F @openmushi/desktop test -- src/session/components/outer-header/index.test.tsx`
Expected: PASS

- [ ] **Step 5: Mark task complete in checklist**

---

### Task 9: Build extension rail + details panel (post-graph only)

**Files:**

- Create: `apps/desktop/src/session/insights/components/ExtensionRail.tsx`
- Create: `apps/desktop/src/session/insights/components/ExtensionCard.tsx`
- Create: `apps/desktop/src/session/insights/components/ExtensionDetailsPanel.tsx`
- Modify: `apps/desktop/src/session/index.tsx`
- Modify: `apps/desktop/src/session/insights/registry.ts`

- [ ] **Step 1: Write failing rail tests**

```tsx
it("renders rail only at graph_ready/extensions_suggested", () => { ... });
it("shows top 3 cards and More", () => { ... });
```

- [ ] **Step 2: Run failing tests**

Run: `pnpm -F @openmushi/desktop test -- src/session/insights/integration.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement rail/card/details with ranking + compatibility gating**

- [ ] **Step 4: Re-run tests**

Run: `pnpm -F @openmushi/desktop test -- src/session/insights/integration.test.tsx`
Expected: PASS

- [ ] **Step 5: Mark task complete in checklist**

---

### Task 10: Register Graph/Flashcards/Homework/Report built-ins

**Files:**

- Modify: `apps/desktop/src/session/insights/registry.ts`
- Create: `apps/desktop/src/session/insights/extensions/flashcards.ts`
- Create: `apps/desktop/src/session/insights/extensions/homework.ts`
- Create: `apps/desktop/src/session/insights/extensions/report.ts`
- Modify: `apps/desktop/src/session/insights/registry.test.ts`

- [ ] **Step 1: Write failing discoverability + contract tests**

```ts
it("includes graph, flashcards, homework, report", () => { ... });
it("all built-ins expose icon/capabilities/inputRequirements", () => { ... });
```

- [ ] **Step 2: Run failing tests**

Run: `pnpm -F @openmushi/desktop test -- src/session/insights/registry.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement built-ins**

Graph is runnable. Others can initially return non-retryable `not_implemented` while preserving registry completeness.

- [ ] **Step 4: Re-run tests**

Run: `pnpm -F @openmushi/desktop test -- src/session/insights/registry.test.ts`
Expected: PASS

- [ ] **Step 5: Mark task complete in checklist**

---

## Chunk 4: Telemetry, Errors, and Integration Hardening

### Task 11: Emit required KPI telemetry events

**Files:**

- Modify: `apps/desktop/src/session/insights/state.ts`
- Modify: `apps/desktop/src/session/insights/components/GenerateInsightsCta.tsx`
- Modify: `apps/desktop/src/session/insights/state.test.ts`

- [ ] **Step 1: Write failing telemetry sequence tests**

```ts
it("emits required events in funnel", async () => {
  // assert ordered emissions:
  // insight_eligible -> insight_cta_clicked -> graph_generation_started -> graph_generation_succeeded
});
```

- [ ] **Step 2: Run failing tests**

Run: `pnpm -F @openmushi/desktop test -- src/session/insights/state.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement exact event emissions**

Required event names (exact):

- `insight_eligible`
- `insight_cta_clicked`
- `graph_generation_started`
- `graph_generation_succeeded`
- `graph_generation_failed`
- `extension_run_started`
- `extension_run_succeeded`

Payload includes: `session_id`, `extension_id` (when applicable), `phase`, `error_code` (on failures).

- [ ] **Step 4: Re-run tests**

Run: `pnpm -F @openmushi/desktop test -- src/session/insights/state.test.ts`
Expected: PASS

- [ ] **Step 5: Mark task complete in checklist**

---

### Task 12: Standardize retryable/non-retryable error UX

**Files:**

- Modify: `apps/desktop/src/session/insights/types.ts`
- Modify: `apps/desktop/src/session/insights/state.ts`
- Modify: `apps/desktop/src/session/insights/components/GenerateInsightsCta.tsx`
- Modify: `apps/desktop/src/session/insights/components/ExtensionDetailsPanel.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
it("shows Retry for retryable timeout", () => { ... });
it("shows Configure action for missing_model non-retryable", () => { ... });
```

- [ ] **Step 2: Run failing tests**

Run: `pnpm -F @openmushi/desktop test -- src/session/insights/state.test.ts`
Expected: FAIL

- [ ] **Step 3: Implement error mapping envelope**

Map errors into `{ code, userMessage, retryable, debugMeta }` used by CTA and rail details.

- [ ] **Step 4: Re-run tests**

Run: `pnpm -F @openmushi/desktop test -- src/session/insights/state.test.ts`
Expected: PASS

- [ ] **Step 5: Mark task complete in checklist**

---

### Task 13: Add integration tests for full session funnel

**Files:**

- Create: `apps/desktop/src/session/insights/integration.test.tsx`
- Modify: `apps/desktop/src/session/index.tsx`
- Modify: `apps/desktop/src/session/components/outer-header/index.test.tsx`

- [ ] **Step 1: Write failing integration tests**

```tsx
it("eligible session shows single CTA; click generates graph then reveals rail", async () => { ... });
it("extension failure does not block transcript/raw editing", async () => { ... });
```

- [ ] **Step 2: Run failing tests**

Run: `pnpm -F @openmushi/desktop test -- src/session/insights/integration.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement integration glue**

- [ ] **Step 4: Re-run tests**

Run: `pnpm -F @openmushi/desktop test -- src/session/insights/integration.test.tsx`
Expected: PASS

- [ ] **Step 5: Mark task complete in checklist**

---

## Chunk 5: Verification Before Completion

### Task 14: Run full verification and finalize plan execution handoff

**Files:**

- Modify (if needed): files from previous tasks only

- [ ] **Step 1: Run focused insights/graph tests**

Run:

- `pnpm -F @openmushi/desktop test -- src/session/insights/state.test.ts`
- `pnpm -F @openmushi/desktop test -- src/session/insights/eligibility.test.ts`
- `pnpm -F @openmushi/desktop test -- src/session/insights/registry.test.ts`
- `pnpm -F @openmushi/desktop test -- src/session/insights/integration.test.tsx`
- `pnpm -F @openmushi/desktop test -- src/graph/useGraphData.test.ts`
- `pnpm -F @openmushi/desktop test -- src/store/tinybase/store/main.test.ts`

Expected: PASS all.

- [ ] **Step 2: Run type/lint checks**

Run:

- `pnpm turbo typecheck --filter=@openmushi/desktop --filter=@openmushi/store`
- `pnpm lint`

Expected: PASS.

- [ ] **Step 3: Manual UX validation**

Run: `pnpm turbo tauri:dev --filter=@openmushi/desktop`

Verify:

- Single primary CTA appears when eligible.
- First run is graph generation.
- Rail appears only after graph success.
- Errors show retry/configure actions.
- Recording/transcript controls still behave as before.

- [ ] **Step 4: Final verification complete; update checklist statuses only (no git commands)**

- [ ] **Step 5: Request code review**

Use @superpowers:requesting-code-review after all checks pass.

---

## Notes for Implementers

- Repository rule: do not run git commands here.
- Preserve the single-decision UX: no competing post-meeting primary CTA before `graph_ready`.
- Keep registry day-1 complete even if non-graph built-ins are initially stubs.
- Keep telemetry event names exact to match KPI instrumentation.
