# A13 late-known settlement after content deletion

Implemented the narrow forward source repair authorized by Root. A published terminal attempt can receive its first safe known usage after candidate publication content has cascaded away. No retention deadline, retirement marker, quota disposition, erasure, worker adoption or data grant is implemented here. ADR-0020's accepted maximum of 30 days remains a separate required implementation; this leaf does not enforce or extend it.

## Change and preserved authority

The isolated, network-denied installed Supabase 2.117.0 CLI created `20261115095258_initial_feedback_late_settlement.sql`. Version/help/scaffold commands exited zero. Root recorded the actual filename before SQL body writing. No SQL was parsed or executed.

The semantic change removes only the candidate-publication existence condition from the published attempt branch of `private.ifo_attempt_guard()`. Admission still requires an existing exact claimed attempt, old `held_unknown` state, null old usage, a fixed nonnull terminal error, safe first known usage, new `failed` state and the same error. The preceding immutable identity, claim/lease/budget binding, known-usage and error guards are unchanged. It adds no new dispatch, retry, known overwrite, publication mutation or consumer access.

The operation checker receives only the new guard source hash. The full checker receives only the new operation-checker hash. All other body bytes remain unchanged, including claim, settlement RPC, publication/read/export factories, numeric/source policies and metadata routines. The publication profile stays byte-identical because its checker composes the forwarded operation closure through the same unchanged body.

| Routine | Before prosrc SHA256 | After prosrc SHA256 |
| --- | --- | --- |
| `private.ifo_attempt_guard()` | `cde43794f51052a21567059232fe446d36aedc357c32893843ef25090da5ebaf` | `207d5aa216776488dcebf080fd804d0b75ce1c00907d3a88a4e2c3c9035c951f` |
| `private.initial_feedback_operation_ready()` | `a88195b8cc89503549d43a9fe23f649bd9b4d9abecdad8461974f3ed9c7e1b9d` | `007ba402596474817e3584b4c3359e352f0fef2a1bce0ff878eb8bc0d164b0c5` |
| `private.initial_feedback_ready()` | `7e37b1d085058f95b15bfd5f7e28b8e120875ee2b1eef5ad13aca110ea10ed2f` | `2a25a380a70725c9fb0af2d8423913595cd61956d2c5308c39c3cc56709ea669` |

The migration guards exact preimages/postimages and keeps all three private routines denied. Frozen `9ffc`, `6bc` and `63dd` migrations remain byte-identical. Two specifically authorized historical test files now use their captured source profiles; all thirteen publication and eight usage assertions/helper bytes after import plumbing are unchanged. `historical-preservation.json` records this exact comparison.

## Evidence

Private packet: `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a13-late-settlement-ylyqwodj`.

Commands used pinned Node `v22.23.4`, sealed synthetic configuration, no dotenv and no live credentials. `commands.json`, each receipt/log and `author-source-manifest.json` record exact command arrays, source hashes and process identities. The source runs neither parse nor execute SQL.

- `source-red.json` / `.log`: the focused assertion failed on the actual frozen guard before body writing. It demonstrated the erasable-row dependency in source, **not a Native behavior RED**. All 811 source inputs were stable; process group 71410 was cleaned up.
- The extended formatter initially caught one extra parenthesis in the newly authored test. It was corrected before the finite test run; no product assertion was weakened.
- `source-green.json` / `.log`: 27 passed; two historical usage assertions failed because read dependencies were absent. Those setup failures are preserved.
- Exact missing-only Root compatibility migration `00833163...` and deferred verifier `8006dd69...` were copied after absence/hash assertions. `source-green-successor.json` / `.log`: 28 passed; the remaining historical assertion found this worktree's old A12 caller. This was another dependency mismatch, not a new guard failure.
- Root explicitly authorized archiving that actual caller preimage and copying released `611f3e5d...`. `affected-dependency.json` / `.log`: the single affected assertion passed; seven cases were unselected by the approved CLI filter. The earlier 28 passes remain valid on the same owned source. Thus all 29 affected source controls are accounted for across the preserved receipts; no fresh full29 green run is claimed.
- `types.json` / `.log`: seven roots, six TypeScript source files, zero diagnostics. `lint.json` / `.log` and `format.json` / `.log` passed. These commands observed 812 stable inputs; after read-dependency completion the final affected run observed 814. Owned source bytes did not change. Root explicitly required no repeat of unchanged checks.

Every recorded group was confirmed cleaned up: 71410, 73893–73896, 74257 and 74855. No database, provider, Docker, LaTeX compiler, browser, real environment or Git operation occurred. TypeScript checking was local and explicitly authorized. Root owns the fresh integrated gate.

The new privileged mutating rollback-only verifier is **UNPARSED/UNEXECUTED**. It requires a separately admitted function-owner fixture produced by the real publication factory: a published deterministic-only result with an actual claimed unknown attempt. It deletes the exact owned analysis parent, checks the real publication/input/writer cascades, records known usage without content resurrection, verifies exact/null replay, refuses changed usage/error and refuses redispatch. It does not fabricate private rows or claim the entire privacy worker, counter retirement or ADR-0020 expiry works. R03 unknown holds still require their separate authorized reconciliation.

## Release

| File | SHA256 |
| --- | --- |
| `supabase/migrations/20261115095258_initial_feedback_late_settlement.sql` | `6563a195f69de2bd92675da850b7b893e7e6df16cd6223a2e85ef3c3739286cf` |
| `app/lib/server/initial-feedback-operation-profile.ts` | `0071bcade48d53e053fa2670f485dd3e90a6a63a248efefe9272019ddb73e93a` |
| `app/lib/server/initial-feedback-profile.ts` | `1a0113aa8a7c19f72cc5da238953404392d86f23fcfa61fc0e16b8748a26104f` |
| `tests/unit/initial-feedback-late-settlement-sql.test.ts` | `291296d1ccd0e8d84b59d618a30ede0c0b6a35b65581333f8b98a847b557f4a9` |
| `tests/unit/initial-feedback-publication-sql.test.ts` | `af3a0488b1642396b1d402fdf13a05a3f3537e7242d6337cf89928e00d06021e` |
| `tests/unit/owned-ai-usage-sql.test.ts` | `5cf9cec6616680dfae5d459ead023f1a556801e3b5b8ce09960e6ab7f3e88e11` |
| `scripts/verify-initial-feedback-late-settlement.sql` | `25254db8b7aba50caa1bb9d998079e0d6ee59bce660d9eb10c36f5bcf206cbf2` |

The allocated publication profile remains `d1e59a0573979737cf4dbe4df75539cfda4dd0e6f58cfdd87b8f60319d3ed2a9`, unchanged. The release packet pins this handoff, immutable before/after snapshots, current full source manifest and every receipt/log. Missing-publication quota retirement, maximum30-day identity disposition, complete owner export, Auth/session/org/restore lifecycle and Native acceptance remain open. This is not privacy or production adoption.
