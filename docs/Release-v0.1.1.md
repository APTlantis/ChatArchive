# ChatArchive v0.1.1 Patch Build

Date: 2026-07-22

## Theme

Blue Slate visual adoption, packaged app polish, and patch installer rebuild.

## Changes

- Adopted Blue Slate colors, typography, focus rings, code surfaces, and status accents without changing ChatArchive layout or archive behavior.
- Added the ChatArchive logo as the source branding asset and generated the Tauri icon set from it.
- Added a small 128px logo derivative for in-app branding so the frontend does not bundle the full source logo.
- Set the packaged Windows release binary to the GUI subsystem so it does not spawn a terminal window.
- Bumped package, Tauri, Cargo, and manifest versions to `0.1.1`.

## Verification

| Check | Result |
| --- | --- |
| `npm run build` | Pass |
| `npm test` | Pass, 4 tests |
| `npm run test:rust` | Pass, 10 passed and 1 ignored real-export smoke |
| `npm run test:ui` | Pass, 15 tests |
| `npm run tauri:build` | Pass |
| `chatarchive.exe` subsystem | Windows GUI |

The normal destructive installer lifecycle gate was not run. The broader DRS release gate remains blocked until installer lifecycle testing is rerun from a known installation baseline.

## Artifacts

| Artifact | Size | SHA-256 |
| --- | ---: | --- |
| `src-tauri\target\release\bundle\msi\ChatArchive_0.1.1_x64_en-US.msi` | 7,028,736 bytes | `F53671C51A5DCDDA8F510B96352448A75EEEBD3972239754D7C559048839A3A0` |
| `src-tauri\target\release\bundle\nsis\ChatArchive_0.1.1_x64-setup.exe` | 5,392,174 bytes | `ACDE89CED4FD40324F4D8CB61552B710AC6E13EBB52CF28B2D039DA9A3C62F78` |
| `src-tauri\target\release\chatarchive.exe` | 15,828,992 bytes | `CC4FB833C34F0D2EA9B1EFC9890ECE08AFDA07A6CE3072790E8B4CAD4C9DAC51` |
