# ChatArchive build reproducibility guide

Build from a clean clone on Windows with the Node/npm version expected by the lockfile, Rust stable/Cargo, Visual Studio C++ build tools, the Windows SDK (`makeappx`, `makepri`, `signtool`), and Tauri prerequisites. Use `npm ci`, then `npm run build`, `npm test -- --run`, and `npm run test:rust` before packaging.

`package-lock.json` and `src-tauri/Cargo.lock` are the locked dependency authorities. The direct MSIX pipeline is `scripts/release/build-store-msix.ps1`; it is distinct from Tauri's MSI/NSIS bundling. It stages required DRS documents into the MSIX payload and records them in its result. Build the final package only with the approved Partner Center identity. Hash, sign, WACK, and lifecycle testing are final-release gates, not reproducibility substitutes.

Before packaging, install the recorded `cargo-cyclonedx` version in a controlled build environment and run `scripts/release/generate-sbom.ps1`. The script pins its npm generator version, writes frontend and Rust CycloneDX JSON to `artifacts/sbom`, and records the generator versions. The direct MSIX script refuses to package when those two SBOMs are absent, so the exact reviewed SBOM payload accompanies the package.
