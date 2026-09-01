# ChatArchive data migration contract v0.2.0

## Scope and compatibility

Existing libraries remain in place. Updating the application does not automatically replace an archive or rewrite user-authored state. An explicit Library refresh creates a new derived archive and reconciles it with the existing SQLite library. v0.2.0 adds the rollback layout `rollback/archive`, `rollback/chatarchive.db`, and `rollback/rollback.json` (`schema: chatarchive.rollback`, version 1).

## Refresh and recovery contract

1. The ZIP or extracted export is validated and built in staging.
2. Before a successful refresh is committed, the active derived archive and SQLite database are copied into rollback staging after a SQLite checkpoint.
3. Rollback staging includes machine-readable version metadata and is promoted only after it is complete. When replacing a rollback point, the old point is retained during rotation and removed only after the new point is in place.
4. The active archive/index is replaced only after the import build succeeds. A failed or cancelled import leaves the active archive and existing rollback point untouched.
5. Restore previous import uses the paired rollback archive/database and then makes the formerly active pair the next rollback point.

## Metadata reconciliation

Stable OpenAI conversation, message, and artifact identifiers retain user-authored state. Missing targets are preserved as unavailable rather than deleted. A later refresh restores availability when the stable target reappears. Export titles and content remain export-authored; notes and relationships remain operator-authored.

## Failure, downgrade, and operator guidance

If refresh reports an error, use the existing library rather than manually deleting its database or archive. Do not copy a database from a different library into an archive folder. Restore the prior import from Library when the immediately prior archive is needed. For broader retention, back up the complete library folder while ChatArchive is closed. Downgrading to an older app version is unsupported unless that version has been tested with the current SQLite schema; preserve a full backup first.
