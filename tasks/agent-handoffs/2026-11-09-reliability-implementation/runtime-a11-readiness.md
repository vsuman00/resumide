# A11 readiness and legacy writer closure

Status: implemented SOURCE ONLY. SQL is UNPARSED, UNAPPLIED and UNEXECUTED. Native grants, schema/caller behavior, concurrency and rollout remain unverified. No database, provider, service, environment-secret or Git operation occurred. Root owns integration and the combined application gate.

## Delivered contract

The forward migration changes three exact known bodies. The legacy writer retains its current owner mutex/privacy/root/membership admission and exact prior replay. Only fresh accept/reject then rechecks the analysis/source/job tuple, locks the actual owned job and latest owned requirement row, and refuses typed2 or unknown/mismatched schema/linkage. No-JD and legacy1 behavior stays in the old branch. Manual edit/confirm/rename/clarify/undo/restore and existing receipts keep their prior implementation.

The canonical checker retains all 138 entries, body/attribute/store/trigger/foreign-key/ACL/column-DML checks; only the legacy-writer body SHA literal changes. A separate private typed checker verifies that exact canonical successor and the ten-routine typed extension: eight helpers, writer and metadata reader. It checks bodies, owner alignment, signatures, attributes, empty search paths and effective/direct grants. Private helpers stay owner-only. The writer permits only its owner and an optional direct, non-grantable service EXECUTE; it rejects PUBLIC, anon/authenticated, other grants and inherited permission. The migration keeps the writer denied. Integrity and EXECUTE are separate, so a coherent staged schema may report `schemaReady:true, writerExecutable:false`; this is not a claim about any current database.

The typed writer replaces its old canonical-only check with the typed checker after current access and exact prior replay, before fresh heads/CAS. Existing bodies, transformations, receipts and hooks otherwise remain unchanged.

`public.read_typed_authoring_readiness()` is a zero-argument, service-only catalog reader. Its strict eight fields are schema/profile versions, `schemaReady`, `writerExecutable` and four actual `pg_proc.prosrc` hashes. It reads no candidate, job, pool or owner data. `writerExecutable` means effective EXECUTE for service_role, not `current_user` inside SECURITY DEFINER, candidate authorization or activation. The Node profile exports six actual strings; hashes are externally pinned without a recursive self-hash. Owned original-command proof still precedes Node readiness; native owner/privacy and replay order is preserved.

## Source evidence and correction

Text-only reconstruction matched legacy `b25b9b1f`, canonical `f88516e9` and typed writer `57af4c1e` predecessors. The original legacy body was reconstructed through both R19 and C02 patches. Postimages are legacy `d4caf737`, canonical `0c8ab460`, writer `7ea525c7`, typed checker `f1f32624` and reader `c70e1e3b`. All ten typed body pins and six profile strings match. Root independently reproduced these checks and recorded `a11-readiness-native-source-review.json`; the filename does not mean native execution occurred.

Root found that the first released legacy guard compared job IDs without locking the actual owned jobs row. The bounded fix added that owner/org check. The initial migration/profile (`7c9c575d`) and pins remain as `.txt`/JSON receipts in the private source directory. Final profile source is `26c3e7a0`; migration `217d9c1a`. No source body changed after Root's final source ACK.

Read-only reconstruction: `/private/tmp/resumide-a11-readiness-text-check.py`. Private pre/postimages and the ten-entry catalog: `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a11-readiness-source-ltoubohk`. The separate generator is an authoring tool that writes source; do not use it as a read-only verifier. Source hashes are not PostgreSQL catalog proof.

## Deferred native protocol

The new verifier is privileged, MUTATING and rollback-only. It requires a separately admitted isolated direct Supabase target and actual owned canonical/JD producers, recorded legacy receipt, current typed JD and real manual rename command/body. It drafts staged metadata/pins, temporary grant/attribute/column-DML failures, exact legacy replay, fresh typed denial/no writes and preserved manual rename. Each catalog fault is rolled back in its subtransaction; the outer transaction rolls back all fixture effects.

GUC acknowledgements do not prove isolation or authorize execution. Actual two-session JD/privacy races, foreign/current-job tampering, no-JD/legacy1 positives, remaining manual operations, PostgREST role execution, rollback/cleanup and source/catalog parity remain NOT RUN. No hosted permission, flag or writer grant was inferred. The prior SQL and 138-entry manifests are unchanged files; this migration is forward-only. Full A11 usefulness, broader declarations and native/representative acceptance remain open.
