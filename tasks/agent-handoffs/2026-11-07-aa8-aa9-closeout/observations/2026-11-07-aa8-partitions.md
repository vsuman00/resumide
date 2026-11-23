# AA082 partition locks

The partition module and its unit suite are ready for coordinator integration. The owner amended the current target to engineering completion for an open-source/demo/release-candidate project, with subagents acting as technical reviewers. Customer/recruiter/vendor pilots and launch review are deferred. Synthetic tests do not establish independent-human annotation or representative corpus validity.

Owned files:

- `app/lib/server/evaluation-partitions.ts`, SHA256 `199ce3fa9ec714d8c7dbcd7d9167bea7388606ce342072a84b0bd25a97c9ffe9`.
- `tests/unit/evaluation-partitions.test.ts`, SHA256 `a58d4c902ca9e73001d86043e5bddaa3c5b25316b4116bd76d2217f665866aab`.

The strict version-1 input binds corpus version, document IDs and hashes, all three populated partitions, person/employer/template/source-family/near-duplicate clusters, access groups and actual annotation-assessor output. The global lock accepts at most 4,096 records. Employer metadata supports known clusters or explicit non-applicability with reason and evidence references; unresolved or missing metadata is rejected.

`createEvaluationPartitionLock` canonicalizes membership and freezes the hash-bound result. `verifyEvaluationPartitionLock` recomputes current bindings and detects tampering or drift. Synthetic evidence creates an engineering lock. A representative lock requires independent-human annotation eligibility from trusted source/reviewer callbacks plus separate trusted approval of the exact membership hash. Missing, throwing or JSON-shaped authority denies it. Scoped partition eligibility never establishes whole-corpus validity or release readiness.

`readEvaluationPartitionLabels` rechecks the lock, purpose and explicit access-group membership before invoking its reader. Calibration cannot read locked-test labels, including when the actor holds the locked-test group. The reader receives only requested partition IDs. The returned audit contains fixed decision metadata, counts and hashes; the application must authenticate groups, enforce reader scoping and persist the audit. Reader errors expose a fixed code.

The tests cover leakage in every category, duplicates, annotation/hash drift, canonical ordering, immutability, missing metadata, non-applicable employers, trusted representative authority, reader denial before execution, allowed scoped reads and safe audit output. All metadata and authority callbacks in tests are synthetic controls.

Node 22 Prettier and targeted ESLint completed with exit 0. Unit execution is reserved for the coordinator's integrated run. The annotation owner was notified that its initial 256-unit bound cannot serve a 4,096-source lock; it is coordinating a bounded global adjustment. No database, Docker, provider, external-data, shared-document or AA7 operation occurred. The locally copied annotation module is read-only alignment from its owner and is excluded from this patch.
