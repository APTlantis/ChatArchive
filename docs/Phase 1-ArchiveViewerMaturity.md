# Phase 1: Archive Viewer Maturity

## Summary
Upgrade the current static React archive reader into a stronger local ChatGPT archive browser without adding a backend. Keep the app local-first, use `localStorage` for personal navigation state, and focus Phase 1 on search/filtering, navigation memory, message bookmarks, a start-screen statistics dashboard, and the first dedicated artifact indexes. Defer full explorer views and provider-neutral ingestion to later phases.

## Key Changes
- Replace the current auto-select-first-conversation behavior with a start dashboard shown on launch.
  - Show archive totals, code block count, first/latest chat dates, asset counts, unresolved asset count, recently viewed, favorites, pinned conversations, and unread/read summary.
  - Selecting any conversation opens the existing reader view.
- Add richer search with visible controls plus lightweight query operators.
  - Plain text searches title + visible message search text.
  - Quoted text performs phrase matching.
  - `title:term`, `content:term`, `type:code`, `type:document`, `type:link`, `language:rust`, `domain:github.com`, `raw:true`, `asset:true`, `missing:true`, and `external:true` are supported.
  - Regex mode is a toggle; invalid regex shows an inline error and does not crash filtering.
  - Add field chips for All, Titles, Messages, Code, Raw, Assets, Documents, and Links.
  - Add date range and conversation length filters.
- Add generated artifact indexes.
  - `public/archive-data/artifacts.json` stores code blocks, assets, document-like Markdown blocks, and links.
  - Language, asset kind, document, link, and domain search are backed by the artifact index rather than approximated from conversation summaries.
- Add browser-local viewer state under one versioned key, `chatArchive.viewerState.v1`.
  - Store favorites, pinned conversations, read/unread status, recently viewed conversations, message bookmarks, and per-conversation last scroll position.
  - Keep state resilient to regenerated archive data: ignore stored conversation/message IDs that no longer exist.
- Add conversation and message navigation tools.
  - Conversation actions: favorite, pin, mark read/unread.
  - Message actions: bookmark/unbookmark and copy link-style anchor.
  - Recently viewed updates when a conversation is opened.
  - Last viewed position is saved on scroll and restored when reopening a conversation.
- Keep artifact explorer UI out of this slice.
  - Use artifact indexes to improve global search precision.
  - Defer full Code Explorer, Document Explorer, Asset Explorer, and Link Explorer browsing screens to the next phase.

## Interfaces And Data
- Extend frontend types with `ViewerState`, `ConversationBookmark`, `MessageBookmark`, `SearchFilters`, and `ArtifactIndex`.
- Extend ingest output with `public/archive-data/artifacts.json`; keep existing `index.json` and per-conversation JSON compatible.
- Compute dashboard totals from `ArchiveIndex` in the browser:
  - conversations: `index.totals.conversations`
  - visible messages: `index.totals.visibleMessages`
  - assets: `index.totals.copiedAssets` plus existing asset totals
  - code blocks: sum `conversation.codeBlockCount`
  - first/latest chat: min/max of `createTime` and `updateTime`
- Keep `npm run ingest`, `npm run dev`, `npm run build`, and `npm run preview` unchanged.
- Update `README.md` and `ChatArchive-Roadmap.md` status notes after implementation to describe completed Phase 1 behavior.

## Test Plan
- Run `npm run build`.
- Run `npm run ingest` and verify artifact totals are generated.
- Manually verify:
  - Launch shows the stats dashboard instead of auto-opening the newest conversation.
  - Plain search, phrase search, field chips, artifact-backed typed operators, regex mode, invalid regex handling, date range, and message-count filters work.
  - Favorites, pins, read/unread, recently viewed, message bookmarks, and last scroll position persist after refresh.
  - Stale `localStorage` state does not break the app after clearing/regenerating archive data.
  - Existing features still work: conversation selection, outline links, show/hide raw, copy code, export Markdown, image lightbox, and collapsed sidebar.
- Add small unit-style helper tests if the project test setup is introduced; otherwise keep pure parser/filter functions isolated enough for easy future testing.

## Assumptions
- Phase 1 remains a static local app with no backend and no file-writing state layer.
- `localStorage` is acceptable for personal viewer state in this phase.
- Message bookmarks and artifact-backed search are in scope; full artifact explorer screens are not.
- Full global artifact indexes are in scope; richer explorer UI is deferred to Phase 2.
- Search should be useful and visible first, with typed operators as a power layer rather than a full query language.
