# Document page-count consumer regression

Status: VERIFIED_LOCAL_SOURCE / SYNTHETIC CONTRACT EVIDENCE. This leaf owns only the new consumer test and this handoff. No UI, production source, SQL, fixture database row or readiness capability was changed. The backend-owned metadata API was transferred read-only at `c45e317272925db9bd2c1fe76bc02c6e48f172746beb67cc641c74e69c80717a`.

The source diagnosis remains precise: review extraction previously returned only its immutable envelope; unlike the legacy extraction path, the worker did not carry declared total pages into persistence. The owned context exposes stored `page_count`; JD2 correctly refuses NULL or mismatched coverage. The diagnosis establishes a code path, not prevalence in deployed records. Backend owns the real producer RED and production repair; Native atomicity and actual stored-count behavior remain unexecuted and outside this leaf.

`tests/unit/evidence-page-count-consumer.test.ts` uses the actual new metadata API with an injected synthetic extractor. No PDF parser runs. It imports actual resulting evidence through the original canonical producer, confirms the target through `reviseCanonical`, creates typed JD relations and passes a scoped synthetic read DTO through the actual strict relationship reader. The positive DTO receives `result.pageCount`, never a default or envelope-length guess. These are read-boundary inputs, not simulated database updates or proof of Auth/SQL ownership.

The twelve cases cover:

- Declared one-page and two-page complete results: one extractor call, unchanged envelope shape, correct clause-order plan and all numerical diagnostics still withheld.
- Historical NULL metadata: complete current evidence does not fill or repair it. The plan stays unavailable and the workspace returns null before any readiness/write RPC.
- Both metadata-count mismatch directions: the exact source-coverage refusal remains; no silent correction or narrowing occurs.
- A declared blank second page: count2 and both page texts remain intact, OCR-unsafe status stays refused despite a known count.
- The supported one-page aggregate fallback, refusal of missing/mismatched multipage boundaries, invalid declared totals and configured page limits. No second extraction is performed merely to obtain a count.

This proves producer-to-consumer structural compatibility and conservative refusal. It does not prove the Native five-argument overload writes `resume_versions.page_count`, its transaction/lease/owner behavior, historical repair, real PDF coverage, a browser journey, or writable capability. No SQL simulator or fake readiness result is used. The physical database boundary still requires separately authorized Native acceptance.

## Exact verification

Evidence directory: `/private/tmp/resumide-page-count-consumer-5uvgtqno`.

The actual metadata API was present before testing; no missing-export/module RED was manufactured. Initial12/1 passed. One formatter check then found first-pass chained-call layout drift; the failed receipt and pre-second-format snapshot remain preserved. The second pass changed only that layout, with no assertion or behavior change. Final `green-successor`, `lint-successor` and `format-check-successor` passed against the frozen bytes, with zero skips, unchanged input hashes and closed process groups. These repeated runs represent twelve unique cases, not an enlarged total.

All children used pinned Node22.23.4, empty HOME and the existing OS network/dotenv/Git-write denial, one worker and 120-second/8MiB bounds. No full suite, author typecheck/build, actual worker, browser, PDF, database, provider or hosted operation ran. Root owns combined current-source checks and profile integration. The current pending schema-only target packet does not authorize the new migration or runtime action.

Frozen test SHA-256: `b10c42c709db273fec36bc28a38e464748ae39c756b8a9e0531c0a56cc9ca25c`. Both owned preimages were absent. The installed self-contained prose workflow is applied without altering code, identifiers, quotations or test claims.
