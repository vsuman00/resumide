# Broad regression: frontend fixture repairs

Repaired only the three allocated component test fixtures. Production code is unchanged.

The actual canonical loader always includes `entryRegroup`. Its real repository returns either an available workspace or the explicit unavailable DTO, never undefined. The older correction fixture and one manual grouped-import loader omitted that required result. They now supply the typed unavailable DTO, without preview/write capability; the correction fixture also supplies its existing owner's ID as the loader does. Original correction/import controls and negative conditions are unchanged.

The privacy loader always returns `exportDownloadAccess` after its independent blocking-deletion check. The older attachment/date fixture bypassed that loader and omitted the result. Its completed-export scenario has no deletion request, so the fixture now explicitly declares allowed access. Production blocking-deletion checks remain intact; no failure or unavailable access was converted to allowed.

Root's original broad failure remains the before evidence: `owned-ai-privacy-broad-integrated-f26fa377-4e74-46c0-bcdc-57b56177a62b.json/log` (31 failed, 5022 passed; these three files account for 21 failures). No duplicate baseline or broad rerun was launched here.

The private packet `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-broad-frontend-repairs-nfbslfw_` preserves preimages, `.txt` snapshots, the fixture-only diff and exact command receipts. One sealed Node22 run with empty HOME passed **38 tests/3 files**: correction19, grouped-import17, privacy2. Scoped lint and format passed. All 888 author inputs stayed stable during checks. The final packet records source/log hashes, assertion preservation and absent owned groups. Existing Router HydrateFallback warnings were nonfatal and retained.

Frozen source hashes:

- CanonicalCorrections: `4804bfd817cd6323ef29c37e8993b9b5255ed1a699284775201d58bcb912e5ec`.
- GroupedOriginalImportReview: `349bfb894b88789d0635d406f3e0897b02933513149df1ce6b76a0e743e67f11`.
- PrivacyRepairs: `0873eaefb2e14bdd1db926a2ccb7f30a7b8a72d43d5d99171da308ee201b1c1c`.

No assertion, test case, threshold or skip changed. The earlier broad run is still failed pending Root's integrated corrections. No DB, SQL parsing, provider, real env/PII, browser, service, Docker, compiler, dependency or workspace Git operation occurred. Shared plans and production sources remain Root-owned.
