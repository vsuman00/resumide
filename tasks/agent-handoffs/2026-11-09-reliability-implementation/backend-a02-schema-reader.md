# CR-A02-S02 schema reader verification repair

2026-11-13, Asia/Kolkata. **TEST-LOCAL READER REPAIRED; FOCUSED CHECKS PASS; PRODUCTION UNCHANGED.** The [two-file allocation](a02-schema-reader-allocation.json), SHA256 `9a3f91d37f9bbcc3d642b4b3aa1798c4ce5d56422773ee5dda6b851254ad51f9`, replaces the released atomic-admission allocation. Root supplied base `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus preserved dirty prerequisites and owns integration/context evidence.

Root's first combined run passed 308 cases and failed the stale canonical schema reader. It retains `a02-atomic-build-integrated-7c3687d9-8e87-4ec6-87c4-c357833c5cf8.json`; session 91923 closed. The old reader selected the latest literal declaration, which contains producers 1.0.0/1.0.1/1.0.2, and missed the actual forward guarded patch adding 1.0.3. This was a test-reader omission, not a reason to change the application schema or historical migrations.

The new test-local reader processes actual source declarations, the historical full-replacement guard and relevant `patch_manifest` entries in migration/source order. Each patch requires the exact predecessor SHA256, exactly one occurrence of each old context and the exact successor SHA256. Only then does the original assertion read the embedded JSON schema. The existing `expect(schema).toBeDefined()` and full `z.toJSONSchema(..., { target: "draft-7" })` equality assertions remain verbatim. No enum filtering, app-derived SQL expectation, parser, skip or production helper was added.

The seven cases comprise the original full-schema equality plus historical-body/ordering, predecessor, missing/repeated context, postimage, historical replacement-guard and missing-declaration controls. They retain the actual historical `c9071376` body and resolve the actual `572ba813` successor. Inputs remain read-only and no source/golden update path exists.

Private packet: `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a02-schema-reader-i8fzwlad`.

- `focused.json`: seven cases/one file PASS.
- `types.json`: three roots/five project files/zero diagnostics PASS.
- `lint.json` and `format.json`: scoped checks PASS.
- All checks used exact Node22.23.4, sealed synthetic environment/no dotenv/AI, 718 stable nonsecret source inputs and exited owned process groups. The formatter exited zero; its retained mutation receipt records the intended owned-file edit.
- `preservation.json` verifies the original assertions verbatim, the baseline test SHA256 `774b9588bfb1981ae9e996467a3f7694e84e9d5f11fcbaa0d2e5f4dbf2874dd5` and all 717 other source inputs unchanged. The final test SHA256 is `32879f0ca2bf48600c888fd7f5c82389e9cdee827c99653c872b55ca90a2fc8a`.

Read-only peer review found no required issue. Only `tests/unit/canonical-sql-contract.test.ts` and this handoff changed. Root owns the affected follow-up/full checks and exact-hash carryforward of the unchanged 308 cases; this agent did not rerun them. No production code, SQL/migration, dependency, environment, provider, candidate data, Git, DB, SQL parser/runtime or deployment changed or ran. SQL remains UNPARSED/UNAPPLIED/UNEXECUTED; native behavior, consumer/cutover and full A02 acceptance remain open.
