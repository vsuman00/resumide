# Existing-head whole-entry regroup preparation

Implemented the three-file CR-A02-S02 backend allocation under amended contract `2f92ae3c643ded969a4a4e24c1c7b748d5c7d067df83dea5f4758ad3dbe10d81`. The earlier `aa59d4eb119ae8dea6fd094ea3c8449b37da43be3a9c587230e23353e62423f2` contract is historical. Root amended the input because the existing correction projection snapshot has no canonical row revision. The new regroup-specific input adds the actual server-owned `canonicalRevision`; it is bounded and must equal the intent capture. The old correction input and helper are unchanged.

The preexisting feature was absent by source inspection: grouped first-import commands require a null head, their producer reconstructs original content and rejects confirmed facts, and ordinary canonical commands have no regroup operation. No missing-module test failure or healthy-code regression was presented as a feature RED. Tests exercise the actual new transform and existing extraction, correction projection and source-choice proof.

`prepareCanonicalEntryRegroup` returns a complete sections-only preparation. It resolves exact selected source members and current fact IDs through the existing current-citation or uninterrupted owned ancestor mapping. It preserves the complete facts array, including edited values, source references, confirmation records and order. A selected member may remain inside its uniquely placed bullet. Relationship preparation supplies no factual confirmation or source-supported claim.

Each group merges whole current entries in one experience section. Direct fact references and unchanged bullet objects are concatenated in current entry order. The employer member's entry ID survives at the earliest affected index. Retired donor IDs and their anchors are explicit. Unselected objects and their relative order remain intact, including entries crossed by selected content. Repeated nonselected references in distinct bullets remain repeated. Header-versus-bullet traversal order may change because the model stores them in separate arrays; the output contains full before/after sections rather than claiming rendered order is unchanged.

Partially grouped, bullet-bearing and already-grouped entries are supported. A valid already-grouped plan returns `changed:false`. Unknown or duplicate intent fields, stale base identity/revision, missing source/lineage proof, ambiguous placement, cross-section placement, foreign employer/role/date facts, overlapping selected entry sets, duplicate resulting direct references and existing schema overflows refuse the whole request. Refusals contain fixed metadata and a reason, with no candidate data or partial result.

The content digest uses fixed-order arrays for complete facts, before/after sections, group/member mappings and retired IDs. The preview hash reuses unchanged A02OP1 framing with a distinct preview schema and operation domain, owned source/model binding, actual base version/revision, locale and content digest. Neither hash authenticates a caller or claims SQL-byte parity. Required future producer `canonical-engine/1.0.4` is metadata only: this leaf creates no canonical document, child ID, event, timestamp, persisted approval or write operation.

## Frozen files

| File                                         | SHA-256                                                            |
| -------------------------------------------- | ------------------------------------------------------------------ |
| `app/lib/server/canonical-entry-regroup.ts`  | `214423d13d67b8fb2310662ac6f1ef498dfb036892bc59e96eff2c8e2186536e` |
| `tests/unit/canonical-entry-regroup.test.ts` | `92cd16c36a00e2bf025916533d963779ac439cef017dd76779935ff686258bbd` |

The third owned file is this handoff. Its hash and exact source copies are in the final private packet.

## Verification and review corrections

Private packet: `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a02-regroup-uobz5t8x`.

- `focused.json`: 50 tests in one file passed.
- `types-final.json`: four roots, 30 source files, zero diagnostics.
- `lint.json` and `format.json`: scoped checks passed.

Each final check used exact Node `v22.23.4`, sealed synthetic configuration, dotenv disabled, AI disabled and no database/provider requests. All 724 recorded source inputs stayed unchanged during each run, with process-group cleanup confirmed. Root owns the combined diff-component gate and full typecheck/lint/web/worker builds. No old broad campaign was repeated.

The first coherent implementation passed three substantive controls and scoped types. Source review identified two bounded corrections before the final matrix: fixed-order section comparison prevents JSON object-key order from falsely reporting a layout change; minimal runtime presence guards prevent missing current/review/context data from throwing before the existing validator. The final controls cover both. These are reviewed source findings with subsequent green controls, not executed historical RED claims. Formatter mutation receipts are preserved separately from read-only checks.

The 50 controls include full/partial/already-grouped layouts, actual edit-plus-confirm ancestry, bullet members, retained repeated references, employer relocation, noncontiguous/interleaved groups, untouched sections, source-order determinism, detached output, independent A02OP1 hash calculation, content/locale/revision binding, malformed intents and snapshots, lineage gaps, unsafe/shared placements, foreign headers, duplicate direct references and valid-base overflow refusal.

No schema, producer, existing helper, SQL, constructor, repository, route or flag was edited. Durable multi-origin composition, atomic approval/save, old assignment remapping, replay/CAS, privacy/export/delete/restore admission, actual route acknowledgement/retry, native validation and release acceptance remain open. No SQL parser/execution, service, provider, environment, dependency, Git or deployment operation occurred.
