# AI run identity and legacy compatibility review

Source review completed on 2026-11-10. This packet adds only this handoff and a [read-only catalog verifier](../../../scripts/verify-legacy-worker-compatibility.sql). No application source, migration or shared plan was changed. No SQL, tests, workers, providers or hosted actions were run.

Retain **no global unique `(analysis_id,input_hash)` index**. The existing hash describes content and prompt/version provenance; it is not the identity of an explicit rewrite request. Preserve the hash bytes and existing UUID run primary key. Do not add a nonce to the content hash or introduce another column.

The [rewrite service](../../../app/lib/server/rewrite-service.ts) hashes the source, job, version and prompt, then creates a fresh `runId` for each accepted POST and records that UUID in `analysis_ai_runs`. Two explicit requests can intentionally reuse identical content. Restoring the historical global content index would reject the second run insert after provider work. Shared-budget operation/attempt identity separately binds the request nonce and payload; it does not redefine `input_hash`.

The [current qualitative persistence function](../../../supabase/migrations/20260910110000_version_skill_taxonomy.sql) locks the analysis row, requires `qualitative_review`, and inserts its run, immutable analysis result and summary draft before the terminal transition. The base result primary key and `(analysis_id,kind)` draft constraint retain product-write uniqueness. No statement uses `ON CONFLICT(analysis_id,input_hash)`. This supports the identity decision in source; it does not prove native concurrency or at-most-once provider execution.

The [recorded native preflight](r11-native-schema-preflight.json) found no equivalent global content index. That absence is compatible with explicit repeat rewrites. It also found later taxonomy/persistence effects despite migration-history gaps. Do not replay the complete historical Phase 4 or taxonomy migrations.

The runtime bridge received a scoped source ACK at SHA256 `a54196112e51a5109ccc143ac20887568bec2e7021dd98328312ba615d69d418`. Its final bodies are:

| Routine | SHA256 of `prosrc` |
| --- | --- |
| `transition_analysis` | `eefd6814879dabe72de6dc15f355edcc57fd37c1271e0a162621479754b59ffd` |
| `release_analysis_job` | `750798339f61230201c162a824f4b858a0d189dbd9cc03afbf2528a5d4edd190` |
| `cancel_analysis` | `777e7bd2ccb838e3764104b85ba8f9ed9491da9750a746c2c36545ea72ed379b` |

The bridge validates known predecessors, signatures, attributes, overloads and grants before changes. Legacy release requires the exact worker, future lease expiry, active analysis, valid attempt count, no dead letter and no fence token, under analysis-then-job locks. It leaves v2 release and later persistence untouched. The last four transaction settings are the only delta from reviewed bridge `1555047e…`.

No index is created. Only the exact historical named plain unique index may be dropped, after full shape checks and canonical definition hash `30236673e1cd5e8824e051a7c7e3fbe3ad19d2318cc79115527321a53c3f6968`. Unknown definitions, name collisions and other non-primary uniqueness reject. Primary and nonunique indexes remain untouched. This review grants no DDL authorization.

The frontend cancellation route/test also received a source ACK at `9e0f8bf9…` / `5b2e658f…`: malformed UUIDs are concealed before RPC; rejected, malformed and unknown RPC outcomes become fixed 503 responses; known statuses retain their intended mappings. The author's 8-failure baseline and 13-test green result were not rerun here.

The verifier is **DRAFT / NOT_RUN**, not parsed or executed. It reads catalogs only, uses a read-only bounded transaction, and reports exact body/grant/index metadata. Root's proposed hosted packet is one separately approved exact bridge application followed by this verifier. Native positive cancellation/release behavior, concurrency, races, recovery, privacy acceptance and full R11/release acceptance remain open.
