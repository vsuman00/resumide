# A13 stored-original-source guard

- Updated: 2026-11-15; worker `/root/a01_page_backend`.
- Worktree: `/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats`.
- Status: IMPLEMENTED; VERIFIED_LOCAL for textual source contracts and scoped static checks. Native behavior, races, installed catalog and adoption remain UNVERIFIED. All data RPCs remain denied.
- Allocation: Root's `a13-stored-source-guard-coordinator.json`, following source triage `a83157fc`. Root's separate pure-plan gate closed before this release; that candidate and its receipts remain historical and unchanged.
- Finite peer source ACK: runtime independently rehashed migration9e8574/profilef2b241, four preimages, five postimages, six profile pins and the 21-to-22 manifest. It found no remaining guard/lock-order or deferred-verifier discrepancy and ran no tests or SQL.

## Change and preserved behavior

Installed CLI 2.117.0 created `20261115064102_stored_scoring_source_access.sql`. The forward migration adds `private.legacy_scoring_stored_source(private.analysis_scoring_inputs)`. It locks/rechecks the actual immutable row with KEY SHARE SKIP LOCKED, then independently admits its original version and active resume root with SHARE SKIP LOCKED. Every relationship uses the stored original IDs and owner/organization. Busy, missing, mismatched or retired original state throws the existing fixed denial. It does not consult a replacement analysis source as authority for the original snapshot.

The three existing bound branches invoke this guard before returning: committed worker read, exact finish replay and saved context read. Removing each single new call restores the corresponding frozen function body byte-for-byte. Current owner/privacy/source admission remains first; original replay still precedes fresh status/lease/JD checks. No fresh-head requirement, rebase, score/checksum/producer change or public DTO change was added. The nonblocking original-row/version/root locks avoid waiting along a reverse retirement/FK-deletion path while holding current-source locks. Native contention behavior still needs independent execution.

The readiness successor retains every prior dependency and structural/ACL/trigger check, adds the new private helper and pins the three amended bodies. Migration preconditions check exact old body preimages and staged predecessor readiness; postconditions check exact new bodies, attributes, owner, private ACLs and the full successor closure. There are no new grants. The complete account exporter and metadata routine bodies are unchanged; the exporter does not filter retained rows by original-root status. Feature defaults and all new data RPC denials remain intact.

Current `LEGACY_SCORING_INPUT_PROFILE` keeps the same schema/profile versions and has actual source-body postimages: checker `56a92f65`, worker reader `2ea3c507`, finish `5db61206`, context `d64ba9ac`; export `e4c17997` and metadata `f18e6abf` remain unchanged. These are source pins, not observed installed-catalog hashes.

## Exact release files

| File                                                                  | SHA256                                                             |
| --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `supabase/migrations/20261115064102_stored_scoring_source_access.sql` | `9e857437bbd3d5995d7942b365406f9eb9f96197d3495853747cf950fdb1c1b2` |
| `app/lib/server/legacy-scoring-input-profile.ts`                      | `f2b2410fe652fbbf1963bbbbba5f9e5e1928f2bb177e5262d9edee30a99a101c` |
| `tests/unit/legacy-scoring-input-sql.test.ts`                         | `1161b334a5a2e4d8c77023a7a2c9ecb72027c81271c1e8b9fa9ab21b76273091` |
| `scripts/verify-stored-scoring-source-access.sql`                     | `a888db2a7a5ea03fd05ece142e7c5205e4011ec421b7f58f7a1642b50c8d8727` |
| This handoff                                                          | Recorded in the final packet                                       |

The backend worktree initially held older profile `a1799dcb`, not coordinator predecessor `b18bbcd0`. The failed local preimage assertion was a setup check, not a behavioral RED. The older bytes were archived privately; exact Root b18, frozen migration2cb and test043 were then copied with SHA checks. No a179-derived profile became the release. Frozen migration2cb itself was not edited.

## Verification and reproduction limit

Private packet:

`/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a13-stored-source-h6amo6im`

`baseline.json` and `.baseline.txt`/`.prior.txt` files preserve predecessor hashes and copies. `postimages.json` records exact preimages, postimages and the current profile. `preservation.json` proves that reversing only the historical-profile fixture/import plumbing restores the original nine-test file exactly to SHA `04308fdc67f82b88a9b71b9dd180d1d7b41e721d115bc30a2e22622988b54094`. None of those nine assertions was weakened. The seven new controls check forward body preservation, actual closure pins, original-source locks/denials, replay order, staged ACLs, unchanged export and the deferred verifier's honest boundaries.

All commands used pinned Node22 `/Users/vaibhavsuman/.codex/tools/resumide-node22/v22.23.4-darwin-arm64/node` through packet `run.mjs`, sealed without dotenv or live credentials. `commands.json` records exact arguments. Each label below has a `.json` receipt and `.log`:

| Label    | Child command                                                                                                                  | Result                                                                  |
| -------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| `finite` | `node_modules/vitest/vitest.mjs run tests/unit/legacy-scoring-input-sql.test.ts`                                               | PASS16 tests/1 file: nine historical plus seven forward source controls |
| `types`  | Packet `types.cjs`                                                                                                             | PASS3 roots/2 source files/0 diagnostics                                |
| `lint`   | `node_modules/eslint/bin/eslint.js app/lib/server/legacy-scoring-input-profile.ts tests/unit/legacy-scoring-input-sql.test.ts` | PASS                                                                    |
| `format` | `node_modules/prettier/bin/prettier.cjs --check` with the same two paths                                                       | PASS                                                                    |

All four receipts report 791 stable worktree inputs, no in-run drift and confirmed process-group cleanup. Root owns the later integrated gate; no unchanged source campaigns were repeated.

Native reproduction was unavailable under this source-only authorization. No fake-store failure is presented as Native RED. The new privileged verifier is explicitly UNPARSED/UNEXECUTED and rollback-only. It requires genuine previously committed synthetic snapshots and actual function-owner authority; it creates no app/service capability. Its three deferred scenarios preserve active-original historical replay, deny all three saved seams during the original tombstone-before-cascade interval, and keep the full retained account export unchanged. It forces deferred constraints before rollback. Two-session contention, retirement/deletion races, installed permissions and eventual consumer behavior remain open.

No SQL parser/execution, database, provider, browser, services, actual environment/key reads, dependency changes, Git or deployment ran. The frozen foundation and Node code are unchanged. Source review and local synthetic/static success do not activate the feature or supply native/release acceptance.
