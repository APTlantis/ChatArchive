# ChatArchive v0.2.0 — Export Continuity

Status: Draft release candidate. Product version: `0.2.0`. Planned Store MSIX version: `1.0.3.0`.

## Operator-facing change

Library now lets an operator import a newer OpenAI export without moving the library or recreating ChatArchive. The new export is prepared before it becomes active. Existing user-authored relationships—favorites, pins, read state, recently viewed items, message bookmarks, tags, collections, notes, knowledge favorites, and project memberships—remain associated with stable export identifiers. Targets absent from a newer export stay stored as unavailable and return automatically if a later export contains the same identifier.

One immediately previous archive/database snapshot is retained for Restore previous import. Restoring swaps the active archive and SQLite state back together; it does not merge two exports.

## Project Intelligence

Project Intelligence is part of this candidate. It scans only local archive facts—repeated meaningful conversation titles plus operator-created tags and collections—across multiple conversations and months. Code, attachments, numeric fragments, and boilerplate do not create candidates; scans return at most 50 ranked candidates. It presents evidence for operator confirmation or dismissal. Confirmed projects have their own workspace, where every member conversation is visible and operators can add or remove conversations. Confirmed projects and their memberships are saved locally and survive an export refresh when stable conversation identifiers remain available. It does not use a remote model, infer project meaning as fact, or create projects without operator confirmation.

## Design boundaries

- The newest valid OpenAI export is authoritative for available archive content.
- ChatArchive does not upload exports or operate an archive cloud service.
- A rollback snapshot is a local recovery aid, not a substitute for an operator backup.
- Existing v0.1.2 Store, local-MSIX, WACK, and lifecycle records remain historical and do not certify this candidate.

## Final artifact record

The final `1.0.3.0` MSIX name, size, SHA-256/ARHS manifest, signatures, WACK result, lifecycle evidence, Partner Center submission, certification, and publication state are pending. This document does not claim the candidate is published, Microsoft-signed, or Store-available.
