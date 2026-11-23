# Reliability implementation: runtime handoff

Updated 2026-11-09. Worktree: `reliability-20261109-runtime/resume_ats`, detached at `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, with the coordinator's explicit non-secret dirty-source snapshot. Authoritative root context/coordinator grant bounded implementation; the copied context was stale, so it was not used as permission. No `.env` or owner PDF was copied/read for this slice.

## CR-R01 offline child: implemented, locally verified, peer review passed

Exclusive files: `app/lib/server/ai-readiness.ts`, `scripts/doctor-ai.ts`, `tests/unit/ai-readiness.test.ts`, and this handoff. Root owns package/runbook integration. This is **partial R01**, not full readiness/CV01 acceptance. The two prior 401 responses and their source/format/precedence diagnostic remain unchanged. An offline doctor is not new evidence of their cause and cannot authenticate a key.

The helper/CLI reports only safe configuration booleans, source categories, issue codes, assignment counts and file modification time. It uses Node 22 `parseEnv` for both effective values and private marker-based assignment discovery, preserves inherited-over-file precedence including empty overrides, and does not load mode/production alternatives automatically. The selected file must remain inside the selected workspace, be regular/non-symlink, valid UTF-8 and at most 128 KiB. Reading is bounded; raw values, key fragments/hashes, caller paths, arbitrary model/endpoint values and filesystem/provider messages are not returned.

Credential format is labelled plausible only. Authentication always says `not_tested`; provider requests are zero. Organization/project/log context exposes presence/source booleans only. Those settings were absent or separately diagnosed in the prior audit; these fields are not a newly discovered 401 cause. Optional cached comparison accepts only an explicitly supplied in-memory snapshot and cannot introspect a running process. CLI does not expose that snapshot input.

No live flag/transport is implemented in this child. Unsupported options fail generically without echoing arguments. A later bounded live-readiness child still needs its explicit allocation/transport tests and a causal credential/account correction before an actual request; R01/CV01 remain open. No SDK, network call, DB operation, Docker mutation, environment write, provider/model fallback, publication or deployment was performed.

## Focused red/green evidence

All commands used Node 22.23.4 and `RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic` in this worktree.

- Initial `npm test -- tests/unit/ai-readiness.test.ts`: exit 1, expected missing new module before implementation.
- First implementation: 27 focused tests passed. Initial bare `tsc --noEmit` then caught two new typing errors plus absent generated route types. The typed Node env dictionary and table-driven CLI argument rows were corrected; normal `npm run typecheck` generated the worktree's route types and passed.
- Added explicit canonical-path and ambient-SDK assertions: 28 tests, two red expectations (outside symlink path reported true; SDK metadata absent), 26 passes. Both source defects were fixed; no assertions were removed or lowered.
- Peer review exposed two quote-count grammar defects. Exact backtick/unterminated-quote tests reproduced both failures (29 pass, two fail); assignment counting now delegates to Node parsing of a private renamed copy. The original values and quotes are not exposed or replaced in the effective configuration.
- Final doctor suite: **31/31**; combined affected config/provider suite below: exit 0, **131/131 in 12 files**.
- Scoped ESLint on the three owned TypeScript files: exit 0.
- Final `npm run typecheck` (`react-router typegen && tsc`): exit 0.
- Direct Node 22 `--experimental-strip-types scripts/doctor-ai.ts --help`: exit 0, safe offline usage JSON. It did not read a credential file.
- Prettier formatted the owned files. Documentation/prose and whitespace checks apply to this handoff before return. No application build or broad suite was repeated; root coordinates integrated verification.

The focused fixtures contain only generated unit values and temporary directories with exact cleanup. No real provider response/prompt or candidate text was retained.

## CR-R02 endpoint-admission child: separate two-file repair

Owned source/test files: `app/lib/server/egress-policy.ts` and new `tests/unit/egress-policy.test.ts`. Parent allocated this independently from the doctor slice. Four real red cases showed that HTTPS hostname checking admitted ports 8443, 444, 80 and 0. The fix additionally requires the normalized default HTTPS port; explicit 443 remains valid. Origin/path/userinfo/query/fragment restrictions remain. The error string is a constant and includes no caller input.

The first red run also contained one harness false positive: asserting that an error did not contain the input `/v1` collided with the legitimate constant official endpoint. The test now asserts the exact safe constant error instead; prohibited endpoint expectations remain unchanged. This preserves privacy without pretending the initial assertion passed.

Current combined test command names the doctor, egress, config, qualitative AI/stage/outage, rewrite AI/service, Build provider/config/service and writer-worker transport unit files. All **131 tests in 12 files pass** with provider/DB adapters mocked. All five owned TypeScript files pass scoped ESLint; `npm run typecheck` passes. There were zero live requests and no root credential file was read.

R02 is still partial: the separate SDK retry/logging/attempt/cancellation contract has not been repaired by this endpoint check. R01 remains partial with actual authentication blocked. Frontend independent review passed for the current frozen files. Root transfer/integrated verification remains pending.

## Exact proposed root-owned additions

Add this package script, preserving existing scripts:

```json
"doctor:ai": "node --experimental-strip-types scripts/doctor-ai.ts"
```

Add the following section to `docs/operations/RUNBOOKS.md` after the key/config recovery guidance:

> ### Offline AI configuration doctor
>
> Use Node 22. Run `npm run doctor:ai -- --workspace <selected-workspace>` to inspect its `.env` plus inherited settings. Use `--source process` for process-only configuration, or `--env-file <workspace-relative-file>` to select another file explicitly. The doctor does not search for a production key or load alternate mode files automatically.
>
> Exit 0 means configuration is plausible; exit 1 reports configuration issues; exit 2 rejects arguments. Authentication remains `not_tested` and no provider request is made. Presence/format, SDK context and precedence checks do not establish key/account/project access or explain a provider 401. Preserve the prior failed receipts and stop repeated live requests until a concrete correction is made.
>
> Cached comparisons are available only through a caller-supplied in-memory snapshot. The CLI cannot inspect a running server's cached configuration; restart owned web/worker processes after an authorized configuration change. No live doctor mode is available in this offline child. A separate bounded live verification must be explicitly allocated before use. Never paste a key into logs or chat.

These snippets are proposed for root review; shared package/runbook files were not edited here. The final current configuration/live-auth gate remains blocked, not repaired by these additions.

## Read-only compiler follow-up and proposed next ownership

The local Docker image inventory still has the owned OCR image `ab1d5c0f…` plus unrelated Evoloryx Supabase images. No LaTeX compiler image exists. Inventory was read-only; no build, pull, remove or container action was run. The prior two failures remain a BuildKit redirect-fetch timeout for the pinned Expat release, not a missing/wrong-hash artifact or a compiler security verdict.

The blocked asset is the existing `expat-2.10.0.tar.xz`: exact upstream URL `https://github.com/libexpat/libexpat/releases/download/R_2_10_0/expat-2.10.0.tar.xz`, size 543,404 bytes and SHA-256 `c624ba2998fc65df1163a49641ff3f9ab73138b11641d92c86bee0fb01b1bc7f`. The prior bounded host fetch matched and its exact temporary asset was deleted. No available trusted cache is assumed.

Proposed R12(a), now approved for source preparation: `scripts/latex-runtime/prefetch-inputs.py`, `tests/unit/latex-build-inputs.test.ts`, `scripts/latex-test-fixtures.ts` (three source/test files). Read only the existing pin manifest; do not modify versions, signatures or hashes. Default verification is offline. A later explicit fetch is one HTTPS request chain restricted to the pinned upstream/release host, no credentials/cookies, no retries, at most 45 seconds, at most 543,405 received bytes before rejection, exact expected 543,404-byte length and hash, regular-file/symlink checks and atomic read-only content-addressed output. Test transport errors, oversize, wrong hash, redirects, missing/tampered cache and metadata redaction without network first. Report this final allocation before any actual fetch.

Proposed R12(b), needs final ownership/allocation: `scripts/latex-runtime/Dockerfile`, `scripts/latex-runtime/.dockerignore`, root `.gitignore`, new `scripts/build-latex-verified.ts`, `docs/operations/LATEX_CONVERTER.md` (five files). Root owns shared ignore/runbook edits. Replace only the failed remote ADD with COPY of the exact verified content-addressed public asset; narrowly admit that cache path and keep binaries out of Git. A constant bounded wrapper rechecks the asset before Docker starts. Preserve every current pin, native Expat/Poppler/FreeType proof, archive authentication, package/license/read-closure checks, resource floor and the accepted E-010 signer disposition. Existing native `prepare.py` already verifies size/hash and compares the upstream tar contents with the authenticated Debian source. Renew exact source/image/resource admission before any later build/runtime allocation; do not substitute an unpinned input or hide old failures.

The next source-only helper work can proceed while doctor peer review completes. No new asset fetch/build is implied by this handoff.
