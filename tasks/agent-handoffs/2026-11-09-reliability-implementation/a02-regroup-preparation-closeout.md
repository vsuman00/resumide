# Existing-head whole-entry regroup preparation

Status: **INTEGRATED / PURE PREPARATION AND DIFF VERIFIED; SAVING AND CONSUMER WIRING OPEN**, 2026-11-13. This advances CR-A02-S02 without closing that task or the reliability goal. The candidate is preserved dirty `main` at `a0b239299d75b0bd64b588fe743ebe2975fb28b9`.

## Implemented behavior

`prepareCanonicalEntryRegroup` accepts the existing owned correction snapshot plus an explicit canonical row revision and a strict regroup intent. The row revision must match the intent; ancestry length never substitutes for it. Source groups resolve through the actual association helper and current source-choice projection. Edited facts may map through an uninterrupted owned same-ID/type ancestor chain. The preparation never reimports source text over current values.

The transform supports split, partially grouped and already-grouped entries, including members inside unchanged bullets. It merges complete affected entries within one experience section. Direct references and unchanged bullet objects concatenate in current entry order. The employer entry ID survives at the earliest affected position; donor entry IDs are recorded as retired from the proposal and remain in the immutable base. Unselected entries keep their relative order. Moved content can cross them, and header-versus-bullet display order can change; the full before/after sections expose those changes.

Current `facts[]`, including order, values, states, citations and confirmations, remains unchanged. Titles, locale, section references and unaffected content are preserved. Valid repeated carried references are retained. Ambiguous or foreign source mappings, discontinuous lineage, cross-section placement, overlapping groups, unrelated entity fields and schema-limit overflow refuse the complete request without returning candidate data. No truncation or deduplication hides a problem.

The preparation returns detached before/after sections, member provenance, retired-to-anchor mappings, a key-order-independent layout-change flag and deterministic content/preview identities. Its authority is derived preparation only: `persistable:false`, `scoringEligible:false`, `requiresDurableAdmission:true`. The future producer `.4` is metadata; no `.4` canonical document or schema admission is created.

The pure `CanonicalEntryRegroupDiff` displays the actual preparation, complete affected sections, current fact states and confirmations, original source wording separately from edited wording, carried content and retired destinations. It labels an already-grouped plan as having no placement changes. Actual proposed positions resolve from the after sections, including when earlier merges compress later positions. It adds no route, request, form, approval or save authority.

## Verification

Root ran one fresh affected gate: **58 tests in two files**, followed by full typecheck, lint, web build and worker build on exact Node.js `v22.23.4`. Exec session `91567` completed with exit 0. The environment used synthetic credentials and disabled dotenv; there were no database, provider or Docker operations.

Root independently rehashed all **741 inputs**, the complete log and both artifacts, and confirmed five owned process groups absent. All **737 previous consumer inputs** remain byte-identical. The web and worker artifacts are also unchanged because the new preparation/display is not yet wired to a route. That is preservation evidence, not proof of an exposed consumer workflow. Exact commands, source and outputs are in the [gate receipt](a02-regroup-integrated-f988accc-8e09-4c54-b990-c8eb8329d87f.json) and [independent custody check](a02-regroup-integrated-review.json).

The tests exercise the real producer and source-choice helpers, not a stub DTO: edited/confirmed ancestry, partial entries, bullet members, repeated carried references, explicit current-fact choices, noncontiguous/interleaved ordering, owned revisions, refusal/bounds, independent digest framing and detached outputs. DOM fixtures are produced through that same actual implementation.

Review found and resolved raw object-key ordering falsely reporting a layout change and missing snapshot presence guards. The UI's actual two-group regression then reproduced a before-index mislabeled as an after position; its original RED and bounded follow-up remain preserved. The final integrated gate includes all 50 core and eight DOM cases. Earlier author runs are separate evidence, not additive passing totals. Final source review reports no remaining required finding.

The [backend integration](a02-regroup-backend-integration.json) and [frontend integration](a02-regroup-frontend-integration.json) pin the six allocated files and archived original packets. The [amended contract](a02-regroup-preparation-contract.json) preserves its predecessor and records why an explicit owned row revision was necessary. No old producer, schema, command, correction projection or first-import path was changed.

## Remaining work

Existing v1 storage fixes the result revision at one, requires a parentless first import and allows one approval origin per snapshot. It cannot represent this operation. The next layer needs versioned multi-origin approval/composition proof that retains eligible prior groups with their original origins. Whole-entry results must not pass through v1's bullet-free singleton assumptions.

Durable admission must resolve the original immutable base for exact replay before fresh CAS, preserve correction provenance and require fresh mapping for location-sensitive assignments after a merge. Privacy/export/delete/retention/restore handling must be paired before writing. A guarded catalog successor, explicit producer/operation admission, owned reader, repository, actual route and named whole-entry acknowledgement remain required. The current pure preview hash is not native admission proof; cross-language semantics must be frozen and verified before adoption.

No SQL parsing/execution, hosted change, native browser campaign, schema activation, provider use, Git mutation, publication or deployment occurred. `verify:ci` and the native storage/transaction/concurrency/restore/consumer gates were not run in this source/DOM allocation. Parent totals remain **2 VERIFIED / 35 PARTIAL / 27 PLANNED** across the unchanged 64-task DAG. Services remain free; pricing and deployment stay on hold.
