# Chat Archive

A local-first viewer for exported ChatGPT conversations. It turns an OpenAI data export into a fast, searchable, static archive with readable conversation threads, copied image assets, highlighted code blocks, rendered Mermaid diagrams, raw-message visibility, and per-conversation Markdown export.

This project started as a personal archive reader, but the shape is intentionally useful beyond one person's ChatGPT history: a provider export goes in, normalized conversation data comes out, and the UI reads that normalized archive without needing a backend.

## What It Does Today

- Imports `openai-history/conversations.json` from a ChatGPT/OpenAI export.
- Normalizes conversation trees into ordered message threads.
- Separates visible chat messages from hidden/raw system, tool, and metadata messages.
- Extracts Markdown text, fenced code blocks, execution output, citations, references, and image pointers.
- Copies matching local image assets into `public/archive-assets`.
- Tracks unresolved asset pointers and external image URLs in `public/archive-data/assets-manifest.json`.
- Builds a static archive index in `public/archive-data/index.json`.
- Builds a dedicated artifact index in `public/archive-data/artifacts.json` for code, assets, document-like Markdown, and links.
- Writes one JSON file per conversation in `public/archive-data/conversations`.
- Provides a React reader with search, month grouping, conversation outline, image lightbox, code copy, all-code copy, raw-message toggle, and Markdown export.
- Highlights code blocks with a locally bundled Prism build; no CDN or external runtime call is needed.
- Renders Mermaid and ZenUML fenced diagrams from local npm packages, with source fallback when a diagram cannot be parsed.
- Opens to a local dashboard with archive totals, first/latest chat dates, code block counts, unresolved asset counts, recently viewed conversations, favorites, pins, and read/unread totals.
- Supports richer client-side search with phrases, regex mode, field chips, typed operators such as `type:code`, `language:python`, `type:document`, `type:link`, `domain:github.com`, date ranges, and conversation length filters.
- Stores viewer-only state in browser `localStorage` under `chatArchive.viewerState.v1`, including favorites, pins, read markers, recently viewed conversations, message bookmarks, and last scroll position.

The current local archive build contains 448 conversations, 26,374 visible messages, 9,584 hidden/raw messages, 3,315 copied local assets, 25,006 code artifacts, 10,297 document artifacts, and 8,096 link artifacts. Those numbers come from the generated data currently in this working tree and will change whenever a different export is ingested.

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
- A ChatGPT/OpenAI export folder containing `conversations.json`

The app is currently a Vite + React + TypeScript project.

## Setup

Install dependencies:

```powershell
npm install
```

Place your OpenAI export in:

```text
openai-history/
```

The expected file is:

```text
openai-history/conversations.json
```

Then ingest the archive:

```powershell
npm run ingest
```

Start the local dev server:

```powershell
npm run dev
```

Build the static app:

```powershell
npm run build
```

Preview the production build:

```powershell
npm run preview
```

## Using A Different Export Location

By default, the ingest script reads from `D:\Chat\openai-history`. You can point it at another OpenAI export folder with `OPENAI_HISTORY_DIR`:

```powershell
$env:OPENAI_HISTORY_DIR = "D:\Exports\openai-history"
npm run ingest
```

The generated archive is still written into:

```text
public/archive-data/
public/archive-assets/
```

## Project Layout

```text
D:\Chat
├── scripts/
│   └── ingest-openai-history.js       # OpenAI export normalizer
├── src/
│   ├── App.tsx                        # Archive reader UI
│   ├── main.tsx                       # React entrypoint
│   ├── styles.css                     # App styling
│   └── types.ts                       # Archive data types
├── prism/
│   ├── prism.js                       # Locally bundled Prism languages/plugins
│   └── prism.css                      # Prism Okaidia theme
├── mermaid/                           # Downloaded Mermaid source snapshot/reference
├── public/
│   ├── archive-data/
│   │   ├── index.json                 # Search/list index and totals
│   │   ├── artifacts.json             # Code, asset, document, and link index
│   │   ├── assets-manifest.json       # Copied, external, and missing asset records
│   │   └── conversations/             # One normalized JSON file per conversation
│   └── archive-assets/                # Copied local image assets
├── openai-history/                    # Source export folder, local/private
└── dist/                              # Production build output
```

## Data Model

The app reads a small normalized model instead of rendering the raw provider export directly.

- `ArchiveIndex` contains generated metadata, totals, and conversation summaries.
- `ConversationSummary` powers search, grouping, counts, snippets, and selection.
- `ConversationFile` contains a full normalized conversation and its messages.
- `ArchiveMessage` stores role, author, time, content type, extracted blocks, assets, references, hidden/raw status, and original content type.
- `MessageBlock` supports Markdown, code, execution output, and notices.
- `ArchiveAsset` tracks local, external, and missing assets.
- `ArtifactIndex` powers exact language, code, asset, document, and link search without loading every conversation file.

This normalized layer is what makes future provider support realistic. Gemini, Claude, Ollama, Jan, or other sources do not need to match OpenAI's export format; they only need adapters that produce the same archive model.

## Current Limitations

- Only OpenAI/ChatGPT export ingestion is implemented.
- Markdown rendering is intentionally lightweight and does not cover every Markdown extension.
- Asset recovery is best-effort. Some OpenAI pointers cannot be matched to local files, but unresolved pointers are recorded.
- Audio and video payloads are skipped by the current asset extractor.
- Search is client-side over generated indexes. Exact artifact search depends on a fresh `npm run ingest` so `artifacts.json` matches the current archive.
- Prism and Mermaid are bundled locally, so the production build is intentionally larger than a CDN-based version.
- Mermaid diagram rendering is limited to fenced `mermaid`, `mmd`, and `zenuml` code blocks.
- Favorites, pins, bookmarks, read markers, and scroll positions are browser-local state. They do not currently sync across browsers or export as a sidecar file.
- There is no built-in privacy scrubber yet. Treat generated archive files as sensitive.
- There is no database or server API. This is currently a static archive reader.

## Privacy Notes

Exports can contain personal data, private code, credentials, screenshots, attachments, and sensitive conversation history. This project keeps processing local, but the generated files are still readable static assets.

Before publishing or sharing:

- Review `public/archive-data`.
- Review `public/archive-assets`.
- Consider deleting or excluding `openai-history`.
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

- Better pointer matching for OpenAI image assets.
- Support downloaded files, PDFs, audio transcripts, and generated images.
- Asset deduplication by hash.
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

The ingest script is deliberately plain Node.js so it can run before the React app exists or without a server. It reads the provider export, writes static JSON, copies assets, and records anything it cannot resolve.

The UI is deliberately static. It fetches JSON from `/archive-data`, renders conversations in the browser, and does not require a backend service. That keeps the archive portable and makes it easier to host, zip, back up, or run locally.

## Suggested Next Milestones

1. Split the current OpenAI ingest logic into a provider adapter shape.
2. Add a small fixture-based test set for normalized archive output.
3. Add a privacy scrubber before broader sharing.
4. Add provider-neutral import documentation.
5. Add a local-model handoff exporter for one selected conversation.
6. Add Code Explorer, Document Explorer, Asset Explorer, and Link Explorer views on top of the artifact index.

## Status

Phase 1 archive viewer maturity is complete. The app is useful today for local OpenAI export browsing, dashboard review, Prism-highlighted code reading, local Mermaid/ZenUML diagram rendering, richer search/filtering, exact artifact-backed operators, and browser-local navigation state, with a clear path toward Phase 2 explorer views.
