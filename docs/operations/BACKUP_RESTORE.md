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
