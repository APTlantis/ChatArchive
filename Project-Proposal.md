# ChatArchive Project Proposal

## Project Type

Desktop application

## Responsibility Posture

adoptable

## Readiness Level

rework

## Governing Standards

- Proposal: PPS
- Workspace: WGS
- Delivery: DRS
- Supporting: Blue Slate

## Problem Statement

Exported AI conversations contain durable research, implementation history, artifacts, and decision context, but raw exports are hard to browse, search, preserve, and revisit. A local archive needs to retain conversation structure and attached artifacts without depending on a hosted account or fragile static export.

## Mission

ChatArchive is a local-first desktop archive for importing, normalizing, browsing, searching, and preserving exported AI conversations and their artifacts in a recoverable local library.

## Design Boundaries

In scope:

- Tauri 2 desktop application with React frontend and Rust import pipeline.
- OpenAI export import, normalized filesystem-backed archive, SQLite app state, artifact explorer, search, and Markdown export.
- Local-first manual knowledge-organization workflows.
- Windows-first public release preparation using NSIS for the next release candidate.
- DRS release evidence before public release claims.

Out of scope for the current release:

- Project Intelligence.
- Claims of macOS or Linux readiness without VM verification.
- MSIX as the public distribution contract for the current release.
- Cloud sync, hosted storage, or account-required operation.

## Success Criteria

- [ ] OpenAI exports import into a durable local archive.
- [ ] Conversations, artifacts, search, and export workflows are usable from the desktop app.
- [ ] Private export data is not exposed or copied unnecessarily.
- [ ] Windows NSIS release evidence covers build, tests, UI checks, Rust checks, installer behavior, hashes, and documentation.
- [ ] Public release claims wait for the full DRS release gate.

## Failure Criteria

- [ ] Archive state cannot be recovered without the original hosted service.
- [ ] Import or normalization loses conversation/artifact relationships.
- [ ] Installer lifecycle verification is skipped but release readiness is claimed.
- [ ] Deferred Project Intelligence returns to the release surface without proposal refresh.

## Constraints

- Technical: Tauri 2, React, TypeScript, Rust, SQLite, filesystem archive library.
- Scope: archive, reader, artifact explorer, search, and export before intelligence features.
- Runtime: Windows-first for the current public release target.
- Data: exported conversation payloads may be private and must remain local by default.

## Risks

- Risk: Native installer testing can be destructive on a machine without a clean baseline.
- Mitigation: Keep installer lifecycle audit explicit and do not claim release readiness until rerun from a known baseline.

- Risk: Platform claims drift beyond actual verification.
- Mitigation: Keep macOS and Linux readiness blocked until platform-specific VM verification exists.

## Roadmap

1. Keep archive import, reader, artifact, search, and export workflows stable.
2. Preserve Blue Slate visual alignment without replacing product behavior.
3. Complete Windows-first DRS verification for the NSIS release candidate.
4. Record hashes, packaged docs, installer lifecycle, and release notes.
5. Reopen Project Intelligence only under a refreshed proposal or later milestone.

## Version Milestone Sketch

### v0.1.2

- Purpose: Windows-first public release candidate focused on durable archive workflows.
- Completion shape: Frontend build, unit tests, Rust tests, UI tests, Tauri build, Windows GUI subsystem, NSIS installer lifecycle, hashes, release note, packaged docs, and DRS checklist are aligned.
- Responsibility posture: adoptable
- Complete project endpoint: no
- Deferred: Project Intelligence, macOS readiness, Linux readiness, and Microsoft Store/MSIX distribution.

### v0.2

- Purpose: Expand from archive baseline into richer organization or intelligence features only after the release baseline is trustworthy.
- Completion shape: Any revived intelligence features have proposal-backed boundaries, privacy controls, and verification evidence.
- Responsibility posture: adoptable
- Complete project endpoint: no
- Deferred: Hosted sync and account-dependent workflows.
