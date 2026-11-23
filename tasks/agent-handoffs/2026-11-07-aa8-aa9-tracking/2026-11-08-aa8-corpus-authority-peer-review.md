# AA8 corpus authority repair: independent review

PASS: no blocking finding in the frozen four-file repair integrated into ROOT. This was a finite source-and-test review, not another test run or a grant of real-data permission.

Reviewed hashes:

- `app/lib/server/evaluation-corpus.ts`: `da9a90eb3595420289a717a256c809696a879428ae13da1c5be967fe28db5331`.
- `app/lib/server/evaluation-corpus-drill.ts`: `da87f4ca787e164afcc2999cbba5cc3cc7360c63746421a311f268e8d74dd4f0`.
- `tests/unit/evaluation-corpus.test.ts`: `5ea0cb1ac7715d6decc3c8f9c8b7e0d57efadb2f2abe0bb94d53e4249d465498`.
- `tests/unit/evaluation-corpus-drill.test.ts`: `313488a4271c1781fd22243f8e3d7fd11c8ae2cd91e9dc3eea32b2460b7e3b7f`.

The optional authority is installed in server context, separately from manifest/actor JSON. Its frozen request binds a version-prefixed digest of every strict, schema-ordered record field, document ID/content hash/source kind, rights and license references, exact purpose, normalized actor groups and validated evaluation time. The caller remains responsible for authenticated group membership and independently verified permission; this module does not manufacture either.

Non-synthetic admission requires the explicit `representative_corpus_evaluation` purpose and a strict boolean `true` from that authority. Missing, JSON-shaped, throwing or non-boolean authorities deny access. Upload or qualitative-processing consent cannot substitute for this purpose. Source-kind naming alone grants nothing. Unknown metadata fields remain rejected; public reports expose fixed reasons/counts rather than private input or callback errors.

Authorization does not override format, domain/language/locale, document/layout class, lifecycle, grant/expiry, retention or group checks. Synthetic admission retains its original purpose and fictional-provenance rules and does not invoke representative authority. Record hashing includes lifecycle/provenance/retention fields, so an approval for an older declaration cannot silently approve changed metadata. Neither admission branch promotes representative or release validity.

The drill forwards the installed authority through its existing assessor. Its separate owner-ID check remains before reads. The existing final current-entry/eligibility check invokes current authority again after both download and terminal-audit awaits, immediately before bytes can be returned. Tests cover withdrawal during either boundary and verify no returned bytes. Owned cleanup remains available after rights withdrawal, preserving deletion verification and failure receipts.

I compared the repair with the prior implementation and read the actual added positive/negative tests. The coordinator reports the frozen candidate's full verification and CLI completed with exit 0: 1,453 tests across 160 files, 615 stable source inputs, source/lint/type/web/worker checks and all 12 workflow/11 pilot controls. This review did not repeat those commands. The new completion receipt preserves earlier evidence rather than rewriting it.

No new route, provider, data acquisition, migration or external operation is introduced. This review supplies AI technical evidence for the bounded repair under ADR-0018; it is not independent-human research, representative-corpus validity or launch approval. Only this reviewer handoff was written in the sandbox worktree.
