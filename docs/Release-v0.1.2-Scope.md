# ChatArchive v0.1.2 Release Scope

Date: 2026-08-21

## Release Position

ChatArchive v0.1.2 is a Windows-first public release candidate for GitHub distribution.

The release target is:

- Windows desktop app.
- GitHub Releases distribution.
- NSIS installer as the primary public installer.
- Hash evidence for published artifacts.
- Installer lifecycle evidence from a known Windows installation baseline before release-ready claims.

The release does not claim:

- Microsoft Store publication.
- Microsoft Store package signing.
- Trusted commercial certificate signing.
- macOS readiness.
- Linux readiness.
- Full cross-platform release certification.

MSIX remains a valid Windows packaging path for future Microsoft Store distribution. For this release, MSIX is treated as a secondary build artifact or future Store path, not the public distribution contract.

## Cross-Platform Posture

ChatArchive is designed as a cross-platform Tauri app, but cross-platform support is not release-certified until it is tested on each target platform.

Windows is the first publish target. macOS and Linux releases remain pending virtual-machine validation and platform-specific packaging checks. Passing Windows build, UI, import, and installer checks does not certify macOS or Linux behavior.

## Feature Scope

This release should focus on the durable archive product:

- OpenAI export import.
- Filesystem-backed local archive library.
- SQLite-backed reader state.
- Conversation browsing and search.
- Code, document, asset, and link artifact indexing.
- Code, document, and asset explorer workflows.
- Knowledge organization with tags, collections, notes, and favorites.
- Markdown and document export paths.
- Local bundled rendering for Prism, Mermaid, and ZenUML.

## Deferred Scope

Project Intelligence is deferred out of this release.

The feature is valuable, but it is not part of the first public Windows release surface. It should not be advertised as a v0.1.2 capability, and user-facing controls for project scanning, project dashboards, candidate review, project timelines, aliases, and project membership curation should be removed or hidden before the release is claimed ready.

The deferred Project Intelligence work can return in a later version after its behavior, documentation, persistence model, test coverage, and cross-platform expectations are reconciled.

## Release Claim Wording

Use this posture for public-facing release notes:

```text
ChatArchive v0.1.2 is a Windows-first local archive release distributed through GitHub with an NSIS installer and hash evidence. macOS and Linux support remain pending platform verification. Project Intelligence is deferred from this release.
```

