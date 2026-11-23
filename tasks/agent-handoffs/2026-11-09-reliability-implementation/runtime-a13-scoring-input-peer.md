# A13 worker and privacy peer review

Source HOLD on one checksum consistency gap, 2026-11-15. The other inspected native-wire seams have no additional concrete finding. This was a bounded read of final Root source, not a test or native execution. The five released runtime foundation files remain unchanged.

Reviewed exact Root inputs:

- `legacy-scoring-input.ts`: `e5d487996953e2075122a3b20fbcb5d07c4915d41a81291ae5fd13cd3ba8e3e5`.
- `scoring-stage.ts`: `f9c262acc637e26c3f47bd9f9a50ecce87ec2cd0009d3f767a47eda0a193acb6`.
- `privacy-worker.ts`: `5bcd063714e86a0bd7da68a50768b0082fe2b270468bde1a60d88a14aff30e6f`.
- Native profile: `b18bbcd0242245d3a4b47ddbb1477bc121c7e3c566ef06bd00f0a5b081016b94`; forward migration: `2cb4e2e684d4f4270085a541911422637b811aba8b02ce668f5dab4833dc8f80`.

The concrete gap is in `finishLegacyScoringInput`, lines 471-491: it parses the result and correlates inputTextChecksum, then forwards resultChecksum without recomputing the existing ordered payload checksum. The saved-context path at lines 515-518 also compares checksum strings without validating payload consistency. A result produced by the actual scorer, with only score changed to another valid 0..100 integer and its old resultChecksum retained, passes these checks and can reach the native finalizer. SQL intentionally treats this JS checksum as opaque and stores the submitted result fields, so its exact row comparison does not repair that mismatch.

This is a source counterexample, not an executed reproduction or a claim that an external candidate can directly supply worker results. The normal stage still invokes the unchanged deterministic scorer. The discrepancy is with the recorded contract that Node recomputes the existing ordered payload checksum. I sent Root and backend the exact path before any owner fix; Root decides the bounded correction or explicit trusted-worker limitation. Any correction must preserve the existing checksum ordering, nested payload semantics and scorer versions, and must not claim independent numeric validation.

The rest of the inspected source matches the frozen native wire. The worker adapter uses the native lease grammar and strict ready/committed/skipped and bound/legacy_unbound unions. It validates exact source/extraction/JD correlations, recomputes UTF8 extraction checksum, preserves empty page arrays, binds job:none explicitly and treats native JSONB hashes as opaque. Metadata admits exactly the actual eight profile fields plus schemaReady/writerExecutable; selected mode does not fall back. The stage's enabled branch reads the new context before scoring, skips non-ready states, keeps the uncalibrated guard and uses the complete admitted original JD. The disabled legacy branch and deterministic function remain separate.

Privacy uses the exact 17-column export row, validates full original input_context and owner/org/source/job/input-digest relationships, refuses duplicate analysis IDs, and enforces 4096 rows/32MiB without truncation. Same-owner historical organizations remain included. The RPC is unconditional; no scoring flag or missing/denied native export becomes an empty success. Its current staged denial therefore remains an explicit export-unavailability consequence until separately admitted adoption.

No tests, SQL parsing/execution, database/advisor/provider/service, environment or Git operation ran. Actual role/transaction/race/retention acceptance remains open; source review and fakeRPC tests cannot supply it. No broader A12/A13 review or new corpus was started.
