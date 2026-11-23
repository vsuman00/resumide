# Document evidence review engineering profile

Status: **IMPLEMENTED locally; uncalibrated; AA1 release gate NOT PASSED.**

The opt-in review workflow binds every immutable attempt to its owner, analysis,
resume version, source SHA-256, creation time and retention policy. The storage
review envelope is strictly versioned `evidence/2.0.0`; it embeds the retained
`native-evidence-v1` source and optional `ocr-evidence-v1` source. This engineering
profile never emits ready/high/verified evidence or calibrated confidence.
It does not establish complete representative AA0/AA1 release conformity.

Native text remains unchanged. OCR runs only on the selected deficient pages in
explicitly approved synthetic local tests; it does not replace the native source.
Source offsets count Unicode code points. OCR line boxes are unions of actual
word boxes in normalized top-left coordinates. Native line geometry is unknown
(`box: null`); no word geometry or probability is invented from text presence.
Original OCR confidence remains tagged as raw/uncalibrated inside its source.
Review proposals have no calibrated numeric confidence.

All eight critical fields are represented. Empty fields remain not evaluated;
multiple values create a conflict; source-backed proposals require review.
Assertions reconstruct exactly from their cited span ranges. Strict replay
recomputes the projection from immutable sources, rather than trusting stored
assertions or caller-supplied eligibility. The PostgreSQL persistence boundary
independently checks source/owner bindings and grounded Unicode references.

Scores are withheld for every attempt until an approved future calibrated policy
exists. Missing OCR pages, failures, absent fields and conflicts are explicit
blockers. An owner confirmation records a decision about an exact candidate;
a correction records separate user-authored content without claiming a source
citation. Neither event changes the source, clears calibration or enables scores.
Corrections lock the owning analysis, compare the expected global revision and
replay only an identical idempotency key/payload. Old-attempt submissions conflict.

The keyboard-accessible `/analysis/:id/evidence` page displays original candidates,
source links, correction forms and append-only history. Owner authentication,
no-store response headers, same-origin actions, strict 8KB forms and 500-character
corrections apply. Errors announce validation, stale revision and recovery steps.
Scorer/model guards and serialized database triggers prevent new outputs; old
legacy result reads are suppressed after an attempt is persisted.

The private review read model derives `native-page-review/1.0.0` after replay and ownership validation. Page observations identify missing or short native text, replacement symbols, invalid character sequences, unexpected control characters and exact repeated extracted text. Existing OCR outcomes and evidence blockers remain visible separately. A shared browser-safe scanner checks at most 20 pages and 500,000 aggregate UTF-16 units without changing source strings, offsets, OCR selection or stored envelopes. Reliability and accuracy remain unassessed, including pages with no listed reasons.

Legacy Parse View labels its stored count bands as text availability. Its separate saved-text observations use the original supplied metadata, with original PDF page boundaries and native/OCR provenance unverified. Missing, malformed or out-of-bounds metadata yields an unavailable notice. Display fallback placeholders are never scanner input, and their allocation is independently bounded. These display projections preserve the `parse-sim-v1` producer, result checksum, numerical fields and historical stored values. Full extraction quality, unsafe-input score admission, native browser/storage and release acceptance remain separate.

The private route also derives `evidence-entry-associations/1.0.0` for review. Exact Employer/Role/optional Dates lines under Employment, Experience, Work Experience, Professional Experience or Employment History can suggest an unverified multiline employment entry within one page and extraction method. Existing same-span group IDs remain intact. Unsupported labels/layouts, ambiguous fields, page/method barriers and out-of-scope observations remain explicit; no proximity or qualification inference is made. The route resolves values through exact existing target/citation references and withholds a proposed entry on mismatch. Recorded aggregate conflicts remain original history, distinct from multiple legitimate jobs and unresolved links. The evidence page displays these relationships; the canonical page has the separate first-import flow described below. See the [local association review result](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/a02-association-review-closeout.md).

A separate pure `canonical-engine/1.0.3` first-import producer can prepare selected multiline groups from a fresh legacy draft while retaining exact fact identities, values, citations and unconfirmed states. It refuses ambiguous placement and keeps all unselected content. Its relationship-only intent and locale-bearing receipt are unverified and nonpersistable; no current import action calls it. Durable relationship approval, semantic replay, transactional CAS and existing-version regrouping remain separate required work. The additive reader preserves all old producer meanings. See the [local grouped-import result](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/a02-grouped-original-closeout.md).

The prospective `grouped-original-command/1.0.0` normalizer resolves compact browser lookup IDs through that owned helper into source-ordered structural references. A separate A02OP1 codec binds original source/model/capture/output-locale and relationship-only acknowledgement semantics without values, opaque UI hashes, generated IDs or timestamps. Commit input requires a matching preview identity and explicit acknowledgement, but preparation still records no approval and grants no persistence. Current-state admission and exact replay belong to the future atomic database path. Its private codec migration is source-only, unparsed and unapplied; see the [framing result](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/a02-durable-codec-closeout.md).

Private export includes attempts and owner decisions. Analysis, source-version
and account deletion cascade to both tables. Audit events retain action/IDs, not
corrected values. The default flag is `EVIDENCE_REVIEW_ENABLED=false`; the runtime
worker has no production OCR adapter. Install the forward migration before
activation, preserve withholding guards during recovery and repair forward.

The held-out synthetic field benchmark currently fails. See the
[AA1 closeout](../evaluation/AA1_ENGINEERING_CLOSEOUT.md) for exact measurements,
regression evidence and deferred representative/calibration obligations.

Thirteen private SQL helpers preserve structural grouping and validate the complete assertion map and bounded entry delta. They return derived preparation without granting approval or save authority. Disposable PostgreSQL executed all 61 source fixtures, including 47 placement checks, and refused all 54 invalid inputs. [Local PostgreSQL verification](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/a02-native-source-closeout.md)

The grouped first-import writer passed the local transaction check after a forward repair to its active association snapshot. A replay returns the original saved version and preserves the current head. Disposable PostgreSQL verified rollback on a write conflict and continued refusal through ordinary save. In a two-session check, identical requests saved once, and a waiting import refused a newly committed deletion. Managed execution and writer admission remain open. [Transaction verification](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/a02-native-atomic-closeout.md)

Ledger/privacy and atomic admission source are integrated under guarded producer admission. The new writer records approval and the first canonical version in one transaction, with exact replay before fresh CAS and preserved origin/active-link snapshots. Its capability profile preserves the historical checks and explicitly denies application execution of the new RPC. All SQL remains unparsed, unapplied and unexecuted. See the [local atomic-source result](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/a02-atomic-import-closeout.md).

The server consumer reads one owned source and revision snapshot and sends the page only derived groups, values and exact source links. The canonical page can preview up to 32 selected relationships with an explicit output locale. Saving requires a separate visible named acknowledgement; it approves relationships only and leaves facts unconfirmed. Existing import, correction, history and ordinary draft controls retain their behavior. Compatible preview and permission to save are separate states, and saving stays unavailable while the writer is revoked.

Existing-head regrouping now has a separate pure preparation and structural diff. It maps current facts through the owned source/ancestor projection, preserves their values and confirmations, and proposes merging whole affected entries. The employer entry ID moves to the earliest affected position; donor IDs retire from the proposal. All carried facts and bullets and the complete affected before/after sections remain visible, including crossed untouched entries. This is not wired to a route or save action and creates no new canonical version. Versioned multi-origin approval proof and actual consumer admission remain required. See the [preparation result](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/a02-regroup-preparation-closeout.md).

The separate regroup command layer retains the original owned base, native row digest, locale and captured prefixes. It resolves compact source-group and fact choices through the canonical model for whole-entry approval. Four private SQL helpers describe the same original-base mapping and captured-prefix checks. [Command preparation verification](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/a02-regroup-command-closeout.md)

The saved-entry regroup reader and writer passed native verification after a forward repair to their saved-head comparison. The reader reports fresh preview availability and preserves the current writer restrictions. The local writer passed exact replay, stale-write refusal, correction materialization, restore and rollback after a forced write failure. [Saved-entry regroup verification](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/a02-native-regroup-closeout.md)

Before a manual save, the page retains the original compact command in bounded tab storage for at most 30 minutes. An ambiguous result or a newly created head does not replace its captures, locale or request key. Reload and retry require a fresh unchecked acknowledgement; no action retries automatically. A matching receipt clears that pending command and links to the actual saved version, including an idempotent result that may no longer be the current head. This flow has source and local synthetic verification only; native transactions, managed browser behavior, existing-head regrouping and release acceptance remain open. See the [consumer result](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/a02-consumer-closeout.md) and [retry data inventory](../security/PRIVACY_DATA_MAP.md#grouped-import-retry-metadata-2026-11-13).
