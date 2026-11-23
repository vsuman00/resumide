# A12 workspace bootstrap peer review

Source review ACK, 2026-11-15. No additional concrete discrepancy was found between the final backend workspace adapter/resource and the frozen native bootstrap contract. This review did not run tests, SQL parsing, native calls, services or providers. It does not establish database behavior, role enforcement, transaction isolation or concurrency.

Reviewed backend inputs:

- `app/lib/server/canonical-rewrite-workspace.ts`: `f73e1f4722b72d1bbfe685d7e2460a2864a8ad2b49dda30a4b678c4c618b08de`.
- `app/routes/analysis.rewrite.workspace.ts`: `99d74a89bfcdc57a38373a3f92142ef80a5ad2201c1b4228f737ab49a407dcf4`.
- `tests/unit/canonical-rewrite-workspace.test.ts`: `208d19001f6f93942de9c11899394becbc1db034c4fee6dd4562ef4d8a4352fd`.

The native comparison used [the forward migration](../../../supabase/migrations/20261115042554_canonical_rewrite_workspace.sql), SHA `bba1f7031822de372f8ad8b75c4fb762ce634ce5ea26a19dd7f42eed8451f8f8`, and [the workspace profile](../../../app/lib/server/canonical-rewrite-workspace-profile.ts), SHA `c35d78e62ad391f8800291ee313d78c105541fc917339c5ed54009d0d19c8ac2`. The original migration, profile, deferred verifier and handoff remained unchanged throughout this review.

The adapter at lines126-169 maps native failures to bounded errors; a generic `P0002` does not become initialization_required. At lines220-285 it verifies exact bootstrap pins and schema readiness, then validates either the complete existing rewrite context or the actual owned relationship context. The missing variant contains real source/version bindings and no draft ID, timestamp or native projection hash. Its profiles digest is local diagnostic correlation; SQL neither receives nor trusts that digest as authority.

Initialization at lines311-388 checks exact selected UUIDs and current canonical/JD heads before the existing-row shortcut. Returning an existing workspace needs no initializer permission because it invokes no writer. The absent-row path requires the separate capability, calls the exact four-argument initializer, validates the returned context and current heads, and accepts created=true only for the exact empty legacy projection with no publication/version/head and revision zero. The native initializer separately performs these owned checks before insertion and returns actual row tokens; foreign or corrupt conflicts are not adopted as empty slots.

The resource at lines493-563 enforces POST, all three existing feature flags, exact origin, authenticated owner, UUID identity and bounded two-field forms before admin work. AI disabled does not block empty setup; the response explicitly sets canGenerate=false. There is no provider, consent, budget, rate, scored persistence or generation operation in this initialization path. The resource route only delegates to that handler and returns 405 for GET.

RPC/body paths use a bounded deadline and request cancellation. Late or uncertain responses produce unavailable/retry_exact; they do not imply absence or authorize a second insert directly. Retrying with unchanged selectors performs a fresh owned read and preserves an existing row. A head change requires review_again. This is ensure-current initialization, not an immutable original receipt replay or generation-request rebasing.

I read the 29-case test file without executing it. Its positive fixtures use the actual relationship and authoring builders, adapter and generation reconstruction, with synthetic native rows/hashes at the fakeRPC boundary. It checks missing read/no mutation, empty creation with AI off, existing empty/nonempty preservation, ambiguous insert recovery, actual returned tokens for a separate generation command, current-head refusal, privacy/foreign rejection, bad relationship/pin data, denied capability, forged created payloads, exact forms and HTTP guards, and body/RPC deadlines. The fake native state machine is application evidence only; its one-slot counter is not a real PostgreSQL race or privilege proof. The separate deferred verifier remains privileged, mutating, rollback-only and UNPARSED/UNEXECUTED. Committed two-session uniqueness and native activation remain pending.

No changes to the old canonical readiness 1.0.1, support policy 648, base138, typed13, scoring guards or default grants were reviewed as part of this allocation. Initializer execution remains denied in the new migration. Root owns integration and the combined application gate.
