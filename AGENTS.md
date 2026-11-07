# AGENTS.md

## Purpose

ChatArchive is a local-first desktop archive for exported ChatGPT conversations. The app uses a Tauri 2 shell, a React/TypeScript frontend, a Rust importer, SQLite app state, and a filesystem-backed archive library.

## Stack

- Frontend: React 19, TypeScript, Vite
- Desktop shell: Tauri 2
- Backend/import pipeline: Rust
- Testing: Vitest, Playwright, cargo test, PowerShell QA runners

## Important Paths

- `src/`: React UI, archive reader, explorer logic, shared frontend types
- `src-tauri/src/`: Tauri commands, importer, SQLite layer, shared Rust models
- `scripts/`: legacy ingest script and QA/release-gate runners
- `tests/`: unit and Playwright coverage
- `docs/`: implementation notes and QA reports
- `public/`: legacy static archive outputs used by the older ingest path

## Common Commands

Always use `pnpm` (never `npm`) for package management and script execution in this repository.

- `pnpm dev`: Vite dev server on `127.0.0.1:5173`
- `pnpm tauri:dev`: run the desktop app in development
- `pnpm build`: production frontend build
- `pnpm test`: Vitest unit suite
- `pnpm test:ui`: Playwright UI coverage
- `pnpm test:rust`: Rust importer/database tests
- `pnpm test:native`: destructive native audit against the workspace-local `.qa\library`
- `pnpm test:installer`: MSI and NSIS lifecycle audit
- `pnpm qa:phase2`: full Phase 2 release gate

## Working Rules

1. Use `pnpm` instead of `npm` for all Node/frontend commands.
2. Prefer the Tauri app path over the legacy static ingest path unless the task explicitly targets legacy behavior.
3. Treat SQLite and the filesystem archive as product state. Changes that affect import, manifests, artifacts, or viewer state should be verified carefully.
4. Keep frontend changes aligned with the existing React/Vite structure instead of introducing parallel patterns.
5. Keep Rust-side changes scoped to the command/import/database boundary already present in `src-tauri/src/`.
6. Do not casually run installer or destructive native QA flows on a machine without a reconstructable baseline.

## Testing Guidance

- Run the smallest relevant test set for the change.
- Expand to `pnpm test:ui` or `pnpm test:rust` when touching shared reader behavior, importer logic, or persistence.
- Reserve `pnpm test:native`, `pnpm test:installer`, and `pnpm qa:phase2` for work that actually affects those release-gated paths.

## Data And Safety Notes

- The repo may contain private local export data under workspace-local folders such as `openai-export/`; avoid copying or exposing private payloads unnecessarily.
- `test:native` mirrors the configured live library into the workspace-local `.qa\library` before destructive testing.
- Current release status and the installer gate blocker are documented in `docs/Phase2-QA-Report.md`.
