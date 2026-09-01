# ChatArchive threat model

| Threat | Control / remaining limitation |
| --- | --- |
| Malicious ZIP path traversal | ZIP extraction accepts only enclosed entry paths; invalid paths are skipped. Resource exhaustion from a very large valid ZIP remains a local availability risk. |
| Malformed export or interrupted import | Build occurs before activation; failure leaves the active archive and rollback point intact. |
| SQLite/archive mismatch | A rollback point records paired archive and database data plus version metadata; refresh checkpoints SQLite before snapshotting. Filesystem failures remain explicitly reported. |
| Local library tampering | No application-level tamper-proofing or encryption is provided. Protect the library with Windows account, disk, and backup controls. |
| Sensitive temporary/rollback data | Temporary extracted files are cleaned after import when possible; rollback intentionally retains one prior copy. Operators control storage and deletion. |
| Remote URLs in archived content | ChatArchive is not a network service, but opening remote links/assets can disclose network metadata to those hosts. |
| Package/dependency supply chain | Locked dependency files, SBOM generation/review, signed-package verification, WACK, and Partner Center evidence are release gates. |
