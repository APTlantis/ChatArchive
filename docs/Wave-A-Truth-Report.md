# Wave A Truth & Implementation Report — ChatArchive (November 2026)

## 1. Purpose

This report records the **Wave A1–A4 baseline reality check** and the **first implementation chunk** executed against [`ChatArchive-Roadmap-2026-11.md`](file:///d:/DRS/ChatArchive/docs/ChatArchive-Roadmap-2026-11.md) in the canonical repository at `D:\DRS\ChatArchive`.

---

## 2. Wave A1 — Checkout, Manifest & Test Baseline

### 2.1 Repository & Manifest Alignment
- **Canonical Workspace**: `D:\DRS\ChatArchive`
- **Roadmap Governance**: Updated [`docs/ChatArchive-Roadmap-2026-11.md`](file:///d:/DRS/ChatArchive/docs/ChatArchive-Roadmap-2026-11.md) (Section 2, *Craft, enjoyability, and pragmatic balance*) to codify that enjoyability and visual craft should neither be automatically pursued at the expense of structure/openness nor automatically discounted when they reinforce clarity.
- **Visual System Manifest**: Updated [`ChatArchive.manifest.toml`](file:///d:/DRS/ChatArchive/ChatArchive.manifest.toml) (`[visual_system]`) from `Blue Slate` to `Crystal` (`previous_theme = "Blue Slate"`), matching the active CSS token architecture in [`src/styles.css`](file:///d:/DRS/ChatArchive/src/styles.css) and [`src/library.css`](file:///d:/DRS/ChatArchive/src/library.css).

### 2.2 Automated Verification Baseline
| Suite | Command | Result |
| :--- | :--- | :--- |
| Frontend Unit Tests | `pnpm test` (Vitest) | **2 files, 11 tests passed** (`artifactLogic.test.ts`, `dualListRelationMatrix.test.ts`) |
| Production Build | `pnpm build` (`tsc -b && vite build`) | **Passed** (`dist/` built cleanly in ~0.9s) |
| Rust Importer / DB / Commands | `cargo test --manifest-path src-tauri/Cargo.toml` | **17 passed, 0 failed, 1 ignored** |

---

## 3. Wave A2 — Live Library & Export Truth Audit

### 3.1 Live Library (`T:\CHAT-ARCHIVE\chatarchive.db`) vs. Extracted Export (`D:\DRS\ChatArchive\openai-export`)
Read-only inspection of the live library and extracted export (`D:\DRS\OpenAI-Export_11-03-2026.zip` / `D:\DRS\ChatArchive\openai-export`) established the exact ground truth:

| Metric | Live Library (`T:\CHAT-ARCHIVE`) | Notes |
| :--- | ---: | :--- |
| Conversations | `977` | Matches `conversations-000.json` through `conversations-009.json` |
| Visible Messages | `33,915` | `0` hidden messages in index summary |
| Code Artifacts | `39,733` | Stored in SQLite `code_artifacts` |
| Document Artifacts | `1,867` | Stored in SQLite `document_artifacts` |
| Link Artifacts | `9,515` | Stored in SQLite `link_artifacts` |
| Asset Artifacts (`asset_artifacts`) | `7,101` | `6,574` local, `506` external, `21` missing (`ArchiveIndex.assets` has `7,093` deduplicated entries) |
| User Curation State | Preserved | `2` user collections (`Logos-And-Theming`, `First Gen Lang-Logos`, `12` items), `19` tags, `1` note, `4` confirmed projects (`apt-lang-logos`, `aptlantis`, `wsl`, `website`) |

### 3.2 Three Concrete Truth Gaps Identified & Resolved

1. **`.dat` and Extensionless Image Assets (`Wave A3`)**
   - **Finding**: `D:\DRS\ChatArchive\openai-export` contains `8,447` `.dat` files (`file_*.dat`). While `conversation_asset_file_names.json` maps `7,124` of them, **`1,323` `.dat` files are unmapped** (`892` PNG, `428` WebP, `3` JPEG by magic bytes), and **`241` mapped entries lack a file extension** in their mapped name (`218` PNG, `22` WebP, `1` GIF).
   - **Impact before fix**: In `T:\CHAT-ARCHIVE\archive\assets`, `241` files were exported with `.dat` or no extension (`file_00000000..._file_00000000....dat`) despite containing valid PNG/WebP/JPEG/GIF/SVG payloads, and unmapped `.dat` files were excluded from `image_files` counts because `is_image_path` only checked extensions.
   - **Fix**: Implemented [`detect_file_signature`](file:///d:/DRS/ChatArchive/src-tauri/src/importer.rs#L969-L1021) in [`src-tauri/src/importer.rs`](file:///d:/DRS/ChatArchive/src-tauri/src/importer.rs) inspecting the first 256 bytes for `png`, `jpg`, `webp`, `gif`, `bmp`, `avif`, `ico`, `pdf`, `zip`, and `svg`. Updated `AssetCandidate`, `build_asset_index`, and `export_asset_name` so `.dat` and extensionless files receive their true file extension on export and record `originalName` + `detectedExt` in `manifest.json`.

2. **Code Fence Language Pollution & `BTreeMap` ASCII Ordering (`Wave A3`)**
   - **Finding**: Unescaped inline triple-backticks inside chat messages produced malformed language tokens such as `"`, `")`, and `"},{"role":"tool"...` (`170+` polluted language keys in `T:\CHAT-ARCHIVE\chatarchive.db`). Because Rust's `BTreeMap<String, usize>` serializes keys in ASCII order, punctuation keys sorted ahead of `bash` (`5,705`), `python` (`4,832`), `powershell` (`4,104`), `json` (`2,499`), and `ts` (`1,106`), causing the Dashboard's "Top 10 Languages" list to display punctuation strings.
   - **Fix**:
     - Added [`normalize_code_language`](file:///d:/DRS/ChatArchive/src-tauri/src/importer.rs#L800-L838) in [`src-tauri/src/importer.rs`](file:///d:/DRS/ChatArchive/src-tauri/src/importer.rs) so future imports normalize aliases (`py` -> `python`, `pwsh` -> `powershell`, `sh` -> `bash`, etc.) and collapse any token containing quotes, braces, spaces, or non-identifier punctuation to `text`.
     - Added [`sanitizeCodeLanguageToken`](file:///d:/DRS/ChatArchive/src/artifactLogic.ts#L10-L31) and [`classifyCodeArtifactKind`](file:///d:/DRS/ChatArchive/src/artifactLogic.ts#L33-L64) in [`src/artifactLogic.ts`](file:///d:/DRS/ChatArchive/src/artifactLogic.ts), and updated [`ArtifactDashboard`](file:///d:/DRS/ChatArchive/src/App.tsx#L1083-L1150) and [`CodeExplorer`](file:///d:/DRS/ChatArchive/src/App.tsx#L1168-L1358) in [`src/App.tsx`](file:///d:/DRS/ChatArchive/src/App.tsx) so existing databases immediately render clean, count-sorted language facets and a new **Block kind** filter (`Source code`, `Shell / command`, `Config / data`, `Diagram`, `Prose / text`).

3. **Relational Matrix Demo-Seed Overwrite Bug (`Wave A2` / `Wave C`)**
   - **Finding**: [`DualListRelationMatrix.tsx`](file:///d:/DRS/ChatArchive/src/DualListRelationMatrix.tsx) previously ran a `useEffect` that overwrote `knowledgeState` with 7 fake `SEED_COLLECTIONS` and `conv_1` pointers whenever `knowledgeState.collections.length === 0`.
   - **Fix**: Removed the automatic demo-seeding `useEffect` from [`src/DualListRelationMatrix.tsx`](file:///d:/DRS/ChatArchive/src/DualListRelationMatrix.tsx#L131-L135) while keeping `SEED_COLLECTIONS` exported strictly for unit test fixtures.

---

## 4. Wave D2 & Wave C5 — End-to-End Source Jump & Portable Recovery Bundles

### 4.1 Source Context Round-Trip (`src/App.tsx`, `src/styles.css`)
- Jumping from **Code Explorer**, **Document Explorer**, **Asset Explorer**, or the **Dual-List Relation Matrix** (`Source` button on any pointer row) to a conversation now:
  1. Remembers the originating workspace view (`returnView`) and updates the topbar back button label (`Back to Code Explorer`, `Back to Documents`, `Back to Assets`, `Back to Knowledge`, `Back to Projects`).
  2. Scrolls directly to `#message-<messageId>` and highlights the target message card (`.message-highlighted`).
- Clicking an artifact row in the **Dual-List Relation Matrix** (`onOpenTarget`) opens the corresponding Explorer (`code`, `documents`, `assets`) and selects that exact artifact (`initialSelectedId`).

### 4.2 Portable Recovery Bundle Export (`src-tauri/src/commands.rs`, `src/archiveApi.ts`, `src/DualListRelationMatrix.tsx`)
- Added Tauri command [`export_recovery_bundle`](file:///d:/DRS/ChatArchive/src-tauri/src/commands.rs#L244-L263) and core builder [`build_recovery_bundle`](file:///d:/DRS/ChatArchive/src-tauri/src/commands.rs#L265-L491):
  - Exports any collection (Column 2 `Export Bundle` button) or the active Staging Queue (Column 3 `Export Queue` button) to a self-contained folder on disk:
    - `code/` — materialized source files with language-appropriate extensions
    - `documents/` — markdown documents with provenance header
    - `assets/` — copied local asset files with magic-byte extension recovery when needed
    - `conversations/` — full conversation JSON snapshots
    - `manifest.json` & `README.md` — structured and human-readable provenance index
