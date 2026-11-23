# A09 pinned Unicode profile

Status: **IMPLEMENTED; 19 source/data tests and scoped static checks PASS.** This is `CR-A09-S03` under the Root allocation `a09-unicode-allocation.json`. SQL, storage admission and full A09 acceptance remain open.

The four owned new files are the generated module, its generator, its unit test and this handoff. Work used the existing runtime worktree at base `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus preserved dirty inputs. Root owns shared contracts, context and integration. No existing parser, policy, SQL, dependency, configuration or service was changed by this leaf.

## Data and consumer boundary

`JOB_RELATION_UNICODE_PROFILE` pins Node `v22.23.4`, Unicode `17.0`, ICU `78.3` and V8 `12.4.254.21-node.57`. It contains sorted scalar ranges for Letter/Number/Mark identifiers, Cased, Case_Ignorable, Unicode-ignore-case regex words and ECMAScript whitespace/trim. It also records default lowercase mappings, ASCII-letter regex case-fold mappings and Final Sigma context metadata. Alias underscore/dollar/asymmetric-dot rules and distinct duration boundaries remain explicit. The profile preserves raw Unicode and distinguishes code-point offsets from UTF-16 size limits.

Every nested object, range and mapping is frozen. The three agreed exports are the profile, `JOB_RELATION_UNICODE_SHA256` and `assertJobRelationUnicodeRuntime`. The assertion compares the exact runtime tuple in constant work; no request scans the Unicode scalar space. Consumers must enforce the recorded NUL/unpaired-surrogate rejection and casing context. These data do not authorize a write or establish SQL behavior.

Profile SHA-256: `f3f8335d9a957bc16e33d61321f28ed7a12c8c81ff8912f0c17c041d86d95571`.
Data SHA-256: `211119c0ccdb16e0be0a5451a9f6f9a8eeb109be5685d15b28466b6a91540327`.
Rule SHA-256: `f610d2573783d1fcf4531b273a520b3a994a5872e49831c48e21373fac8a0ab2`.

## Verification and retained failure

The bounded generator inspected all **1,112,064 Unicode scalars**. Initial generation took 162 ms. After generator-template formatting and malformed-runtime guarding, the final deterministic `--check` took 249 ms and reproduced the 62,954-byte module exactly. Generator output contains metadata only, with a 55-second internal deadline and a 59-second owned-process deadline. It uses Node builtins and no downloaded dataset or added dependency.

The single behavioral run passed **19/19** in one file. Its independent lookup traversal compared every scalar with native JavaScript regex, lowercase and trim behavior. It also checked exact hashes, immutable nested data, runtime drift, malformed tuples, Final Sigma context, combining marks, Kelvin sign, long s, supplementary characters and normalization distinctions. This is differential evidence against the pinned runtime, not independent Unicode-dataset validation or PostgreSQL parity.

Scoped TypeScript passed with two roots, 214 source files and zero diagnostics. Final lint, formatting, deterministic generation and whitespace checks passed. The first lint run failed because the generator omitted explicit `URL` and `Buffer` imports; those builtin imports were added. The production module and test stayed byte-identical, so the 19-case run was retained without repetition. All final commands recorded stable nine-file input sets and absent owned process groups. No deadline, skip or abort occurred.

Receipts are in `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a09-unicode-mfc2o54m/`. Preserve `unit.json/log`, `deterministic-check.json/log`, `types.json/log`, `types-detail.json`, `lint.json/log` and the final lint/format receipts. Unit log SHA-256 is `4bc4063f58f402f30f5fc68351da2e2ebe2ead9179e459283f90c09ba090766c`; deterministic-check log is `b47f71cd28bebcd76c5abeed6c9ce83910e97862faccbe1972c8180102f21c1e`.

## Frozen source and next action

| File                                        | SHA-256                                                            |
| ------------------------------------------- | ------------------------------------------------------------------ |
| `app/lib/server/job-relation-unicode.ts`    | `a04123ca90d4db15e8840492378e0a5cd9948a253dfecb917fe1789df2f41354` |
| `scripts/generate-job-relation-unicode.mjs` | `3c16a254a8ebfa2c0b592d705496e4c1b32ba2e9f0e821ea075be632fa6d31fa` |
| `tests/unit/job-relation-unicode.test.ts`   | `18c79806234c766f806d2c44fc14c48aea9cd5df8a32d650cd505348284b989f` |

Root may integrate these exact bytes and bind the profile hash into the wire/admission descriptor. The next SQL leaf waits for its separate allocation and frozen DTO/structural schema. Preserve the writer-off guard against a legacy child of a v2 head; this leaf does not implement it. Native SQL syntax, differential serialization, direct-RPC tampering, concurrency, RLS, cleanup and storage activation remain unexecuted. No database, SQL parsing, provider, real environment, owner-file, Docker, Git mutation or deployment action ran. Full builds and combined consumer checks belong to Root's later integrated candidate.
