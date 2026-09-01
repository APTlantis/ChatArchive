# ChatArchive dependency provenance

The complete resolved dependency inventories are `package-lock.json` (npm) and `src-tauri/Cargo.lock` (Cargo). Direct frontend dependencies and build tools are declared in `package.json`; direct Rust dependencies are declared in `src-tauri/Cargo.toml`. Their public registries, package metadata, and license declarations are the source of provenance; the final SBOM records resolved transitive components and licenses for the release candidate.

Packaging inputs are the clean source tree, lockfiles, Rust toolchain, Node toolchain, Windows SDK tools, Partner Center identity configuration, and the Windows assets referenced by that configuration. Local certificates and `store-identity.json` are deliberately excluded from source control. A package built with a developer certificate is sideload evidence only.

Generate SBOMs into `artifacts/sbom` before release using the documented npm and Cargo CycloneDX tooling, retain the exact generated files in the release evidence bundle, and review unexpected components/licenses before signing.
