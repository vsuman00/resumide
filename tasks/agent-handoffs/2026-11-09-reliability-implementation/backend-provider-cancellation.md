# R09: worker cancellation and the rewrite save boundary

2026-11-10. Local source/tests only, following RT09 and the coordinated RT10 helper contract. Backend owns only qualitative stage, rewrite service, the new cancellation test and this handoff. R07 source remains frozen apart from Root's separately authorized route-policy fingerprint correction. No provider, database, Docker, browser, real-document, credential, Git or deployment operation occurred.

| File | SHA-256 |
| --- | --- |
| `app/lib/server/qualitative-stage.ts` | `41f8fb783af46407dcbf956fde668978763632df0521d34c414b8ede75483bbc` |
| `app/lib/server/rewrite-service.ts` | `05b3c9dc81e314e95d952c79429fd5a4d2d580cca47e03b87f606fdfb494bdea` |
| `tests/unit/provider-cancellation.test.ts` | `29c208a07ba903731faa76b01d639724886a6a5e1dfb379db1d9ac05c1e7aa25` |

Prior qualitative/rewrite sources were `d3cbf0d6…` and `f134c6bf…`. Frontend owns `analysis-stage-fence.ts`, dependency SHA `a5746b7295a9644a7cfb63a25ae0b35ab614ab35e84031056cdc0ecb3e4e72b9`; its author authorized an exact copy into this worktree. Backend did not edit or claim that helper. Runtime owns the stage-write SQL; neither its execution nor lease concurrency is established here.

The qualitative function retains its optional third transport argument and adds optional fourth `AnalysisStageOptions`. It checks activity and requires a supplied lease's attempt to equal the job argument before reads, accounting or provider work. Lease authority is checked before input use/dispatch, including inside budgeted execution after claim. The same signal reaches `runQualitativeAi` and `runBudgetedAiAttempt`. Existing R02 transports already support it and were not changed.

The catch rethrows fence failures and provider cancellation instead of creating partial feedback. If the worker signal is aborted, the active guard prevents either product persistence path. Known dispatched usage still settles through the shared budget helper before that guard; unknown usage retains its existing conservative hold. Both partial and final qualitative RPCs use frontend's `persistAnalysisStage` wrapper, preserving the old arguments/default-off result shape and selecting the atomic leased mutation RPC when a lease is supplied. Definitive resource exhaustion still uses the earlier partial branch when the stage remains active.

Rewrite adds an immediate abort check after the asynchronous ownership/source reads and before draft CAS. Its earlier known ledger settlement and run record remain intact. A disconnect observed in that final read cannot update the draft. Existing authentication, consent, source equality, timestamp CAS and safe responses remain unchanged.

Four finite tests failed against the actual prior sources: pre-aborted qualitative work resolved true; a worker abort did not abort its child transport; known provider cancellation resolved partial false; and rewrite returned 200 after disconnect during its final lookup. Those failures remain in the tool result. After the repair all four pass. The first fixture also verifies a mismatched supplied lease/job attempt stops before reads/provider/accounting. The late-response fixture deliberately ignores abort; no partial/final write follows it. The known-cancellation fixture checks exact known usage settlement and no partial, while the rewrite race retains accounting but performs no draft update.

Command: Node22 Vitest with `RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic`, `AI_ENABLED=false`, fake credentials and dotenv disabled. Existing provider/client suites were reused by source contract, not repeated here. Scoped ESLint passes; project-options no-emit types report zero diagnostics over 588 files/five roots. Final Prettier/whitespace checks pass after a test-only layout correction; the final test hash reflects that formatting. Root owns the combined affected tests and full types/lint/build gate.

This is injected-transport/RPC evidence. It does not prove deployed worker shutdown, database lease races, cancellation of an already in-flight database commit, managed SQL permissions or production activation. Frontend/runtime RT10 integration and actual managed R08–R10 acceptance remain separate. Budget unknown holds and committed accounting are retained; no refund, retry, new flag activation or release claim is introduced.
