# A13 read-only publication access

Separated server-side publication reads and complete owner exports from worker leases. Only the publication repository, its existing unit file and this handoff changed. The worker service/test, frozen e6/131 schemas, SQL, flags and retention implementation remain untouched.

`createInitialFeedbackPublicationReader(client,{ownerId,organizationId,analysisId},expectedProfile,options)` exposes only read. It requires actual owned analysis identity but no invented lease. `createInitialFeedbackOwnerExporter(client,{ownerId},expectedProfile,options)` exposes only exportOwned; no analysis, organization or worker identity is supplied or fabricated. Both facades are frozen and reuse the existing strict profile/capability, deadline, error and Native reply checks. These remain server-only DTOs; no browser serialization or private-binding projection was introduced.

The existing worker factory/API stays compatible. Its strictly disjoint scope union accepts worker, read or owner-only scope. Read requires owner/org/analysis; finish requires the real validated worker lease. Insufficient scope rejects before metadata or data IO. Mixed partial tuples, unknown feature flags and malformed identities refuse rather than filling missing fields. The narrow facades do not expose finish; the owner exporter also does not expose read.

Owner export still validates the complete versioned collection and all returned ownership/graph/resource correlations. It never filters by a current organization, analysis, source, state or feature flag. Missing, denied, malformed or foreign data fails closed; an unavailable export is not an empty successful export. No Native grants or adoption readiness are inferred from the Node interfaces.

## Verification

Preimages: repository SHA `9eaab5f3275737f04332fc9ef11aa4297b74cbe30744d217918827058e8acd99`; unit file SHA `3e43e0794807329802f1f91a89fc06973009d858aff3bfbafa633248a48c06ee`. Exact originals and genuine RED snapshots are retained in the private 0700 packet `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a13-readonly-publication-sp34_3c0`.

- scope-red.json/log: two genuine failures/14 unselected through the existing constructor. Actual lease-free read and owner-only export were rejected before RPC. No missing-import scaffold was used.
- finite.json/log: 19 tests/one file passed after correction. All original fourteen cases and assertions remain byte-identical. Five new cases cover lease-free read, owner-only export, narrow facades and read/finish isolation, strict mixed-scope refusal, and missing/denied/foreign/staged export failures. Existing same-owner/two-organization collection assertions remain intact.
- Scoped types: four roots/45 sources/zero diagnostics. Scoped lint and format passed. The 796 source inputs stayed stable during each verification command; final preservation checks all 794 nonowned inputs and the immutable service/test hashes. No full service or unrelated test campaign was repeated.

Frozen repository SHA `43aff60fd4233f89e3bc3a8e42d0ab39a60deba775ee5b4d85915ac438d127e2`; unit file SHA `c4b9f2db35eec1a2915070da270a41854a295a982ca7965516d8a4122b2a4408`. Cleanup and receipt/log hashes are in cleanup-final.json and final-packet.json.

Evidence is sealed Node22, actual producer/schema helpers and synthetic RPC data only. Explicit synthetic expected pins stay test-only; no fake production profile/default was added. Native owner completeness, role grants, SQL behavior and runtime adoption remain unverified. The owner's thirty-day metadata retention choice is a separate implementation, not implemented or claimed here. No database, SQL parser/execution, provider, real environment/keys/PII, services, browser, Docker, dependency, Git or deployment operation ran. Root owns the integrated gate and the next consumer allocation.
