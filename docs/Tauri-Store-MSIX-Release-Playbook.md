# Tauri Store MSIX Release Playbook

This playbook records the repeatable Windows release path for Aptlantis/DRS Tauri desktop apps that should ship through the Microsoft Store.

Use it when a Tauri app is moving from local development or installer experiments into a Store-ready Windows release lane. Treat project-specific values, names, paths, and evidence files as inputs; do not copy ChatArchive identity values into another app.

## Release Boundary

Public Windows GUI apps should use:

- MSIX package shape.
- Microsoft Store distribution.
- Partner Center package identity as authority.
- Microsoft signing after Store certification.
- Local self-signed packages only for sideload validation.

Do not treat local signing, WACK success, ReleaseHasher output, detached hash-manifest signatures, or direct download artifacts as Microsoft Store publication.

Keep these responsibilities separate:

- MSIX package signing: local sideload certificate or Microsoft Store signing.
- Release hashing: release artifact hash manifest.
- Archive/preservation signing: detached manifest signatures such as PGP or SLH-DSA/SPHINCS records.
- Publication evidence: Partner Center certification, Store status, Microsoft-signed package verification, and public availability.

## Versioning

Use two version concepts when needed:

- Product version: the app release label, such as `0.1.2`.
- Store package version: MSIX four-part package identity, such as `1.0.2.0`.

For Store MSIX package identity:

- Use four numeric parts.
- Use a nonzero first segment.
- Keep the fourth segment `0`.
- Keep package architecture aligned with the built executable.

The executable may still report the product version, such as `0.1.2` or file version `0.1.2.0`.

## Required Inputs

Before building the Store package, gather:

- Confirmed project root.
- Tauri executable name.
- Windows target architecture.
- Visual assets for Store package logos and tiles.
- Partner Center reserved package name.
- Partner Center publisher string.
- Publisher display name.
- App display name and description.
- `runFullTrust` Store submission justification.
- Package version.
- Local sideload certificate only if local install/WACK validation is needed.

Store identity values must come from Partner Center before submission. Development identity may be used for local smoke builds only when the script or record clearly marks it local-only.

## Packaging Contract

The clean Store MSIX package must:

- Stage the release executable directly.
- Set the app entry executable to the product executable, such as `chatarchive.exe`.
- Use `EntryPoint="Windows.FullTrustApplication"` for a Tauri desktop app.
- Declare `runFullTrust` only when justified for Store submission.
- Include package visual assets.
- Include generated PRI resources.
- Exclude NSIS/MSI installers.
- Exclude `.pfx`, `.pvk`, private key material, dev certificates, installer caches, and unrelated build output.
- Exclude private archive data, test fixtures, and local user libraries.

For Tauri projects where the Tauri CLI does not directly produce Store MSIX, use a separate release script around:

1. `npx tauri build --no-bundle`
2. staging of the release executable and assets
3. manifest generation from Store identity config
4. `makepri.exe`
5. `makeappx.exe`
6. optional local sideload signing with `signtool.exe`

## Repository Setup

Add or verify:

- `scripts/release/build-store-msix.ps1`
- `scripts/release/store-identity.template.json`
- untracked `scripts/release/store-identity.json`
- `scripts/release/bundle-release-docs.ps1`
- `npm run release:msix`
- `npm run release:docs`
- `.gitignore` entries for local identity config, generated MSIX/AppX outputs, and signing material.

Recommended ignore coverage:

```gitignore
scripts/release/store-identity.json
*.pfx
*.pvk
*.cer
*.msix
*.appx
src-tauri/target/
```

Generated release docs and package outputs normally live under `src-tauri\target\...` so they are reproducible and not committed by default.

## Build Sequence

From the project root:

```powershell
npm run build
npm test
npm run test:rust
```

Run focused UI coverage appropriate to the release surface:

```powershell
npm run test:ui
```

Build the Tauri executable without Tauri installer bundling:

```powershell
npm run tauri:build
```

Build the Store MSIX:

```powershell
npm run release:msix
```

For a local sideload package, pass the local certificate only as an explicit local validation input. Never treat this as Store signing.

## Local Signing

Use local signing only for sideload installation and local WACK validation.

Rules:

- Keep `.pfx` files out of Git.
- Do not package certificate files.
- Do not record local self-signing as publication evidence.
- Record certificate subject/thumbprint only when useful for traceability.
- Expect sandboxed shells or restricted contexts to fail PFX access; run signing in an authorized local context when needed.

## WACK Validation

Run Windows App Certification Kit against the exact MSIX intended for evidence.

Record:

- WACK XML path.
- Overall result.
- Report generation time.
- WACK tool version.
- Package name.
- Package full name.
- Package version.
- Architecture.
- Application executable.
- Entry point.
- Product/file version from the executable.
- Notable optional warnings or failures.

An optional WACK test may fail while the overall report passes. Record that exactly; do not collapse it into either a total failure or a clean report.

## Local AppX Lifecycle

Use local lifecycle validation after WACK/local signing.

Record:

- Package state before uninstall.
- Running app process before uninstall.
- Uninstall command.
- Package absence after uninstall.
- Reinstall command.
- Package state after reinstall.
- AppsFolder launch command.
- Running process after launch.
- Package full name.
- Signature kind.
- Install status.
- Install location.
- MSIX size and SHA-256.

For example:

```powershell
Get-AppxPackage -Name <PackageName>
Remove-AppxPackage -Package <PackageFullName>
Add-AppxPackage -Path <Package.msix>
Start-Process 'shell:AppsFolder\<PackageFamilyName>!<AppId>'
```

Only claim data preservation for paths actually checked. If a known external library was absent, say so and keep broader data-preservation open.

## User Validation

Before calling the package ready for submission, use the installed package in realistic workflows:

- Launch from Start/AppsFolder.
- Select or open an existing library.
- Import a representative export if safe.
- Browse conversations.
- Search.
- Use main explorer views.
- Export documents or code.
- Save tags, collections, notes, and favorites when the app supports Knowledge organization.
- Close and reopen.

Record what was exercised, who exercised it, and any limits. Do not call a package ready from a blind install.

## Evidence Records

Update the project records together:

- README release status.
- Project README or governance manifest.
- Release scope document.
- QA report.
- Package manifest/template notes.
- Release evidence manifest.
- User guide or operator guide if the release adds a workflow that users must understand.

For each Store MSIX candidate, record:

- Exact commands.
- Tool versions where available.
- Package name/version/architecture.
- Package path.
- MSIX size.
- MSIX SHA-256.
- WACK XML path and result.
- AppX lifecycle result.
- Data-preservation result or limitation.
- Store submission status.
- Microsoft certification status.
- Microsoft-signed package status.
- Publication status.

Keep local-only evidence marked local-only.

## Documentation Bundle

Bundle release documentation and evidence before downstream hash/signing.

```powershell
npm run release:docs
```

The docs bundle should include:

- README and project README.
- Release scope.
- QA report.
- User/operator guide.
- Package manifest.
- Release manifest.
- Store identity template.
- MSIX build script.
- WACK XML.
- Release evidence JSON.
- Existing trust/hash-manifest files.

The docs bundler may include the MSIX only when explicitly requested. The default docs bundle should not replace the release artifact hash-manifest workflow.

## Release Hashing And Signing

After the package and docs are final:

1. Generate the release hash manifest suite for the final artifact set.
2. Run the manifest signer.
3. Place resulting hash/signature evidence under the project trust/evidence location.
4. Re-run the docs bundle so the final trust files are included.

Do not merge this with MSIX signing. These signatures prove release-record integrity, not Microsoft Store package signing.

## Store Submission Gates

Before submission:

- Replace local development identity with reserved Partner Center identity.
- Confirm Store identity fields match Partner Center exactly.
- Confirm package version is final.
- Confirm WACK pass belongs to the final-name package.
- Confirm no private key/cert/installer/cache payloads are in the MSIX.
- Confirm `runFullTrust` justification is ready.
- Confirm release docs identify Store publication as pending.

After submission:

- Record Partner Center submission ID/status.
- Record certification result.
- Record Microsoft re-signing/publication status.
- Download or inspect the distributed package when available.
- Record Microsoft-signed package verification separately from local WACK.

## Common Failure Points

- Wrong project root, especially stale paths with spaces or renamed folders.
- Tauri build emits old paths; run `cargo clean` and rebuild from the physical checkout.
- MSIX wraps an installer instead of launching the executable directly.
- Package version uses product semver instead of Store-compatible four-part identity.
- `.pfx` or cert material gets staged accidentally.
- WACK report is for a smoke identity, not the final package identity.
- AppX install succeeds in one user/elevation context but is queried from another.
- Optional WACK analyzer warnings are overstated or hidden.
- Local sideload signing is mistaken for Microsoft Store signing.
- Release hash signatures are mistaken for package signing.
- Data preservation is claimed without checking the actual external library.

## Reusable Completion Shape

A Windows Store-MSIX release candidate is locally ready for Partner Center submission when:

- production build passes,
- unit/Rust/focused UI tests pass or exceptions are documented,
- direct-executable MSIX builds,
- package has final Partner Center identity,
- local sideload signing is only used for validation,
- WACK passes for the final package,
- local install/launch/uninstall/reinstall evidence is recorded,
- data preservation is tested or explicitly limited,
- MSIX hash is recorded,
- docs/evidence bundle is current,
- hash-manifest suite and manifest signatures are generated,
- remaining Store publication gates are clearly marked pending.

It is publicly release-ready only after Partner Center certification, Microsoft signing, publication, and distributed-package verification are complete.
