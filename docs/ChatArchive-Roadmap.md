# Chat Archive Local Export Toolbox Roadmap

## Phase 1 — Archive Viewer Maturity

**Goal:** Become the best local ChatGPT archive browser.

**Status:** Complete. The app now opens to a dashboard, supports richer client-side search and filters, stores viewer navigation state in browser `localStorage` under `chatArchive.viewerState.v1`, generates a dedicated artifact index for code, assets, documents, and links, highlights code blocks with locally bundled Prism, and renders Mermaid/ZenUML diagrams locally.

## Phase 1.5 — Tauri Durable Archive Foundation

**Goal:** Move the project from a static browser prototype to a durable local desktop app before building deeper explorer workflows.

**Status:** Complete as the new product foundation. ChatArchive now has a Tauri 2 shell, React UI, Rust OpenAI importer, user-selected `ChatArchive/` library folder, SQLite metadata/state database, filesystem-backed archive assets, Markdown export through the backend, and one-time migration from `chatArchive.viewerState.v1`.

Implemented:

* User-chosen library folder with `archives/`, `chatarchive.db`, and `settings.json`
* Rust `ProviderImporter` boundary with `OpenAiImporter` as the first implementation
* Transaction-oriented archive import with staged archive folders
* Normalized per-conversation JSON on disk
* Copied screenshots and attachments stored as normal filesystem assets
* SQLite tables for archives, conversations, messages, code artifacts, asset artifacts, document artifacts, link artifacts, tags, saved searches, favorites, pins, read state, recent views, bookmarks, scroll positions, and FTS search
* Tauri commands for library setup, import, listing, conversation loading, search, dashboard data, viewer-state updates, and Markdown export
* Browser fallback adapter retained for static development, but durable state now belongs to SQLite

### Phase 1 Search Improvements

Current:

* Dashboard-first archive start screen
* Title and message search
* Phrase search
* Regex search toggle
* Search field chips for all, title, content, code, raw, and assets
* Artifact-backed search field chips for code, assets, documents, and links
* Typed operators including `title:`, `content:`, `type:code`, `type:document`, `type:link`, `language:`, `domain:`, `raw:true`, `asset:true`, `missing:true`, and `external:true`
* Date range filters
* Conversation length filters
* Dedicated artifact indexes for exact language, asset, document, and link search
* Locally bundled Prism code highlighting
* Locally bundled Mermaid and ZenUML diagram rendering with source fallback

Remaining:

* Saved searches
* Semantic search
* Explorer views for code, documents, assets, and links are promoted to Phase 2

Example:

```text
rust downloader
```

or

```text
language:rust
```

or

```text
type:code blake3
```

---

### Phase 1 Navigation Improvements

Implemented:

* Recently viewed
* Favorites
* Message bookmarks
* Pinned conversations
* Read/unread markers
* Last viewed position

---

### Phase 1 Archive Statistics

Implemented dashboard:

```text
448 Conversations

26,374 Messages

2,282 Assets

Code Block Count

First Chat:
computed from archive index

Latest Chat:
computed from archive index
```

---

# Phase 2 — Artifact Extraction

**Goal:** Stop treating conversations as blobs.

**Status:** Planned. The artifact tables now exist in SQLite; Phase 2 builds dedicated explorer views and workflows on top of the Tauri command boundary, database indexes, and filesystem-backed archive library.

---

## Code Explorer

Extract:

```text
Language
File Name
Conversation
Date
Code
```

Build:

```text
Code
├── Rust
├── Python
├── PowerShell
├── Bash
├── YAML
```

Features:

* Browse by language
* Search code only
* Use Prism highlighting in snippets and detail views
* Export snippets
* Copy snippet
* Open source conversation
* Show snippet size, message role, date, and source conversation

---

## Document Explorer

Extract:

```text
Markdown
READMEs
Standards
Specifications
Release Notes
```

Browse:

```text
Documents
├── Standards
├── READMEs
├── Release Notes
├── Architecture
```

Features:

* Browse by document type
* Search document titles and previews
* Export selected candidates to Markdown
* Open source conversation

---

## Asset Explorer

Extract:

```text
Images
Diagrams
Screenshots
Generated Images
```

Browse:

```text
Assets
├── Screenshots
├── Diagrams
├── UI Mockups
├── Generated Images
```

Features:

* Browse by asset kind
* Filter local, external, and missing assets
* Open full-size previews
* Open source conversation
* Surface missing-asset repair targets

---

## Link Explorer

Track:

```text
GitHub
Documentation
Articles
Repositories
```

Useful for recovering old references.

Features:

* Browse by domain
* Search labels and URLs
* Copy URL
* Open source conversation
* Group common domains such as GitHub, documentation, package registries, and articles

---

# Phase 3 — Knowledge Organization

**Goal:** Turn archive into a knowledge base.

**Status:** Implemented. ChatArchive now stores reusable manual tags, cross-conversation collections, notes, and favorites in the library SQLite database. Conversations, code snippets, documents, and assets share one organizer, and the Knowledge workspace surfaces collections, starred items, and recent notes.

---

## Tags

Manual tags:

```text
WSL
Rust
Security
Docker
AI
```

Apply:

```text
Conversation
Code Snippet
Asset
Document
```

---

## Collections

Example:

```text
Aegis

CityHall

FileCabinet

Command Wizard
```

Collections span conversations.

---

## Notes

Attach notes to:

```text
Conversation
Code Block
Document
Asset
```

Example:

```text
This became v0.3.0 implementation.
```

---

## Favorites

Star:

```text
Conversation
Code
Document
Asset
```

---

# Phase 4 — Project Intelligence

**Goal:** Discover long-running projects.

This is where things become unique.

---

## Project Detection

Use heuristics:

```text
Repeated keywords
Titles
Tags
Referenced files
```

Create:

```text
Projects
├── Aegis
├── Aptlantis
├── CityHall
```

Automatically.

---

## Project Timelines

Example:

```text
Aegis

Aug 2025
Initial concept

Oct 2025
UI design

Jan 2026
Backend implementation

Feb 2026
v0.3.0
```

---

## Project Dashboards

Show:

```text
Conversations
Documents
Code
Assets
Links
```

All related to one project.

---

# Phase 5 — Conversation Distillation

**Goal:** Make large archives manageable.

No AI required initially.

---

## Conversation Metadata

Generate:

```text
Message Count
Code Count
Asset Count
Links
Languages Used
```

---

## Conversation Reports

Example:

```text
Title

Summary

Key Topics

Code Produced

Assets Referenced

Referenced Projects

Related Conversations
```

Initially:

* Manual
* Rule-based

Later:

* Optional AI

---

## Decision Tracking

Extract:

```text
Decision:
Use MSIX

Conversation:
Packaging Discussion

Date:
2026-02-11
```

---

## Task Extraction

Extract:

```text
TODO
Next Steps
Action Items
```

Useful for project archives.

---

# Phase 6 — Cross-Conversation Discovery

**Goal:** Connect archive content.

---

## Related Conversations

Based on:

```text
Shared tags
Shared code
Shared assets
Shared links
Shared projects
```

---

## Topic Graphs

Example:

```text
WSL
 ├─ Debian
 ├─ Ubuntu
 ├─ Nitrux
 └─ Solus
```

---

## Timeline Views

Browse:

```text
By Year

By Month

By Project

By Topic
```

---

# Phase 7 — Publishing & Portability

**Goal:** Share safely.

---

## Public Export

Remove:

```text
Hidden messages
Personal data
Sensitive paths
```

Generate:

```text
Static Site
Markdown Bundle
ZIP Archive
```

---

## Redaction Engine

Detect:

```text
Emails
Paths
Tokens
Keys
URLs
```

---

## Portable Archives

Export:

```text
Conversation Package
Project Package
Collection Package
```

---

# Phase 8 — Provider Neutral Archive

**Goal:** Become more than a ChatGPT tool.

This is where I think the project becomes genuinely interesting.

---

## Provider Adapters

Support:

* ChatGPT
* Claude
* Gemini
* Open WebUI
* Ollama
* Jan
* LM Studio

---

## Unified Archive Model

Everything becomes:

```text
Conversation
Message
Code
Document
Asset
Link
Project
```

regardless of source.

---

## Cross-Provider Search

Example:

```text
Show every conversation
about Docker
from Claude, ChatGPT,
and Gemini.
```


