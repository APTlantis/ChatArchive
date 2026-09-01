# ChatArchive trust and security model

ChatArchive is local-first. OpenAI exports, derived archive files, SQLite state, rollback snapshots, and generated exports reside in the operator-selected library and inherit that location's filesystem permissions. They are sensitive personal/work data and are not encrypted by ChatArchive at rest.

The application accepts only a user-selected ZIP or extracted export folder, validates ZIP entry containment, and builds derived data before activation. SQLite and archive ownership are local to the selected library; a user who can modify that library can change its contents. Rollback copies deliberately duplicate sensitive data and must receive the same retention and backup treatment as the live library.

There is no ChatArchive-operated network service or telemetry path for archive refresh. Rendering an export can still request an external URL referenced by its content or asset; operators should treat untrusted external links and remotely hosted assets cautiously. OS account security, Windows package provenance, and the selected library ACL are the primary trust boundaries.
