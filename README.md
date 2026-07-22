# ChatArchive

A local-first desktop archive for exported ChatGPT conversations. ChatArchive now uses a Tauri 2 shell, a React reader, a Rust OpenAI importer, durable SQLite app state, and a filesystem-backed library folder for normalized conversations, screenshots, attachments, exports, and manifests.

This project started as a static personal archive reader, but the direction is broader: a provider export goes in, normalized conversation data and durable indexes come out, and the same reader can eventually support ChatGPT, Claude, Gemini, local LLM tools, and other AI conversation sources without trusting browser storage as the permanent home.

## What It Does Today

- Runs as a Tauri desktop app on top of the existing Vite/React UI.
- Lets the user choose a visible `ChatArchive/` library folder for backup clarity.
- Imports legacy and current ChatGPT/OpenAI exports through the Rust backend.
- Supports both single-file `conversations.json` exports and current sharded `conversations-*.json` exports.
- Normalizes conversation trees into ordered message threads.
- Separates visible chat messages from hidden/raw system, tool, and metadata messages.
- Extracts Markdown text, fenced code blocks, execution output, citations, references, image pointers, uploaded documents, and OpenAI-produced download links.
- Resolves matching image and document payloads from current `.dat` export blobs, restores attachment filenames, and stores documents separately from media assets.
- Tracks unresolved asset pointers and external image URLs in durable archive metadata.
- Writes normalized per-conversation JSON on disk.
- Stores archive, conversation, message, artifact, search, tag, bookmark, favorite, pin, read-state, recent-view, and scroll metadata in SQLite.
- Builds dedicated artifact records for code, image assets, attached documents, and links.
- Provides a React reader with search, month grouping, conversation outline, image lightbox, code copy, all-code copy, raw-message toggle, and Markdown export.
- Highlights code blocks with a locally bundled Prism build; no CDN or external runtime call is needed.
- Renders Mermaid and ZenUML fenced diagrams from local npm packages, with source fallback when a diagram cannot be parsed.
- Opens to a local dashboard with archive totals, first/latest chat dates, code block counts, unresolved asset counts, recently viewed conversations, favorites, pins, and read/unread totals.
- Supports richer client-side search with phrases, regex mode, field chips, typed operators such as `type:code`, `language:python`, `type:document`, `type:link`, `domain:github.com`, date ranges, and conversation length filters.
- Includes three-pane Code, Document, and Asset explorers with independent search, facets, bounded result lists, previews, export/copy actions, and source-message navigation.
- Previews recovered Markdown, JSON, TOML, YAML, CSV, XML, HTML, RST, and text attachments directly. PDF and Office files remain byte-faithful downloadable artifacts.
- Migrates existing browser `localStorage` viewer state from `chatArchive.viewerState.v1` once, then treats SQLite as authoritative.

The currently verified archive contains 733 conversations, 29,861 visible messages, 36,835 code artifacts, 5,823 image assets, 1,624 attached documents, and 8,838 link artifacts. Of the image assets, 5,320 resolve locally, 490 are external, and 13 remain unresolved. Of the documents, 724 payloads are recoverable from the export and 900 remain metadata-only pointers because their source blobs are absent. These are live-library figures from the June 30, 2026 import and will change when another export is ingested.

> **Release status:** Phase 1 and Phase 2A-2C are implemented, but Stage 3 is intentionally blocked by the Phase 2 release gate. The functional, data-integrity, accessibility, native-import, and packaging checks pass; the Windows installer lifecycle must be rerun from a known installation baseline before the gate can be cleared. See the [Phase 2 QA report](docs/Phase2-QA-Report.md) for results, hashes, performance baselines, and the exact blocker.

> **Latest patch build:** v0.1.1 was rebuilt on July 22, 2026 with the Blue Slate visual pass, new ChatArchive logo/icon assets, and a packaged Windows GUI subsystem so release builds do not spawn a terminal. See [Release v0.1.1](docs/Release-v0.1.1.md) for hashes and verification evidence. This patch build does not clear the installer lifecycle blocker above.

## Why This Exists

Most chat exports are useful but awkward. They preserve data, not continuity. This project tries to make exported conversations browsable, inspectable, and reusable:

- Find old work without logging into a platform.
- Recover code snippets and decisions from long-running chats.
- Keep image-heavy conversations with local assets when possible.
- Export a single conversation to Markdown for notes, repos, documentation, or follow-up work.
- Build toward provider-neutral conversation archives that could include ChatGPT, Gemini, Claude, local LLM chats, and other tools.

## Requirements

- Node.js
- npm
- Rust toolchain compatible with Tauri 2
- A ChatGPT/OpenAI export folder containing either `conversations.json` or sharded `conversations-*.json` files

The app is now a Tauri 2 + React + TypeScript + Rust project.

## Setup

Install dependencies:

```powershell
npm install
```

Run the desktop app in development:

```powershell
npm run tauri:dev
```

Build the React frontend:

```powershell
npm run build
```

Build the Windows desktop bundle:

```powershell
npm run tauri:build
```

## Testing And Release Gate

The repository includes permanent regression coverage for the React explorer logic, rendered desktop/mobile behavior, Rust import transactions, real-export reconciliation, native persistence, production privacy, and Windows installers.

```powershell
# Fast unit suite
npm test

# Rendered UI, responsive layout, keyboard, and accessibility checks
npm run test:ui

# Rust importer/database tests
npm run test:rust

# Destructive real-export audit against .qa\library under the repo root
npm run test:native

# MSI and NSIS lifecycle audit
npm run test:installer

# Complete Phase 2 release gate
npm run qa:phase2
```

`test:native` mirrors the configured live library into `.qa\library` under the repo root before destructive testing. It does not use `A:\ChatArchive` as an import destination. The real export and generated QA workspace remain outside Git; committed fixtures are synthetic.

The June 30, 2026 audit currently records:

- 4 Vitest tests passed.
- 9 Playwright tests passed at 1920x1080, 1366x768, and 390x844, with no serious or critical automated accessibility violations in the tested flow.
- 6 active Rust tests passed; the opt-in real-export smoke is covered by the isolated native audit.
- SQLite and artifact indexes reconciled exactly with zero orphaned source IDs.
- A representative recovered document matched its source `.dat` blob byte-for-byte.
- Production frontend, Tauri, MSI, NSIS, Clippy, formatting, and private-payload checks passed.
- The installer-state restoration check failed, so `qa:phase2` is not yet a green release gate.

Do not run the installer lifecycle casually on a workstation with an installation you cannot reconstruct. The hardened runner snapshots registered package information and installer payloads, but a known baseline is still required for a meaningful restoration assertion.

The July 22, 2026 v0.1.1 patch build additionally verified `npm run build`, `npm test`, `npm run test:rust`, `npm run test:ui`, and `npm run tauri:build`. The rebuilt `chatarchive.exe` reports the `Windows GUI` subsystem, and the generated MSI/NSIS installers are hashed in the release note.

The app will ask for a library folder. A normal library layout looks like:

```text
ChatArchive/
├── archives/
│   └── openai-2026-02/
│       ├── raw/
│       ├── conversations/
│       ├── assets/
│       ├── documents/
│       ├── exports/
│       └── manifest.json
├── chatarchive.db
└── settings.json
```

The legacy static ingest path is still present for comparison and fallback development:

```powershell
npm run ingest
npm run dev
npm run preview
```

## Using A Different Export Location

In the Tauri app, choose the OpenAI export folder from the import dialog. The folder should contain either a legacy `conversations.json` file or current `conversations-*.json` shards. Current OpenAI exports may also include many `.dat` files. The Rust importer indexes those blobs by file ID, consults `conversation_asset_file_names.json` and attachment metadata for original names, and copies recoverable images and documents into separate archive folders.

For the legacy Node ingest script, the default source is `openai-history` under the repo root. You can point it at another OpenAI export folder with `OPENAI_HISTORY_DIR`:

```powershell
$env:OPENAI_HISTORY_DIR = "D:\Exports\openai-history"
npm run ingest
```

The legacy static archive is written into:

```text
public/archive-data/
public/archive-assets/
public/archive-documents/
```

## Project Layout

```text
D:\DRS\Chat
├── src-tauri/
│   ├── src/
│   │   ├── main.rs                    # Tauri command registration
│   │   ├── commands.rs                # Frontend command boundary
│   │   ├── db.rs                      # SQLite schema, settings, viewer state
│   │   ├── importer.rs                # Rust OpenAI importer
│   │   └── models.rs                  # Shared archive/viewer models
│   ├── capabilities/                  # Tauri permissions
│   └── tauri.conf.json
├── scripts/
│   ├── ingest-openai-history.js       # Legacy static OpenAI normalizer
│   └── qa/                            # Native, installer, and release-gate runners
├── src/
│   ├── App.tsx                        # Archive reader UI
│   ├── artifactLogic.ts               # Pure explorer filtering/facet/selection logic
│   ├── archiveApi.ts                  # Tauri command/static fetch adapter
│   ├── main.tsx                       # React entrypoint
│   ├── styles.css                     # App styling
│   └── types.ts                       # Archive data types
├── prism/
│   ├── prism.js                       # Locally bundled Prism languages/plugins
│   └── prism.css                      # Prism Okaidia theme
├── public/
│   ├── archive-data/
│   │   ├── index.json                 # Legacy static search/list index
│   │   ├── artifacts.json             # Legacy static artifact index
│   │   ├── assets-manifest.json       # Copied, external, and missing asset records
│   │   └── conversations/             # One normalized JSON file per conversation
│   ├── archive-assets/                # Legacy copied local image assets
│   └── archive-documents/             # Legacy copied document payloads
├── tests/
│   ├── e2e/                           # Playwright UI/accessibility/layout coverage
│   ├── fixtures/                      # Synthetic static and OpenAI export fixtures
│   └── unit/                          # Vitest explorer logic coverage
├── docs/
│   ├── Phase 2-ArtifactExtraction.md  # Phase 2A-2D implementation roadmap
│   └── Phase2-QA-Report.md            # Current release-gate evidence and verdict
├── openai-history/                    # Source export folder, local/private
└── dist/                              # Production build output
```

## Data Model

The app reads a small normalized model instead of rendering the raw provider export directly.

- `ArchiveIndex` contains generated metadata, totals, and conversation summaries.
- `ConversationSummary` powers search, grouping, counts, snippets, and selection.
- `ConversationFile` contains a full normalized conversation and its messages.
- `ArchiveMessage` stores role, author, time, content type, extracted blocks, media assets, document attachments, references, hidden/raw status, and original content type.
- `MessageBlock` supports Markdown, code, execution output, and notices.
- `ArchiveAsset` tracks local, external, and missing media. Document attachment records reuse the same resolved-file shape but live in a separate document collection and folder.
- `ArtifactIndex`/SQLite artifact tables power exact language, code, asset, document, and link search without loading every conversation file.
- SQLite owns user state: favorites, pins, read/unread status, recently viewed conversations, message bookmarks, tags, saved searches, and scroll positions.

This normalized layer is what makes future provider support realistic. Gemini, Claude, Ollama, Jan, or other sources do not need to match OpenAI's export format; they only need adapters that produce the same archive model.

## Current Limitations

- Only OpenAI/ChatGPT export ingestion is implemented.
- Markdown rendering is intentionally lightweight and does not cover every Markdown extension.
- Image and document recovery is best-effort. The importer matches `.dat` blobs by file ID and recovered filename; pointers whose payloads are absent from the provider export remain diagnostic records.
- Text-based documents can be previewed in-app. PDF, DOCX, PPTX, and other binary documents are preserved for original-file export but are not rendered inline.
- Audio and video payloads are skipped by the current asset extractor.
- Explorer listing commands are backed by Tauri and SQLite. Some conversation-level rich filtering still reuses the frontend filter layer over the loaded archive index.
- Prism and Mermaid are bundled locally, so the production build is intentionally larger than a CDN-based version.
- Mermaid diagram rendering is limited to fenced `mermaid`, `mmd`, and `zenuml` code blocks.
- There is no built-in privacy scrubber yet. Treat generated archive files as sensitive.
- Provider-neutral import begins with the Rust `ProviderImporter` boundary, but only the OpenAI implementation exists right now.

## Privacy Notes

Exports can contain personal data, private code, credentials, screenshots, attachments, and sensitive conversation history. This project keeps processing local, but the generated files are still readable static assets.

Before publishing or sharing:

- Review `public/archive-data`.
- Review `public/archive-assets`.
- Review `public/archive-documents`.
- Consider deleting or excluding private source exports such as `openai-history` or `openai-export`.
- Consider adding a future redaction pass for secrets, emails, paths, API keys, and personal identifiers.

## Roadmap

### 1. Provider Adapters

Add importers that map other platforms into the shared archive model.

- Claude export adapter.
- Gemini export adapter.
- ChatGPT shared-link or HTML export adapter.
- Open WebUI, Jan, LM Studio, and Ollama conversation adapters where export formats are available.
- Adapter test fixtures so provider support does not depend on private archives.

The goal is a plugin-like ingestion layer:

```text
provider export -> provider adapter -> normalized archive JSON -> same reader UI
```

### 2. Local LLM Continuation

Use archived conversations as context packs for local models.

Potential paths:

- Export selected conversations as model-ready Markdown.
- Export condensed summaries plus important code/assets.
- Create Ollama-compatible prompt bundles.
- Create Jan/Open WebUI import bundles if those formats support it.
- Add "continue this conversation locally" actions that prepare a compact handoff file.

Local models may not handle giant conversation histories in one pass, so this likely needs context batching:

- Chunk long conversations by topic, time, or message boundaries.
- Preserve code blocks and decisions as high-priority context.
- Generate rolling summaries.
- Let users choose "full transcript", "working summary", "code only", or "decision log" handoff modes.

### 3. Better Search And Retrieval

Phase 1 added the first mature search pass: phrases, regex mode, field chips, typed operators, date ranges, conversation length filters, browser-local navigation state, and a dedicated artifact index for code, assets, documents, and links. The remaining work is deeper retrieval rather than basic viewer search.

- Full-text index with field weighting for title, user messages, assistant messages, code, assets, documents, and links.
- Conversation tags and manual notes.
- Saved searches.
- Semantic search using local embeddings.
- "Find related conversations" based on shared code, filenames, topics, or embeddings.

### 4. Archive Editing And Curation

Make the archive useful as a personal knowledge base, not just a viewer.

- Rename conversations locally.
- Add tags, notes, and bookmarks.
- Mark important messages.
- Build collections across provider boundaries.
- Export curated bundles to Markdown, JSON, or static HTML.
- Generate repo-ready documentation from selected chats.

### 5. Asset And Attachment Support

Chat platforms often make media export awkward. This framework can do more because it controls the local asset layer.

- Hash-based deduplication for recovered images and documents.
- Inline PDF/Office previews where a local renderer can be bundled safely.
- Attachment manifests with original names, content types, dimensions, and source messages.
- Missing-asset repair tools.
- Optional thumbnail generation.

### 6. Privacy And Redaction

Before this becomes generally useful for other people, privacy tooling should be first-class.

- Local redaction pass for API keys, tokens, emails, phone numbers, file paths, and custom patterns.
- Per-conversation exclusion rules.
- "Public export" mode that strips hidden/raw messages and risky metadata.
- Diffable redaction report.
- Secret scanner integration before static publishing.

### 7. Static Publishing

The current app can already build to `dist`, but publishing needs guardrails.

- Public/private build modes.
- Optional password gate for personal hosting.
- GitHub Pages-compatible output.
- Cloudflare Pages-compatible output.
- Portable offline bundle.
- Single-conversation publish mode.

### 8. Conversation Intelligence

Once conversations are normalized, the archive can support workflows that platforms usually do not expose.

- Topic clustering.
- Decision extraction.
- Code snippet library.
- Timeline views.
- Project-specific conversation grouping.
- "What did I already try?" summaries.
- Cross-model comparison when the same task appears in multiple providers.

## Development Notes

The legacy ingest script is deliberately plain Node.js so it can normalize an export without the desktop shell. It writes static JSON, copies image and document payloads, and records anything it cannot resolve.

The React UI supports two data paths. In the desktop app it uses Tauri commands and SQLite-backed indexes; in static development mode it can still fetch generated JSON from `/archive-data`. Production Tauri builds exclude private `public/archive-data`, `public/archive-assets`, and `public/archive-documents` payloads unless static inclusion is explicitly enabled.

## Suggested Next Milestones

1. Re-establish a known Windows installation baseline and clear the complete Phase 2 release gate.
2. Complete the static/in-app-browser compatibility smoke and record it in the QA report.
3. Add Phase 2D Link Explorer on top of the existing link artifact index.
4. Add a privacy scrubber before broader sharing.
5. Add the next provider adapter behind the existing `ProviderImporter` boundary.
6. Add provider-neutral import documentation and a local-model handoff exporter.

## Status

Phase 1 and Phase 2A-2C are implemented. ChatArchive is useful today as a durable local OpenAI archive with SQLite-backed viewer state, sharded-export ingestion, `.dat` attachment recovery, rich conversation search, code and diagram rendering, and dedicated Code, Document, and Asset explorers. The extensive Phase 2 regression harness is now part of the repository, but its current verdict keeps Stage 3 blocked until installer-state restoration is proven from a known baseline. Phase 2D Link Explorer, provider adapters, curation, privacy/redaction, and deeper retrieval remain future work.
