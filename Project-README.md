# ChatArchive

## Purpose and boundaries

Tauri desktop application for importing, browsing, and managing OpenAI conversation exports.

This document is the internal governance and handoff entry point. Existing `README.md`, process documents, source, tests, and built artifacts remain project evidence and should be consulted for operational detail.

## Governance

- [Project manifest](ChatArchive.manifest.toml)
- [Project proposal](Project-Proposal.md)
- [Modification instructions](AGENTS.md)
- [DRS canonical standard](D:/.city_hall/DRS/README.md)
- [Workspace Governance Standard](D:/.city_hall/WGS/README.md)

## Current state

The current public line is v0.1.2 through the Microsoft Store. v0.2.0, *Export Continuity*, is an active draft candidate with source version `0.2.0` and planned Store package version `1.0.3.0`; it is not yet published or Microsoft-signed. Historical local package, WACK, lifecycle, and Store records remain engineering evidence for the shipped v0.1.2 line only.

The v0.1.2 release established a Windows-first Microsoft Store release using MSIX as the primary public Windows artifact. Partner Center package identity is authoritative for Store submission, and local self-signed MSIX packages are sideload evidence only. macOS and Linux readiness require platform-specific VM verification before any public claim.

Project Intelligence is included in v0.2.0 as a deterministic, local candidate scanner with explicit operator confirmation/dismissal and persisted project memberships. The candidate focuses on the durable archive, artifact explorer, search, export, manual knowledge organization, project review, and safe refresh/restore workflow.

## Visual system

ChatArchive explicitly adopts [Blue Slate](D:/.city_hall/blue.slate/Project-README.md) as a visual-system dependency for color tokens, typography, focus treatment, code surfaces, and status accents. This adoption does not replace the current product layout, React/Tauri workflow, archive data model, or DRS release gates.

This is a theme alignment only. It does not alter the Store release status or the normal DRS requirements for future package changes.

## Structure and relationships

This is registered as one independently governed project.

Legacy manifests, when listed in `ChatArchive.manifest.toml`, are retained as migration evidence rather than parallel authority.

## Build and verification

Follow existing AGENTS.md and README.md; verify import fixtures, tests, frontend build, and the packaged application.

Record verified commands, artifacts, versions, and current test results here as project-specific reconciliation proceeds.

## Known gaps and next review

- Confirm the project lifecycle and active-development state.
- Confirm build, run, test, Store MSIX packaging, and release commands from current source.
- Reconcile useful fields from legacy manifests without deleting historical evidence.
- Replace inferred descriptions with project-owner language where needed.
