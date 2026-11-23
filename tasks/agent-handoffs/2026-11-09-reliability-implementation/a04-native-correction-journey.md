# CR-A04-S08 correction and export on one PostgreSQL fixture

The application rejected an owned correction workspace with 503 after the 100-operation replay. The native readiness RPC reported checker fingerprint `e796d58b…`, the exact successor from the entry-regroup migration. The shared candidate privacy reader expected only the previous `f0f42740…` fingerprint. A disposable grant made the access RPC available and the mismatch still reproduced.

The candidate reader now accepts the complete, exact predecessor or regroup fingerprint. It still requires a ready schema, access execute privilege and a privacy response bound to the owner. This change covers candidate access. The separate accounting export and retention readers retain their own profile checks.

## Verification

On dirty `main` at `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, Node 22.23.4 drove actual repository code against the 100-operation PostgreSQL 17 replay, whose ordered digest was `4e253744226912aab1c9411cb03e528f8fbdaa10984aa5933a88ff380601293a`.

- The service-role evidence RPC persisted the synthetic document. Two evidence corrections kept the original envelope intact. Target review selected both original citations and the correction transaction created one corrected fact per value. Exact replay returned the same receipt and saved version.
- The corrected facts started unconfirmed, with no old citations. Export preview refused the version before attempting to read the source. Exact owner confirmation preserved both correction applications and left scoring unavailable.
- Real PDF and DOCX renderers used the confirmed head. Independent extraction found each replacement once and found neither old value. The reports carried the confirmed version ID and the observed hashes of the output bytes.
- Restore created a new child of the current head and recovered the original cited value. The previous preview link then returned 409. A queued deletion made preview return 404 before reading the source.

The [verification runner](../../../scripts/verify-local-correction-journey.py) starts a socket-only database. The Supabase client uses an in-process adapter for the exercised Data API shapes. Its table reads and RPCs use PostgreSQL as the service role, and its Storage response supplies the exact synthetic PDF. The fixture session added read privileges for four base tables and a temporary execute grant for candidate privacy access. The runner first verified that this access and accounting export were staged. It stopped and removed the cluster afterward.

All 223 affected tests in seven suites passed. Full type checking, web and worker builds, and lint passed. Lint reported four existing JD clause-order warnings. The authenticated CV04 browser run, managed grants and release acceptance remain open.

## Chromium correction and download

CR-A04-S09 ran Chromium against the production web bundle on loopback and a fresh copy of the same 100-operation PostgreSQL replay. The browser verified an anonymous sign-in redirect and then used an SDK-created session for the synthetic owner. Auth and Storage responses came from the local fixture. The app's built route handlers used PostgreSQL for the evidence and correction reads and mutations. The browser context blocked requests to external origins.

The candidate changed the name on the evidence page, opened the structured resume, selected the cited target, and acknowledged assignment and apply separately. Chromium showed the corrected fact once and the correction history. The stored evidence envelope kept the original. Preview refused the unconfirmed version with 422. After separate fact confirmation, the browser followed the exact version link, checked and downloaded PDF and DOCX, and parsed both attachments. Each contained the new name once. The original name was absent. Restoring the original created a new version and made the previous preview link return 409.

Run the [local verifier](../../../scripts/verify-local-correction-journey.py) with `--browser` after `npm run build` on Node 22. Use the same PostgreSQL 17 and native JSON Schema library inputs as S08. Both browser and repository modes passed, along with type checking and scoped lint. The loopback server, browser, temporary downloads, and database stopped after the run. The isolated Supabase session, Data API, Storage, and managed acceptance still require execution on the approved target.
