# ChatArchive — Strategic Roadmap

**Reset date:** 2026-11-05  
**Status:** Proposed product direction; not an implementation-status report  
**Scope:** Future work only. Previously shipped or implemented capabilities are deliberately excluded from the task list.  
**Product:** Local-first Tauri/Rust/React desktop archive workbench, Windows Store as the currently documented public distribution lane.

> **Product thesis:** ChatArchive should make past conversations and their artifacts *recoverable, understandable, reusable, and portable*. It should not attempt to become a general-purpose IDE, file manager, project management suite, or autonomous AI knowledge system.

---

## 1. Why this roadmap replaces the old one

The former roadmap was largely capability-oriented: build a viewer, add indexes and explorers, create knowledge tools, add projects, distill conversations, connect topics, publish, and eventually support other providers. Its foundation and a substantial portion of its once-future UI are now visible in the newer screenshots. Continuing to carry completed phases makes the roadmap both less actionable and less informative.

This document deliberately starts from the current *product opportunity*, not from the chronological history of implementation. It preserves the old roadmap and release records as historical evidence; it does not remove historical accomplishments from the repository.

### Evidence considered and confidence

- **November UI captures:** dashboard; conversation reader and Mermaid rendering; Code Explorer; Asset Explorer; Knowledge/Collection manager; full-screen collection canvas; Project Intelligence. They demonstrate visible workflows, not necessarily backend correctness or complete public release readiness.
- **Old roadmap:** describes a Tauri 2, Rust importer, SQLite state/indexes, filesystem-backed assets, search, explorer aspirations, collections, an experimental Project Intelligence system, and future export/provider goals.
- **September 2026 manifest:** identifies an active `0.2.0` / “Export Continuity” draft and pending final package evidence. Its Blue Slate visual dependency and release metadata may no longer reflect the latest development checkout.
- **August 2026 WACK report:** overall `PASS` for v0.1.2.0; it also contains an optional blocked-executable-analyzer `FAIL`. That historical result neither blocks all future work nor proves a later build is ready.
- **Store release playbook:** establishes separate lanes for source tests, MSIX/WACK validation, local signing, Store certification, integrity signatures, and publication.
- **Limitation:** no current repository build, live database, or automated test run was performed for this roadmap. Actual behavior, performance, migration state, and present release version must be checked against the working checkout.

### Observations that should influence priorities

The supplied November dashboard shows **977 conversations**, **33,915 messages**, **39,733 indexed code artifacts**, **7,101 indexed assets**, **1,867 documents**, **9,515 links**, and **21 unresolved assets**. The Knowledge view shows **7 collections**, **7 organized items**, **5 tags**, and **0 notes** in that captured state. Those numbers are observations from one UI snapshot, not a test of correctness.

Two things are especially worth checking:

1. **High code-artifact counts are not inherently bad,** because a message can contain many blocks. However, the prominent `text` and `bash` categories make it worth measuring how many extracted items are actually reusable code versus logs, prose, commands, or examples.
2. **Most local assets appear with `.dat` extensions** in the Asset Explorer. That may accurately preserve export filenames, but a user needs reliable type detection, understandable previews, practical filenames, and safe bulk recovery when taking material back out.

The relatively small amount of manual organization is another signal: the app must deliver value **before** users spend hours curating collections, tags, or projects.

---

## 2. North star and product boundaries

### North-star user story

> “I remember we worked out a Rust utility, a useful diagram, and a few design choices months ago. I want to find the right version, see its original context, collect the pieces, and export usable files—without manually reopening dozens of chats.”

Every major feature must improve at least one of four outcomes:

1. **Find:** locate a specific conversation, message, artifact, or idea quickly.
2. **Trust:** verify exactly where it came from, what is intact, and what may be missing or transformed.
3. **Reuse:** copy, compare, collect, and export it into an existing workflow.
4. **Preserve:** safely reimport, migrate, back up, and move archives without losing user curation.

### Architectural rules

| Layer | Responsibility | Rule |
|---|---|---|
| Source archive | Imported conversations and original attachments | Preserve provenance and enough raw source to audit conversions; do not silently rewrite history |
| Derived index | Search, artifact detection, thumbnails, classification, optional embeddings | Rebuildable from sources; version extraction rules |
| User curation | Collections, tags, favorites, notes, verified relationships | Must survive reindexing and export refresh |
| Optional workspace | A focused view on references to source items | Avoid duplicating entire archive records or inventing a second filesystem |
| Export | Portable materialization of chosen source items | Explain transformations, preserve backlink metadata, never execute extracted code |

**Default posture:** local-first; offline basic browsing; no account requirement; no background uploading; no model requirement for core features; no irreversible automated organization.

### Terminology to keep stable

- **Archive:** a source import/snapshot, including provider provenance and import history.
- **Conversation / message:** the canonical navigable source context.
- **Artifact:** a detected or user-designated code block, document, image/asset, diagram, or link anchored to a source location.
- **Collection:** an arbitrary many-to-many grouping of references. Can combine chats, snippets, images, local file references, and other meaningful material; does not imply a software project.
- **Project:** an explicitly confirmed, optional longitudinal grouping around work over time. A project may refer to collections and artifacts, but is not an obligatory parent of them.
- **Saved view:** a query/filter definition, possibly dynamic; it is not a duplicate collection unless the user pins specific items.

**Projects should remain shallow:** the current two-level approach is a hard starting constraint. Do not add hierarchical subproject trees or project administration unless concrete workflows justify them.

### Craft, enjoyability, and pragmatic balance

This roadmap intentionally leads with structure, provenance, and openness rather than intangible qualities like "delight" or "aesthetic feel." In many software projects, elevating those intangibles to top-level roadmap goals causes features and surface usability to become the entire point of the application at the expense of honest data structure, inspectability, and portability.

However, there is real value in an application being genuinely enjoyable to use:

- **Neither automatically pursued nor automatically discounted:** Tactile clarity, calm visual hierarchy, balanced typography, and responsive interactions should not be chased for their own sake or allowed to obscure raw archive truth—but they also should not be dismissed when they make long archival reading and curation sessions markedly better.
- **Structure and openness come first:** Whenever an aesthetic or experiential refinement can be achieved *without* compromising data transparency, local-first openness, or structural simplicity, it is worth doing thoughtfully. Whenever polish competes with inspectability or portability, structure wins.

---

## 3. The dependency order at a glance

```text
A. Archive integrity & continuity
                │
                ▼
B. Excellent retrieval + exact source navigation
                │
                ▼
C. Artifact recovery, comparison & portable export
                │
                ▼
D. Frictionless collections and optional project views
                │
                ▼
E. Timeline, relationships & evidence-based rediscovery
                │
                ▼
F. Selective local AI / second-provider experiments
                │
                ▼
G. Curated publishing and ecosystem integrations

Cross-cutting: performance • UX • accessibility • security • Store release evidence
```

This is a **dependency order**, not a promise of one gigantic release. A small high-value item from a later wave can move earlier if it has no dangerous dependencies. A big speculative item should not leap ahead just because it is technically interesting.

| Rank | Investment area | Expected value | Risk / effort | Planning decision |
|---|---|---|---|---|
| 1 | Reimport reliability, provenance, backup/rollback | Essential | Medium–high | Protect first |
| 2 | Fast, contextual retrieval and saved views | Very high | Medium | Main product differentiator |
| 3 | High-fidelity artifact extraction / useful export | Very high | Medium–high | Highest practical payoff |
| 4 | Collection usability and batch workflows | High | Medium | Build on existing UI, reduce friction |
| 5 | Version history, timeline, exact/similar reuse | High | Medium | Favor deterministic evidence |
| 6 | Shallow opt-in Projects | Uncertain | Potentially high | Time-box; allow retirement |
| 7 | Local semantic search / grounded assistant | Conditional | High | Pilot only after retrieval benchmark |
| 8 | One additional provider adapter | Conditional | Medium–high | Only for real sample data and demand |
| 9 | Public publishing / elaborate knowledge graphs | Low near-term | High | Defer |

---

## 4. Wave A — Archive integrity, continuity, and extraction truth

**Outcome:** The application can explain what it has, what it lacks, and whether a new export can be imported safely. No user-curated work disappears when source data is refreshed.

### A1. Establish a current-state truth report

- Reconcile screenshots, `ChatArchive.manifest.toml`, project docs, actual build/version, database schema, and release branch.
- Verify which UI features persist, which are demos, and which are public-release-capable; explicitly label any development-only surface.
- Run a representative local build and tests; record exact commands, versions, failures, and dataset size.
- Gather a repeatable fixture: several long conversations, many code blocks, diagrams, attachments, unresolved pointers, and at least two refresh exports.
- Measure index counts by *message*, *artifact*, *provider*, *source state*, and *detected type*, not only dashboard totals.

**Gate:** A human-readable “what is real today” report with reproducible fixtures and no ambiguous feature claims.

### A2. Finish safe export-refresh behavior

- Identify repeated conversations/messages across OpenAI exports without duplicating them.
- Preserve user tags, collections, bookmarks, notes, links to artifacts, and read state across reimport/reindex.
- Resolve source record identity deterministically, with collision and changed-content handling.
- Transactional import, dry-run preview (new/updated/unchanged/missing), cancellation, rollback, and interrupted-import recovery.
- Version database migrations; run migration tests against earlier library formats.
- Add backup/restore verification and clear “what will be replaced?” language.

**Gate:** Multiple repeated imports do not silently duplicate data or detach curated references; forced cancellation and rollback leave a usable library.

### A3. Audit artifact fidelity

- Sample actual code blocks by language, especially `text`, `bash`, and mislabeled/empty fences.
- Distinguish code, terminal transcripts, config, prose-fenced blocks, structured data, diagrams, and unknown material; retain the original label as evidence.
- Inspect `.dat` attachments by content signature/MIME where possible, without changing preserved source files.
- Track original extension, detected type, display type, dimensions, import status, and repairability separately.
- Build a small accuracy benchmark: user-verified positive/negative examples and counts of false classifications.

**Gate:** An auditable report documents accuracy and specific fixes. Avoid promising “all code” or “all images” if classification is uncertain.

### A4. Treat unresolved assets as a repair queue

- Group missing/external assets by cause and affected conversation.
- Offer safe relink/recovery where there is local evidence.
- Provide “skip,” “still external,” and “unrecoverable” states; do not repeatedly nag users for impossible repairs.
- Distinguish a genuinely missing asset from an intentionally external reference.

**Gate:** Each unresolved asset has an understandable status and an actionable next step or explicit terminal reason.

---

## 5. Wave B — Retrieval that wins without organization

**Outcome:** A user can recover remembered material quickly, even in an untagged archive.

### B1. One consistent search language

- Make global search and explorer search share a clear query model, filtering vocabulary, and result count semantics.
- Retain exact, phrase, code-language, role, date, type, domain, and source/provider filters; add a query builder that writes readable syntax rather than a separate incompatible mode.
- Add saved searches, pinned searches, recent useful queries, and a compact reset path.
- Explain why an item matched and highlight the matched span, not only the item title.
- For every result, show concise type, source conversation, message role/date, and availability state.

### B2. Reliable source navigation

- Deep-link directly to the **exact message and artifact occurrence**, not merely to the top of a long conversation.
- Preserve location when moving `Search → Artifact → Source → Back`.
- Provide adjacent message context around a result without losing the selected result.
- Handle results in huge conversations using virtualized navigation and stable anchors.
- Copy an internal deep-link/locator that remains valid after reindex where identities are preserved.

### B3. Usefulness-oriented result controls

- Preview before opening; keyboard navigation; density controls; consistent sorting; collection-aware filter.
- Let users compare multiple candidate hits side-by-side only where useful; do not build a giant universal comparison UI.
- Add `Find related exact/near duplicate` initially using hashes, normalized text, language, and source metadata.
- Make zero-result states propose a small number of transparent query relaxations.

### B4. Measure retrieval rather than counting UI features

Maintain a benchmark of **10–20 known-item retrieval tasks**, including: one exact phrase, one snippet by language, one image from an old chat, one document, one broken pointer, and one ambiguous topic with multiple versions.

Record: found/not found, elapsed time, correct source link, useful preview, and number of interactions. Choose performance thresholds after a real baseline on the target Windows machine.

**Gate:** Known items are found reliably and are opened at the correct location; users do not need to create tags or projects first.

---

## 6. Wave C — Recovery, versioning, and export as the practical payoff

**Outcome:** ChatArchive is not only where things are viewed. It is where reusable work can be recovered to normal, named files.

### C1. Better code artifact recovery

- Identify filename and language candidates with confidence; user can override them.
- Provide copy, save-as, and multi-select export with sensible extensions.
- Recover adjacent snippets and multipart answers without silently concatenating unrelated content.
- Keep `original text`, `normalized preview`, and `user-edited exported copy` distinct.
- Use safe filename sanitation and collision rules; show the resulting paths before writing.
- Add source metadata to a sidecar/manifest rather than polluting executable code by default.

### C2. Document recovery

- Export document candidates as Markdown (preserving headings, fences, and links where feasible).
- Recognize document-like answers, not only fenced Markdown, but require preview when boundaries are uncertain.
- Optional document frontmatter: source conversation, source message, timestamps, title, confidence, and extraction version.
- Let users choose a single document, selected sections, or a batch; prevent accidental duplication.
- Markdown output should be usable by tools like SiYuan, a docs site, or ordinary editors without ChatArchive installed.

### C3. Asset recovery and type fidelity

- Detect actual file type of `.dat` assets by trusted signatures; present recognizable extensions and preview types.
- Export with user-friendly, collision-safe names; retain original pointer and source metadata.
- Batch export by collection, conversation, date, type, or query result.
- Offer deterministic duplicate detection by hash; show duplicate groups without automatically deleting sources.
- Preserve original binary bytes when merely renaming or packaging; any conversion must be a separate explicit action.

### C4. Version and duplicate comparison

- Group byte-identical snippets/assets by content hash.
- For likely code revisions, show a *candidate* version lineage based on same name, language, and related conversation context; user confirms relationships.
- Add side-by-side/diff view for text and code, with clear dates and source links.
- Avoid declaring a “latest correct version” solely because a block has a later timestamp.

### C5. Portable recovery packages

Create user-chosen bundles with a simple predictable structure:

```text
Recovered-Collection/
  manifest.json             # items, origins, hashes, transforms
  README.md                 # human-readable index and limitations
  code/
  documents/
  assets/
```

- Export selected files, Markdown, or a ZIP; optional relative hyperlinks in the index.
- Include hashes and source identifiers; do not require an Aptlantis or City Hall schema to read a basic bundle.
- Warn about missing files and filename conflicts before committing.
- Detect obvious secrets and sensitive paths in *publish-intended* exports; never claim detection is exhaustive.

**Gate:** A representative mixed collection can be exported, opened in normal desktop tools, traced back to source, and re-exported predictably without silent data loss.

---

## 7. Wave D — Collections first; Projects on probation

**Outcome:** Users can organize work when it helps, but organization never becomes the price of admission.

### D1. Collections are flexible reference sets

- Preserve many-to-many membership and heterogeneous content: conversations, messages, code, documents, assets, and links.
- Add **optional external local-file references** (for a local JSON, logo, stylesheet, or directory of resources) as *references*, not implicit bulk imports or copies.
- External references should expose path, availability, size/type where obtainable, and what happens when a drive is moved or unplugged.
- Allow stable item names, notes, ordering, selection, and quick open-source/open-file actions.
- Support batch add/remove from every explorer consistently.
- Offer lightweight “inbox/review later” behavior that avoids requiring taxonomy decisions at capture time.

### D2. Remove friction from the current three-column canvas

The existing collection matrix is promising but dense. Improve the workflow instead of adding more panels:

- An immediate and obvious path: **select → choose collection → confirm**.
- Keep selected items visible when switching views; use a temporary selection tray.
- Move rarely used controls behind contextual menus; distinguish selected collection(s) from selected artifact(s).
- Show what will be linked or unlinked before a many-item operation.
- Provide compact and spacious layouts; make the full-screen manager optional rather than obligatory.
- Remove demo/sample controls from production surfaces once real flows work.

### D3. Saved searches versus manual collections

- **Saved view:** dynamically updates with the query; no obligation to curate members.
- **Collection:** explicitly chosen items; stable manual membership.
- Support “add current results to collection,” but keep the distinction visible.
- Do not automatically move/retag items based on search results without explicit opt-in.

### D4. Project Intelligence: a small falsifiable experiment

Keep the separate Projects concept only if it saves meaningful work.

- Candidate detection may suggest *possible* projects from meaningful recurring titles, tags, and collections.
- A project must be confirmed by the user; no autonomous mass creation.
- Start with two levels at most and a small amount of project-specific state: title, aliases, attached items, and chronology.
- A project view should combine useful pointers and an evidence-backed chronological view—not create tasks, milestones, dependencies, or its own file manager.
- Time-box one small implementation/evaluation cycle on **3–5 real long-running projects**, comparing it to simply using collections plus saved searches.

**Keep Projects only if** finding and revisiting longitudinal work is visibly faster, maintenance/curation is small, and the distinction from Collections stays obvious. **Collapse or remove the separate workflow** if it repeatedly duplicates collection behavior, invents noisy candidates, or requires ongoing administration.

**Gate:** A brand-new user can create a collection and save a useful mixed set in minutes; a project can be ignored entirely without any capability loss to ordinary browsing/recovery.

---

## 8. Wave E — Evidence-based rediscovery across time

**Outcome:** The archive reveals continuity, without pretending that inferences are facts.

### E1. Chronology that helps answer real questions

- Timeline for a conversation, collection, confirmed project, or saved query.
- Show concrete events: conversation started, source message, artifact created, document revision candidate, collection membership change.
- Filter to substantive material, not one tick for every message.
- Link every timeline event to the exact supporting source.

### E2. Related items without a “knowledge graph” dependency

Use transparent relationships first:

- Same file/hash; identical or near-identical code; same URL; shared manually applied tags; same collection; repeated unique terms; cited filename or repository.
- Display a “Why related?” explanation.
- Let users reject a suggestion; store that rejection to avoid repeated noise.
- Add an optional local graph visualization only if it helps users navigate a proven relationship dataset.

### E3. Decision and task *candidates*, not authoritative records

- Surface passages that appear to contain decisions, TODOs, rejected approaches, or proposed follow-ups.
- Always attach the surrounding messages and date; distinguish **discussed**, **proposed**, **confirmed**, **superseded**, and **unknown**.
- Prefer manual confirmation before moving a decision into a project/collection summary.
- Never infer current task status merely from a statement in an old conversation.

### E4. “What changed?” exploration

- Compare candidate revisions of a recovered snippet or document.
- Show conversations mentioning a distinct change over time.
- Produce a source-linked activity report for a collection/project without replacing the raw history.

**Gate:** At least three concrete rediscovery tasks are substantially easier than manually searching and opening chronological chats; each generated relationship or claim is inspectable.

---

## 9. Wave F — Optional intelligence and provider experiments

These are **opt-in experiments**, not foundation requirements.

### F1. Semantic retrieval: benchmark before productizing

- Start with small local embedding tests on representative chat/message and artifact chunks.
- Evaluate hybrid **FTS + semantic** retrieval versus current lexical search on the *same* known-item benchmark.
- Compare time, model/storage cost, index build burden, and relevance; label inferred results.
- Keep embeddings rebuildable; do not mix semantic scores with lexical scores without a clear ranking policy.
- If semantic search is no better for important tasks, stop. Do not ship it just to advertise “AI search.”

### F2. Grounded local assistant, only if semantic retrieval proves value

- User-selectable local model/endpoint; no dependency on one Ollama model.
- Answer only from selected retrieved source passages; show exact links and quotations/short excerpts.
- Explicitly say when the archive has insufficient evidence.
- Never rewrite source records or reorganize items without user confirmation.
- Measure fabricated citations and unsupported conclusions in evaluation fixtures.

### F3. Provider neutrality, narrow by design

- Preserve adapter boundaries in core data models now: provider, export version, source identifiers, timestamps, roles, attachments, tool outputs, missing-content state.
- Add a **second importer only when there is a representative real export and a concrete user workflow**.
- Keep the raw provider payload available for audit and deterministic reindexing.
- Test chronology, nested message structures, tool results, attachments, identity, and incremental refresh.
- Avoid promising a universal schema that perfectly erases provider differences; mark what cannot be normalized.
- No live account sync, scraping, or credentials workflow in the first cross-provider experiment.

**Gate:** Each experiment beats a simpler baseline on explicit tasks, with cost and failure modes documented. Otherwise revert or defer it without impacting core retrieval/export.

---

## 10. Wave G — Portability, publishing, and integration

**Outcome:** Selected archive material can move safely into existing tools. Public sharing is a separate, high-caution capability.

### G1. Private portability before public publishing

- Export selected conversations, messages, documents, code, and collection bundles using ordinary formats.
- Use stable source IDs and sidecar metadata for future import/reconstruction where feasible.
- Provide restoration instructions and a versioned package manifest for *ChatArchive-to-ChatArchive* movement, distinct from ordinary file export.
- Verify restores into a fresh library and after a version upgrade.

### G2. Interoperability with existing workflows

- Markdown-first output and optional frontmatter for SiYuan, docs sites, and local text tooling.
- Optional “open file externally,” “reveal in Explorer,” “copy path,” and “copy source link.”
- Optional Git-friendly export structure for *selected* artifacts; ChatArchive does **not** become a Git client or code repository.
- Keep generic formats primary; City Hall/DRS metadata should be an optional profile, not a dependency.

### G3. Public share packages, much later

- Explicit opt-in for publishing; default is private.
- Staged redaction preview with source-by-source review, including code blocks, file paths, metadata, images, and links.
- Clear warning that automatic redaction cannot guarantee privacy; secrets can be embedded in screenshots, prose, and code.
- Create a static read-only site/bundle only after testing the review process with realistic sensitive fixtures.

**Gate:** Private portability works and source attribution survives before any public-publishing feature is advertised.

---

## 11. Cross-cutting tracks (not separate phases that block progress)

### Interaction and visual system

- Finish the current theme's **semantic mappings**, contrast, focus, selected/hover/disabled states, and component consistency rather than multiplying new palettes.
- Standardize typography (e.g., IBM Plex Sans and IBM Plex Mono as a coherent default pairing), code alignment, spacing scales, row density, icon meaning, and keyboard focus.
- Audit the app at common window widths and display scaling, especially the dense three-column views, dual sidebars, and sticky bottom collection controls.
- Keep **compact** and **comfortable** density options if supported by real user needs; do not create a large theming settings suite before the base UI is coherent.
- Accessibility: keyboard navigation, visible focus, semantic labels, contrast, readable text, predictable shortcuts, scroll behavior, and screen-reader traversal.

### Runtime and database performance

- Benchmark import, index, query, 500-item selection, long-conversation rendering, and asset thumbnail loading on a representative large library.
- Add pagination/virtualization and background jobs with cancellation/progress where they materially improve responsiveness.
- Keep UI queries bounded; enforce indexes; avoid synchronous bulk operations on the UI thread.
- Store a small benchmark history to detect regressions rather than guessing from subjective feel.

### Reliability, security, and observability

- Corrupt-file safety, bounded parser work, path traversal defenses, export sandbox/path rules, and no execution of recovered snippets.
- Clearly separate imported/untrusted HTML and Markdown content from privileged desktop APIs; review rendering/sanitization boundaries.
- Local logs that omit content and secrets by default; diagnostic export only by user action.
- Schema migrations, fixture-based regression tests, deterministic rebuilds, data backup/recovery, and failure-injection tests.

### Releases and documentation

- Continue the documented Store/MSIX process and its evidence separation; do not treat local signing or a WACK `PASS` as publication proof.
- Keep release manifests, current UI claims, current version, screenshots, and feature docs synchronized.
- Do not claim Linux/macOS support until actual builds, package workflows, filesystem behavior, and realistic VM/device tests are complete.
- Ship small vertical slices, each with a user-visible workflow, a fixture, a regression test, and a brief change record.

---

## 12. Explicit non-goals and stop rules

| Temptation | Why it is dangerous | Better bet / stop condition |
|---|---|---|
| Full autonomous Project Intelligence | False grouping, ongoing curation, overlaps collections | Confirm-only pilot; remove separate view if it fails the time-boxed user comparison |
| Rich, deep project hierarchy | More administration than retrieval value | Two levels maximum until real data proves more is needed |
| AI-generated summary of every message | Expensive, stale, unreliable, hard to audit | On-demand, source-cited report on selected scope |
| Semantic search for its own sake | Index/storage/model burden without guaranteed better results | A/B benchmark versus lexical search first |
| Universal “second brain” ontology / knowledge graph | Hard to define; visually impressive but often noisy | Simple relations with provenance; graph optional |
| In-app code execution / terminal / IDE features | Security surface and duplicate of mature tools | Export/copy/open in external IDE |
| Full local file manager or external-drive crawler | Scope explosion, moving-path and permission problems | Reference selected external files only |
| Unlimited provider connectors | Schema drift, maintenance burden, provider-specific limitations | One evidence-backed adapter at a time |
| Direct web/API sync into private provider accounts | Credentials, ToS, rate limits, fragile changes | User-authorized local exports first |
| Automatic deduplication/deletion | Risk of destroying useful versions or context | Report identical/similar material; leave sources intact |
| Public sharing before redaction review | Sensitive material may survive in metadata, screenshots, paths, or snippets | Export privately first; explicit publish review later |
| Cross-platform claims based on compilation | Native desktop packaging and filesystem behavior differ | Demand tested OS-specific proof |
| Theme proliferation and elaborate customization | Diverts effort from information utility | Polish one semantic system; later support curated alternatives |
| Universal City Hall integration | Makes the product harder for ordinary users to adopt | Generic exports first; optional profile later |

A “stop rule” is a product success, not a failed engineering effort: it prevents a speculative module from becoming a permanent maintenance obligation.

---

## 13. Recommended first implementation queue

These are **proposals for new work**, not assertions that they are currently missing. The first task must confirm the current checkout so completed changes are not rebuilt.

1. **Reality check and test harness** — Audit the latest checkout, current UI and data schema; establish artifact-fidelity and retrieval fixtures; reconcile v0.2 draft versus actual release branch.
2. **Export refresh / curation preservation** — Complete or prove repeatable OpenAI reimport with collision safety, preview, rollback, and persistent user links.
3. **Exact source anchors** — Make every code, document, asset, and search result jump to the precise source occurrence and return to its place.
4. **Artifact fidelity audit** — Classify representative `text`/`bash`/structured-code blocks and detect real file types for `.dat` assets; version the extractor.
5. **Useful bulk recovery** — Export selected mixed artifacts into normal files plus readable index and provenance manifest; begin with a small collection.
6. **Saved retrieval workflows** — Saved searches, match explanation, result context, and quick return to source.
7. **Collection flow simplification** — Validate batch add/remove and selection continuity from explorer to collection; test real external file references without silently ingesting a disk.
8. **Timeline/version experiment** — Compare known successive versions of one file and show their supporting chat context.
9. **Project probation test** — Run 3–5 real projects; compare benefit with collection + saved search; keep or retire the separate workflow.
10. **Local AI pilot decision** — Only after the benchmark provides a meaningful hard-to-find corpus.

### Slice template for Codex / an implementation agent

Each ticket should declare:

```text
Problem / user story:
Current checkout evidence:
Scope and non-goals:
Data and migration impact:
Source/provenance behavior:
UI flow and screenshots:
Fixture(s) and regression test(s):
Failure / rollback behavior:
Acceptance criteria:
Release documentation impact:
```

Avoid “implement a phase” prompts; each unit should change one testable workflow end-to-end.

---

## 14. How to decide what moves forward

Evaluate proposals against these questions:

1. **Frequency:** Does this help with something users actually do repeatedly?
2. **Recovery value:** Does it find/recover useful work otherwise buried?
3. **Trust:** Does it make provenance or data integrity better, rather than more ambiguous?
4. **Friction:** Does it remove steps or require new maintenance and tagging?
5. **Reversibility:** Can it be tried, measured, and removed without corrupting the library?
6. **Cost:** Does it add runtime/model/OS/provider dependencies or a large upkeep obligation?

Prioritize high-frequency, high-recovery, high-trust, low-friction changes. Experimental features get a fixed evaluation gate; they do not acquire permanent status through implementation alone.

### Suggested success measures

- **Findability:** share of known retrieval tasks completed correctly; time/steps to target.
- **Reuse:** share of selected exports that open with appropriate filename/type and correct source index.
- **Continuity:** zero silent loss of user curation across tested refresh/migration sequences.
- **Quality:** measured extraction false positives, missing-resource reasons, and ambiguous labels.
- **Responsiveness:** p50/p95 query and view latency on a stable large-library fixture.
- **Organization cost:** number of actions to save a mixed set and later retrieve it.
- **Project justification:** measurable advantage over collection + saved search; otherwise no standalone Projects investment.
- **Release confidence:** tests and artifact-level Store evidence attached to the actual candidate.

No arbitrary 100% readiness score. Record exact evidence, known limits, and user-important blockers.

---

## 15. Strategic horizon

**Near-term:** trusted imports, contextual search, source links, asset correctness, recovery export.  
**Middle horizon:** excellent collections, user-confirmed version/chronology, selective relationship discovery.  
**Exploratory horizon:** local semantic search, one new provider adapter, carefully scoped project intelligence.  
**Long horizon:** portable curated knowledge bundles, optional publication pipeline, deep but selective ecosystem interoperability.

**The product becomes exceptional by getting recovery, context, and portability right—not by accumulating the most modules.**

---

## 16. Historical material to preserve outside this roadmap

Keep the old `ChatArchive-Roadmap.md` as an archived historical snapshot or move it to a documentation history folder. Do not erase the completed work from git history. Preserve the WACK report, MSIX playbook, release evidence, earlier manifests, and historical goals as source records. This new roadmap describes future direction only and should supersede the old roadmap as the active planning document after project review.
