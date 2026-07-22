# Chat

## Purpose and boundaries

Tauri desktop application for importing, browsing, and managing OpenAI conversation exports.

This document is the internal governance and handoff entry point. Existing `README.md`, process documents, source, tests, and built artifacts remain project evidence and should be consulted for operational detail.

## Governance

- [Project manifest](Chat.manifest.toml)
- [Modification instructions](AGENTS.md)
- [DRS canonical standard](D:/.library/aptlantis_core/DRS/README.md)
- [Workspace Governance Standard](D:/.library/aptlantis_core/WGS/README.md)

## Current state

Governance metadata was reconciled on 2026-07-08: version `0.1.0`, lifecycle `blocked`, stage `blocked`. Evidence reviewed: package.json, README.md, tests, and documented installer gate. The build, tests, shipping artifact, and release posture were not executed during this metadata pass, so this classification is not a release-readiness claim.

## Visual system

ChatArchive explicitly adopts [Blue Slate](D:/.library/aptlantis_core/blue.slate/Project-README.md) as a visual-system dependency for color tokens, typography, focus treatment, code surfaces, and status accents. This adoption does not replace the current product layout, React/Tauri workflow, archive data model, or DRS release gates.

This is a theme alignment only. The project remains `blocked` and not release-verified until the normal DRS build, packaging, installer, launch, hash, and documentation gates are completed.

## Structure and relationships

This is registered as one independently governed project.

Legacy manifests, when listed in `Chat.manifest.toml`, are retained as migration evidence rather than parallel authority.

## Build and verification

Follow existing AGENTS.md and README.md; verify import fixtures, tests, frontend build, and the packaged application.

Record verified commands, artifacts, versions, and current test results here as project-specific reconciliation proceeds.

## Known gaps and next review

- Confirm the project lifecycle and active-development state.
- Confirm build, run, test, packaging, and release commands from current source.
- Reconcile useful fields from legacy manifests without deleting historical evidence.
- Replace inferred descriptions with project-owner language where needed.
