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

- Add an explorer mode or tab for Code.
- Group by language with counts.
- Search code text, language, conversation title, and source role.
- Show snippet preview with Prism highlighting.
- Support copy snippet, export snippet, and open source conversation at source message.
- Show language, date, source conversation, role, and approximate size.

Acceptance checks:

- `language:python` search and Code Explorer language filters agree.
- Opening a code artifact jumps to the original conversation message.
- Copy/export preserves the original code text, not highlighted HTML.

## Phase 2B — Document Explorer

Goal: recover document-like outputs without manually searching conversations.

- Add an explorer mode or tab for Documents.
- Group by document type: README, Release notes, Specification, Architecture, Standard, Roadmap, Document.
- Search title, type, preview, and source conversation.
- Open source conversation at source message.
- Export selected document candidates to Markdown.

Acceptance checks:

- Document counts match `artifacts.json`.
- Document previews are readable and do not overwhelm the list.
- Exported Markdown is plain text and source-faithful.

## Phase 2C — Asset Explorer

Goal: make images and missing assets discoverable across the whole archive.

- Add an explorer mode or tab for Assets.
- Filter local, external, and missing assets.
- Search label, original pointer, URL, and source conversation.
- Show image thumbnails for local/external assets.
- Show clear missing-asset cards for unresolved pointers.
- Open full-size preview and open source conversation.

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
