# Atomic expiry fold: independent source review

Status: SOURCE ACK; no remaining scoped finding in the pinned product candidate. This is a staged implementation with an absent adoption dependency, not usable expiry or a 720-hour erasure guarantee. Products/tests were read only; only this handoff was written. Base revision: `a0b239299d75b0bd64b588fe743ebe2975fb28b9`.

Authority: frozen expiry contract SHA256 `69a3582d942a2399dec8021cb2e36bbdd7c2b027af329aa2f8f4c3d3749736ae`, clarification `b954232d06b265f358cc2c7b582f780b7aaa347ba84c4b9dc109fd54c51cff73`, adoption boundary `eabe9b0d67a9c1615837f275cdbaaa234f650b463c7547b8f7cdced0d87e2d51`, and exact peer/backend/runtime allocations. No live action or grant is authorized by this review.

The actual core selects due accounting identities under the owner lock, using immutable operation/account deadline minima. Repair-required history refuses rather than receiving a guessed clock. Selection does not erase unrelated active operations merely because another source retired. Work authority records exact identities/current transaction only; its write guard rejects another transaction ID and the deferred constraint rejects surviving work. Folding and selected relational deletion share the transaction, so committed deletion removes the personal dedup authority too.

Shared quota and R03 amounts remain separate. Validated unlinked retained runs contribute once; linked copies contribute through their typed authority. Legacy run counters are cast before addition. Typed usage uses original claim month, R03 uses stored attempt period, and erased compatibility-run counts retain their separate original run month solely to refuse affected arbitrary-since reads. Unknown/reserved exposure and unreconciled overages remain global fences beyond identity expiry. An erased over-limit pool that would otherwise lose its fence adds an unresolved numeric pool-deficit marker. No expiry refund or extra dispatch follows from removing that pool contribution.

Reported draft findings are resolved in the final candidate: the pool-fence loss; incomplete deferred work check; A13 finish fence confined to replay; missing later-month raw-run evidence; the post-lock STABLE-snapshot race; and the seal trigger's missing predicate/argument checks. The successor uses fresh VOLATILE post-lock hold checks while preserving existing consistent classification/totals statements. A13 now fences both fresh and replay completion on the common owned-operation path. Distinct local row names avoid SQL alias ambiguity. Deadline reporting retains initial and selected removed deadlines and performs a fresh final overdue/repair scan, including successfully folded overdue work.

The adoption verifier and capability record are unimplemented/unseeded. Actual catalogue properties, trusted owner, closed ACL and approved body digest must match before its strict transient source-bound witness can authorize folding. Missing authority refuses before aggregate writes/removal. The core does not demand renewed AI consent, membership or surviving content parents. Foreign actors on surviving foreign spend, Auth/session/replay closure, org/opening evidence, old exports/objects and the independent restore floor remain real adoption obligations. Structural schema readiness is separate from adoption-dependent execution; the absent verifier does not disable normal non-due AI paths. Only metadata is granted; sweep/data access remains denied.

Independent text/digest review resolves 24 full-body preimages to preceding source, checks every before/after digest, and matches 19 safety plus 24 transition manifest pins to 45 actual bodies. The nine successor profiles reverse exactly to allocated preimages by restoring dependency digests. The new profile matches actual checker/sweep/metadata bodies. The fresh catalogue seal covers all four new relation schemas and explicitly checks its excluded closed trigger, including empty arguments, NULL predicate and NULL transition tables. Old sealed rows are not resealed.

The runtime strictly validates the seven-key metadata and five-key sweep wire, exact profile, counts/sum/limit, cancellation and shared deadline through final return. It sends at most one sweep and never retries an uncertain commit. Only a confirmed report can supply count diagnostics; blocked/breached work fails. CLI requires explicit `--execute` before loading the real client and prints fixed failures/counts without identities.

Pinned SHA256 values:

| File | SHA256 |
| --- | --- |
| `supabase/migrations/20261115190341_owned_ai_expiry_fold.sql` | `01c770432cfd5532b1a0f2d4bdc4d6a9d657c7a1ae5975b8c4b07cad06449a55` |
| `app/lib/server/owned-ai-expiry-profile.ts` | `bdc224158dd5f5284d8ac02b5a8c8f04d843c2ad746a03b50b2650cb63e38c23` |
| `app/lib/server/owned-ai-budget-export-profile.ts` | `6a30b99e13450c76135a07a8057ea9fd61e83f13b6408a47e11ed55181acfb99` |
| `app/lib/server/initial-feedback-publication-profile.ts` | `94a1a7d0e30370aa407ec61e76dcbf6e2106caf4cb38f64a117a40b7041ae2fd` |
| `app/lib/server/initial-feedback-operation-profile.ts` | `fcaadc734374ce30a143a13af55c7c9a93ea9bc9c8dafc09c143bfaf3e0bd2f0` |
| `app/lib/server/initial-feedback-profile.ts` | `614d61ed5ebb617a0084b07631ca2d31768de5971cf7eda8b6fa97d756e727de` |
| `app/lib/server/canonical-rewrite-readiness-profile.ts` | `d8c774f87377ea4fa027c011e5c4172eaf64419af8efbaa8972ab937997b9f25` |
| `app/lib/server/canonical-rewrite-workspace-profile.ts` | `d7cd43635795a2d9c3ac03b2a3f2e8488d7409ba116b43b078ba5b631edb0245` |
| `app/lib/server/owned-legacy-ai-usage-profile.ts` | `d96e05191117ccd81961386940081e30c9bfacf72a553a19965279230d3a98f6` |
| `app/lib/server/ai-budget-source-profile.ts` | `3993cea64daeedcae52f2f1422655175bfc1b3c359a33394923df24c2e630b69` |
| `app/lib/server/owned-ai-disposition-profile.ts` | `cc6e5aa1533a6d10b46d4172f1049229476db5c55d2fdaa8bd556528289fb543` |
| `app/lib/server/owned-ai-expiry.ts` | `f93ccb1cd9b7d4f4452cef9399d0eb0ec6e5bd18b9907b7f42d0a5cabaa88360` |
| `scripts/run-owned-ai-expiry.ts` | `6c076b574cdfe4f0651244c94dbca1149d1e2da743227aa17393442f93a40654` |

Runtime release `/tmp/resumide-expiry-fold-release.json`, SHA256 `25ba68d793c7aa0cdc7232324fd0194072c32eda7eba2eb2415840b3025f315f`, preserves the earlier draft-profile checks and scoped format/lint. Its separate final-profile successor `/tmp/resumide-expiry-fold-release-final-profile.json`, SHA256 `02f3c0d3f640409618ed60323cc1d14c6e89062426c3670016f67582300ecc45`, binds unchanged products to actual profile `bdc22415` and fresh author 85/2 fake-RPC/CLI passes with zero skips; it does not repeat statics. Backend historical bridges/final packet and Root combined gates remain pending at this handoff. No peer tests, SQL parser/execution, Native/DB/provider/network calls, services, environment inspection or Git operations occurred. Actual role/transaction/storage races, completed adoption, scheduler/deadline monitoring and representative/owner/release acceptance remain unverified and open.
