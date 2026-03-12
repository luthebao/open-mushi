# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Rules (must follow)

- Never use any git commands in this repository.
- Always use GitHub MCP (not guessed URLs) when reading GitHub repo links.
- Treat `docs/plans/` as the source of truth for implementation sequencing and design decisions.
- For significant feature/design changes, update the relevant plan/design docs with rationale.

## Environment assumptions

- Node.js `>=22` (from root `package.json` engines)
- pnpm `10.30.0` (from root `packageManager`)
- Rust toolchain `1.93.0` with `rust-analyzer`, `rustfmt`, `clippy` (from `rust-toolchain.toml`)
- macOS is the primary target (CoreAudio / desktop platform assumptions)

## What this codebase is

Open Mushi is a **Tauri v2 desktop app** with:

- Rust backend/plugin runtime (`apps/desktop/src-tauri` + `crates/*` + `plugins/*`)
- React 19 frontend (`apps/desktop/src`)
- Local-first meeting pipeline (audio capture → STT → transcript/chat/graph)

Monorepo tooling:

- pnpm workspaces (`apps/*`, `packages/*`, `plugins/*`)
- Cargo workspace (`apps/desktop/src-tauri`, `crates/*`, `plugins/*`)
- Turbo tasks coordinate builds/dev/typecheck across workspaces

## Canonical commands

Run from repo root unless noted.

### Setup

- `pnpm install`

### Dev mode (desktop)

- Build shared UI package first when desktop CSS/assets are needed: `pnpm -F @openmushi/ui build`
- Preferred (workspace/turbo): `pnpm turbo tauri:dev --filter=@openmushi/desktop`
- Alternative (inside `apps/desktop`): `pnpm tauri:dev`

### Production build (desktop)

- Full workspace build: `pnpm turbo build`
- Preferred desktop bundle build from root: `pnpm turbo tauri:build --filter=@openmushi/desktop`
- Alternative (inside `apps/desktop`): `pnpm tauri:build`

### Typecheck / Lint / Format

- Typecheck workspace tasks: `pnpm turbo typecheck`
- Lint: `pnpm lint`
- Format: `pnpm fmt`

### Tests

- Desktop tests: `pnpm -F @openmushi/desktop test`
- Single Vitest file: `pnpm -F @openmushi/desktop test -- src/session/components/note-input/note-tab.test.tsx`
- Rust workspace tests: `cargo test --workspace`
- Single Rust crate: `cargo test -p listener-core`
- Single Rust test name: `cargo test -p listener-core <test_name>`

## Architecture map (where to change code)

### 1) App bootstrap and runtime composition

- Rust app entry: `apps/desktop/src-tauri/src/lib.rs`
  - Tauri builder, plugin registration, Specta command mounting, lifecycle hooks.
  - Supervisor/store initialization lives here.
- Frontend entry: `apps/desktop/src/main.tsx`
  - Router + Query + TinyBase + TinyTick provider composition.
  - Frontend boot/runtime wiring starts here.

### 2) Audio/transcription pipeline

- Actor pipeline core: `crates/listener-core/src/actors/*`
  - Listener/recorder/session coordination.
- Realtime adapter routing: `crates/listener-core/src/actors/listener/adapters.rs`
  - Provider routing and Sherpa in-process path (`sherpa://local`).
- Local STT plugin surface: `plugins/local-stt/src/*`
  - Command/server integration for sherpa-based transcription.

### 3) Persisted vs ephemeral state split

- Persisted state: TinyBase persisters under `apps/desktop/src/store/tinybase/persister/*`
- Ephemeral runtime/UI state: Zustand slices under `apps/desktop/src/store/zustand/*`
- Rust-side DB/storage capabilities: `plugins/db2`, `crates/db-*`

### 4) Frontend feature organization

- Routes: `apps/desktop/src/routes/*` (TanStack file-based routing)
- Session/transcript UX: `apps/desktop/src/session/*`
- Shared UI/domain packages: `packages/ui`, `packages/transcript`, `packages/store`, `packages/utils`

## Additional assistant-instruction sources

- Searched for repo-level Cursor/Copilot assistant rule files and found none:
  - `.cursor/rules/**`
  - `.cursorrules`
  - `.github/copilot-instructions.md`
- In this repository, treat this `CLAUDE.md` + `docs/plans/` as the operative guidance.

## Important implementation conventions

- Styling is Tailwind CSS v4 utility-first; avoid introducing ad-hoc styling patterns when existing UI package patterns apply.
- Rust plugins generally expose `PluginExt` traits on `tauri::Manager` for app-state/plugin access.
- Skill/template content uses frontmatter + minijinja flow (see `crates/frontmatter` and template-related crates/plugins).
- Prefer extending existing plugin/crate boundaries rather than adding new top-level subsystems.
