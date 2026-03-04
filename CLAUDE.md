# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Important Notes

- Never use any git commands in this repository.
- Must follow the plans and design documents in `docs/plans/` for implementation guidance.
- Always save documents after brainstorming or design work, and reference them in code comments, and save to the appropriate `docs/plans/` file if new design work is done.
- For any new features or significant changes, update the relevant design documents in `docs/plans/` with detailed explanations, diagrams, and rationale.
- Always use Github MCP to read the github repo link.

## Project Overview

Omnigraph (open-mushi) is a desktop meeting companion that captures system audio and microphone input, transcribes locally via sherpa-onnx, processes transcripts through an LLM-powered skill system, and visualizes keyword connections via a knowledge graph. Built with Tauri v2 (Rust backend) + React 19 (TypeScript frontend).

**Status:** Design complete with 11 phase plans in `docs/plans/`. Implementation starts at Phase 0.

## Project Structure

```sh
src-tauri/
  ├── src/           # Tauri entry point, app setup, root supervisor
  ├── crates/        # Internal Rust library crates (audio, vad, aec, db-core, llm-*, whisper-local, etc.)
  └── plugins/       # Tauri plugins (db, listener, local-stt, local-llm, settings, permissions, etc.)
src/
  ├── routes/        # TanStack Router file-based routes
  ├── session/       # Session/meeting view (core feature)
  ├── transcript/    # Transcript processing pipeline + UI
  ├── chat/          # AI chat panel
  ├── graph/         # Knowledge graph (React Flow)
  ├── settings/      # Settings panels (AI providers, general)
  ├── sidebar/       # Left sidebar (timeline, session list)
  ├── store/
  │   ├── tinybase/  # Persisted data schemas
  │   └── zustand/   # Ephemeral state slices
  └── services/      # Background services
```

## Key Design Documents

- **Full design:** `docs/plans/2026-02-28-omnigraph-design.md`
- **Phase plans:** `docs/plans/2026-02-28-phase-{0..10}-*.md`
- **Project brief:** `docs/BRIEF.md`

## Phase Dependencies (Critical Path)

```sh
Phase 0 (bootstrap) → 1 (SQLite) → 2 (audio) → 3 (STT) → 4 (transcript UI)
Phase 1 → 5 (workspaces), 6 (skill engine)  [parallel]
Phase 0 → 7 (LLM) → 8 (summarization, needs 6+7), 9 (graph, needs 4+7) → 10 (polish)
```

## Conventions

- **Styling:** Tailwind CSS v4 utility classes only. shadcn/ui new-york style. No custom CSS except for graph canvas.
- **Routing:** TanStack Router with file-based routes in `src/routes/`.
- **Rust plugins** expose `PluginExt` extension traits on `tauri::Manager` for Rust-side state access.
- **Skill files:** `SKILL.md` with YAML frontmatter, parsed by Rust `frontmatter` crate, rendered via `minijinja`.
- **Reference repo:** [fastrepl/char](https://github.com/fastrepl/char) — copy architecture patterns from here.
