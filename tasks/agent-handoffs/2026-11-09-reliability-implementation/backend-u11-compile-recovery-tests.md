# CR-U11-S01 compile recovery tests

This allocation owns only `tests/components/LatexCompileRecovery.test.tsx` and this handoff in the preserved backend worktree. Frozen contract: `u11-compile-recovery-contract.json`, SHA256 `ccf2757717443af96b2930fc74f5c1463de3fd0c3562e6d3a3cdcc6de79411cf`. Root owns integration and shared task records; frontend owns the route patch.

The test renders the actual `app/routes/latex.tsx` component through a React Router memory data router. The router supplies synthetic loader flags. Only the server loader and PDF-render component are mocked; global fetch and object URLs are controlled. Navigation, editor, compile state, cancellation, generation checks and disabled AI component remain actual product code. The synthetic PDF response is a boundary fixture, not a valid rendered PDF.

The actual current-route RED ran six cases: five failed and one passed. Both recovery codes displayed the old identical advice. `__proto__` reached the test error boundary, `constructor` produced an empty alert, and `toString` rendered `[object Undefined]`. The published `source_unsafe` message and exact compile-request control passed. Baseline route SHA256: `4270a18889ce335698400168e3092178103bd3a0eb209ea65bf5923cd380d5e0`. The receipt binds 738 unchanged source inputs and confirms process-group cleanup.

The finite final matrix contains 24 cases covering prescribed recovery copy; inherited, unknown and malformed error bodies; existing published messages; exact source/profile/paper retention; fresh success; stale preview/download invalidation and URL revocation; busy single-request behavior; cancel/edit/unmount with late success or failure; client deadline abort; disabled compilation; and existing source byte limits.

Root synced the reviewed route at SHA256 `d3bc6d5274e2d76bc38ec510f0e24edb12daa65e3857e8eeb9d2d0da7d372987`. The final test SHA256 is `47c40f234390bdb01da7e6e599d8b123aba2bddadf1adecc860f08bceebdf8d5`; its source is frozen and released for integration.

Terminal verification passed under exact Node.js 22.23.4 with sealed synthetic environment and dotenv disabled: `vitest run tests/components/LatexCompileRecovery.test.tsx` passed 24 tests in one file; scoped TypeScript checked three roots and 20 source files with zero diagnostics; scoped ESLint and Prettier passed. The four `*-terminal.json` receipts bind 738 unchanged source inputs, tool exit 0 and confirmed process-group cleanup. Root owns the separate combined gate.

Two intermediate 19-pass/5-fail runs are preserved as `focused.json/log` and `focused-final.json/log`. These were fixture query collisions, not additional product defects: the PDF mock used an implicit-status `output` element, and the actual disabled AI component also contains a status element. The mock now uses `div`; compile-status queries use the actual named Compilation workspace region. Every test and expected value remains. The earlier read-only `format-check` failure is preserved; final formatting passed after formatting only the owned test. Both mutating format receipts record exit 0 but report immutable-input failure because their intended formatting changed the owned test.

The genuine baseline RED remains separate from those fixture corrections. No production file was edited by this allocation.

Private evidence directory: `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-u11-recovery-tests-yfxhk55a` (mode 0700). It contains `red-actual.json`, `red-actual.log`, `route-before.txt`, the bounded runner, source hashes and final `.txt` source snapshots. The RED log SHA256 is `36b2ae26826fa3ac538682c93b79b311221b0a07197d44f3fa26771a92defc69`. The `format-write` receipt records tool exit 0 and deliberate mutation of the owned test; its immutable-input status is therefore `FAILED_OR_INCOMPLETE`, not a failing product assertion or a verification pass.

This is DOM/synthetic evidence. No compiler, Docker, browser, external service, provider, database, real environment or credential operation ran. Actual compiler restoration, quarantine recovery, PDF rendering/parity, browser behavior and full U11 acceptance remain open.

The installed `clean-user-facing-text` workflow was applied to this handoff, preserving exact code, hashes, paths and claims. Peer review status and final packet hashes are recorded separately by Root.
