# ChatArchive

## Purpose and boundaries

Tauri desktop application for importing, browsing, and managing OpenAI conversation exports.

This document is the internal governance and handoff entry point. Existing `README.md`, process documents, source, tests, and built artifacts remain project evidence and should be consulted for operational detail.

## Governance

- [Project manifest](ChatArchive.manifest.toml)
- [Project proposal](Project-Proposal.md)
- [Modification instructions](AGENTS.md)
- [DRS canonical standard](D:/.library/aptlantis_core/DRS/README.md)
- [Workspace Governance Standard](D:/.library/aptlantis_core/WGS/README.md)

## Current state

Governance metadata was refreshed on 2026-08-24: version `0.1.2`, lifecycle `active`, stage `active`. ChatArchive is an adoptable Windows Store/MSIX release candidate; the local package, WACK, and lifecycle records are evidence for the release candidate, not proof of Partner Center certification, Microsoft signing, or publication.

The next release scope was revised on 2026-08-23: ChatArchive v0.1.2 is a Windows-first Microsoft Store release candidate using MSIX as the primary public Windows artifact. Partner Center package identity is authoritative for Store submission, and local self-signed MSIX packages are sideload evidence only. macOS and Linux readiness require platform-specific VM verification before any public claim.

Project Intelligence is deferred from the v0.1.2 release surface. The release should focus on the durable archive, artifact explorer, search, export, and manual knowledge-organization workflows.

## Visual system

ChatArchive explicitly adopts [Blue Slate](D:/.library/aptlantis_core/blue.slate/Project-README.md) as a visual-system dependency for color tokens, typography, focus treatment, code surfaces, and status accents. This adoption does not replace the current product layout, React/Tauri workflow, archive data model, or DRS release gates.

This is a theme alignment only. The project remains an active release candidate until the normal DRS build, Store MSIX packaging, WACK, MSIX lifecycle, final hash, Partner Center publication, and documentation gates are completed.

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
