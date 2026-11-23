# CR-A10 typed diagnostic consumer

Implemented the owned typed requirement context -> semantic evidence -> coverage -> technical diagnostics path in the preserved backend worktree. The typed path calls the actual owned relationship reader and derives coverage internally. It does not accept caller-supplied witnesses, use a null legacy requirement substitute, or convert SHA clause identities into legacy UUID traces.

The frozen allocation covers six code files and this handoff. Root explicitly added `score-v2-contract.ts` for the single `score-v2/typed-1.0.0` producer literal. The governing contract is `a10-typed-consumer-contract.json`; Root owns shared plans, integration, tests, route/UI changes and the final combined gate. The baseline is `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus Root's exact dirty source copies recorded in `a10-typed-consumer-baseline.json`.

`buildTypedScoreDiagnostics(rawContext)` returns `{ diagnostics, typedCoverage }`. `TypedScoreDiagnosticsSchema` uses `score-diagnostics/typed-1.0.0`; `typedCoverage` is the actual available `RequirementCoverage` sidecar, with exact bindings, policies, digest, clauses, operands, retained clauses, witnesses and explicit counts. Legacy alignment stays empty in the typed core. The legacy `ScoreDiagnosticsSchema` stays unchanged. The read model is an explicit legacy/typed union distinguished by the presence of `typedCoverage`.

The typed readiness record retains actual `declaredPageCount`, including null and values above 20. Null yields unknown page coverage and an unevaluated page rule. A declared count of 21 remains 21. No observed page count replaces missing metadata. Numeric dimensions, weights, readiness aggregate, calibration receipt and score eligibility remain withheld under the existing draft policy.

The repository binds selected versions separately from captured heads. It checks expected heads, rejects a moved current selection, obtains one owned pair for derivation, and rechecks the owned context, heads, immutable content hashes, page metadata and analysis job link before release. Invalid or unavailable context fails closed. Historical selectors remain historical. No fallback table query supplies relationship authority.

`assertAuthoringDiagnosticsAllowed` rejects the real typed producer in shared suggestion construction, validation and findings. `loadAuthoring` rejects before its reads, and fresh accept/reject operations reject before the authoring write RPC. Existing independent canonical edit, confirm, rename, clarify, undo and restore actions retain their behavior and ownership/CAS/privacy checks. Read-only typed diagnostics do not admit coverage-driven proposals.

The shared technical rule extraction preserves the legacy engine body: reversing only the extraction and type import reconstructs baseline `8eccbb77298ac15a376ba3f5d8a16512163ca45d0ab337d4667f85f26322e09d` byte for byte. Removing only the new producer literal reconstructs the producer contract baseline. These are source preservation checks, not runtime acceptance.

Author verification passed with exact Node `v22.23.4`: scoped types (8 roots, 49 source files, zero diagnostics), scoped ESLint and Prettier. Each sealed receipt records 747 unchanged source inputs and a settled process group. No author test suite or build campaign ran. Independent repository/route/DOM tests and the combined full checks belong to Root and the other allocated agents; their results are recorded separately.

Private packet: `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a10-typed-consumer-n5xrqwn9`. It contains immutable `.txt` source snapshots, `sources.json`, `types.json`/`types.log`, `lint.json`/`lint.log`, `format.json`/`format.log`, and the two source preservation receipts.

| Owned code file | SHA-256 |
| --- | --- |
| `app/lib/server/score-v2-contract.ts` | `3b6ba7cab792893aba68bd24c13baf9eb7e21525d716b99bb613d9af0836c80d` |
| `app/lib/server/score-v2-engine.ts` | `175cc512066abc2f11e9aa27e80ad61beea86d8d21423d5bfc21cf4c7ccbe6f2` |
| `app/lib/server/score-v2-repository.ts` | `bcdfef98b11c60f8e5344a5f03a86ae97ddc9db90db5eda9fd1d11d927746e23` |
| `app/lib/server/typed-score-diagnostics.ts` | `2c389425584526db32d4ba946037113528fe5683053595e649189df1750ed334` |
| `app/lib/server/authoring-contract.ts` | `04ba1595b9bb3e4757ae463fdf80cb431a041fd2e53aa9e811e5162bb54b69f2` |
| `app/lib/server/authoring-repository.ts` | `c84e5365b792b59b3a06af269583edb2ba58277dfd37b51cdbe43e544545c90e` |

Evidence is source/static and synthetic only. No SQL parsing or execution, database, provider, real configuration, candidate data, browser, compiler service, Docker, dependency, Git or deployment operation ran. Flags remain unchanged and default off. Native migration/readiness adoption, calibrated quality, owner acceptance and release approval remain separate gates. Full typed coverage and explicit authoring admission remain plan obligations; this slice does not claim their formal acceptance.
