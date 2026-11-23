# A10 typed repository and authoring tests

Status: synthetic coupled tests and scoped source review. Native database behavior and release acceptance remain unverified.

Base HEAD: `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, with preserved dirty work. This leaf owns only `tests/unit/typed-score-repository.test.ts` and this handoff. Root separately assigned the three narrow coverage corrections recorded below.

## Actual test path

The tests call the real canonical and JD repositories, strict relationship reader, semantic producer, coverage matcher, typed diagnostics builder, and score repository. The shared fixture uses actual evidence, grouped canonical import, revisions, confirmations, and typed JD builders. Only table transport and RPC results are synthetic. Opaque native hashes, header approval metadata, ownership, and snapshot atomicity are supplied by the fake store; these tests do not prove SQL-origin authority, database privacy, grants, locking, or concurrency.

The 26 cases cover the coupled typed result, exact SHA clause identities, withheld numbers, nullable and 21-page metadata, stale expected heads, foreign ownership, missing membership, deletion, source access, unavailable migration, invalid owner/source/profile bindings, explicit historical canonical and JD selections, final privacy failures, changing heads/native digests/page metadata/job links, exact legacy output, shared proposal guards, and accept/reject blocking before write transport. The historical cases retain actual selected builder content separately from current head metadata.

## Evidence and failed attempts

- The unchanged coupled control failed at the old typed-JD 503 boundary, then passed against the coherent six-source successor. Logs: `/private/tmp/resumide-a10-typed-repository-baseline.log` and `/private/tmp/resumide-a10-typed-repository-coupled-green.log`.
- The first finite matrix passed 20 and failed 5. All five failures were test harness or expectation errors: typed clauses live under `relations`; deletion reads return arrays; header metadata uses `canonicalContentSha256`; native digest changes must retain the header binding; legacy `maybeSingle` reads return one row. The failed log is preserved at `/private/tmp/resumide-a10-typed-repository-matrix-initial.log`.
- After those corrections, all 25 cases passed in 572 ms. Log: `/private/tmp/resumide-a10-typed-repository-matrix-corrected.log`.
- The final profile-negative adjustment passed its affected case. One added, already-planned historical JD case passed through the real JD builder and repository. Logs: `/private/tmp/resumide-a10-typed-repository-final-profile.log` and `/private/tmp/resumide-a10-typed-repository-historical-jd.log`. Filtered runs intentionally select existing cases; no test is disabled in source. Root owns the final integrated 26-case run.
- The initial scoped checks caught an unused mock argument and a nonexistent negative-fixture profile property. These were corrected in the test only. The subsequent scoped check passed: two roots, 50 sources, zero TypeScript diagnostics; ESLint and formatting passed. Final checks after the historical case are recorded alongside these receipts.

All commands used pinned Node 22.23.4 and a sealed synthetic environment with dotenv disabled. No SQL parsing or execution, database, provider, browser, Docker, actual environment credentials, candidate data, service, dependency, or Git mutation occurred.

## Finite backend source review

No additional hold was identified in the six-file typed repository, diagnostics, shared technical extraction, enum, and authoring checkpoint. The typed branch selects exact owned versions, keeps captured heads distinct, uses a second strict owned read plus job-link check before returning, and fails closed without a relationship-table fallback. The typed diagnostics schema keeps legacy alignment empty and preserves unknown page counts. Shared proposal builders and repository accept/reject paths pause typed proposals before writes. This is a scoped source and synthetic transport assessment, not native transaction proof.

Reviewed checkpoint pins: repository `bcdfef98`, engine `175cc512`, typed diagnostics `2c389425`, enum `3b6ba7ca`, authoring contract `04ba1595`, and authoring repository `c84e5365`. Shared actual fixture: `5a3482a913209ce148f123e73682a19cc082c0e4f5311b1bc7f1b0468ad86e08`.

## Separately assigned coverage corrections

Root and frontend captured two real deduplication failures. Coverage source now preserves sorted literal proficiency qualifiers and includes the normalized literal clause plus unknown reason for unknown expressions. Distinct unknown meanings are not asserted equivalent. Backend also found source-reported date fragments described as an owner declaration. The new `source_dated_clause_requires_review` reason distinguishes that source evidence, including mixed source/declaration cases, without changing witness, interval, proposed-state, or numeric behavior. Frozen source: `d3a70ff51d230b4360ddaec4cbead14d07a804a0997d2141f424d492c83542ff`. Earlier `13840b0d`, `b835614d`, and `e7f818ce` receipts remain historical.

Frontend separately identified that explicit duration prefixes currently leave stored skill expressions unknown. That actual coupled-path gap remains open; passing repository tests do not establish duration coverage. Root coordinates its next source slice. No parser, admission profile, SQL, flag, authoring activation, or release floor changed here.
