import { readFileSync as generationReadFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { OWNED_LEGACY_AI_USAGE_PROFILE as GENERATION_CURRENT_EXPIRY_CURRENT_MANDATORY_BUDGET_OWNED_LEGACY_AI_USAGE_PROFILE } from "../../app/lib/server/owned-legacy-ai-usage-profile";
import {
  INITIAL_FEEDBACK_PROFILE as GENERATION_CURRENT_EXPIRY_CURRENT_MANDATORY_BUDGET_INITIAL_FEEDBACK_PROFILE,
  OWNED_AI_RETIREMENT_PROFILE as GENERATION_CURRENT_EXPIRY_CURRENT_MANDATORY_BUDGET_OWNED_AI_RETIREMENT_PROFILE,
} from "../../app/lib/server/initial-feedback-profile";
import { AI_BUDGET_SOURCE_PROFILE as GENERATION_CURRENT_EXPIRY_CURRENT_MANDATORY_BUDGET_AI_BUDGET_SOURCE_PROFILE } from "../../app/lib/server/ai-budget-source-profile";
import { OWNED_AI_DISPOSITION_PROFILE as GENERATION_CURRENT_EXPIRY_CURRENT_MANDATORY_BUDGET_OWNED_AI_DISPOSITION_PROFILE } from "../../app/lib/server/owned-ai-disposition-profile";
// Freeze immediate predecessor imports; all previous assertions remain exact.
const EXPIRY_CURRENT_MANDATORY_BUDGET_OWNED_LEGACY_AI_USAGE_PROFILE =
  Object.freeze({
    schemaVersion: "owned-legacy-ai-usage-readiness/1.0.0",
    profileVersion: "owned-legacy-ai-usage-profile/1.0.0",
    checkerSha256:
      "b98eb5b12c9fdd775904afa8f38ab0ebb7046b5dd63d60ffcc542bdd616ddf39",
    captureSha256:
      "9ff188bfea3fda8a19df1629632b69b9832cd68b5db61dbafff95d01b8fb5383",
    exportSha256:
      "7b2854f765754a396045589fc3abfb0a0eed6f51e95c0eaff5ff1fa1b0c0c146",
    metadataSha256:
      "ef83a5a3cbb95833d074dbca53e6e0ab878a1d09c291c342f536b3e9eb0a3968",
  });
const EXPIRY_CURRENT_MANDATORY_BUDGET_INITIAL_FEEDBACK_PROFILE = Object.freeze({
  schemaVersion: "initial-feedback-readiness/1.0.0",
  profileVersion: "initial-feedback-readiness-profile/1.0.0",
  checkerSha256:
    "969f1e4633659e47ee9cfc0243ca461c009159fcd1ce62bf5b54fd3684861351",
  readerSha256:
    "57701a307d3087720642d9b4057eac87b770465e81726c000c5238708bcfc47b",
  prepareSha256:
    "93b7af8445710cd105e2da67eb27f7d9b8d9c52cd7ec924a6ab6f6aa69548f92",
  claimSha256:
    "f7b45e9f59df53aa5324c6a62b2d800201c2d27b29eac5f76b3bc5a59c3f50a5",
  settleSha256:
    "9218ef0590dbb24e8580e88ba186de2164b326c6d5a2abfdc963bd7ad8aab76f",
  finishSha256:
    "4dd69746741103ab0961fb1c40919b1227b9a64dda4c43394f55d638b6d37b3f",
  usageSha256:
    "3ced80cc4289760a1e4b88defefe7f330374968fcc96592dc775a116b615ddc3",
  exportSha256:
    "eefd5842be1eb38fe1e0f17ea148f1708eae634c2a8fe42ab94467c9839fe0cd",
  metadataSha256:
    "2bafa1e30a02308604ad0114ab114189aef6e8323379e443ab7a96a64b2196d6",
});
const EXPIRY_CURRENT_MANDATORY_BUDGET_OWNED_AI_RETIREMENT_PROFILE =
  Object.freeze({
    schemaVersion: "owned-ai-retirement-readiness/1.0.0",
    profileVersion: "owned-ai-retirement-profile/1.0.0",
    checkerSha256:
      "d649fc31a7d91ddf2917c84f0624420db8f0bd2ff217d7fd3fda678e71037d43",
    captureSha256:
      "d066dfb3459d527b551ab81a564f85e896220e8b8f88749d21e378bd2b84cce0",
    exportSha256:
      "dc09528d888b8089e5e87d2d1edf32a8796267683021b2085dac2d0e80f3db27",
    metadataSha256:
      "55a9f1dd2000b1a4cd1e258e68b0e56d36872422f7a76ced5c08585fe31d70b7",
  });
const EXPIRY_CURRENT_MANDATORY_BUDGET_AI_BUDGET_SOURCE_PROFILE = Object.freeze({
  schemaVersion: "ai-budget-source-readiness/2.0.0",
  profileVersion: "ai-budget-source-profile/2.0.0",
  checkerSha256:
    "45df8f9520848c9ed95c7bfb6655a6686f327af94dbc7d95a4d03f815ffb7b82",
  reserveSha256:
    "0d586a4e782fec52f6fba3545de80e9f3a4f2a1eaaed3e489f4ed273ec9160f7",
  exportSha256:
    "7b98b91f31f88bc22676754657d36be536ef5c6a67a0455be6a9fd368ac801fe",
  metadataSha256:
    "b9a9685504c1e45316e63366f02fcd5499a0ea0d65a3bfcaf36f9d4741b781cf",
});
const EXPIRY_CURRENT_MANDATORY_BUDGET_OWNED_AI_DISPOSITION_PROFILE =
  Object.freeze({
    schemaVersion: "owned-ai-disposition-readiness/1.0.0",
    profileVersion: "owned-ai-disposition-profile/1.0.0",
    checkerSha256:
      "9021695f1c4976d27287564a9c30c6ff236a777b33401a62ca249f46482652de",
    exportSha256:
      "9e024843ba62807efc21000971e6074579ca595a69d293ba7a84500a500b01b0",
    accessSha256:
      "0846149a1f25edf14ea3c907219634cda85358065b3e4d5a06c79da2522f87db",
    metadataSha256:
      "f42f6f60454023ad2b6ef998e2fd9098585768c0cfe35cd5307affdd5f349a6a",
  });

// Frozen immediate predecessor imports; every earlier assertion/object remains unchanged.
const MANDATORY_BUDGET_OWNED_LEGACY_AI_USAGE_PROFILE = Object.freeze({
  schemaVersion: "owned-legacy-ai-usage-readiness/1.0.0",
  profileVersion: "owned-legacy-ai-usage-profile/1.0.0",
  checkerSha256:
    "bf104476ada3f7425aa65a1c12a8023f5c43166dac2c27314905d7c7d8749c43",
  captureSha256:
    "9ff188bfea3fda8a19df1629632b69b9832cd68b5db61dbafff95d01b8fb5383",
  exportSha256:
    "7b2854f765754a396045589fc3abfb0a0eed6f51e95c0eaff5ff1fa1b0c0c146",
  metadataSha256:
    "ef83a5a3cbb95833d074dbca53e6e0ab878a1d09c291c342f536b3e9eb0a3968",
});
const MANDATORY_BUDGET_INITIAL_FEEDBACK_PROFILE = Object.freeze({
  schemaVersion: "initial-feedback-readiness/1.0.0",
  profileVersion: "initial-feedback-readiness-profile/1.0.0",
  checkerSha256:
    "8172bbcf76eb371d34e34002d7bf485568f0ca6632446da50ba63a8787c578d7",
  readerSha256:
    "57701a307d3087720642d9b4057eac87b770465e81726c000c5238708bcfc47b",
  prepareSha256:
    "93b7af8445710cd105e2da67eb27f7d9b8d9c52cd7ec924a6ab6f6aa69548f92",
  claimSha256:
    "f7b45e9f59df53aa5324c6a62b2d800201c2d27b29eac5f76b3bc5a59c3f50a5",
  settleSha256:
    "739919dedaa5080c4bb8f3c556a9f9b1528fb88747edef9764588bd9038d4148",
  finishSha256:
    "966cdb270ca5a4c1ab8fe6a6dd9097b5d46ebb2b2218f8047b794646cca315a8",
  usageSha256:
    "3ced80cc4289760a1e4b88defefe7f330374968fcc96592dc775a116b615ddc3",
  exportSha256:
    "eefd5842be1eb38fe1e0f17ea148f1708eae634c2a8fe42ab94467c9839fe0cd",
  metadataSha256:
    "2bafa1e30a02308604ad0114ab114189aef6e8323379e443ab7a96a64b2196d6",
});
const MANDATORY_BUDGET_OWNED_AI_RETIREMENT_PROFILE = Object.freeze({
  schemaVersion: "owned-ai-retirement-readiness/1.0.0",
  profileVersion: "owned-ai-retirement-profile/1.0.0",
  checkerSha256:
    "a0b6290511973757a983b793f249c8ef1225091eaac5a118847a7e4bb53d0694",
  captureSha256:
    "d066dfb3459d527b551ab81a564f85e896220e8b8f88749d21e378bd2b84cce0",
  exportSha256:
    "dc09528d888b8089e5e87d2d1edf32a8796267683021b2085dac2d0e80f3db27",
  metadataSha256:
    "55a9f1dd2000b1a4cd1e258e68b0e56d36872422f7a76ced5c08585fe31d70b7",
});
const MANDATORY_BUDGET_AI_BUDGET_SOURCE_PROFILE = Object.freeze({
  schemaVersion: "ai-budget-source-readiness/2.0.0",
  profileVersion: "ai-budget-source-profile/2.0.0",
  checkerSha256:
    "8ea2b83fbd6804a631d75e2e21816a0e3907bc7f9c09b30dc536c4b39e0b804e",
  reserveSha256:
    "0d586a4e782fec52f6fba3545de80e9f3a4f2a1eaaed3e489f4ed273ec9160f7",
  exportSha256:
    "7b98b91f31f88bc22676754657d36be536ef5c6a67a0455be6a9fd368ac801fe",
  metadataSha256:
    "b9a9685504c1e45316e63366f02fcd5499a0ea0d65a3bfcaf36f9d4741b781cf",
});
const MANDATORY_BUDGET_OWNED_AI_DISPOSITION_PROFILE = Object.freeze({
  schemaVersion: "owned-ai-disposition-readiness/1.0.0",
  profileVersion: "owned-ai-disposition-profile/1.0.0",
  checkerSha256:
    "342d370615d1c6076fe7e16c06e13ecfa45b428e971b56c860e6fd0f5a425bf5",
  exportSha256:
    "9e024843ba62807efc21000971e6074579ca595a69d293ba7a84500a500b01b0",
  accessSha256:
    "0846149a1f25edf14ea3c907219634cda85358065b3e4d5a06c79da2522f87db",
  metadataSha256:
    "f42f6f60454023ad2b6ef998e2fd9098585768c0cfe35cd5307affdd5f349a6a",
});

// Frozen immediate predecessor profiles; every earlier assertion remains unchanged.
const OWNED_LEGACY_AI_USAGE_PROFILE = Object.freeze({
  schemaVersion: "owned-legacy-ai-usage-readiness/1.0.0",
  profileVersion: "owned-legacy-ai-usage-profile/1.0.0",
  checkerSha256:
    "fd8a87b4b2992f4924b6047ffe9ead49370cf389f80774816b8841bb90855b05",
  captureSha256:
    "9ff188bfea3fda8a19df1629632b69b9832cd68b5db61dbafff95d01b8fb5383",
  exportSha256:
    "7b2854f765754a396045589fc3abfb0a0eed6f51e95c0eaff5ff1fa1b0c0c146",
  metadataSha256:
    "ef83a5a3cbb95833d074dbca53e6e0ab878a1d09c291c342f536b3e9eb0a3968",
});
const INITIAL_FEEDBACK_PROFILE = Object.freeze({
  schemaVersion: "initial-feedback-readiness/1.0.0",
  profileVersion: "initial-feedback-readiness-profile/1.0.0",
  checkerSha256:
    "5c35085cb3a1d089370b93aaa1d4ea88782e5bc0a3d53e2607eebcfc19f2ef98",
  readerSha256:
    "57701a307d3087720642d9b4057eac87b770465e81726c000c5238708bcfc47b",
  prepareSha256:
    "93b7af8445710cd105e2da67eb27f7d9b8d9c52cd7ec924a6ab6f6aa69548f92",
  claimSha256:
    "8d9ca0645d4457616d6a7fc947658fa89b3b7529042ba6f17f90f1cbc051012a",
  settleSha256:
    "739919dedaa5080c4bb8f3c556a9f9b1528fb88747edef9764588bd9038d4148",
  finishSha256:
    "966cdb270ca5a4c1ab8fe6a6dd9097b5d46ebb2b2218f8047b794646cca315a8",
  usageSha256:
    "3ced80cc4289760a1e4b88defefe7f330374968fcc96592dc775a116b615ddc3",
  exportSha256:
    "eefd5842be1eb38fe1e0f17ea148f1708eae634c2a8fe42ab94467c9839fe0cd",
  metadataSha256:
    "2bafa1e30a02308604ad0114ab114189aef6e8323379e443ab7a96a64b2196d6",
});
const OWNED_AI_RETIREMENT_PROFILE = Object.freeze({
  schemaVersion: "owned-ai-retirement-readiness/1.0.0",
  profileVersion: "owned-ai-retirement-profile/1.0.0",
  checkerSha256:
    "a0b6290511973757a983b793f249c8ef1225091eaac5a118847a7e4bb53d0694",
  captureSha256:
    "d066dfb3459d527b551ab81a564f85e896220e8b8f88749d21e378bd2b84cce0",
  exportSha256:
    "dc09528d888b8089e5e87d2d1edf32a8796267683021b2085dac2d0e80f3db27",
  metadataSha256:
    "55a9f1dd2000b1a4cd1e258e68b0e56d36872422f7a76ced5c08585fe31d70b7",
});
const AI_BUDGET_SOURCE_PROFILE = Object.freeze({
  schemaVersion: "ai-budget-source-readiness/2.0.0",
  profileVersion: "ai-budget-source-profile/2.0.0",
  checkerSha256:
    "0d2605fe5f78efe11b6162fc112a7d542ccfe9260afe503db83806634f5b010d",
  reserveSha256:
    "0d586a4e782fec52f6fba3545de80e9f3a4f2a1eaaed3e489f4ed273ec9160f7",
  exportSha256:
    "7b98b91f31f88bc22676754657d36be536ef5c6a67a0455be6a9fd368ac801fe",
  metadataSha256:
    "b9a9685504c1e45316e63366f02fcd5499a0ea0d65a3bfcaf36f9d4741b781cf",
});
const OWNED_AI_DISPOSITION_PROFILE = Object.freeze({
  schemaVersion: "owned-ai-disposition-readiness/1.0.0",
  profileVersion: "owned-ai-disposition-profile/1.0.0",
  checkerSha256:
    "ef0eaea8b3b8da45247ecd911e49e96239e43bbd32292484d082808b13873e57",
  exportSha256:
    "9e024843ba62807efc21000971e6074579ca595a69d293ba7a84500a500b01b0",
  accessSha256:
    "0846149a1f25edf14ea3c907219634cda85358065b3e4d5a06c79da2522f87db",
  metadataSha256:
    "f42f6f60454023ad2b6ef998e2fd9098585768c0cfe35cd5307affdd5f349a6a",
});

const preExpiryRead = (n: string) =>
  readFileSync(new URL(`../../${n}`, import.meta.url), "utf8");
const candidate = read(
  "supabase/migrations/20261115172527_owned_legacy_ai_usage_retention.sql",
);
const r17 = JSON.parse(
  read("supabase/migrations/20261115143547_retention_root_coverage.sql").split(
    "$r17_patches$",
  )[1],
) as Array<{ signature: string; new: string }>;
const retirement = read(
  "supabase/migrations/20261115100607_owned_ai_retirement.sql",
);
const legacy = read(
  "supabase/migrations/20260909220000_qualitative_ai_stage.sql",
);
describe("actual predecessor source loss regressions, SQL unparsed/unexecuted", () => {
  it("captures actual runs before the final covered parent DELETE", () => {
    const actual =
      candidate ||
      r17.find((p) => p.signature === "public.complete_retention_item(uuid)")!
        .new;
    expect(actual).toContain("capture_owned_legacy_ai_usage");
  });
  it("includes retained original-month unlinked usage in the real shared reader", () => {
    expect(
      candidate || retirement.split("$retirement_usage$")[1] || retirement,
    ).toContain("owned_legacy_ai_usage_retirements");
  });
  it("preserves old arbitrary-since run usage and casts each integer before addition", () => {
    const actual =
      candidate ||
      legacy.slice(
        legacy.indexOf(
          "create function public.get_organization_ai_tokens_used",
        ),
        legacy.indexOf("create function public.persist_qualitative_analysis"),
      );
    expect(actual).toContain("input_tokens::numeric");
    expect(actual).toContain("output_tokens::numeric");
  });
});

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const block = (s: string, n: string) => s.split(`$${n}$`)[1];
type Patch = {
  signature: string;
  before: string;
  after: string;
  old: string;
  new: string;
};
const patches = JSON.parse(block(candidate, "usage_patches")) as Patch[];
function body(n: string) {
  const p = patches.find((p) => p.signature.split("(")[0] === n);
  if (p) return p.new;
  const start = candidate.indexOf(`create function ${n}(`);
  const m = /\bas\s+(\$[A-Za-z0-9_]+\$)([\s\S]*?)\1;/u.exec(
    candidate.slice(start),
  );
  if (start < 0 || !m) throw Error("ACTUAL_SOURCE_BODY");
  return m[2];
}
const pinRows = JSON.parse(
  block(body("private.owned_legacy_ai_usage_ready"), "legacy_functions"),
) as Array<{
  signature: string;
  sha256: string;
  acl: string;
  setof: boolean;
  resultType: string;
}>;
describe("actual original-month capture/readers/closure, not Native execution", () => {
  it("binds actual eight pre/postimages and all new source pins to current profiles", () => {
    expect(patches).toHaveLength(8);
    for (const p of patches) {
      expect(hash(p.old)).toBe(p.before);
      expect(hash(p.new)).toBe(p.after);
    }
    expect(pinRows).toHaveLength(29);
    for (const p of pinRows) {
      const n = p.signature.split("(")[0];
      if (
        patches.some((x) => x.signature === p.signature) ||
        candidate.includes(`create function ${n}(`)
      )
        expect(hash(body(n))).toBe(p.sha256);
    }
    for (const [n, pin] of [
      [
        "private.owned_legacy_ai_usage_ready",
        OWNED_LEGACY_AI_USAGE_PROFILE.checkerSha256,
      ],
      [
        "private.capture_owned_legacy_ai_usage",
        OWNED_LEGACY_AI_USAGE_PROFILE.captureSha256,
      ],
      [
        "public.export_owned_legacy_ai_usage_records",
        OWNED_LEGACY_AI_USAGE_PROFILE.exportSha256,
      ],
      [
        "public.read_owned_legacy_ai_usage_readiness",
        OWNED_LEGACY_AI_USAGE_PROFILE.metadataSha256,
      ],
      [
        "private.initial_feedback_ready",
        INITIAL_FEEDBACK_PROFILE.checkerSha256,
      ],
      [
        "public.read_initial_feedback_usage",
        INITIAL_FEEDBACK_PROFILE.usageSha256,
      ],
      [
        "private.owned_ai_retirement_ready",
        OWNED_AI_RETIREMENT_PROFILE.checkerSha256,
      ],
      [
        "private.ai_budget_source_ready",
        AI_BUDGET_SOURCE_PROFILE.checkerSha256,
      ],
      [
        "private.owned_ai_disposition_ready",
        OWNED_AI_DISPOSITION_PROFILE.checkerSha256,
      ],
    ])
      expect(hash(body(n))).toBe(pin);
  });
  it("copies the actual global all-month link partition and changes only its output class labels", () => {
    const prior = patches.find(
      (p) => p.signature === "public.read_initial_feedback_usage(uuid,uuid)",
    )!.old;
    let expected = prior
      .slice(
        prior.indexOf("  with canonical_scope as materialized ("),
        prior.indexOf("  ), legacy as (") + 4,
      )
      .slice(0, -1)
      .replaceAll("a.organization_id", "p_org");
    expected = expected
      .replace(
        "select r.id run_id,coalesce(",
        "select r.id run_id,'a12_linked'::text classification,coalesce(",
      )
      .replace(
        "select p.run_id,coalesce(",
        "select p.run_id,'a13_linked'::text,coalesce(",
      );
    expect(
      body("private.owned_legacy_ai_usage_links").split(
        "\n select l.run_id",
      )[0],
    ).toBe("\n" + expected);
    expect(expected).not.toContain("period_start");
    expect(expected).not.toContain("period_end");
    expect(body("private.owned_legacy_ai_usage_links")).toContain(
      "union all select null::uuid,null::text,i.valid",
    );
    expect(
      pinRows.find(
        (p) => p.signature === "private.owned_legacy_ai_usage_links(uuid)",
      )?.setof,
    ).toBe(true);
  });
  it("hooks account erasure and final covered root erasure before publication/raw deletion", () => {
    const account = body("public.prepare_deletion_request"),
      complete = body("public.complete_retention_item");
    for (const s of [account, complete]) {
      expect(s.indexOf("private.capture_owned_legacy_ai_usage")).toBeLessThan(
        s.indexOf("private.retire_initial_feedback_publications"),
      );
    }
    expect(
      account.indexOf("private.capture_owned_legacy_ai_usage"),
    ).toBeLessThan(account.indexOf("delete from public.analyses"));
    expect(complete.indexOf("private.r17_root_covered")).toBeLessThan(
      complete.indexOf("private.capture_owned_legacy_ai_usage"),
    );
    expect(
      complete.indexOf("selected.status='deleted' then return true"),
    ).toBeLessThan(complete.indexOf("private.capture_owned_legacy_ai_usage"));
    expect(
      complete.indexOf("private.capture_owned_legacy_ai_usage"),
    ).toBeLessThan(complete.indexOf("delete from public.resumes"));
  });
  it("enumerates the real cascade before owner validation and blocks late FK inserts with parent/run UPDATE locks", () => {
    const scope = body("private.owned_legacy_ai_usage_analysis_scope"),
      capture = body("private.capture_owned_legacy_ai_usage");
    expect(scope).toContain("a.owner_id=p_owner or exists");
    expect(scope).toContain("r.owner_id=p_owner");
    expect(scope).not.toContain("and a.owner_id=p_owner and");
    for (const name of ["r", "v", "a"])
      expect(capture).toContain(`for update of ${name} skip locked`);
    expect(capture).toContain(
      "x.owner_id,x.analysis_owner,x.version_owner,x.root_owner",
    );
    expect(capture).toContain("locked<>expected");
    expect(capture).not.toContain("declare root public.resumes%rowtype");
    expect(capture).toContain("declare locked_root public.resumes%rowtype");
    expect(capture).not.toContain("limit 4096");
    expect(capture).not.toContain("limit 1000");
    expect(capture.indexOf("private.try_lock_candidate_owners")).toBeLessThan(
      capture.indexOf("for locked_root in"),
    );
  });
  it("deduplicates actual run IDs and compares every immutable source/counter/class/clock field", () => {
    const c = body("private.capture_owned_legacy_ai_usage");
    expect(c).toContain("where run_id=x.id for update skip locked");
    expect(c).toContain(
      "prior.run_created_at,prior.original_month,prior.input_tokens,prior.output_tokens",
    );
    expect(c).toContain(
      "prior.classification,prior.first_cause,prior.deletion_request_id,prior.retention_item_id,prior.prepared_at,prior.expires_at",
    );
    expect(c).toContain("is distinct from (p_owner,x.organization_id");
    expect(c).not.toContain("on conflict");
    expect(c).not.toContain("input_hash");
    expect(candidate).toContain("run_id uuid primary key");
  });
  it("preserves the first actual root/account clock while allowing legitimate later run creation", () => {
    const c = body("private.capture_owned_legacy_ai_usage");
    expect(c).toContain("order by t.created_at,t.id limit 1");
    expect(c).toContain("first_at:=account_row.prepared_at");
    expect(c).toContain("root_clock.created_at<first_at");
    expect(c).toContain("OWNED_LEGACY_AI_USAGE_CLOCK_REPAIR");
    expect(c).toContain("x.root_status='deleted' and root_clock.id is null");
    expect(
      c.indexOf("x.root_status='deleted' and root_clock.id is null"),
    ).toBeLessThan(c.indexOf("first_at:=account_row.prepared_at"));
    expect(c).toContain(
      "root_clock.id is not null and not isfinite(root_clock.created_at)",
    );
    expect(c.indexOf("not isfinite(root_clock.created_at)")).toBeLessThan(
      c.indexOf("first_at:=account_row.prepared_at"),
    );
    expect(c).not.toContain("first_at:=clock_timestamp");
    expect(c).not.toMatch(/x\.created_at\s*(?:<=|<)\s*first_at/u);
    expect(body("private.owned_legacy_ai_usage_row_valid")).toContain(
      "a.first_request_id,a.prepared_at",
    );
  });
  it("rejects live/retained drift before organization/month/since exclusions", () => {
    const valid = body("private.owned_legacy_ai_usage_row_valid"),
      check = body("private.assert_owned_legacy_ai_usage");
    expect(check).toContain("x.organization_id=p_org\n  or exists");
    expect(check).toContain("r.id=x.run_id and r.organization_id=p_org");
    expect(check).not.toContain("p_since");
    expect(check).not.toContain("original_month");
    expect(valid).toContain(
      "r.created_at,r.input_tokens::numeric,r.output_tokens::numeric",
    );
    expect(valid).toContain(
      "is distinct from (t.owner_id,t.organization_id,t.analysis_id,t.run_created_at,t.input_tokens,t.output_tokens)",
    );
  });
  it("proves surviving typed usage after raw/A13 publication erasure instead of dropping linked charges", () => {
    const v = body("private.owned_legacy_ai_usage_row_valid");
    expect(v).toContain(
      "private.initial_feedback_content_retirements s join private.initial_feedback_operations o",
    );
    expect(v).toContain(
      "s.publication_id=o.publication_id and s.binding_sha256=o.binding_sha256",
    );
    expect(v).toContain("a.state='published'");
    expect(v).toContain(
      "c.run_id,c.owner_id,c.organization_id,c.analysis_id,c.source_id",
    );
    expect(v).toContain("c.claimed_at is not null");
    expect(v).toContain("(c.usage->>'inputTokens')::numeric=t.input_tokens");
    expect(v).toContain("(a.usage->>'outputTokens')::numeric=t.output_tokens");
    expect(v).toContain(
      "private.initial_feedback_content_retirements s where s.run_id=t.run_id",
    );
  });
  it("counts only retained unlinked original-month rows in the unchanged shared thirteen-field wire", () => {
    const s = body("public.read_initial_feedback_usage");
    expect(s).toContain(
      "t.classification='legacy_unlinked' and t.original_month=period_start",
    );
    expect(s).toContain(
      "not exists(select 1 from public.analysis_ai_runs r where r.id=t.run_id)",
    );
    expect(s).toContain("canonical.unknown_count+feedback.unknown_count");
    expect(s).toContain("canonical.tokens,feedback.tokens");
    expect(s).toContain("with preserved_integrity as materialized");
    expect(s).toContain(
      "cross join preserved_integrity where preserved_integrity.proved",
    );
    expect(s).not.toContain(
      "perform private.assert_owned_legacy_ai_usage(a.organization_id)",
    );
  });
  it("keeps legacy all-class arbitrary-since semantics and casts individually before addition", () => {
    const p = body("private.read_preserved_organization_ai_tokens");
    expect(p).toContain("r.created_at>=p_since");
    expect(p).toContain("t.run_created_at>=p_since");
    expect(p).not.toContain("classification='legacy_unlinked'");
    expect(p).toContain("r.input_tokens::numeric+r.output_tokens::numeric");
    expect(p).toContain("t.input_tokens::numeric+t.output_tokens::numeric");
    expect(p).toContain("total>9223372036854775807");
    expect(p).toContain("p_since is null or not isfinite(p_since)");
    expect(body("public.get_organization_ai_tokens_used")).toContain(
      "private.read_preserved_organization_ai_tokens",
    );
  });
  it("never turns due personal rows into quota refunds in a 31-day month", () => {
    const p = body("private.assert_owned_legacy_ai_usage_month");
    expect(p).toContain("least(t.expires_at,a.expires_at)<=clock_timestamp()");
    expect(p).toContain("raise exception 'OWNED_LEGACY_AI_USAGE_UNAVAILABLE'");
    const l = body("private.read_preserved_organization_ai_tokens");
    expect(l).toContain("least(t.expires_at,a.expires_at)<=clock_timestamp()");
    expect(l).not.toMatch(/expires_at\s*>\s*clock_timestamp/u);
    const prepared = Date.UTC(2026, 0, 1),
      expiry = prepared + 720 * 3600000,
      end = Date.UTC(2026, 1, 1);
    expect(expiry).toBeLessThan(end);
  });
  it("keeps private immutable personal metadata, exact source counter schema and a one-time closed catalogue seal", () => {
    expect(candidate).toContain(
      "revoke all on private.owned_legacy_ai_usage_retirements from public,anon,authenticated,service_role",
    );
    expect(candidate).toContain(
      "before insert or update or delete on private.owned_legacy_ai_usage_retirements",
    );
    expect(body("private.owned_legacy_ai_usage_guard")).toContain(
      "tg_op<>'INSERT'",
    );
    const check = body("private.owned_legacy_ai_usage_ready");
    expect(check).toContain("a.atttypid='integer'::regtype and a.attnotnull");
    expect(check).toContain("column_name||'>=0'");
    expect(check).toContain("k.confdeltype='c'");
    expect(check).toContain("g.tgenabled<>'O'");
    expect(
      candidate.match(
        /insert into private.owned_legacy_ai_usage_catalogue_seal/g,
      ),
    ).toHaveLength(1);
    expect(candidate).not.toContain(
      "update private.owned_ai_disposition_catalogue_seal",
    );
    expect(body("private.owned_legacy_ai_usage_catalogue")).toContain(
      "c.relname='owned_legacy_ai_usage_catalogue_seal' and t.tgname='owned_legacy_ai_usage_seal_closed'",
    );
  });
  it("exports complete old-period owner data with exact clocks and independently denied data capability", () => {
    const e = body("public.export_owned_legacy_ai_usage_records"),
      m = body("public.read_owned_legacy_ai_usage_readiness");
    expect(e).toContain("where owner_id=p_user_id order by run_id limit 4097");
    expect(e).toContain("if n>4096");
    expect(e).toContain("bytes>33554432");
    expect(e).not.toContain("original_month=period_start");
    for (const key of [
      "runId",
      "ownerId",
      "organizationId",
      "analysisId",
      "resumeId",
      "resumeVersionId",
      "runCreatedAt",
      "originalMonth",
      "inputTokens",
      "outputTokens",
      "classification",
      "firstCause",
      "deletionRequestId",
      "retentionItemId",
      "preparedAt",
      "expiresAt",
      "effectiveExpiresAt",
    ])
      expect(e).toContain(`'${key}'`);
    expect(e).toContain(
      "private.ifo_stamp(least(retired_row.expires_at,account_expiry))",
    );
    expect(m).not.toContain("captureExecutable");
    expect(Object.keys(OWNED_LEGACY_AI_USAGE_PROFILE)).toHaveLength(6);
    expect(candidate).not.toContain(
      "grant execute on function public.export_owned_legacy_ai_usage_records",
    );
  });
});

it("binds mandatory-budget current profiles while retaining all prior source assertions", () => {
  const terminal = JSON.parse(
    read(
      "supabase/migrations/20261115182650_mandatory_ai_budget_dispatch.sql",
    ).split("$budget_required_patches$")[1],
  ) as Array<{
    signature: string;
    old: string;
    new: string;
    before: string;
    after: string;
  }>;
  expect(terminal).toHaveLength(9);
  for (const p of terminal) {
    expect(createHash("sha256").update(p.old).digest("hex")).toBe(p.before);
    expect(createHash("sha256").update(p.new).digest("hex")).toBe(p.after);
  }
  for (const [key, value] of Object.entries(OWNED_LEGACY_AI_USAGE_PROFILE)) {
    const successor = terminal.find((p) => p.before === value);
    expect(
      (
        MANDATORY_BUDGET_OWNED_LEGACY_AI_USAGE_PROFILE as Record<string, string>
      )[key],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(INITIAL_FEEDBACK_PROFILE)) {
    const successor = terminal.find((p) => p.before === value);
    expect(
      (MANDATORY_BUDGET_INITIAL_FEEDBACK_PROFILE as Record<string, string>)[
        key
      ],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(OWNED_AI_RETIREMENT_PROFILE)) {
    const successor = terminal.find((p) => p.before === value);
    expect(
      (MANDATORY_BUDGET_OWNED_AI_RETIREMENT_PROFILE as Record<string, string>)[
        key
      ],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(AI_BUDGET_SOURCE_PROFILE)) {
    const successor = terminal.find((p) => p.before === value);
    expect(
      (MANDATORY_BUDGET_AI_BUDGET_SOURCE_PROFILE as Record<string, string>)[
        key
      ],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(OWNED_AI_DISPOSITION_PROFILE)) {
    const successor = terminal.find((p) => p.before === value);
    expect(
      (MANDATORY_BUDGET_OWNED_AI_DISPOSITION_PROFILE as Record<string, string>)[
        key
      ],
    ).toBe(successor ? successor.after : value);
  }
});

// Historical source assertions read the pre-expiry profile view; live successor exports are tied below.
function read(file: string) {
  let value = preExpiryRead(file);
  if (file.startsWith("app/lib/server/") && file.endsWith("-profile.ts")) {
    const expiry = JSON.parse(
      readFileSync(
        new URL(
          "../../supabase/migrations/20261115190341_owned_ai_expiry_fold.sql",
          import.meta.url,
        ),
        "utf8",
      ).split("$expiry_patches$")[1],
    ) as Array<{ before: string; after: string }>;
    for (const p of [...expiry].reverse())
      value = value.replaceAll(p.after, p.before);
  }
  return value;
}

it("binds atomic-expiry successors while retaining all historical Source assertions", () => {
  const rows = JSON.parse(
    readFileSync(
      new URL(
        "../../supabase/migrations/20261115190341_owned_ai_expiry_fold.sql",
        import.meta.url,
      ),
      "utf8",
    ).split("$expiry_patches$")[1],
  ) as Array<{
    signature: string;
    old: string;
    new: string;
    before: string;
    after: string;
  }>;
  expect(rows).toHaveLength(24);
  for (const p of rows) {
    expect(createHash("sha256").update(p.old).digest("hex")).toBe(p.before);
    expect(createHash("sha256").update(p.new).digest("hex")).toBe(p.after);
  }
  for (const [key, value] of Object.entries(
    MANDATORY_BUDGET_OWNED_LEGACY_AI_USAGE_PROFILE,
  )) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (
        EXPIRY_CURRENT_MANDATORY_BUDGET_OWNED_LEGACY_AI_USAGE_PROFILE as Record<
          string,
          string
        >
      )[key],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(
    MANDATORY_BUDGET_INITIAL_FEEDBACK_PROFILE,
  )) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (
        EXPIRY_CURRENT_MANDATORY_BUDGET_INITIAL_FEEDBACK_PROFILE as Record<
          string,
          string
        >
      )[key],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(
    MANDATORY_BUDGET_OWNED_AI_RETIREMENT_PROFILE,
  )) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (
        EXPIRY_CURRENT_MANDATORY_BUDGET_OWNED_AI_RETIREMENT_PROFILE as Record<
          string,
          string
        >
      )[key],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(
    MANDATORY_BUDGET_AI_BUDGET_SOURCE_PROFILE,
  )) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (
        EXPIRY_CURRENT_MANDATORY_BUDGET_AI_BUDGET_SOURCE_PROFILE as Record<
          string,
          string
        >
      )[key],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(
    MANDATORY_BUDGET_OWNED_AI_DISPOSITION_PROFILE,
  )) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (
        EXPIRY_CURRENT_MANDATORY_BUDGET_OWNED_AI_DISPOSITION_PROFILE as Record<
          string,
          string
        >
      )[key],
    ).toBe(successor ? successor.after : value);
  }
});

// Apply the newest explicit historical cutoff before older fixture readers invert their own successors.
function readFileSync(input: URL | string, encoding: "utf8"): string {
  let value = generationReadFileSync(input, encoding);
  if (
    String(input).includes("/app/lib/server/") &&
    String(input).endsWith("-profile.ts")
  ) {
    const rows = JSON.parse(
      generationReadFileSync(
        new URL(
          "../../supabase/migrations/20261116075250_privacy_export_generation.sql",
          import.meta.url,
        ),
        "utf8",
      ).split("$privacy_generation_patches$")[1],
    ) as Array<{ before: string; after: string }>;
    for (const row of [...rows].reverse())
      value = value.replaceAll(row.after, row.before);
  }
  return value;
}
it("binds live privacy-generation successors and preserves every historical assertion", () => {
  const rows = JSON.parse(
    generationReadFileSync(
      new URL(
        "../../supabase/migrations/20261116075250_privacy_export_generation.sql",
        import.meta.url,
      ),
      "utf8",
    ).split("$privacy_generation_patches$")[1],
  ) as Array<{
    signature: string;
    before: string;
    after: string;
    old: string;
    new: string;
  }>;
  expect(rows).toHaveLength(12);
  for (const p of rows) {
    expect(createHash("sha256").update(p.old).digest("hex")).toBe(p.before);
    expect(createHash("sha256").update(p.new).digest("hex")).toBe(p.after);
  }
  for (const [key, value] of Object.entries(
    EXPIRY_CURRENT_MANDATORY_BUDGET_OWNED_LEGACY_AI_USAGE_PROFILE,
  )) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (
        GENERATION_CURRENT_EXPIRY_CURRENT_MANDATORY_BUDGET_OWNED_LEGACY_AI_USAGE_PROFILE as Record<
          string,
          string
        >
      )[key],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(
    EXPIRY_CURRENT_MANDATORY_BUDGET_INITIAL_FEEDBACK_PROFILE,
  )) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (
        GENERATION_CURRENT_EXPIRY_CURRENT_MANDATORY_BUDGET_INITIAL_FEEDBACK_PROFILE as Record<
          string,
          string
        >
      )[key],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(
    EXPIRY_CURRENT_MANDATORY_BUDGET_OWNED_AI_RETIREMENT_PROFILE,
  )) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (
        GENERATION_CURRENT_EXPIRY_CURRENT_MANDATORY_BUDGET_OWNED_AI_RETIREMENT_PROFILE as Record<
          string,
          string
        >
      )[key],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(
    EXPIRY_CURRENT_MANDATORY_BUDGET_AI_BUDGET_SOURCE_PROFILE,
  )) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (
        GENERATION_CURRENT_EXPIRY_CURRENT_MANDATORY_BUDGET_AI_BUDGET_SOURCE_PROFILE as Record<
          string,
          string
        >
      )[key],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(
    EXPIRY_CURRENT_MANDATORY_BUDGET_OWNED_AI_DISPOSITION_PROFILE,
  )) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (
        GENERATION_CURRENT_EXPIRY_CURRENT_MANDATORY_BUDGET_OWNED_AI_DISPOSITION_PROFILE as Record<
          string,
          string
        >
      )[key],
    ).toBe(successor ? successor.after : value);
  }
});
