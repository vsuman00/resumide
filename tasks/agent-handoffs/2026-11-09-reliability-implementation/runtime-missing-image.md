# R13 known compiler-image absence before create

Updated 2026-11-09. Source-only child in the runtime worktree; owns `app/lib/server/latex-sandbox.ts`, `tests/unit/latex-sandbox.test.ts` and this handoff. Base source hashes matched ROOT before edits: sandbox `e7b0b41aee2d83553c29437264524cf71f4fbb9a6bf8b1f760e4041d5eea2477`, tests `93c99b80b1881d260f180ad1ed5b5c6b4ea3f46d39b9d98690d5864524631ad2`. The coordinator explicitly approved this bounded source repair before the complete R12 runtime gate under master-plan section 5. No Docker, database, provider, deployment or publication operation ran.

## Change and invariant

Previously, the adapter first discovered a missing image at `docker create`. Every create failure was conservatively quarantined, so an unavailable image could leave the process refusing later requests even after installation.

The adapter now performs bounded local `docker image inspect --format {{.Id}} <immutable ID>` before create, after the existing startup/quarantine/cancellation/concurrency checks. The read-only call has the existing five-second and 4096-byte bounds. It sends no source, never pulls, and requires successful exit plus the exact configured immutable image ID.

Missing, mismatched, malformed, over-cap or failed inspection yields the existing safe `runtime_unavailable` error. It creates no container, sends no source, performs no cleanup and does not set quarantine. Availability is checked again on the next request, so installation of the same image can recover without restarting this process. Raw Docker stderr or exception messages are not exposed.

Quarantine, cancellation and concurrency are checked again after the awaited inspection. Another request can reserve a slot or encounter uncertain cleanup while inspection is pending. The source cannot enter create after such a change.

All later behavior remains conservative. Nonzero/late/ambiguous create outcomes and uncertain cleanup still quarantine; an image disappearing after successful inspection is not reclassified as proven pre-create absence. Existing container isolation, source/output validation, limits, cleanup ownership and startup reconciliation are unchanged. No broad runtime/image-manifest admission was added.

## Evidence

Six focused reds reproduced unavailable-image/malformed-inspection/cancellation cases being classified as `cleanup_failed`. The minimal preflight fix made the first nineteen cases pass. Two additional concurrency regressions then verified post-await admission: three simultaneous image inspections admit only two creates, and cleanup quarantine raised by another request blocks a pending inspection from creating anything.

Final checks on this dirty runtime candidate:

- **21/21 sandbox tests pass**. Cases cover known absence, later image installation, exact ID mismatch, appended output, output cap, process error, cancellation, create-time disappearance, concurrent capacity and concurrent quarantine. Docker is mocked throughout. Synthetic PDF envelopes only exercise adapter control flow; they are not actual compiler/PDF parity evidence.
- Existing `npm run test:latex`: **117/117 tests in five files pass**.
- Scoped ESLint/Prettier, Node22 `npm run typecheck` and whitespace checks pass.
- No unchanged broad application suite was repeated. Root owns the integrated web/worker verification after source/peer review.

Source SHA-256: `7d67985bf84fb82d2caac705a2523adcd06f3bb54ff98aec584a177488e629d1`.
Tests SHA-256: `e680bd9f1849201beae214cb14a040f72a4cdff4a3eaee9143763f04db1b75a9`.

The source change is one bounded image check plus post-await admission fences. Review/integrate only these three owned files. Do not replace other dirty app/worktree files or erase earlier failed receipts. Rolling back this slice means restoring those two source/test files to the recorded prior candidate, not resetting the checkout or changing Docker state.

## Remaining actual gates

This fixes source classification and recovery; it does not make the absent compiler available or prove current sandbox/PDF behavior. It changes one of the compiler's explicit source bindings, so ROOT must prepare a fresh compiler packet after integration. The prior compiler packet must not execute against changed source.

The coordinator's first single cancellation probe independently failed closed before RUN: the observed local OCI identifier differed from the prepared selector, and Buildx wrote `Target: default` in its owned local-state record. Its failed receipts and attempt stay preserved; no retry ran in this child. The next separate source corrections must address those exact observed contracts before a new reviewed probe allocation. Actual cancellation, heavy compiler build, confinement/PDF parity, advisory disposition and release remain open.
