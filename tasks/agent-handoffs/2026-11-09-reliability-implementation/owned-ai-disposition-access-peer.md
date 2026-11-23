# Owned AI disposition access peer review

2026-11-15. Outcome: **No new scoped Required or Critical finding identified.** Technical source review only, with no Native, browser or release acceptance. Base HEAD `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, dirty main preserved. The code-review-and-quality skill guided source and existing-test inspection; the explicit read-only allocation excludes its mutation experiment and fresh test runs.

Reviewed actual Root files from `owned-ai-disposition-access-peer-allocation.json`, not the runtime export adapter. Start: `2026-11-15T13:36:47.866114+00:00`. End: `2026-11-15T13:40:35.291763+00:00`. All eight source/test hashes below matched the frozen allocation at both observations; no source changed during this review. The author handoff also remained `43ebe61e108f4ced2f7e34b7588b7847da3c14a9e26cf7541ec069fb63292e1f`. Allocation SHA-256: `7141ef19b89b5addae2ac684c843a11928736a5bb11d7dabb36798d5cc409bb6`.

- The shared access helper validates the strict nine-key metadata, all six pinned strings and its distinct `accessExecutable`; export permission is not substituted. Its strict four-key access reply must match the requested owner. Missing methods, thrown/query errors, denial and malformed replies return unavailable, without a request-table fallback.
- The download loader checks durable authority before loading the owner-filtered completed manifest and again before serialization. Prepared deletion blocks failed/cancelled or cleaned-up request histories. Authentication, owner/kind/status predicates and no-store responses remain.
- The privacy loader supplies preparation independently of its twenty-row history. Unknown authority stays unavailable/null. Server cancellation checks the owned target kind, refuses prepared deletion with 409 and permits pre-preparation or export cancellation. The UI hides unsafe deletion cancellation and old download links without treating unknown as unprepared.
- Canonical and JD readers use the same helper while retaining analysis ownership, membership and source/root/version ownership and active-status checks. Their clear replies do not bypass these checks; blocked becomes missing and unavailable becomes a service error.
- One bounded shared deadline and AbortSignal cover metadata/access. Finite, nondecreasing wall-clock checks run at await boundaries and before clear return, including the delayed-timer case. Timer/listener cleanup and underlying query cancellation are explicit.

Existing author evidence was inspected, not rerun: `combined-checks/green-receipt.json` is PASS with no source drift, and its JSON report records 87 passes, zero failures/skips across three files. The frozen postimages match the reviewed eight files. The deadline regression and the original prepared-failure/cancellation regression remain preserved in the author packet; this review adds no independent runtime result. The author correctly labels its compiler successor incomplete after profile dependency drift. Root's combined current-profile gate remains pending.

The authoritative Native cancellation trigger and transaction races, Auth/org disposition, expiry/purge, physical artifacts and restore are separate adoption obligations. Two Node access probes are not Native isolation proof. No fresh tests, source edits, SQL parsing/execution, DB, provider, actual environment/data, services, browser, dependency or Git mutations ran. Branch, HEAD and scoped status were checked read-only. Only this allocated handoff was created; Root owns integration and gates.

| Reviewed source                                | Start and end SHA-256                                              |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| `app/lib/server/privacy-deletion-policy.ts`    | `f0b1d52d71331e23ed4d5d89535e740e16fd0581cb57b236a6cfab1a1544227a` |
| `app/routes/api.privacy-export.ts`             | `b0f9d01037055c55e299057d2fb330d171d0c9f54c736102a6040b2281edeb8f` |
| `app/routes/privacy.tsx`                       | `6750c7711d0c521db605908eb6548b5907e59f8b48316495c00c80f058d95c40` |
| `tests/unit/privacy-export-route.test.ts`      | `38e303a73563866c88fdb787ccecdd2a753fb0f05d27c74b84ef799651218bee` |
| `tests/unit/privacy-route.test.ts`             | `134ee3f94a8ffe6c1a40118c64adcdbb02cdfeb038be9e9ad47c6dbdc3b99994` |
| `app/lib/server/canonical-repository.ts`       | `b09c436d4a151977218d552dc734e63fb842880e34c123d8ff3d615d6f01b22c` |
| `app/lib/server/job-requirement-repository.ts` | `b6426a2b2f29635a4f9c1bb8958489fc8f5dbd1c9d3fcd57ec97ebb327090230` |
| `tests/unit/privacy-deletion-access.test.ts`   | `361b5e0a7402a9d680daae04180162a4e056aff1c2eb00221ebf14759c0c1478` |
