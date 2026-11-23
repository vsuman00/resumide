import { createHash } from "node:crypto";
import { readFileSync as generationReadFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { preRegroupProfileSource } from "../fixtures/pre-regroup-profile-source";
const preExpiryRead = (n: string) =>
  readFileSync(new URL(`../../${n}`, import.meta.url), "utf8");
const candidate = read(
  "supabase/migrations/20261115182650_mandatory_ai_budget_dispatch.sql",
);
type Patch = {
  signature: string;
  before: string;
  after: string;
  old: string;
  new: string;
};
const prior = JSON.parse(
  read(
    "supabase/migrations/20261115162257_ai_budget_all_caller_sources.sql",
  ).split("$callers_patches$")[1],
) as Patch[];
const patches = candidate
  ? (JSON.parse(candidate.split("$budget_required_patches$")[1]) as Patch[])
  : prior;
const body = (name: string) =>
  patches.find((p) => p.signature.split("(")[0] === name)!.new;
describe("actual predecessor null-budget dispatch regressions, Native unexecuted", () => {
  it("refuses SQL/JSON null A12 budget immediately after no-dispatch replay", () => {
    expect(body("public.claim_canonical_rewrite_dispatch")).toContain(
      "end if;\n  if p_budget is null or p_budget='null'::jsonb then perform private.correction_fail('unavailable');end if;\n  if private.canonical_rewrite_ready()",
    );
  });
  it("refuses absent stored A13 technical policy or SQL/JSON null budget after replay", () => {
    expect(body("public.claim_initial_feedback_dispatch")).toContain(
      "end if;\n  if (op.binding->'policy'->>'budgetPolicyVersion') is null or p_budget is null or p_budget='null'::jsonb then perform private.ifo_fail('unavailable');end if;\n  if a.status<>'qualitative_review'",
    );
  });
});

import { CANONICAL_REWRITE_READINESS_PROFILE as EXPIRY_CURRENT_CANONICAL_REWRITE_READINESS_PROFILE } from "../../app/lib/server/canonical-rewrite-readiness-profile";

import { CANONICAL_REWRITE_WORKSPACE_PROFILE as EXPIRY_CURRENT_CANONICAL_REWRITE_WORKSPACE_PROFILE } from "../../app/lib/server/canonical-rewrite-workspace-profile";

import { INITIAL_FEEDBACK_OPERATION_PROFILE as EXPIRY_CURRENT_INITIAL_FEEDBACK_OPERATION_PROFILE } from "../../app/lib/server/initial-feedback-operation-profile";

import {
  INITIAL_FEEDBACK_PROFILE as GENERATION_CURRENT_EXPIRY_CURRENT_INITIAL_FEEDBACK_PROFILE,
  OWNED_AI_RETIREMENT_PROFILE as GENERATION_CURRENT_EXPIRY_CURRENT_OWNED_AI_RETIREMENT_PROFILE,
} from "../../app/lib/server/initial-feedback-profile";

import { OWNED_LEGACY_AI_USAGE_PROFILE as GENERATION_CURRENT_EXPIRY_CURRENT_OWNED_LEGACY_AI_USAGE_PROFILE } from "../../app/lib/server/owned-legacy-ai-usage-profile";

import { AI_BUDGET_SOURCE_PROFILE as GENERATION_CURRENT_EXPIRY_CURRENT_AI_BUDGET_SOURCE_PROFILE } from "../../app/lib/server/ai-budget-source-profile";

import { OWNED_AI_DISPOSITION_PROFILE as GENERATION_CURRENT_EXPIRY_CURRENT_OWNED_AI_DISPOSITION_PROFILE } from "../../app/lib/server/owned-ai-disposition-profile";
// Freeze immediate predecessor imports; all previous assertions remain exact.
const EXPIRY_CURRENT_INITIAL_FEEDBACK_PROFILE = Object.freeze({
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
const EXPIRY_CURRENT_OWNED_AI_RETIREMENT_PROFILE = Object.freeze({
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
const EXPIRY_CURRENT_OWNED_LEGACY_AI_USAGE_PROFILE = Object.freeze({
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
const EXPIRY_CURRENT_AI_BUDGET_SOURCE_PROFILE = Object.freeze({
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
const EXPIRY_CURRENT_OWNED_AI_DISPOSITION_PROFILE = Object.freeze({
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
const CANONICAL_REWRITE_READINESS_PROFILE = Object.freeze({
  schemaVersion: "canonical-rewrite-readiness/1.0.0",
  profileVersion: "canonical-rewrite-readiness-profile/1.0.1",
  checkerSha256:
    "b8f2c321599054fc5a05bdccdd15ebd8b3bd3bbdc8e7cf233c99cc01b205ffed",
  readerSha256:
    "fbe6a2167174a33a8fe9541a781623e595444206d0fe121971b87f1b14089707",
  prepareSha256:
    "3ba48ee775c9ce62aa3df976d2011b6cc202acd16c62dd60abe4e36c9f65aef9",
  claimSha256:
    "08c3eedd3979e2a3287d5ab8dac9da876daa7c18ad5fdd848661c54949f1aa66",
  finishSha256:
    "cb7a256fbacd55d494fb72196308e6c06e8c7faabb40c18a9ea2bba97a3c5828",
  settleSha256:
    "7bf6d0a1fc731d650716c7ce3ccd204d5529f74cc12e69d0c830b1ac4a69ed28",
  usageSha256:
    "e58366ed4afd20b587a6d133fd3ad397c139d327fc060fbc0b040b857069f7ca",
} as const);
const CANONICAL_REWRITE_WORKSPACE_PROFILE = Object.freeze({
  schemaVersion: "canonical-rewrite-workspace-readiness/1.0.0",
  profileVersion: "canonical-rewrite-workspace-profile/1.0.0",
  checkerSha256:
    "bebf3463501e80ef81bf3cdd0bc95a9c263e5354f3fb38fdd8cac9589e098a4e",
  readerSha256:
    "c4d92e2e4e9cf666ce2ccb3ced23c61873d2f974fd61303d9f0828331a5537e3",
  initializerSha256:
    "07f71d4063e15301fe797a3eab876a6223a66350c6fa334295c9369accdf7f75",
  metadataSha256:
    "f05e249fed5e0f7852a198935780a05324505abaf182b0b6a2f22a6c3b95ccb3",
} as const);
const INITIAL_FEEDBACK_OPERATION_PROFILE = Object.freeze({
  schemaVersion: "initial-feedback-operation-readiness/1.0.0",
  profileVersion: "initial-feedback-operation-profile/1.0.0",
  checkerSha256:
    "906f829eaa3b72c08ea64e4bf848d176118b10cbd7560c9517f5e415fde36579",
  prepareSha256:
    "93b7af8445710cd105e2da67eb27f7d9b8d9c52cd7ec924a6ab6f6aa69548f92",
  claimSha256:
    "f7b45e9f59df53aa5324c6a62b2d800201c2d27b29eac5f76b3bc5a59c3f50a5",
  settleSha256:
    "739919dedaa5080c4bb8f3c556a9f9b1528fb88747edef9764588bd9038d4148",
  metadataSha256:
    "8b38d923165d34fab6a4462cf9940a0447e501cc74ec657b93efc569953fe5e7",
});
const INITIAL_FEEDBACK_PROFILE = Object.freeze({
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
const OWNED_LEGACY_AI_USAGE_PROFILE = Object.freeze({
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
const AI_BUDGET_SOURCE_PROFILE = Object.freeze({
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
const OWNED_AI_DISPOSITION_PROFILE = Object.freeze({
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

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const changed = new Map(patches.map((p) => [p.signature.split("(")[0], p]));
const guards = [
  "  if p_budget is null or p_budget='null'::jsonb then perform private.correction_fail('unavailable');end if;\n",
  "  if (op.binding->'policy'->>'budgetPolicyVersion') is null or p_budget is null or p_budget='null'::jsonb then perform private.ifo_fail('unavailable');end if;\n",
];
describe("exact forward mandatory-budget closure, Source evidence only", () => {
  it("changes exactly two claim bodies and seven checker bodies with guarded pre/postimages", () => {
    expect(patches).toHaveLength(9);
    expect(new Set(patches.map((p) => p.signature)).size).toBe(9);
    for (const p of patches) {
      expect(hash(p.old)).toBe(p.before);
      expect(hash(p.new)).toBe(p.after);
    }
    expect(candidate).toContain("p.prosrc is distinct from item->>'old'");
    expect(candidate).toContain(
      "statements:=array_append(statements,replace(source,p.prosrc,item->>'new'))",
    );
    expect(candidate).toContain("MANDATORY_AI_BUDGET_POSTIMAGE_DRIFT");
  });
  it.each([
    ["public.claim_canonical_rewrite_dispatch", 0],
    ["public.claim_initial_feedback_dispatch", 1],
  ] as const)(
    "preserves every predecessor byte except its mandatory guard: %s",
    (name, index) => {
      const p = changed.get(name)!;
      expect(p.new.split(guards[index])).toHaveLength(2);
      expect(p.new.replace(guards[index], "")).toBe(p.old);
      expect(p.old).toBe(prior.find((x) => x.signature === p.signature)!.new);
      const replay = p.new.indexOf(
        name.includes("canonical")
          ? "if op.state<>'reserved'"
          : "if op.state<>'open'",
      );
      expect(replay).toBeLessThan(p.new.indexOf(guards[index]));
      expect(p.new.indexOf(guards[index])).toBeLessThan(
        p.new.indexOf("budget:=private.ai_budget_transition"),
      );
    },
  );
  it("renews checker digests only, preserving all other bytes/ACL/catalogue checks", () => {
    for (const p of patches.slice(2)) {
      let restored = p.new;
      for (const dep of [...patches].reverse())
        restored = restored.replaceAll(dep.after, dep.before);
      expect(restored).toBe(p.old);
    }
  });
  it("leaves table seals, permissions, prices and policy schemas unchanged", () => {
    expect(candidate).not.toMatch(
      /(?:create|alter|drop)\s+(?:table|trigger|policy)|(?:grant|revoke)\s/iu,
    );
    expect(
      patches.every(
        (p) =>
          !/(?:settle|finish|publish|outcome|policy_valid|transition|prepare)/u.test(
            p.signature,
          ),
      ),
    ).toBe(true);
    expect(body("public.claim_initial_feedback_dispatch")).toContain(
      "op.binding->'policy'->>'budgetPolicyVersion'",
    );
    expect(body("public.claim_canonical_rewrite_dispatch")).not.toContain(
      "budgetPolicyVersion",
    );
  });
  it("preserves all seven profile preimages except actual successor body pins", () => {
    const predecessors = {
      "app/lib/server/canonical-rewrite-readiness-profile.ts":
        "f6f9e1b12f02c9b24890ea6c90f1634a30ed4cbf7d3ede637c4722ea7f9fc54a",
      "app/lib/server/canonical-rewrite-workspace-profile.ts":
        "c5f6655a1d668b45af2f9142c13b6c9fe912e7947ce91e81da3f53bd65c3c23c",
      "app/lib/server/initial-feedback-operation-profile.ts":
        "4b2d8c7e1e3639b175f75bb6be62659cf1370a85860cd830e0b6d522b2546469",
      "app/lib/server/initial-feedback-profile.ts":
        "a7ced570ef5341cefdb67b42ce83fee844b9d6150b141469c639f64fc80fae55",
      "app/lib/server/owned-legacy-ai-usage-profile.ts":
        "837172b4f944bf374cc695d2b2dfb99e8fe845d4446e79e34a2be0bddf00da8c",
      "app/lib/server/ai-budget-source-profile.ts":
        "b2de20c04cddb06349f086912a6517a9da32b8f66e4090537013661319a19328",
      "app/lib/server/owned-ai-disposition-profile.ts":
        "d3af45bf0637475066edf69bbf8926852577cceb7ced9b8bd2d2dba60f3d21ad",
    };
    for (const [file, pin] of Object.entries(predecessors)) {
      let restored = preRegroupProfileSource(file, read(file));
      for (const p of [...patches].reverse())
        restored = restored.replaceAll(p.after, p.before);
      expect(hash(restored)).toBe(pin);
    }
    const bindings = [
      [CANONICAL_REWRITE_READINESS_PROFILE, "private.canonical_rewrite_ready"],
      [
        CANONICAL_REWRITE_WORKSPACE_PROFILE,
        "private.canonical_rewrite_workspace_ready",
      ],
      [
        INITIAL_FEEDBACK_OPERATION_PROFILE,
        "private.initial_feedback_operation_ready",
      ],
      [INITIAL_FEEDBACK_PROFILE, "private.initial_feedback_ready"],
      [OWNED_LEGACY_AI_USAGE_PROFILE, "private.owned_legacy_ai_usage_ready"],
      [AI_BUDGET_SOURCE_PROFILE, "private.ai_budget_source_ready"],
      [OWNED_AI_DISPOSITION_PROFILE, "private.owned_ai_disposition_ready"],
    ] as const;
    for (const [profile, name] of bindings)
      expect(profile.checkerSha256).toBe(hash(body(name)));
    expect(CANONICAL_REWRITE_READINESS_PROFILE.claimSha256).toBe(
      hash(body("public.claim_canonical_rewrite_dispatch")),
    );
    expect(INITIAL_FEEDBACK_OPERATION_PROFILE.claimSha256).toBe(
      hash(body("public.claim_initial_feedback_dispatch")),
    );
    expect(INITIAL_FEEDBACK_PROFILE.claimSha256).toBe(
      hash(body("public.claim_initial_feedback_dispatch")),
    );
    expect(OWNED_AI_RETIREMENT_PROFILE.checkerSha256).toBe(
      "a0b6290511973757a983b793f249c8ef1225091eaac5a118847a7e4bb53d0694",
    );
  });
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
    CANONICAL_REWRITE_READINESS_PROFILE,
  )) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (
        EXPIRY_CURRENT_CANONICAL_REWRITE_READINESS_PROFILE as Record<
          string,
          string
        >
      )[key],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(
    CANONICAL_REWRITE_WORKSPACE_PROFILE,
  )) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (
        EXPIRY_CURRENT_CANONICAL_REWRITE_WORKSPACE_PROFILE as Record<
          string,
          string
        >
      )[key],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(
    INITIAL_FEEDBACK_OPERATION_PROFILE,
  )) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (
        EXPIRY_CURRENT_INITIAL_FEEDBACK_OPERATION_PROFILE as Record<
          string,
          string
        >
      )[key],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(INITIAL_FEEDBACK_PROFILE)) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (EXPIRY_CURRENT_INITIAL_FEEDBACK_PROFILE as Record<string, string>)[key],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(OWNED_AI_RETIREMENT_PROFILE)) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (EXPIRY_CURRENT_OWNED_AI_RETIREMENT_PROFILE as Record<string, string>)[
        key
      ],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(OWNED_LEGACY_AI_USAGE_PROFILE)) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (EXPIRY_CURRENT_OWNED_LEGACY_AI_USAGE_PROFILE as Record<string, string>)[
        key
      ],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(AI_BUDGET_SOURCE_PROFILE)) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (EXPIRY_CURRENT_AI_BUDGET_SOURCE_PROFILE as Record<string, string>)[key],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(OWNED_AI_DISPOSITION_PROFILE)) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (EXPIRY_CURRENT_OWNED_AI_DISPOSITION_PROFILE as Record<string, string>)[
        key
      ],
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
    EXPIRY_CURRENT_INITIAL_FEEDBACK_PROFILE,
  )) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (
        GENERATION_CURRENT_EXPIRY_CURRENT_INITIAL_FEEDBACK_PROFILE as Record<
          string,
          string
        >
      )[key],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(
    EXPIRY_CURRENT_OWNED_AI_RETIREMENT_PROFILE,
  )) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (
        GENERATION_CURRENT_EXPIRY_CURRENT_OWNED_AI_RETIREMENT_PROFILE as Record<
          string,
          string
        >
      )[key],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(
    EXPIRY_CURRENT_OWNED_LEGACY_AI_USAGE_PROFILE,
  )) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (
        GENERATION_CURRENT_EXPIRY_CURRENT_OWNED_LEGACY_AI_USAGE_PROFILE as Record<
          string,
          string
        >
      )[key],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(
    EXPIRY_CURRENT_AI_BUDGET_SOURCE_PROFILE,
  )) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (
        GENERATION_CURRENT_EXPIRY_CURRENT_AI_BUDGET_SOURCE_PROFILE as Record<
          string,
          string
        >
      )[key],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(
    EXPIRY_CURRENT_OWNED_AI_DISPOSITION_PROFILE,
  )) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (
        GENERATION_CURRENT_EXPIRY_CURRENT_OWNED_AI_DISPOSITION_PROFILE as Record<
          string,
          string
        >
      )[key],
    ).toBe(successor ? successor.after : value);
  }
});
