# Phase 2: Artifact Extraction

## Summary

Phase 1 stopped the archive from being a passive transcript viewer. Phase 2 should stop treating useful output as buried conversation text. The app already generates `public/archive-data/artifacts.json`; Phase 2 turns that index into first-class explorer views for code, documents, assets, and links.

## Current Foundation

- `artifacts.json` contains code, asset, document, and link records.
- Code blocks render with locally bundled Prism highlighting.
- Artifact-backed search operators already work from the main conversation list.
- Source conversation and message IDs are preserved on every artifact record.

## Phase 2A — Code Explorer

Goal: make code blocks directly browseable.

Status: Implemented.

- Added a Code Explorer view from the sidebar.
- Grouped code artifacts by language with counts from the artifact index/SQLite code artifact table.
- Added search across code text, language, conversation title, and source role.
- Shows a bounded, dense snippet list and Prism-highlighted selected snippet preview.
- Supports copy snippet, export snippet, and open source conversation at the source message.
- Shows language, date, source conversation, role, and approximate size.
- Uses the Tauri `list_code_artifacts` command in desktop mode and falls back to `artifacts.json` in static browser mode.
- Mounts only the first 500 visible rows while preserving full result counts, so large archives do not render tens of thousands of snippet rows at once.

Acceptance checks:

- `language:python` search and Code Explorer language filters agree.
- Opening a code artifact jumps to the original conversation message.
- Copy/export preserves the original code text, not highlighted HTML.

## Phase 2B — Document Explorer

Goal: recover document-like outputs without manually searching conversations.

Status: Implemented.

- Added a three-pane Document Explorer with all seven document-type facets.
- Searches title, type, preview, source conversation, and source role.
- Shows newest-first results with a 500-row render bound and full facet counts.
- Indexes actual uploaded document attachments and OpenAI-produced download links instead of inferring documents from ordinary message prose.
- Previews Markdown and text attachments directly; binary formats such as PDF, DOCX, and PPTX remain original-file artifacts.
- Supports byte-faithful single-document export, copy for previewable text, and source-message navigation.

Acceptance checks:

- Document counts match `artifacts.json`.
- Document previews are readable and do not overwhelm the list.
- Exported Markdown is plain text and source-faithful.

## Phase 2C — Asset Explorer

Goal: make images and missing assets discoverable across the whole archive.

Status: Implemented.

- Added a three-pane Asset Explorer with all, local, external, and missing facets and counts.
- Searches label, original pointer, URL, and source conversation.
- Shows a lazy 500-item thumbnail grid with a controlled unavailable-image fallback.
- Opens full-size previews for available images through Tauri's asset protocol.
- Keeps all missing assets as diagnostic cards with copy-pointer and source-message actions; it does not mutate or relink the archive.

Acceptance checks:

- Missing asset count matches artifact index state.
- Image preview still uses local archive assets when available.
- Missing assets are useful repair targets, not dead cards.

## Phase 2D — Link Explorer

Goal: recover references, repositories, docs, and articles from old conversations.

- Add an explorer mode or tab for Links.
- Group by domain.
- Search label, URL, domain, and source conversation.
- Copy URL and open source conversation.
- Provide quick domain groups for GitHub, docs, package registries, and articles when detectable.

Acceptance checks:

- `domain:github.com` search and Link Explorer domain filtering agree.
- Link labels remain readable even when only a raw URL exists.
- External links open normally without changing archive state.

## UI Direction

- Keep the first screen operational, not marketing-like.
- Add explorer navigation without crowding the existing conversation reader.
- Prefer dense, scannable lists with preview/detail panes over large cards.
- Keep every explorer item tied back to its source conversation.
- Reuse existing sidebar/search styling where it fits.

## Test Plan

- Run `npm run ingest`.
- Run `npm run build`.
- Verify each explorer count against `artifacts.json`.
- Verify source-message navigation from each artifact type.
- Verify copy/export actions use original source text/URL.
- Verify existing Phase 1 flows still work: dashboard, search, bookmarks, pins, read state, raw toggle, Markdown export, image lightbox, collapsed sidebar.

## Out Of Scope

- Semantic search.
- Saved searches.
- Provider-neutral adapters.
- AI-generated summaries.
- Editable tags, collections, or notes.
