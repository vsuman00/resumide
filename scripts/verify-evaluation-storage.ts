import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { getServerConfig } from "../app/lib/server/config";
import { EvaluationCorpusDrill } from "../app/lib/server/evaluation-corpus-drill";
import { createEvaluationCorpusRecord } from "../tests/fixtures/evaluation-corpus";
import { syntheticPdf } from "../tests/fixtures/native-pdf";
import type { createBrowserOwner } from "./browser-owner-fixture";
import {
  recordBrowserFixture,
  requireBrowserTestTarget,
} from "./browser-test-target";

const digest = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");
function missingObject(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const value = error as {
    status?: unknown;
    statusCode?: unknown;
    code?: unknown;
  };
  // Do not accept generic 404, bucket-not-found, auth or transient responses.
  return (
    value.code === "NoSuchKey" &&
    (value.status === 404 || value.statusCode === "404")
  );
}
async function requireFreshLedger() {
  const path = process.env.BROWSER_TEST_LEDGER ?? "";
  if (!/^\/tmp\/resumide-auth-audit-[a-z0-9-]+\.jsonl$/.test(path))
    throw new Error("PRIVATE_LEDGER_REQUIRED");
  const file = await open(
    path,
    constants.O_RDWR | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const stat = await file.stat();
    if (
      !stat.isFile() ||
      stat.nlink !== 1 ||
      (stat.mode & 0o777) !== 0o600 ||
      stat.uid !== process.getuid?.() ||
      stat.size !== 0
    )
      throw new Error("PRIVATE_LEDGER_REQUIRED");
  } finally {
    await file.close();
  }
}

async function main() {
  process.umask(0o077);
  const report = {
    schemaVersion: 1,
    evidenceTier: "synthetic_storage_drill",
    status: "rejected",
    failures: [] as string[],
    checks: {} as Record<string, boolean>,
    counts: {
      ownersCreated: 0,
      ownersAbsent: 0,
      auditRowsBeforeCleanup: 0,
      auditRowsAfterCleanup: 0,
      exactKeysVerifiedAbsent: 0,
    },
    journalHash: null as string | null,
    // Storage's not-found reply can also hide authorization failures. This script
    // is only one observation; the coordinator independently verifies exact rows.
    independentStorageMetadataVerification: "required",
    representativeReady: false,
    releaseReady: false,
  };
  const fail = (code: string) => {
    if (!report.failures.includes(code)) report.failures.push(code);
  };
  const check = (name: string, value: boolean) => {
    report.checks[name] = value;
    if (!value) fail(name);
  };
  if (
    process.argv.slice(2).join(" ") !== "--live-synthetic-storage" ||
    process.env.RESUMIDE_PRIVATE_VERIFY !== "aa7-owned-synthetic" ||
    process.env.AI_ENABLED !== "false"
  ) {
    fail("LIVE_NOT_AUTHORIZED");
    return report;
  }
  const owners: Awaited<ReturnType<typeof createBrowserOwner>>[] = [];
  let drill: EvaluationCorpusDrill | undefined;
  let primary: Awaited<ReturnType<typeof createBrowserOwner>> | undefined;
  const runId = randomUUID();
  let expectedKeys: string[] = [];
  let storageReads = 0;
  try {
    const config = getServerConfig();
    requireBrowserTestTarget(config.SUPABASE_URL);
    await requireFreshLedger();
    const { createBrowserOwner: createOwner } =
      await import("./browser-owner-fixture");
    primary = await createOwner();
    owners.push(primary);
    const other = await createOwner();
    owners.push(other);
    report.counts.ownersCreated = owners.length;
    const bucket = primary.admin.storage.from(config.SUPABASE_RESUME_BUCKET);
    drill = new EvaluationCorpusDrill(
      {
        runId,
        organizationId: primary.organizationId,
        ownerId: primary.ownerId,
      },
      {
        storage: {
          upload: (...args) => bucket.upload(...args),
          remove: (...args) => bucket.remove(...args),
          download: (...args) => {
            storageReads++;
            return bucket.download(...args);
          },
        },
        isNotFound: missingObject,
        audit: async (event) => {
          const result = await primary!.admin.from("audit_events").insert({
            organization_id: primary!.organizationId,
            actor_id: primary!.ownerId,
            action: `evaluation_corpus.${event.action}.${event.phase}.${event.code}`,
            target_type: "evaluation_corpus_drill",
            outcome: event.outcome === "allowed" ? "success" : event.outcome,
            request_id: runId,
          });
          if (result.error) throw new Error("AUDIT_FAILED");
        },
      },
    );
    const asOf = new Date().toISOString();
    const expiry = new Date(Date.now() + 60_000).toISOString();
    const payloads = [
      syntheticPdf(
        "BT /F1 12 Tf 50 750 Td (Synthetic corpus revoke control) Tj ET",
      ),
      syntheticPdf(
        "BT /F1 12 Tf 50 750 Td (Synthetic corpus expiry control) Tj ET",
      ),
    ];
    const records = payloads.map((bytes, index) => {
      const record = createEvaluationCorpusRecord();
      record.id = `synthetic-drill-${index}`;
      record.contentHash = digest(bytes);
      record.permission.grantedAt = asOf;
      record.permission.expiresAt = expiry;
      record.retentionExpiresAt = expiry;
      record.stateChangedAt = asOf;
      return record;
    });
    const actor = { id: primary.ownerId, groups: [records[0].accessGroup] };
    expectedKeys = records.map(
      (record) =>
        `organizations/${primary!.organizationId}/evaluation-corpus/${runId}/${record.id}.pdf`,
    );
    for (const key of expectedKeys)
      await recordBrowserFixture(config.SUPABASE_URL, {
        ownerId: primary.ownerId,
        storageKey: key,
      });
    for (const [index, record] of records.entries())
      check(
        `intake_${index}`,
        (await drill.intake(record, payloads[index], actor, asOf)).ok,
      );
    const beforeWrong = storageReads;
    const wrong = await drill.read(
      records[0].id,
      { ...actor, id: other.ownerId },
      asOf,
    );
    check(
      "wrong_owner_denied_before_read",
      wrong.code === "ACCESS_DENIED" && storageReads === beforeWrong,
    );
    const beforeGroup = storageReads;
    const group = await drill.read(
      records[0].id,
      { ...actor, groups: [] },
      asOf,
    );
    check(
      "wrong_group_denied_before_read",
      group.code === "ACCESS_DENIED" && storageReads === beforeGroup,
    );
    const allowed = await drill.read(records[0].id, actor, asOf);
    check(
      "actual_read_hash",
      allowed.ok &&
        !!allowed.bytes &&
        digest(allowed.bytes) === records[0].contentHash,
    );
    check("revoke", (await drill.revoke(records[0].id, actor, asOf)).ok);
    const beforeRevoke = storageReads;
    const revoked = await drill.read(records[0].id, actor, asOf);
    check(
      "revoked_before_read",
      revoked.code === "RECORD_REVOKED" && storageReads === beforeRevoke,
    );
    const beforeExpiry = storageReads;
    const expired = await drill.read(records[1].id, actor, expiry);
    check(
      "expired_before_read",
      expired.code === "PERMISSION_EXPIRED" && storageReads === beforeExpiry,
    );
    const auditRows = await primary.admin
      .from("audit_events")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", primary.organizationId)
      .eq("request_id", runId);
    if (auditRows.error) throw new Error("AUDIT_VERIFY_FAILED");
    report.counts.auditRowsBeforeCleanup = auditRows.count ?? 0;
    check(
      "actual_audit_rows",
      report.counts.auditRowsBeforeCleanup ===
        drill.receipts().filter((event) => event.auditPersisted).length &&
        report.counts.auditRowsBeforeCleanup > 0,
    );
  } catch {
    fail("DRILL_FAILED");
  } finally {
    report.counts.ownersCreated = owners.length;
    if (drill) {
      // Retry cleanup only, never retry an observation or hide the first failure.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const cleanup = await drill.cleanup(new Date().toISOString());
          if (!cleanup.ok) fail("CLEANUP_ATTEMPT_FAILED");
          if (
            cleanup.ok &&
            cleanup.deletionVerified &&
            cleanup.remainingObjects === 0
          )
            break;
        } catch {
          fail("CLEANUP_ATTEMPT_FAILED");
        }
      }
      report.journalHash = digest(JSON.stringify(drill.receipts()));
    }
    if (primary) {
      const bucket = primary.admin.storage.from(
        getServerConfig().SUPABASE_RESUME_BUCKET,
      );
      for (const key of expectedKeys) {
        try {
          const result = await bucket.download(key);
          if (!result.data && missingObject(result.error))
            report.counts.exactKeysVerifiedAbsent++;
          else fail("EXACT_STORAGE_ABSENCE_UNVERIFIED");
        } catch {
          fail("EXACT_STORAGE_ABSENCE_UNVERIFIED");
        }
      }
    }
    for (const owner of owners) {
      try {
        await owner.cleanup();
      } catch {
        fail("OWNER_CLEANUP_FAILED");
      }
    }
    for (const owner of owners) {
      try {
        const result = await owner.admin.auth.admin.getUserById(owner.ownerId);
        if (
          !result.data.user &&
          result.error?.status === 404 &&
          result.error.code === "user_not_found"
        )
          report.counts.ownersAbsent++;
        else fail("OWNER_ABSENCE_UNVERIFIED");
        const auditRows = await owner.admin
          .from("audit_events")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", owner.organizationId)
          .eq("request_id", runId);
        if (auditRows.error) fail("AUDIT_CLEANUP_UNVERIFIED");
        else report.counts.auditRowsAfterCleanup += auditRows.count ?? 0;
      } catch {
        fail("CLEANUP_VERIFY_FAILED");
      }
    }
    if (owners.length) {
      check(
        "exact_owners_absent",
        report.counts.ownersAbsent === owners.length,
      );
      check(
        "exact_audit_rows_absent",
        report.counts.auditRowsAfterCleanup === 0,
      );
      check(
        "exact_storage_read_absence",
        report.counts.exactKeysVerifiedAbsent === expectedKeys.length &&
          expectedKeys.length === 2,
      );
    }
  }
  report.status = report.failures.length
    ? "failed"
    : "observed_pending_independent_storage_verification";
  return report;
}

void main()
  .then((report) => {
    process.stdout.write(JSON.stringify(report) + "\n");
    process.exitCode = report.failures.length ? 1 : 0;
  })
  .catch(() => {
    process.stdout.write(
      JSON.stringify({
        schemaVersion: 1,
        status: "failed",
        failures: ["INTERNAL_ERROR"],
      }) + "\n",
    );
    process.exitCode = 1;
  });
