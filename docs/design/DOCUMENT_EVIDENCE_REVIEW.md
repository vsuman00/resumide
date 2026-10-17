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

Private export includes attempts and owner decisions. Analysis, source-version
and account deletion cascade to both tables. Audit events retain action/IDs, not
corrected values. The default flag is `EVIDENCE_REVIEW_ENABLED=false`; the runtime
worker has no production OCR adapter. Install the forward migration before
activation, preserve withholding guards during recovery and repair forward.

The held-out synthetic field benchmark currently fails. See the
[AA1 closeout](../evaluation/AA1_ENGINEERING_CLOSEOUT.md) for exact measurements,
regression evidence and deferred representative/calibration obligations.
