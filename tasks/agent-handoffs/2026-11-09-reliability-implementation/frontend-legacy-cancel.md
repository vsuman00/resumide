# Cancellation route compatibility repair

Date: 2026-11-10. Owner: frontend subagent. Base: detached `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus 699 coordinator-synchronized nonsecret inputs. Status: bounded route repair verified; native cancellation/compatibility acceptance remains open.

Only `app/routes/api.analysis-cancel.ts`, new `tests/unit/analysis-cancel.test.ts` and this handoff are owned. The original route hash matches the coordinator's `legacy-compatibility-baseline.json`: `47510c724252b2919ae36518155d34c87e78e5c2ccf0bae0a5baf11593854e9a`. No provider, SQL, real Supabase, browser, Docker, worker, owner-file, credential or network operation ran. No Git mutation ran.

## Behavior

RPC infrastructure errors, rejected promises, malformed receipts and unknown/null output now produce a fixed, redacted, retryable `SERVICE_UNAVAILABLE` response with status 503. An RPC error takes precedence even if its data says `not_found`.

Only an exact `not_found` result produces the concealed 404. Exact `already_started` retains its existing 409 body. Exact `cancelled` and `already_cancelled` retain their existing 200 bodies and idempotent flag. Missing/malformed UUID route inputs receive the same concealed 404 before an RPC. POST-only behavior, origin/authentication order, request-ID headers, positive session headers and authenticated owner parameters remain intact. No other route or header policy was changed.

## Reproduction and checks

The actual baseline produced eight failures and five passing controls. RPC errors incorrectly became 404, a rejected promise became 500, four malformed/unknown output fixtures falsely reported cancellation success, and a malformed route ID reached the RPC. Known-status and method controls passed. The failed source/test receipt is preserved.

After the narrow fix, the same finite suite passed 13/13 with no assertions removed or weakened. Command: `node node_modules/vitest/vitest.mjs run tests/unit/analysis-cancel.test.ts`. The sealed Node.js 22 environment used `RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic` and did not load `.env`.

Scoped ESLint passed. Scoped TypeScript verification passed with 12 transitive source files, four ambient roots and zero diagnostics. Prettier, prose hygiene and `git diff --check` passed. No readiness, full-suite or build campaign was repeated. The coordinator owns the integrated gate. Backend peer review was requested against the exact frozen route/test hashes.

| Released file                        | SHA-256                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| `app/routes/api.analysis-cancel.ts`  | `9e0f8bf9f040dd59a8490cb9780c1d1567cdfff05f8ae89d6701b9fd22674263` |
| `tests/unit/analysis-cancel.test.ts` | `5b2e658f9dddd4653642b4a3dabda33f3b6f4907d36f8e568b515fd09bf39e7f` |

Private failure/passing logs and bindings remain in `/private/tmp/resumide-legacy-cancel-tests-n7_8tvm_`. The route tests use controlled authentication and RPC doubles. They do not prove the managed cancellation function exists or that a real consumer cancellation succeeds. The coordinator's native compatibility bridge and hosted-action packet remain separate; this repair makes unavailable cancellation honest rather than claiming success or concealing an outage as missing data.
