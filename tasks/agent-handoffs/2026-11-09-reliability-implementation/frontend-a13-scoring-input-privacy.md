# A13 original scoring-input privacy export

Source implementation and finite fake-RPC checks are complete. Root integration and native execution remain separate. The worker always requests `export_legacy_scoring_inputs(p_user_id)` and requires its explicit versioned collection. It never skips stored snapshots because scoring is disabled or substitutes an empty collection for a missing, denied or failed RPC.

The staged source denies the new data exporter. Consequently, privacy exports intentionally fail closed until the paired native adoption/grant is authorized and verified. This affects existing accounts even with the scoring-input flag off. There is no legacy success fallback; this leaf does not authorize activation or an ACL change.

The exported `legacyScoringInputs` collection preserves all 17 raw-row fields and the complete original extraction and job context. Strict schema, row/context/source/binding correlations and the shared pure `validateLegacyScoringInputContext` reject malformed or foreign data. Same-owner historical records across organizations remain included; the request organization is queue context, not a filter. The timestamp reuses `LegacyScoringReceiptSchema.shape.createdAt`, retaining native microseconds and rejecting invalid calendar dates.

One native request is bounded to five seconds, including an ignored-abort promise race. The entire collection fails on more than 4096 rows, more than 32 MiB UTF8 serialized data, duplicate analysis IDs or invalid context. Nothing is truncated. Existing account queries, deletion, completion, consent and error handling remain intact. Native result and deterministic-content hashes are format-checked and preserved; the Node export does not independently verify them or manufacture a receipt.

## Evidence

Private 0700 packet: `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a13-scoring-input-privacy-azh31cn8`. Logs, JSON receipts and `.txt` source snapshots are private. Context/native metadata are synthetic; the unchanged actual scorer supplies fixture result checksums. Fake RPC responses are not proof of native ownership, completeness, grants or cascades.

- `omission-red.json/log`: actual prior worker omitted two supplied complete owned snapshots; one expected failure before product editing. Exact RED source bytes are retained, including a reconstruction checked against the recorded test SHA256.
- `privacy-finite.json/log`: 34 privacy controls passed. The second file collected no tests because an immutable source-text SQL fixture was absent from this worktree; the command remains `FAILED_OR_INCOMPLETE`. After copying that exact Root text dependency, `operations-followup.json/log` passed all 54 preserved operations cases. No SQL parser or native execution ran.
- One fixture-only TS2339 union error and its original source are retained. Naming the original source row preserved every value and assertion; the affected positive case and scoped checks then passed.
- `calendar-red.json/log`: actual `2026-02-31T00:00:00Z` was incorrectly accepted by the first local date check. `calendar-green.json/log` passed the invalid-date refusal and real positive case after reusing the strict shared timestamp. No broad test repetition followed.
- Final scoped types: 5 roots/38 source files/0 diagnostics; lint and format passed. Final checks used helper `e5d48799` and source profile `a1799dcb`. The initial 34/54 controls used `ce093e6a`; the released helper successor changes no consumer API. Root owns the fresh complete final gate.
- `preservation.json` retains all 83 original assertion statements: 23 policy/contention and 60 operations assertions. The operations file changes only its fake-RPC adapter to return an explicit valid empty export envelope. All 773 common source inputs outside the three allocated implementation/test files are unchanged; the helper/profile and one read-only SQL text fixture were added as approved dependencies.

## Frozen source

| File                                    | SHA256                                                             |
| --------------------------------------- | ------------------------------------------------------------------ |
| `app/lib/server/privacy-worker.ts`      | `5bcd063714e86a0bd7da68a50768b0082fe2b270468bde1a60d88a14aff30e6f` |
| `tests/unit/privacy.test.ts`            | `0563764fe92e9379fad5b4a5c471ff43004beb120f8f830039ad58c6bbb122dd` |
| `tests/unit/privacy-operations.test.ts` | `457e882ac8543f713a5676b3229caca2efa458a478cb2c6feea4d2d84493eddd` |

Baseline worker `33f4dca1` and both exact Root test preimages were archived before edits. Final shared helper SHA256 is `e5d487996953e2075122a3b20fbcb5d07c4915d41a81291ae5fd13cd3ba8e3e5`; tested profile is `a1799dcb80d81632fc9d9cee14a650fef21fb0bb10def3d1787471c75b27ae46`. Final released profile `b18bbcd0242245d3a4b47ddbb1477bc121c7e3c566ef06bd00f0a5b081016b94` was copied after checks closed; Root's fresh integrated gate covers those final source pins.

No database, SQL parsing/execution, services, browser, providers, real environment, PII, dependency changes or Git operations ran. Numeric scoring, frozen policies and the A12 bootstrap candidate remain unchanged. Native transaction/privacy/completeness checks, representative usefulness and release approval remain open.
