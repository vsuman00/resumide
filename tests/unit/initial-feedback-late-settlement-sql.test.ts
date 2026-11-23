import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { INITIAL_FEEDBACK_OPERATION_PROFILE as EXPIRY_CURRENT_MANDATORY_BUDGET_ALL_CALLERS_currentOperationProfile } from "../../app/lib/server/initial-feedback-operation-profile";
// Frozen immediate predecessor imports; every earlier assertion/object remains unchanged.
const MANDATORY_BUDGET_ALL_CALLERS_currentOperationProfile = Object.freeze({
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

// Frozen immediate predecessor profiles; every earlier assertion remains unchanged.
const ALL_CALLERS_currentOperationProfile = Object.freeze({
  schemaVersion: "initial-feedback-operation-readiness/1.0.0",
  profileVersion: "initial-feedback-operation-profile/1.0.0",
  checkerSha256:
    "cfd7be13fbfc2f0a3770ddc02fe931b640d46a2449405fe77b58dd8ef67bd0a6",
  prepareSha256:
    "93b7af8445710cd105e2da67eb27f7d9b8d9c52cd7ec924a6ab6f6aa69548f92",
  claimSha256:
    "8d9ca0645d4457616d6a7fc947658fa89b3b7529042ba6f17f90f1cbc051012a",
  settleSha256:
    "739919dedaa5080c4bb8f3c556a9f9b1528fb88747edef9764588bd9038d4148",
  metadataSha256:
    "8b38d923165d34fab6a4462cf9940a0447e501cc74ec657b93efc569953fe5e7",
});

// Frozen late-settlement operation profile; all earlier golden assertions remain.
const currentOperationProfile = Object.freeze({
  schemaVersion: "initial-feedback-operation-readiness/1.0.0",
  profileVersion: "initial-feedback-operation-profile/1.0.0",
  checkerSha256:
    "2f5dc596054e962f56059afbe62c2b6bccacec60e845a0f1a493e121ca532fc0",
  prepareSha256:
    "93b7af8445710cd105e2da67eb27f7d9b8d9c52cd7ec924a6ab6f6aa69548f92",
  claimSha256:
    "335cef3a4e4f948b4c3b3c17ea9a3159368cab5df6e5a7a1389bc0f46759766a",
  settleSha256:
    "739919dedaa5080c4bb8f3c556a9f9b1528fb88747edef9764588bd9038d4148",
  metadataSha256:
    "8b38d923165d34fab6a4462cf9940a0447e501cc74ec657b93efc569953fe5e7",
});
const operationProfile = Object.freeze({
  ...currentOperationProfile,
  checkerSha256:
    "007ba402596474817e3584b4c3359e352f0fef2a1bce0ff878eb8bc0d164b0c5",
});
// Frozen95258 full-profile fixture; every original assertion remains unchanged.
const fullProfile = Object.freeze({
  schemaVersion: "initial-feedback-readiness/1.0.0",
  profileVersion: "initial-feedback-readiness-profile/1.0.0",
  checkerSha256:
    "2a25a380a70725c9fb0af2d8423913595cd61956d2c5308c39c3cc56709ea669",
  readerSha256:
    "57701a307d3087720642d9b4057eac87b770465e81726c000c5238708bcfc47b",
  prepareSha256:
    "93b7af8445710cd105e2da67eb27f7d9b8d9c52cd7ec924a6ab6f6aa69548f92",
  claimSha256:
    "335cef3a4e4f948b4c3b3c17ea9a3159368cab5df6e5a7a1389bc0f46759766a",
  settleSha256:
    "739919dedaa5080c4bb8f3c556a9f9b1528fb88747edef9764588bd9038d4148",
  finishSha256:
    "966cdb270ca5a4c1ab8fe6a6dd9097b5d46ebb2b2218f8047b794646cca315a8",
  usageSha256:
    "b242c0e264b0dfa5307f742a77e7a3cc0818bc9c18c88b946d9b27ee0a25889f",
  exportSha256:
    "eefd5842be1eb38fe1e0f17ea148f1708eae634c2a8fe42ab94467c9839fe0cd",
  metadataSha256:
    "2bafa1e30a02308604ad0114ab114189aef6e8323379e443ab7a96a64b2196d6",
});

// Textual source regression only. No SQL parser, execution or Native RED.
const preExpiryRead = (file: string) =>
  readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const original = read(
  "supabase/migrations/20261115081345_initial_feedback_publications.sql",
);
const forward = read(
  "supabase/migrations/20261115095258_initial_feedback_late_settlement.sql",
);
function bodyIn(text: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const matches = [
    ...text.matchAll(
      new RegExp(
        `create(?: or replace)? function ${escaped}\\([\\s\\S]*?\\)\\s*returns [\\s\\S]*?\\bas\\s+(\\$[A-Za-z0-9_]*\\$)([\\s\\S]*?)\\1;`,
        "gu",
      ),
    ),
  ];
  return matches.at(-1)?.[2];
}
const guard =
  bodyIn(forward, "private.ifo_attempt_guard") ??
  bodyIn(original, "private.ifo_attempt_guard");
if (!guard) throw new Error("Missing actual predecessor source.");
const branch = guard
  .split("if op.state='published' then")[1]
  ?.split("elsif old.state='reserved' then")[0];
describe("published late-known accounting source", () => {
  it("does not make exact terminal accounting depend on an erasable publication row", () => {
    expect(branch).toBeDefined();
    expect(branch).not.toContain("initial_feedback_publications");
    expect(branch).toContain("old.state='held_unknown' and old.usage is null");
    expect(branch).toContain("new.state='failed' and new.usage is not null");
    expect(branch).toContain("new.error_code=old.error_code");
  });
});

const hash = (s: string) =>
  createHash("sha256").update(s, "utf8").digest("hex");
const oldUsage = read("supabase/migrations/20261115082125_owned_ai_usage.sql");
const jsonTag = (tag: string) =>
  JSON.parse(forward.split(`$${tag}$`)[1]) as Array<{
    signature: string;
    sha256: string;
  }>;
const beforeFragment = `   -- A partial's unknown hold may learn actual usage after publication. It
   -- cannot change its terminal reason, acquire a dispatch, or alter content.
   if not exists(select 1 from private.initial_feedback_publications p where p.id=op.publication_id and p.state='deterministic_only')
    or not(old.state='held_unknown' and old.usage is null and old.error_code is not null and new.state='failed' and new.usage is not null
`;
const afterFragment = `   -- Candidate content may already have cascaded away. Exact immutable
   -- claimed metadata alone admits this first known fill, never a new dispatch.
   -- Identity-retention expiry is a separate, not-yet-adopted lifecycle.
   if not(old.state='held_unknown' and old.usage is null and old.error_code is not null and new.state='failed' and new.usage is not null
`;
describe("late-known forward source closure", () => {
  it("preserves9ffc/6bc/63dd source bytes and the publication profile", () => {
    expect(
      hash(
        read(
          "supabase/migrations/20261115072701_initial_feedback_operations.sql",
        ),
      ),
    ).toBe("9ffc4851feb8a43097c4d007b5a0730135bd51353ecd4cff7de66793d744e52c");
    expect(hash(original)).toBe(
      "6bc869e81b7d9a81447f3228496ba44bffdc3c783922063a6ddfe1b01130c62e",
    );
    expect(hash(oldUsage)).toBe(
      "63ddc8a43deba5e794feef0f6c0fefe73be524d6c75a60b70e67087ae82b44b1",
    );
    expect(
      hash(read("app/lib/server/initial-feedback-publication-profile.ts")),
    ).toBe("d1e59a0573979737cf4dbe4df75539cfda4dd0e6f58cfdd87b8f60319d3ed2a9");
  });
  it("changes only the erasable-row condition while retaining every old guard", () => {
    const old = bodyIn(original, "private.ifo_attempt_guard")!;
    expect(old).toContain(beforeFragment);
    expect(guard).toBe(old.replace(beforeFragment, afterFragment));
    for (const fixed of [
      "old.claimed_at is not null",
      "new.claimed_at,new.claim_lease,new.budget_attempt_id",
      "old.usage is not null and new.usage is distinct from old.usage",
      "old.error_code is not null and new.error_code is distinct from old.error_code",
      "op.state<>'open' or op.publication_id is not null",
      "old.state in ('published','cancelled_before_dispatch')",
    ])
      expect(guard).toContain(fixed);
  });
  it("changes only the exact guard hash in the operation source manifest", () => {
    const old = bodyIn(original, "private.initial_feedback_operation_ready")!;
    const next = bodyIn(forward, "private.initial_feedback_operation_ready")!;
    expect(next).toBe(
      old.replace(
        hash(bodyIn(original, "private.ifo_attempt_guard")!),
        hash(guard),
      ),
    );
    expect(hash(next)).toBe(operationProfile.checkerSha256);
  });
  it("changes only the exact operation checker hash in the full source manifest", () => {
    const old = bodyIn(oldUsage, "private.initial_feedback_ready")!;
    const next = bodyIn(forward, "private.initial_feedback_ready")!;
    expect(next).toBe(
      old.replace(
        hash(bodyIn(original, "private.initial_feedback_operation_ready")!),
        operationProfile.checkerSha256,
      ),
    );
    expect(hash(next)).toBe(fullProfile.checkerSha256);
    expect(fullProfile.readerSha256).toBe(
      hash(bodyIn(original, "public.read_initial_feedback")!),
    );
    expect(fullProfile.settleSha256).toBe(
      hash(bodyIn(original, "public.settle_initial_feedback_attempt")!),
    );
  });
  it("guards exact preimages/postimages and keeps all three private routines denied", () => {
    const pre = jsonTag("late_preimages"),
      post = jsonTag("late_postimages");
    expect(pre).toHaveLength(3);
    expect(post).toHaveLength(3);
    for (const entry of post) {
      expect(hash(bodyIn(forward, entry.signature.split("(")[0])!)).toBe(
        entry.sha256,
      );
      expect(forward).toContain(
        `revoke all on function ${entry.signature} from public,anon,authenticated,service_role;`,
      );
    }
    expect(forward).toContain("INITIAL_FEEDBACK_LATE_PREIMAGE_DRIFT");
    expect(forward).toContain("INITIAL_FEEDBACK_LATE_POSTIMAGE_DRIFT");
    expect(forward).not.toMatch(/\bgrant\s+execute/iu);
    expect(forward.match(/create or replace function/gu)).toHaveLength(3);
  });
  it("adds no storage/policy/admission path and leaves the usage-retirement defect separate", () => {
    expect(forward).not.toMatch(
      /\b(create table|alter table|insert into|delete from)\b/iu,
    );
    expect(forward).not.toContain("public.claim_initial_feedback_dispatch(p_");
    expect(forward).not.toContain(
      "create or replace function public.settle_initial_feedback_attempt",
    );
    expect(forward).toContain("This does NOT implement ADR0020 expiry");
    expect(oldUsage).toContain("o.publication_id is not null");
  });
  it("retains a real owner-scoped cascade/late-settlement verifier as explicitly unrun", () => {
    const verifier = read(
      "scripts/verify-initial-feedback-late-settlement.sql",
    );
    expect(verifier).toContain("PRIVILEGED MUTATING ROLLBACK-ONLY");
    expect(verifier).toContain("UNPARSED/UNEXECUTED");
    expect(verifier).toContain(
      "delete from public.analyses where id=analysis_value and owner_id=owner_value",
    );
    expect(verifier).toContain("public.settle_initial_feedback_attempt");
    expect(verifier).toContain("late_known_after_content_cascade");
    expect(verifier).toContain("changed_known_denied");
    expect(verifier).toContain("changed_error_denied");
    expect(verifier).toContain("set constraints all immediate;");
    expect(verifier.trimEnd().endsWith("rollback;")).toBe(true);
  });
});

it("renews the current operation checker through the exact disposition successor without changing late-settlement history", () => {
  const text = read(
    "supabase/migrations/20261115131621_owned_ai_disposition_clocks.sql",
  );
  const rows = JSON.parse(text.split("$disposition_patches$")[1]) as Array<{
    signature: string;
    before: string;
    after: string;
    old: string;
    new: string;
  }>;
  const p = rows.find(
    (x) => x.signature === "private.initial_feedback_operation_ready()",
  )!;
  expect(p.old).toBe(
    bodyIn(forward, "private.initial_feedback_operation_ready"),
  );
  expect(p.before).toBe(operationProfile.checkerSha256);
  expect(hash(p.new)).toBe(currentOperationProfile.checkerSha256);
  expect(p.after).toBe(currentOperationProfile.checkerSha256);
});

it("binds current all-caller profile successors while retaining all prior source goldens", () => {
  const source = readFileSync(
    new URL(
      "../../supabase/migrations/20261115162257_ai_budget_all_caller_sources.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const rows = JSON.parse(source.split("$callers_patches$")[1]) as Array<{
    before: string;
    after: string;
    old: string;
    new: string;
  }>;
  const sha = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  {
    const p = rows.find(
      (p) => p.before === currentOperationProfile.checkerSha256,
    )!;
    expect(sha(p.old)).toBe(currentOperationProfile.checkerSha256);
    expect(p.before).toBe(currentOperationProfile.checkerSha256);
    expect(sha(p.new)).toBe(ALL_CALLERS_currentOperationProfile.checkerSha256);
    expect(p.after).toBe(ALL_CALLERS_currentOperationProfile.checkerSha256);
  }
  {
    const p = rows.find(
      (p) => p.before === currentOperationProfile.claimSha256,
    )!;
    expect(sha(p.old)).toBe(currentOperationProfile.claimSha256);
    expect(p.before).toBe(currentOperationProfile.claimSha256);
    expect(sha(p.new)).toBe(ALL_CALLERS_currentOperationProfile.claimSha256);
    expect(p.after).toBe(ALL_CALLERS_currentOperationProfile.claimSha256);
  }
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
  for (const [key, value] of Object.entries(
    ALL_CALLERS_currentOperationProfile,
  )) {
    const successor = terminal.find((p) => p.before === value);
    expect(
      (
        MANDATORY_BUDGET_ALL_CALLERS_currentOperationProfile as Record<
          string,
          string
        >
      )[key],
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
    MANDATORY_BUDGET_ALL_CALLERS_currentOperationProfile,
  )) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (
        EXPIRY_CURRENT_MANDATORY_BUDGET_ALL_CALLERS_currentOperationProfile as Record<
          string,
          string
        >
      )[key],
    ).toBe(successor ? successor.after : value);
  }
});
