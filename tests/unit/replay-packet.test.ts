// ATS-D6 (option b): the materialized packet is the only supported way to replay the schema on an
// existing managed project. Raw migration files that differ from it must never be replayed, so any
// change to that set, or to the packet itself, fails here and needs a reviewed update.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const RAW = join(__dirname, "../../supabase/migrations");
const SCRIPT = join(
  __dirname,
  "../../scripts/materialize-managed-schema-successor.py",
);
const PACKET_DIGEST =
  "4e253744226912aab1c9411cb03e528f8fbdaa10984aa5933a88ff380601293a";
// Raw files the packet rewrites. Replaying any of them as written is unsupported.
const DIFFERING_RAW_FILES = [
  "20261111010000_job_requirement_relations.sql",
  "20261113180050_entry_regroup_atomic_admission.sql",
  "20261114104337_requirement_relationship_context.sql",
  "20261114170229_typed_authoring_readiness.sql",
  "20261114174039_typed_authoring_declaration.sql",
  "20261114181344_canonical_rewrite_operations.sql",
  "20261114192207_canonical_rewrite_compatibility.sql",
  "20261115042554_canonical_rewrite_workspace.sql",
  "20261115082125_owned_ai_usage.sql",
  "20261115095258_initial_feedback_late_settlement.sql",
  "20261115100607_owned_ai_retirement.sql",
  "20261115102625_owned_ai_budget_export.sql",
  "20261115131621_owned_ai_disposition_clocks.sql",
  "20261115143547_retention_root_coverage.sql",
  "20261115154855_ai_budget_source_registration.sql",
  "20261115162257_ai_budget_all_caller_sources.sql",
  "20261115172527_owned_legacy_ai_usage_retention.sql",
  "20261115182650_mandatory_ai_budget_dispatch.sql",
  "20261115190341_owned_ai_expiry_fold.sql",
  "20261116075250_privacy_export_generation.sql",
  "20261116192537_jd_clause_order_decisions.sql",
];

const out = mkdtempSync(join(tmpdir(), "replay-packet-"));
afterAll(() => rmSync(out, { recursive: true, force: true }));
const sql = (dir: string) =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

describe("schema replay packet (ATS-D6)", () => {
  const log = execFileSync("python3", [
    SCRIPT,
    "--correction-commit-repair",
    join(out, "packet"),
  ]).toString();
  const packet = sql(join(out, "packet"));
  const raw = sql(RAW);

  it("materializes the pinned packet", () => {
    expect(log).toContain(PACKET_DIGEST);
    expect(packet).toHaveLength(100);
  });

  it("lists exactly the raw files that must not be replayed as written", () => {
    const differing = packet.filter(
      (f) =>
        !raw.includes(f) ||
        !readFileSync(join(RAW, f)).equals(
          readFileSync(join(out, "packet", f)),
        ),
    );
    expect(differing).toEqual(DIFFERING_RAW_FILES);
  });

  it("allows raw files beyond the packet only as later forward migrations", () => {
    const last = packet[packet.length - 1];
    const extra = raw.filter((f) => !packet.includes(f));
    expect(extra.length).toBeGreaterThan(0);
    for (const f of extra) expect(f > last).toBe(true);
  });
});
