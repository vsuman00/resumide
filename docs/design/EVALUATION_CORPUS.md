# Evaluation corpus metadata foundation

Status: AA080 prerelease engineering is complete and verified under [ADR-0018](../decisions/0018-solo-prerelease-aa8-aa9-verification.md). Representative acquisition is owner-deferred to the [release-readiness checklist](../../tasks/aa8-aa9-release-readiness.md). The metadata foundation described below is one component of the completed workflow. [ADR-0017](../decisions/0017-aa7-owner-acceptance-and-aa8-start.md) closes Gate AA7 and authorizes starting AA8 under the existing [AA003 governance](../decisions/0009-aa0-truth-contract-and-evaluation-design.md#aa003--corpus-governance-and-annotation-handbook).

The pure server module [evaluation-corpus.ts](../../app/lib/server/evaluation-corpus.ts) evaluates declared metadata. It does not ingest documents or persist a corpus. Its strict version-1 manifest accepts at most 256 records per batch; actor context accepts at most 32 opaque access groups. The caller supplies trusted group membership and an assessment timestamp. The CLI requires explicit groups and time for an external manifest; only its no-argument demo supplies a fictional actor and fixed time.

Each record contains an opaque ID, declared SHA-256, source kind, PDF/segment tags, generator/source-family/template/near-duplicate references, fictional-identity declaration, permission/license/purpose references and validity dates, partition label, access group, retention expiry and lifecycle state. The default policy admits only synthetic metadata for software engineering, English (`en`), India (`IN`), PDF and the declared native/scanned/mixed/layout taxonomy. Taxonomy admission does not certify parser support for that segment.

Future permitted non-synthetic intake uses an optional in-process `EvaluationCorpusAuthority`, supplied by the trusted server rather than the manifest or a client flag. `hashEvaluationCorpusRecord` binds the entire validated record. An authorization decision binds that hash, ID/content hash, source kind, permission/license references, purpose, actor groups and assessment time. Non-synthetic records require `REPRESENTATIVE_CORPUS_PURPOSE` (`representative_corpus_evaluation`) plus actual trusted authorization; ordinary upload or qualitative-AI consent does not satisfy it. Missing, throwing or forged authority denies admission. Existing scope, lifecycle, permission expiry, retention and membership checks still apply. Admission alone never grants representative validity.

`EvaluationCorpusDrill` accepts the same optional authority port. Its byte/hash checks remain mandatory and read-time authorization is rechecked after awaited storage/audit operations, so a revoked authority cannot return document bytes. The CLI supplies no authority; real records remain denied there. No real corpus or provider was used to test this future contract.

Unknown fields, unauthorized real/uploaded/scraped source kinds, missing/invalid metadata, unapproved scope/purpose, future or expired permissions, expired retention, revoked/deleted records and missing actor membership are excluded with fixed reason codes. Exact ID/hash collisions exclude all otherwise-admissible peers. Summaries expose counts and fixed codes; they do not echo raw metadata or validation errors. `representativeReady` and `releaseReady` remain false, including an empty inventory.

`assessCorpusRetention` plans invalidation/deletion requirements from provided dates and states. `transitionCorpusRecord` makes immutable forward-only revoke/deleted metadata changes. These helpers do not authenticate actors, verify external rights, enforce physical cleanup or certify a deletion drill. Permission references and hashes remain declarations until independently checked against permitted source material. Partition labels in this helper are not frozen partitions; the completed [AA082 partition module](../../app/lib/server/evaluation-partitions.ts) supplies canonical locks, leakage checks and restricted readers.

## Operator commands

Use Node.js 22. No-argument demonstration:

```sh
npm run --silent verify:aa8:corpus
```

Explicit metadata assessment:

```sh
npm run --silent verify:aa8:corpus -- --manifest /path/to/metadata.json --as-of 2026-11-07T00:00:00Z --group synthetic-evaluation-group
```

The CLI opens only a regular non-symlink metadata file, bounds reads to 1 MiB, requires valid UTF-8/JSON and returns fixed safe errors. It exits nonzero for malformed input or any excluded record. `--silent` avoids npm echoing the supplied path. The static demo is an engineering example, not current-time authorization.

## Evidence and current completion

The [verification report](../evaluation/AA8_METADATA_ADMISSION_20261107.md) records 44 focused tests, 14 actual CLI cases, typecheck, lint, source checks and web/worker builds. No database, Docker, provider or AA7 test operation was performed for this slice. The completed [full workflow](../evaluation/AA8_AA9_WORKFLOW_20261107.json) and [direct-Supabase drill](../evaluation/AA8_STORAGE_DRILL_20261107.json) add actual byte/hash/access/lifecycle execution and independently verified cleanup. AA080/AA081 current software acceptance is complete. Actual representative rights/data, coverage/sample justification and independent-human research remain deferred release evidence; no representative/domain-valid claim is promoted.
