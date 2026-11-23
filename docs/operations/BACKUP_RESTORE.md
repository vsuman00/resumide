# Backup, restore, and disaster recovery

Status: **PROCEDURE IMPLEMENTED, LIVE DRILL REQUIRED FOR A4**

## Approved baseline

- Region: Mumbai (`ap-south-1`) for the approved candidate B2C deployment.
- Target RPO: 24 hours.
- Target RTO: 4 hours.
- Active resume retention: 30 days; provider-governed backup expiry applies to
  copies outside active storage.

## Recovery procedure

1. Freeze writes or place the service in maintenance mode.
2. Restore PostgreSQL into an isolated database using the provider's point-in-
   time backup at or before the incident boundary.
3. Apply only forward-compatible migrations required by the selected artifact.
4. Restore private object storage into an isolated bucket and verify every
   object checksum against the database manifest.
5. Verify organization/user ownership, RLS, signed URL behavior, queue leases,
   and a representative authenticated result flow.
6. Record restore duration, data boundary timestamp, checksum results,
   unresolved items, and remediation owners.
7. Promote only after the operations owner approves; retain the original
   environment for forensics according to the incident policy.

`npm run test:restore` is a deterministic synthetic fixture check for manifest
checksum and ownership preservation. It is useful in CI but does not claim a
managed PostgreSQL or object-storage restore. A4 remains open until a dated
isolated hosted drill supplies the evidence above.

## Compare two isolated synthetic databases

After an independently approved restore finishes, the read-only comparison can check the populated canonical, JD, evidence and authoring rows on two dedicated Supabase projects. Keep the synthetic source frozen until the comparison finishes. Approve the exact pair of projects and fixture IDs using `MANAGED_RESTORE_APPROVAL`. Set its JSON fields to `schemaVersion: "managed-restore-check/1"`, `exclusiveSyntheticProjects: true`, the exact `sourceUrl` and `restoredUrl`, and distinct v4 UUIDs for `ownerId` and `viewerId`. Use the project API URLs without a trailing slash.

Each database needs the same two accounts marked `restore-check-<uuid>@example.test`. Add the second account to the first account's workspace as a viewer. Populate the owner fixture with one canonical head, three revisions, facts and change events, one evidence attempt, one JD revision with ten requirements, and one authoring event. Retain the source snapshot used to create the restored copy.

Provide `MANAGED_RESTORE_SOURCE_PASSWORD` and `MANAGED_RESTORE_RESTORED_PASSWORD` as secrets. Set `MANAGED_RESTORE_SOURCE_CA_FILE` and `MANAGED_RESTORE_RESTORED_CA_FILE` to the absolute CA bundle paths. The driver uses the direct database hostname derived from each approved project URL and verifies both the certificate and hostname. Use a shell without inherited PostgreSQL or workspace database connection settings. [Supabase direct PostgreSQL connections](https://supabase.com/docs/guides/database/connecting-to-postgres)

```sh
node --experimental-strip-types scripts/verify-managed-restore.ts
```

Exit 0 requires matching row and guard digests, populated owner reads, zero viewer access, and the expected restricted write grants. Exit 1 reports a failed check. Exit 2 reports unavailable configuration. The command emits only a status and stage. It does not run a backup, initiate a restore, create or delete fixtures, or promote an environment.

On dirty `main` at `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, the exact 97-operation schema packet was tested with a real local PostgreSQL 17.11 dump and restore. The SQL also rejected a disabled immutable trigger, a changed canonical row, and an extra account. Local mutation probes separately confirmed three restored triggers reject writes. The native test used synthetic Auth and Storage structures and a stand-in restricted to one separately schema-validated JD. The focused Node 22 suite passed 115 tests.

Hosted backup and restore, private-object checksums, queue and historical artifact replay, score diagnostic replay, and RPO/RTO measurements remain open. Supabase's database backup and private object contents require separate verification. [Supabase backup scope](https://supabase.com/docs/guides/platform/backups)

## Canonical importer compatibility repair

Apply `20261017010000_canonical_producer_compatibility.sql` before running the
repaired importer. It accepts both `canonical-engine/1.0.0` and
`canonical-engine/1.0.1` without rewriting saved versions or their citations.
Restore checks must retain historical versions and verify that a new import
records producer 1.0.1. Keep this forward migration during application rollback;
do not restore the older validator over documents produced by 1.0.1.
Template and renderer 1.0.2 identify the repaired export presentation and
source-link checks. Artifacts remain transient and must be checked again after
restore. This compatibility change does not authorize a hosted migration or
close the formal accuracy and artifact-release gates.
