# Phase 2A-2C Release-Gate QA Report

**Date:** June 30, 2026  
**Platform:** Windows, native Tauri/WebView2 authoritative  
**Result:** **FAIL - Stage 3 remains blocked**

## Executive result

The Phase 2 regression harness is implemented and the unit, Rust, rendered UI, production build, privacy, isolated real-export import, reconciliation, document-fidelity, and native persistence gates pass. The installer audit uncovered a release-blocking defect in the test/restoration workflow: the pre-test installation used `C:\Program Files\ChatArchive`, while the current bundles install per-user under `%LOCALAPPDATA%\ChatArchive`. The first lifecycle runner did not preserve the registered installer's cached MSI before replacement, so it could restore the original executable files but could not recreate the original Windows Installer registration exactly.

The original executable files remain backed up at `D:\Chat\.qa\installed-backup`. Windows Installer now has only the newly built product registered and cached. Under the release criteria, inability to prove exact pre-test installation restoration blocks Stage 3.

## Environment and isolation

- Source export: `D:\Chat\openai-export`
- Read-only live source library: `A:\ChatArchive`
- Destructive test library: `D:\Chat\.qa\library`
- Isolated native settings/WebView profile: `D:\Chat\.qa\native-profile`
- Real export content is excluded from Git. QA output records only counts, sizes, timing, and hashes.

## Automated results

| Gate | Result | Evidence |
|---|---:|---|
| Vitest unit tests | Pass | 4 tests: facets, filtering/sorting, 500-row bound, selection fallback, URL handling |
| Rust tests | Pass | 6 passed, 1 intentionally ignored real-export smoke; deterministic sharded import covers recovery, stable IDs, rollback, reconciliation, and viewer-state preservation |
| TypeScript/Vite build | Pass | Production static build completed |
| Rust formatting | Pass | `cargo fmt --check` |
| Clippy | Pass | All targets with warnings denied |
| Playwright UI | Pass | 9/9 at 1920x1080, 1366x768, and 390x844 |
| Accessibility | Pass | No serious or critical axe violations in tested flow; keyboard focus verified |
| Production Tauri build | Pass | MSI and NSIS produced |
| Privacy payload inspection | Pass | No archive-data, archive-assets, or archive-documents payload in `dist` |
| Native isolated import | Pass | Exact live baselines, zero orphan source IDs, state survived forced relaunch |
| Recovered document fidelity | Pass | Source `.dat` and archived document bytes/hash match |
| Installer lifecycle | **Fail** | Exact pre-test Windows Installer registration could not be restored after package-scope mismatch |
| In-app browser compatibility smoke | Not executed | Browser backend rejected the tab/session binding; Playwright static-browser matrix remains green |

## Live invariant reconciliation

The isolated re-import completed in 54,785 ms and reconciled as follows:

| Invariant | Actual | Expected |
|---|---:|---:|
| Conversations | 733 | 733 |
| Visible messages | 29,861 | 29,861 |
| Code artifacts | 36,835 | 36,835 |
| Asset artifacts | 5,823 | 5,823 |
| Document artifacts | 1,624 | 1,624 |
| Link artifacts | 8,838 | 8,838 |
| Local assets | 5,320 | 5,320 |
| External assets | 490 | 490 |
| Missing assets | 13 | 13 |
| Recovered documents | 724 | 724 |
| Metadata-only documents | 900 | 900 |

SQLite and `ArtifactIndex` totals match. Orphan counts are zero for code, asset, document, and link artifacts.

Representative recovered document:

- Artifact: `5c27808fdc76`
- Bytes: 10,327
- Source/archive SHA-256: `378CC55C1C819208A805879DA734815F4E99A42C98D14CC4BBCA3021AD316B17`

## UI coverage

The deterministic browser archive includes sharded/legacy conversation structure, code, README/TOML/missing documents, 510 local images, an external failure, and a missing image. Tests cover explorer navigation, search, facet selection, 500-item bounds, no-result states, source navigation, selection changes, image fallback, keyboard focus, accessibility, and non-collapsing asset cards.

Reference screenshots are stored in `tests/e2e/phase2.spec.ts-snapshots/` and are asserted on every Playwright run.

## Performance baselines

These are informational, not release thresholds.

| Measurement | Baseline |
|---|---:|
| Native cold launch | 696 ms |
| Full isolated import | 54,785 ms |
| Working set after relaunch | 70,295,552 bytes |
| SQLite database | 596,013,056 bytes |
| MSI | 6,594,560 bytes |
| NSIS | 5,132,443 bytes |

## Bundle hashes

| Bundle | SHA-256 |
|---|---|
| `ChatArchive_0.1.0_x64_en-US.msi` | `DE7F7DBAE6AA4AB1F340CF8041896F7FA5D28AA2BDED8D26F0EAF6B9430CD7CA` |
| `ChatArchive_0.1.0_x64-setup.exe` | `19FE335E44FB59678F1629E6FB40C8A1E33FCA9478D57D42CE89020D5EE04CA3` |

## Permanent test infrastructure

- `npm test`: Vitest unit tests
- `npm run test:ui`: Playwright desktop/mobile and accessibility suite
- `npm run test:native`: isolated real-export import, reconciliation, fidelity, and persistence audit
- `npm run test:installer`: MSI/NSIS lifecycle audit
- `npm run qa:phase2`: complete release gate

The installer runner was hardened after the failure to discover install destinations from registry data and preserve a registered installer's cached MSI before future replacement testing. A future release run must begin from a deliberately established known installation, prove that its registration and files are restored byte-for-byte, and then complete MSI and NSIS clean-install/replacement/uninstall assertions.

## Stage 3 recommendation

**Do not begin Stage 3.** Re-establish the intended production installation state, rerun the hardened installer lifecycle from that known baseline, complete the in-app browser compatibility smoke, and require a fully green `npm run qa:phase2`. No functional archive, explorer, fidelity, or data-reconciliation defect was found in the gates that completed.
