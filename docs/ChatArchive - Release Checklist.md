# ChatArchive release checklist

This permanent checklist is completed with dated evidence for every release. A check is not evidence by itself.

## Required gates

- [ ] Clean-clone build with locked Node and Rust dependencies.
- [ ] Frontend build, unit tests, Rust tests, and relevant desktop/UI smoke pass.
- [ ] Existing-library refresh, unavailable-target, rollback rotation, and exact-restore smoke pass.
- [ ] Project Intelligence smoke: scan the high-signal shortlist, confirm/dismiss candidates, inspect every project member, and add/remove a conversation without affecting another project.
- [ ] Package payload includes the required current DRS documents and SBOMs.
- [ ] SBOM review identifies no unexpected components or unresolved license concerns.
- [ ] Final MSIX is built from the approved identity, hashed, and recorded in the ARHS manifest.
- [ ] Required signing is verified; local developer signing is labelled sideload-only.
- [ ] Signed final MSIX passes WACK and lifecycle/upgrade-data-preservation validation.
- [ ] Release documentation bundle is regenerated from the exact version and artifact evidence.
- [ ] Partner Center upload, certification, and publication evidence is captured before Store claims are made.

## v0.2.0 / 1.0.3.0 evidence block

Candidate scope: Export Continuity. All final-artifact and Store gates are pending until the final package exists. Historical v0.1.2 evidence is retained for reference and is not reused for this block.
