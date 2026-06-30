The Phase-1-Completion check point is reached:
Phase 1-ArchiveViewerMaturity.md
ChatArchive-Phase1-Completion-Checkpoint-1.png
ChatArchive-Phase1-Completion-Checkpoint-2.png
ChatArchive-Phase1-Completion-Checkpoint-3.png
ChatArchive-Roadmap.md

Now I'll be starting the Phase 2-ArtifactExtraction.md

Sidenote:
The 831 unresolved assets is largely because this is not a current or complete export I'm using right now, it only goes up to Feb 9, 2026, and I've deleted or lost a lot of the screenshots I enclosed in the chats.
I'm waiting for OpenAI to finish my current/complete export, and I'll be using thatonce they do.

I got distracted with Prism and forgot that I have a lot of Mermaid in there too, and wanted to add that at for Phase1-Completion too.
I'm more interested in the app always working over saving a few MB so I snagged the @mermaid-js/mermaid-zenuml@0.2.3 Latest - release from Github.
If we end up needing to save some space for some reason or there's issues we can go to CDNS but I'd rather stay local for now.


# Phase 1.5: Tauri Durable Archive Foundation

**Status:** Implemented as the new product foundation. The app now has a Tauri 2 shell, a Rust OpenAI importer, a user-selected filesystem library, SQLite-backed archive/user-state metadata, one-time `chatArchive.viewerState.v1` migration, and Tauri command adapters for the React reader. The importer supports both legacy `conversations.json` exports and current OpenAI sharded `conversations-*.json` exports with `.dat` asset blobs mapped through `conversation_asset_file_names.json`. Phase 2 explorer work should build against these Tauri/SQLite boundaries.

## Summary

Move ChatArchive from a static browser prototype to a Tauri-first desktop app before Phase 2 explorer work. React remains the UI, but durable state, archive imports, indexing, and filesystem access move behind a Rust backend. SQLite becomes the application brain; the filesystem remains the archive body. The current Node ingest path is replaced by a Rust OpenAI importer now, rather than carrying it forward and migrating later.

References used for feasibility: Tauri v2 filesystem base directories and path APIs, plus Tauri v2 SQL/SQLite plugin support and Rust minimum version guidance from official docs: [File System](https://v2.tauri.app/plugin/file-system/) and [SQL](https://v2.tauri.app/plugin/sql/).

## Key Changes

- Added a Tauri 2 app shell with the existing Vite/React UI as the frontend.
- Made Tauri the primary product shape; static browser mode remains useful for fallback development but is no longer the durability target.
- Added a user-chosen `ChatArchive/` library folder:
  ```text
  ChatArchive/
  ├── archives/
  │   └── openai-2026-02/
  │       ├── raw/
  │       ├── conversations/
  │       ├── assets/
  │       ├── exports/
  │       └── manifest.json
  ├── chatarchive.db
  └── settings.json
  ```
- Ported the current OpenAI ingest path to Rust.
  - Supports legacy `conversations.json` and current `conversations-*.json` shards.
  - Preserves raw non-attachment export files under `raw/`.
  - Resolves current `.dat` attachment blobs through `conversation_asset_file_names.json` where possible.
  - Preserve normalized frontend data shapes where practical: conversations, messages, blocks, assets, references, artifacts.
  - Keep copied assets and normalized JSON on disk.
  - Insert conversation, message, artifact, asset, and search metadata into SQLite during import.
- Added a frontend adapter that uses Tauri commands in desktop mode and static fetches in browser fallback mode.
  - `get_library_status`
  - `select_library_folder`
  - `import_openai_export`
  - `list_conversations`
  - `get_conversation`
  - `search_conversations`
  - `get_dashboard`
  - `update_viewer_state`
  - `toggle_favorite`
  - `toggle_pin`
  - `mark_read`
  - `save_message_bookmark`
  - `save_scroll_position`
  - `export_conversation_markdown`
- Made SQLite authoritative for user-owned state:
  - favorites
  - pins
  - read/unread
  - recently viewed
  - message bookmarks
  - scroll positions
  - tags
  - saved searches
- Added SQLite tables for indexes and lookup metadata:
  - archives
  - conversations
  - messages
  - code artifacts
  - document artifacts
  - asset artifacts
  - link artifacts
  - source pointers
  - FTS-backed search tables
- Kept large/sourceful bodies on disk:
  - raw provider exports
  - normalized per-conversation JSON
  - images and attachments
  - Markdown exports
  - repair/import manifests
- Added one-time migration from `chatArchive.viewerState.v1`.
  - On first Tauri run, read existing localStorage viewer state from the webview.
  - Insert valid records into SQLite.
  - Mark migration complete in `settings.json` or SQLite app metadata.
  - After migration, SQLite is authoritative.

## Implementation Notes

- Create a Rust core boundary around provider import:
  - `ProviderImporter` trait
  - first implementation: `OpenAiImporter`
  - output: normalized archive records plus copied asset records
- Use stable IDs compatible with the current archive where possible so existing bookmarks survive migration.
- Store app/library settings outside browser state.
- Treat import as transactional:
  - create or stage archive folder
  - normalize data
  - copy assets
  - write manifest
  - populate SQLite
  - commit archive as active only after success
- Failed imports leave a readable failure manifest and do not corrupt the previous active archive.
- Keep Prism, Mermaid, and current reader rendering behavior unchanged.
- Phase 2 explorer views should be built against SQLite/Tauri commands, not against static JSON fetches or localStorage.

## Test Plan

- Build checks:
  - `npm run build`
  - Tauri desktop dev run
  - Tauri production build for Windows first
- Import checks:
  - Import current OpenAI export, including sharded `conversations-*.json` and `.dat` asset blobs.
  - Verify totals match the existing known baseline: 448 conversations, 26,374 visible messages, 3,315 copied assets, 25,006 code artifacts.
  - Verify copied assets render from the library folder.
  - Verify Mermaid, Prism, image lightbox, raw toggle, copy code, and Markdown export still work.
- Current export smoke checks:
  - `cargo test loads_sharded_openai_export`
  - `cargo test imports_real_openai_export_shape -- --ignored`
- State migration checks:
  - Seed `chatArchive.viewerState.v1`.
  - Launch Tauri app.
  - Confirm favorites, pins, read state, recently viewed, bookmarks, and scroll positions appear from SQLite.
  - Relaunch app and confirm state persists without localStorage.
- Search checks:
  - Plain search, phrase search, regex, field chips, `language:python`, `type:document`, `type:link`, `domain:github.com`, `missing:true`.
  - Confirm search uses SQLite/index data rather than loading all conversation JSON into browser memory.
- Durability checks:
  - Clear browser/webview storage and confirm archive state remains.
  - Move/backup the chosen `ChatArchive/` folder and verify the app can reopen it.
  - Failed import does not destroy the previous archive.

## Assumptions

- Tauri is now the primary app direction before Phase 2.
- Rust ingest replaces Node ingest as the product path.
- SQLite is the durable application database; DuckDB is deferred for later analytics.
- The user chooses the visible library folder for backup clarity.
- Existing localStorage state is imported once, then deprecated.
- Full provider neutrality starts with the Rust importer boundary, but only OpenAI import must be implemented in this migration.
