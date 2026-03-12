# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Rules (must follow)

- Never use any git commands in this repository.
- Always use GitHub MCP (not guessed URLs) when reading GitHub repo links.
- Treat `docs/plans/` as the source of truth for implementation sequencing and design decisions.
- For significant feature/design changes, update the relevant plan/design docs with rationale.

## What this codebase is

Open Mushi is a **Tauri v2 desktop app** with:
- Rust backend/plugin runtime (`apps/desktop/src-tauri` + `crates/*` + `plugins/*`)
- React 19 frontend (`apps/desktop/src`)
- Local-first meeting pipeline (audio capture → STT → transcript/chat/graph)

Monorepo tooling:
- pnpm workspaces (`apps/*`, `packages/*`, `plugins/*`)
- Cargo workspace (`apps/desktop/src-tauri`, `crates/*`, `plugins/*`)
- Turbo tasks coordinate builds/dev/typecheck across workspaces

## Common commands

Run from repo root unless noted.

### Setup
- `pnpm install`

### Frontend/Desktop dev
- `pnpm -F @openmushi/ui build` (required before desktop build/dev when UI CSS is needed)
- `pnpm turbo tauri:dev --filter=@openmushi/desktop`
- Alternative (inside `apps/desktop`): `pnpm tauri:dev`

### Build
- `pnpm turbo build`
- `pnpm turbo tauri:build --filter=@openmushi/desktop`
- Alternative (inside `apps/desktop`): `pnpm tauri:build`

### Typecheck / Lint / Format
- `pnpm turbo typecheck`
- `pnpm lint`
- `pnpm fmt`

### Tests
- Desktop tests: `pnpm -F @openmushi/desktop test`
- Single test file (Vitest): `pnpm -F @openmushi/desktop test -- src/session/components/note-input/note-tab.test.tsx`
- Rust workspace tests: `cargo test --workspace`
- Single Rust crate: `cargo test -p listener-core`
- Single Rust test name: `cargo test -p listener-core <test_name>`

## High-level architecture (big picture)

### 1) App bootstrap and runtime composition
- Rust app entry: `apps/desktop/src-tauri/src/lib.rs`
  - Builds the Tauri app, registers a large plugin surface, mounts Specta commands, and wires lifecycle hooks.
  - Spawns/monitors root supervisor and initializes persistent stores.
- Frontend entry: `apps/desktop/src/main.tsx`
  - Composes Router + Query + TinyBase + TinyTick providers.
  - Initializes plugin globals and routes.

### 2) Audio/transcription pipeline
- Core actor pipeline: `crates/listener-core/src/actors/*`
  - Source → listener → recorder/session coordination using Ractor actors.
- STT adapter bridge: `crates/listener-core/src/actors/listener/adapters.rs`
  - Routes realtime transcription by provider adapter.
  - Includes in-process Sherpa path (`sherpa://local`) that bypasses websocket adapters.
- Local STT plugin surface: `plugins/local-stt/src/*`
  - Exposes commands and server integration for sherpa-based local transcription.

### 3) Data model and persistence split
- Persisted app/session state uses TinyBase persisters under `apps/desktop/src/store/tinybase/persister/*`.
- Ephemeral UI/runtime state uses Zustand slices in `apps/desktop/src/store/zustand/*`.
- Rust-side storage/database capabilities are exposed through Tauri plugins and crates (`plugins/db2`, `crates/db-*`).

### 4) Frontend feature organization
- Routing: `apps/desktop/src/routes/*` (TanStack file-based routing).
- Session UX and transcript editing/live state: `apps/desktop/src/session/*`.
- Shared workspace packages:
  - `packages/ui` (design system + Tailwind-generated globals)
  - `packages/transcript`, `packages/store`, `packages/utils`, etc.

## Important implementation conventions

- Styling is Tailwind CSS v4 utility-first; avoid introducing ad-hoc styling patterns when existing UI package patterns apply.
- Rust plugins generally expose `PluginExt` traits on `tauri::Manager` for app-state/plugin access.
- Skill/template content uses frontmatter + minijinja flow (see `crates/frontmatter` and template-related crates/plugins).
- Prefer extending existing plugin/crate boundaries rather than adding new top-level subsystems.