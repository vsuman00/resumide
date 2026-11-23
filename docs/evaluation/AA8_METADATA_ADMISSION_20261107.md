# AA8 metadata-admission slice

Gate AA7 is closed and owner-accepted under [ADR-0017](../decisions/0017-aa7-owner-acceptance-and-aa8-start.md). Phase AA8 has started. This first AA080 slice implements a strict metadata assessor, lifecycle-planning helpers and a bounded CLI; representative-data acquisition is not complete.

## Results

| Check | Actual result |
| --- | --- |
| Targeted corpus tests | 44 passed, one file |
| Actual CLI cases | 14/14 passed, including deterministic output, explicit membership, unauthorized source, private-field rejection, malformed/oversize/UTF-8/symlink input and safe errors |
| TypeScript, lint and scoped source checks | Passed |
| Web and worker builds | Passed; both final outputs exist |
| CLI temporary files | Seven owned metadata files and their directory removed |
| AA7 tests or scans rerun | None |
| Database, Docker or provider operations | None |

The initial web and worker builds ran concurrently; React Router cleaned the worker output. Running the worker build after the web build restored both artifacts. This was build sequencing, with no application source fix or repeated unit/CLI test run. The web build retained the existing Zod annotation warnings and empty resource-route chunks with exit zero.

[Machine-readable evidence](AA8_METADATA_ADMISSION_20261107.json) binds all four source files and package scripts. [CLI receipts](../../tasks/agent-handoffs/2026-11-07-aa8-cli/actual-cli-receipt.json) preserve actual process outcomes. Independent backend/test/CLI work used separate existing worktrees; root integrated their owned files. Existing unrelated dirty work was preserved; no commit, push, migration or deployment occurred.

## Metadata data card

The demo contains three fictional metadata records tagged native, scanned and mixed, all in development. They share one declared source family, template and near-duplicate group. Their hash strings and permission references are placeholders; no PDF bytes or real resume/JD were acquired. Raw document count is zero. This is not three independently sampled resumes or a representative corpus. Both representative and release readiness remain false.

AA080 still requires actual permitted data, rights/privacy review, coverage counts and access/deletion evidence. AA081–AA086 retain their annotation, partition, calibration, locked-evaluation and claim-approval dependencies. The [design](../design/EVALUATION_CORPUS.md) documents the implemented contract and its limits. No failed historical release metrics or thresholds were changed.
