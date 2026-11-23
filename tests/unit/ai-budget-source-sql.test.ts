import { readFileSync as generationReadFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { AI_BUDGET_SOURCE_PROFILE as GENERATION_CURRENT_EXPIRY_CURRENT_MANDATORY_BUDGET_USAGE_RETENTION_CURRENT_CALLER_SOURCE_PROFILE } from "../../app/lib/server/ai-budget-source-profile";
import { OWNED_AI_DISPOSITION_PROFILE as GENERATION_CURRENT_EXPIRY_CURRENT_MANDATORY_BUDGET_USAGE_RETENTION_CURRENT_CALLER_DISPOSITION_PROFILE } from "../../app/lib/server/owned-ai-disposition-profile";
const CURRENT_CALLER_SOURCE_PROFILE = Object.freeze({
  schemaVersion: "ai-budget-source-readiness/2.0.0",
  profileVersion: "ai-budget-source-profile/2.0.0",
  checkerSha256:
    "522a850c498d48147885f3b980054051da088a3cd1369117796aca1c1c94c65e",
  reserveSha256:
    "0d586a4e782fec52f6fba3545de80e9f3a4f2a1eaaed3e489f4ed273ec9160f7",
  exportSha256:
    "7b98b91f31f88bc22676754657d36be536ef5c6a67a0455be6a9fd368ac801fe",
  metadataSha256:
    "b9a9685504c1e45316e63366f02fcd5499a0ea0d65a3bfcaf36f9d4741b781cf",
});
const CURRENT_CALLER_DISPOSITION_PROFILE = Object.freeze({
  schemaVersion: "owned-ai-disposition-readiness/1.0.0",
  profileVersion: "owned-ai-disposition-profile/1.0.0",
  checkerSha256:
    "fe4dfcb8039a81eca3782260e7e25626358fd84931fd6cacbc213a0cc5b0a627",
  exportSha256:
    "9e024843ba62807efc21000971e6074579ca595a69d293ba7a84500a500b01b0",
  accessSha256:
    "0846149a1f25edf14ea3c907219634cda85358065b3e4d5a06c79da2522f87db",
  metadataSha256:
    "f42f6f60454023ad2b6ef998e2fd9098585768c0cfe35cd5307affdd5f349a6a",
});
const CALLER_FULL_PROFILE = Object.freeze({
  schemaVersion: "initial-feedback-readiness/1.0.0",
  profileVersion: "initial-feedback-readiness-profile/1.0.0",
  checkerSha256:
    "7a203a7faa708467656c96618e7e16fc3d624f24bf0b5d9aba6da9883a87a8d7",
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
    "9564c709cea106d8999c61e4db14ce45c40c41eacd23ce54f7fa1ea5c234c223",
  exportSha256:
    "eefd5842be1eb38fe1e0f17ea148f1708eae634c2a8fe42ab94467c9839fe0cd",
  metadataSha256:
    "2bafa1e30a02308604ad0114ab114189aef6e8323379e443ab7a96a64b2196d6",
});
const AI_BUDGET_SOURCE_PROFILE = Object.freeze({
  schemaVersion: "ai-budget-source-readiness/1.0.0",
  profileVersion: "ai-budget-source-profile/1.0.0",
  checkerSha256:
    "64e051edd163c086e7ab9e3aca423584ebc55ba613d29d5e234b7295a109244a",
  reserveSha256:
    "2969934a55f00bd100622934024b867d52b00bd620d349b5a38f5c95dfd734ed",
  exportSha256:
    "4653d1bb8815a5dd56932cba5d822bd81779d7c28aee63868f173370afc59362",
  metadataSha256:
    "09d087f0573f07c7d7fd1cfa2b2b057dab1d2387928cd0a809b214d4b69c090e",
});
const OWNED_AI_DISPOSITION_PROFILE = Object.freeze({
  schemaVersion: "owned-ai-disposition-readiness/1.0.0",
  profileVersion: "owned-ai-disposition-profile/1.0.0",
  checkerSha256:
    "b20a83ce978794972816d2fd238999179921426d55ae77da1d35515f944370e0",
  exportSha256:
    "0039dcf875a77ae45e3d0495369d374704e2b93e750d9e8af870d8d4325b80ec",
  accessSha256:
    "0846149a1f25edf14ea3c907219634cda85358065b3e4d5a06c79da2522f87db",
  metadataSha256:
    "f42f6f60454023ad2b6ef998e2fd9098585768c0cfe35cd5307affdd5f349a6a",
});
const preExpiryRead = (p: string) =>
  readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
const base = read("supabase/migrations/20261110062548_technical_ai_budget.sql");
const clock = read(
  "supabase/migrations/20261115131621_owned_ai_disposition_clocks.sql",
);
const candidate = read(
  "supabase/migrations/20261115154855_ai_budget_source_registration.sql",
);
describe("actual R03 producer source regression, SQL unparsed/unexecuted", () => {
  it("guards actual fresh generic operation insertion with a live registered source", () => {
    expect(base).toContain("insert into private.ai_budget_operations");
    expect(candidate).toContain(
      "before insert on private.ai_budget_operations",
    );
  });
  it("extends the actual retirement producer to registered legacy rewrite selectors", () => {
    expect(clock).toContain(
      "for x in select o.* from private.ai_budget_operations",
    );
    expect(candidate).toContain("private.ai_budget_operation_sources");
  });
  it("refuses ambiguous retained OP1 retries and rolls fresh registration back on denied reserve", () => {
    expect(base).toContain("return private.ai_budget_denied");
    expect(candidate).toContain("AI_SOURCE_RESERVE_ROLLBACK");
    expect(candidate).toContain("AIBUDGET-OP1");
  });
});

const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const block = (s: string, n: string) => {
  const parts = s.split(`$${n}$`);
  if (parts.length !== 3) throw Error("DELIMITED_SOURCE");
  return parts[1];
};
const body = (n: string) => {
  const start = candidate.indexOf(`create function ${n}(`);
  if (start < 0) throw Error("SOURCE_BODY");
  const m = /\bas\s+(\$[a-z_]+\$)([\s\S]*?)\1;/u.exec(candidate.slice(start));
  if (!m) throw Error("SOURCE_DELIMITER");
  return m[2];
};
type Patch = {
  signature: string;
  before: string;
  after: string;
  old: string;
  new: string;
};
const patches = JSON.parse(block(candidate, "source_patches")) as Patch[];
const current = (n: string) =>
  patches.find((p) => p.signature === n)?.new ?? body(n.split("(")[0]);
type Pin = {
  signature: string;
  sha256: string;
  definer: boolean;
  strict: boolean;
  acl: string;
};
const pins = JSON.parse(
  block(body("private.ai_budget_source_ready"), "source_functions"),
) as Pin[];
describe("actual terminal source and catalogue proof mechanism; no SQL execution", () => {
  it("pins every new actual function and all three terminal pre/postimages", () => {
    expect(patches.map((p) => p.signature)).toEqual([
      "private.capture_owned_ai_operation_dispositions(uuid,uuid,uuid,uuid)",
      "public.export_owned_ai_disposition_records(uuid)",
      "private.owned_ai_disposition_ready()",
    ]);
    for (const p of patches) {
      expect(hash(p.old)).toBe(p.before);
      expect(hash(p.new)).toBe(p.after);
    }
    const newPins = pins.filter(
      (p) =>
        p.signature.startsWith("private.ai_budget_source_") ||
        [
          "public.ai_budget_reserve_source_next",
          "public.export_owned_ai_budget_sources",
          "public.read_ai_budget_source_readiness",
        ].includes(p.signature.split("(")[0]),
    );
    for (const p of newPins)
      expect(hash(body(p.signature.split("(")[0]))).toBe(p.sha256);
    expect(hash(body("private.ai_budget_source_ready"))).toBe(
      AI_BUDGET_SOURCE_PROFILE.checkerSha256,
    );
    expect(hash(body("public.ai_budget_reserve_source_next"))).toBe(
      AI_BUDGET_SOURCE_PROFILE.reserveSha256,
    );
    expect(hash(body("public.export_owned_ai_budget_sources"))).toBe(
      AI_BUDGET_SOURCE_PROFILE.exportSha256,
    );
    expect(hash(body("public.read_ai_budget_source_readiness"))).toBe(
      AI_BUDGET_SOURCE_PROFILE.metadataSha256,
    );
    expect(hash(current("private.owned_ai_disposition_ready()"))).toBe(
      OWNED_AI_DISPOSITION_PROFILE.checkerSha256,
    );
    expect(
      hash(current("public.export_owned_ai_disposition_records(uuid)")),
    ).toBe(OWNED_AI_DISPOSITION_PROFILE.exportSha256);
  });
  it("preserves generic budget bodies and strict old binding/receipt/policy dependencies", () => {
    const expected = {
      "public.ai_budget_reserve(uuid,uuid,jsonb)":
        "b0e5f479153e6de8954695702a85be673257d59beb9ecf331f53ab7a153fcb69",
      "public.ai_budget_reserve_next(uuid,uuid,jsonb)":
        "db7c59b3c08143c81c0c5792c813ddfc1aa2414769286f0d7f59fc2369098fe7",
      "private.ai_budget_transition(uuid,uuid,jsonb,text)":
        "b2ee84cc0468cd21f68865bdabfca570b830b60a61ecc1f4c453c84c015f60e9",
    };
    for (const [sig, pin] of Object.entries(expected))
      expect(pins.find((p) => p.signature === sig)?.sha256).toBe(pin);
    expect(
      pins.find(
        (p) => p.signature === "private.try_candidate_privacy_write(uuid)",
      )?.definer,
    ).toBe(true);
    expect(
      patches.some((p) =>
        /ai_budget_transition|ifo_policy|legacy_scoring|candidate_write_blocked/u.test(
          p.signature,
        ),
      ),
    ).toBe(false);
    expect(candidate).not.toContain("alter table private.ai_budget_operations");
    expect(candidate).not.toContain(
      "grant execute on function public.ai_budget_reserve_source_next",
    );
    expect(candidate).not.toContain(
      "grant execute on function public.export_owned_ai_budget_sources",
    );
  });
  it("requires real owner/analysis/version/root and nonblocking admission before any reserve", () => {
    const lock = body("private.ai_budget_source_lock"),
      reserve = body("public.ai_budget_reserve_source_next");
    expect(lock.indexOf("private.try_candidate_privacy_write")).toBeLessThan(
      lock.indexOf("select v.resume_id"),
    );
    expect(lock).toContain(
      "a.id=p_analysis and a.owner_id=p_owner and a.organization_id=p_org and v.id=p_version",
    );
    expect(lock).toContain("r.status='active' for share skip locked");
    expect(lock).toContain("for share of a,v skip locked");
    expect(lock).toContain("for share of o,m skip locked");
    expect(lock).toContain("v.storage_key=private.r17_storage_key");
    expect(
      reserve.indexOf("root_id:=private.ai_budget_source_lock"),
    ).toBeLessThan(
      reserve.indexOf("insert into private.ai_budget_operation_sources"),
    );
    expect(reserve).toContain(
      "p_request->>'operationId' is distinct from op_id::text",
    );
  });
  it("guards all generic new operations/attempts/dispatch, but leaves release/settlement paths alone", () => {
    const guard = body("private.ai_budget_source_guard");
    expect(candidate).toContain(
      "before insert on private.ai_budget_operations",
    );
    expect(candidate).toContain(
      "before insert or update on private.ai_budget_attempts",
    );
    expect(guard).toContain("elsif tg_op='INSERT' then");
    expect(guard).toContain(
      "elsif old.state='reserved' and new.state='dispatched' then",
    );
    expect(guard).toContain("private.ai_budget_source_valid(s,new)");
    expect(guard).not.toContain("settled");
    expect(guard).not.toContain("released");
    expect(guard).not.toContain("held_unknown");
    expect(body("private.ai_budget_source_admit")).toContain(
      "private.ai_budget_source_lock",
    );
    expect(candidate).not.toMatch(
      /current_setting\('[^']*(?:bypass|flag|enabled)/u,
    );
  });
  it("rolls fresh source registration back on every denied or malformed old reservation", () => {
    const s = body("public.ai_budget_reserve_source_next"),
      insert = s.indexOf("insert into private.ai_budget_operation_sources"),
      call = s.indexOf("reply:=public.ai_budget_reserve_next"),
      abort = s.indexOf("raise exception 'AI_SOURCE_RESERVE_ROLLBACK'"),
      handler = s.indexOf("exception when sqlstate 'P0S01'");
    expect(insert).toBeLessThan(call);
    expect(call).toBeLessThan(abort);
    expect(abort).toBeLessThan(handler);
    expect(s.slice(handler)).toContain(
      "return private.ai_budget_denied('AI_BUDGET_UNAVAILABLE')",
    );
    expect(s).toContain(
      "reply->'receipt'->>'bindingSha256' is distinct from binding",
    );
    expect(s.match(/where id=old_op/g)).toHaveLength(2);
    expect(s).not.toMatch(/where id=old_op[^;]*(?:state|status)/u);
  });
  it("uses exact registered selectors before legacy/account inference and never makes a clock from registration", () => {
    const s = current(
      "private.capture_owned_ai_operation_dispositions(uuid,uuid,uuid,uuid)",
    );
    expect(s).toContain(
      "s.operation_id=o.id and s.owner_id=p_owner and s.resume_id=p_resume",
    );
    const registered = s.indexOf("-- Registered OP2 source wins"),
      legacy = s.indexOf("-- Account capture cannot restart");
    expect(registered).toBeLessThan(legacy);
    const branch = s.slice(registered, legacy);
    expect(branch).toContain(
      "registration.analysis_id;root_id:=registration.resume_id;version_id:=registration.resume_version_id",
    );
    expect(branch).toContain("select t.id,t.created_at into root_clock");
    expect(branch).toContain("root_clock.created_at<capture_at");
    expect(branch).toContain("capture_at:=source_row.prepared_at");
    expect(branch).toContain("scope:='historical_unresolved';capture_at:=null");
    expect(branch).not.toContain("registered_at");
    expect(branch).not.toContain("clock_timestamp()");
    expect(
      current("public.export_owned_ai_disposition_records(uuid)"),
    ).toContain(
      "from private.ai_budget_operation_sources s where s.owner_id=p_user_id",
    );
  });
  it("exports the complete owner set with exact binding/source proof after retirement", () => {
    const s = body("public.export_owned_ai_budget_sources");
    expect(s).toContain(
      "where owner_id=p_user_id order by operation_id limit 4097",
    );
    expect(s).toContain("if n>4096");
    expect(s).toContain("bytes>33554432");
    expect(s).toContain("private.ai_budget_source_valid(s,o)");
    expect(s).toContain("d.phase='prepared' and d.source_scope='resume_root'");
    expect(s).toContain(
      "(d.owner_id,d.organization_id,d.analysis_id,d.resume_id,d.resume_version_id)=(s.owner_id,s.organization_id,s.analysis_id,s.resume_id,s.resume_version_id)",
    );
    expect(s).not.toContain("current_setting");
    expect(s).not.toContain("for update");
    expect(s).not.toContain("join public.memberships");
    for (const key of [
      "operationId",
      "ownerId",
      "organizationId",
      "kind",
      "analysisId",
      "resumeId",
      "resumeVersionId",
      "requestNonce",
      "bindingSha256",
    ])
      expect(s).toContain(`'${key}',s.`);
    expect(s).toContain("'registeredAt',private.ifo_stamp(s.registered_at)");
  });
  it("seals fresh schema/constraints/indexes/guards once and rejects writable catalogue/data access", () => {
    const s = body("private.ai_budget_source_ready"),
      cat = body("private.ai_budget_source_catalogue");
    for (const term of [
      "pg_get_constraintdef",
      "pg_get_indexdef",
      "pg_get_triggerdef",
      "attnotnull",
      "atthasdef",
    ])
      expect(term === "atthasdef" ? s : cat).toContain(term);
    expect(cat).toContain(
      "'private.ai_budget_source_catalogue_seal'::regclass",
    );
    expect(cat).toContain(
      "c.relname='ai_budget_source_catalogue_seal' and t.tgname='ai_budget_source_seal_closed'",
    );
    expect(
      candidate.match(/insert into private.ai_budget_source_catalogue_seal/g),
    ).toHaveLength(1);
    expect(s).toContain("has_any_column_privilege");
    expect(s).toContain("has_table_privilege");
    expect(s).toContain("pg_catalog.pg_policy");
    expect(s).toContain("tgenabled='O'");
    expect(s).toContain("tgconstraint=0");
    expect(s).toContain(
      "private.ifo_sha(private.ai_budget_source_catalogue()::text) is distinct from",
    );
    expect(body("private.ai_budget_source_seal_closed")).toContain(
      "raise exception 'AI_SOURCE_SEAL_CLOSED'",
    );
    expect(s).not.toContain("insert into");
    expect(s).not.toContain("update private.");
  });
  it("exposes exactly independent frozen metadata capabilities", () => {
    expect(Object.keys(AI_BUDGET_SOURCE_PROFILE)).toHaveLength(6);
    const s = body("public.read_ai_budget_source_readiness");
    for (const key of [
      ...Object.keys(AI_BUDGET_SOURCE_PROFILE),
      "schemaReady",
      "reserveExecutable",
      "exportExecutable",
    ])
      expect(s).toContain(`'${key}'`);
    expect(s).toContain(
      "has_function_privilege('service_role','public.ai_budget_reserve_source_next",
    );
    expect(s).toContain(
      "has_function_privilege('service_role','public.export_owned_ai_budget_sources",
    );
  });
});

const vectors = [
  {
    atoms: [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "legacy_rewrite",
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
      "shared-request",
    ],
    framedUtf8Hex:
      "41494255444745542d4f50320a5433363a31313131313131312d313131312d343131312d383131312d3131313131313131313131313b5433363a32323232323232322d323232322d343232322d383232322d3232323232323232323232323b5431343a6c65676163795f726577726974653b5433363a33333333333333332d333333332d343333332d383333332d3333333333333333333333333b5433363a34343434343434342d343434342d343434342d383434342d3434343434343434343434343b5431343a7368617265642d726571756573743b",
    operationId: "7cd53f15-ba8c-8625-9698-4604dabfcb4b",
  },
  {
    atoms: [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "legacy_rewrite",
      "55555555-5555-4555-8555-555555555555",
      "44444444-4444-4444-8444-444444444444",
      "shared-request",
    ],
    framedUtf8Hex:
      "41494255444745542d4f50320a5433363a31313131313131312d313131312d343131312d383131312d3131313131313131313131313b5433363a32323232323232322d323232322d343232322d383232322d3232323232323232323232323b5431343a6c65676163795f726577726974653b5433363a35353535353535352d353535352d343535352d383535352d3535353535353535353535353b5433363a34343434343434342d343434342d343434342d383434342d3434343434343434343434343b5431343a7368617265642d726571756573743b",
    operationId: "033a7039-590c-8638-b36a-a578dedcf2a9",
  },
  {
    atoms: [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "legacy_rewrite",
      "33333333-3333-4333-8333-333333333333",
      "66666666-6666-4666-8666-666666666666",
      "shared-request",
    ],
    framedUtf8Hex:
      "41494255444745542d4f50320a5433363a31313131313131312d313131312d343131312d383131312d3131313131313131313131313b5433363a32323232323232322d323232322d343232322d383232322d3232323232323232323232323b5431343a6c65676163795f726577726974653b5433363a33333333333333332d333333332d343333332d383333332d3333333333333333333333333b5433363a36363636363636362d363636362d343636362d383636362d3636363636363636363636363b5431343a7368617265642d726571756573743b",
    operationId: "15ae9c0b-12a2-8850-a718-33237bcc533a",
  },
  {
    atoms: [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "legacy_rewrite",
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
      " ",
    ],
    framedUtf8Hex:
      "41494255444745542d4f50320a5433363a31313131313131312d313131312d343131312d383131312d3131313131313131313131313b5433363a32323232323232322d323232322d343232322d383232322d3232323232323232323232323b5431343a6c65676163795f726577726974653b5433363a33333333333333332d333333332d343333332d383333332d3333333333333333333333333b5433363a34343434343434342d343434342d343434342d383434342d3434343434343434343434343b54313a203b",
    operationId: "3a4d4106-1f24-8dc3-9b3c-12b3c76b3b03",
  },
  {
    atoms: [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "legacy_rewrite",
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ],
    framedUtf8Hex:
      "41494255444745542d4f50320a5433363a31313131313131312d313131312d343131312d383131312d3131313131313131313131313b5433363a32323232323232322d323232322d343232322d383232322d3232323232323232323232323b5431343a6c65676163795f726577726974653b5433363a33333333333333332d333333332d343333332d383333332d3333333333333333333333333b5433363a34343434343434342d343434342d343434342d383434342d3434343434343434343434343b543132383a61616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161613b",
    operationId: "05dff7c7-f067-86a1-a31b-7d95f2e83fce",
  },
] as const;

describe("independent byte vectors and source controls, not Native codec execution", () => {
  for (const [n, v] of vectors.entries())
    it(`preserves Root OP2 byte vector ${n + 1}`, () => {
      const frame =
        "AIBUDGET-OP2\n" +
        v.atoms.map((a) => `T${Buffer.byteLength(a, "utf8")}:${a};`).join("");
      expect(Buffer.from(frame, "utf8").toString("hex")).toBe(v.framedUtf8Hex);
      const bytes = createHash("sha256")
        .update(frame, "utf8")
        .digest()
        .subarray(0, 16);
      bytes[6] = (bytes[6] & 15) | 128;
      bytes[8] = (bytes[8] & 63) | 128;
      const hex = bytes.toString("hex"),
        id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      expect(id).toBe(v.operationId);
    });
  it("binds the actual Native source to the exact OP2 header/framing/masks", () => {
    expect(body("private.ai_budget_source_operation_id")).toContain(
      "E'AIBUDGET-OP2\\n'",
    );
    const s = body("private.ai_budget_source_uuid");
    expect(s).toContain("octet_length(convert_to(atom,'UTF8'))");
    expect(s).toContain("(get_byte(bytes,6)&15)|128");
    expect(s).toContain("(get_byte(bytes,8)&63)|128");
    expect(body("public.ai_budget_reserve_source_next")).toContain(
      "~ '^[ -~]{1,128}$'",
    );
  });
});

const callersDraft = read(
  "supabase/migrations/20261115162257_ai_budget_all_caller_sources.sql",
);
describe("all-caller actual producer regressions, SQL unparsed/unexecuted", () => {
  it("admits real typed and account sources instead of the current rewrite-only guard", () => {
    const actual = callersDraft || body("private.ai_budget_source_valid");
    expect(actual).toContain("build_account");
    expect(actual).toContain("canonical_rewrite");
  });
  it("closes public generic technical claim bypass for typed Native once gates", () => {
    const actual =
      callersDraft ||
      base.slice(
        base.indexOf("create function public.ai_budget_claim_dispatch"),
        base.indexOf("create function public.ai_budget_release"),
      );
    expect(actual).toContain("ai_budget_operation_sources");
  });
  it("keeps Build capture account-only with literal null parent selectors", () => {
    expect(
      callersDraft ||
        current(
          "private.capture_owned_ai_operation_dispositions(uuid,uuid,uuid,uuid)",
        ),
    ).toContain("registration.kind='build_account'");
  });
});

import { CANONICAL_REWRITE_READINESS_PROFILE as EXPIRY_CURRENT_MANDATORY_BUDGET_CALLER_CANONICAL_PROFILE } from "../../app/lib/server/canonical-rewrite-readiness-profile";
import { CANONICAL_REWRITE_WORKSPACE_PROFILE as EXPIRY_CURRENT_MANDATORY_BUDGET_CALLER_WORKSPACE_PROFILE } from "../../app/lib/server/canonical-rewrite-workspace-profile";
import { INITIAL_FEEDBACK_OPERATION_PROFILE as EXPIRY_CURRENT_MANDATORY_BUDGET_CALLER_OPERATION_PROFILE } from "../../app/lib/server/initial-feedback-operation-profile";
import { INITIAL_FEEDBACK_PROFILE as GENERATION_CURRENT_EXPIRY_CURRENT_MANDATORY_BUDGET_USAGE_RETENTION_CALLER_FULL_PROFILE } from "../../app/lib/server/initial-feedback-profile";
// Freeze immediate predecessor imports; all previous assertions remain exact.
const EXPIRY_CURRENT_MANDATORY_BUDGET_USAGE_RETENTION_CURRENT_CALLER_SOURCE_PROFILE =
  Object.freeze({
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
const EXPIRY_CURRENT_MANDATORY_BUDGET_USAGE_RETENTION_CURRENT_CALLER_DISPOSITION_PROFILE =
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
const EXPIRY_CURRENT_MANDATORY_BUDGET_USAGE_RETENTION_CALLER_FULL_PROFILE =
  Object.freeze({
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

// Frozen immediate predecessor imports; every earlier assertion/object remains unchanged.
const MANDATORY_BUDGET_USAGE_RETENTION_CURRENT_CALLER_SOURCE_PROFILE =
  Object.freeze({
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
const MANDATORY_BUDGET_USAGE_RETENTION_CURRENT_CALLER_DISPOSITION_PROFILE =
  Object.freeze({
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
const MANDATORY_BUDGET_CALLER_CANONICAL_PROFILE = Object.freeze({
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
const MANDATORY_BUDGET_CALLER_WORKSPACE_PROFILE = Object.freeze({
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
const MANDATORY_BUDGET_CALLER_OPERATION_PROFILE = Object.freeze({
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
const MANDATORY_BUDGET_USAGE_RETENTION_CALLER_FULL_PROFILE = Object.freeze({
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

// Frozen immediate predecessor profiles; every earlier assertion remains unchanged.
const USAGE_RETENTION_CURRENT_CALLER_SOURCE_PROFILE = Object.freeze({
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
const USAGE_RETENTION_CURRENT_CALLER_DISPOSITION_PROFILE = Object.freeze({
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
const CALLER_CANONICAL_PROFILE = Object.freeze({
  schemaVersion: "canonical-rewrite-readiness/1.0.0",
  profileVersion: "canonical-rewrite-readiness-profile/1.0.1",
  checkerSha256:
    "ef084481faf7a75e5da4dafbabdb8cd9c2aacae542b26c5e90ced4ed25b8ef14",
  readerSha256:
    "fbe6a2167174a33a8fe9541a781623e595444206d0fe121971b87f1b14089707",
  prepareSha256:
    "3ba48ee775c9ce62aa3df976d2011b6cc202acd16c62dd60abe4e36c9f65aef9",
  claimSha256:
    "77a9357fde10413f08d0276bae3c1b747f44e2de10c1ef757d47eb05b21992aa",
  finishSha256:
    "cb7a256fbacd55d494fb72196308e6c06e8c7faabb40c18a9ea2bba97a3c5828",
  settleSha256:
    "7bf6d0a1fc731d650716c7ce3ccd204d5529f74cc12e69d0c830b1ac4a69ed28",
  usageSha256:
    "e58366ed4afd20b587a6d133fd3ad397c139d327fc060fbc0b040b857069f7ca",
} as const);
const CALLER_WORKSPACE_PROFILE = Object.freeze({
  schemaVersion: "canonical-rewrite-workspace-readiness/1.0.0",
  profileVersion: "canonical-rewrite-workspace-profile/1.0.0",
  checkerSha256:
    "32d3e0ecf62b1e053ff2da8d66fa8b949c026447fc64383183404ff438466efe",
  readerSha256:
    "c4d92e2e4e9cf666ce2ccb3ced23c61873d2f974fd61303d9f0828331a5537e3",
  initializerSha256:
    "07f71d4063e15301fe797a3eab876a6223a66350c6fa334295c9369accdf7f75",
  metadataSha256:
    "f05e249fed5e0f7852a198935780a05324505abaf182b0b6a2f22a6c3b95ccb3",
} as const);
const CALLER_OPERATION_PROFILE = Object.freeze({
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
const USAGE_RETENTION_CALLER_FULL_PROFILE = Object.freeze({
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

const callerPatches = JSON.parse(
  block(callersDraft, "callers_patches"),
) as Patch[];
function callerBody(n: string) {
  const p = callerPatches.find((p) => p.signature.split("(")[0] === n);
  if (p) return p.new;
  const i = callersDraft.indexOf(`create function ${n}(`);
  const m = /\bas\s+(\$[A-Za-z0-9_]+\$)([\s\S]*?)\1;/u.exec(
    callersDraft.slice(i),
  );
  if (i < 0 || !m) throw Error("CALLER_SOURCE_BODY");
  return m[2];
}
const callerPins = JSON.parse(
  block(callerBody("private.ai_budget_source_ready"), "source_functions"),
) as Pin[];
describe("all-caller actual terminal source closure, not Native parsing/execution", () => {
  it("binds all20 actual predecessor/postimage bodies and current Node profiles", () => {
    expect(callerPatches).toHaveLength(20);
    for (const p of callerPatches) {
      expect(hash(p.old)).toBe(p.before);
      expect(hash(p.new)).toBe(p.after);
    }
    for (const [n, pin] of [
      [
        "private.ai_budget_source_ready",
        CURRENT_CALLER_SOURCE_PROFILE.checkerSha256,
      ],
      [
        "public.ai_budget_reserve_source_next",
        CURRENT_CALLER_SOURCE_PROFILE.reserveSha256,
      ],
      [
        "public.export_owned_ai_budget_sources",
        CURRENT_CALLER_SOURCE_PROFILE.exportSha256,
      ],
      [
        "public.read_ai_budget_source_readiness",
        CURRENT_CALLER_SOURCE_PROFILE.metadataSha256,
      ],
      [
        "private.owned_ai_disposition_ready",
        CURRENT_CALLER_DISPOSITION_PROFILE.checkerSha256,
      ],
      [
        "public.export_owned_ai_disposition_records",
        CURRENT_CALLER_DISPOSITION_PROFILE.exportSha256,
      ],
      [
        "private.canonical_rewrite_ready",
        CALLER_CANONICAL_PROFILE.checkerSha256,
      ],
      [
        "public.claim_canonical_rewrite_dispatch",
        CALLER_CANONICAL_PROFILE.claimSha256,
      ],
      [
        "private.canonical_rewrite_workspace_ready",
        CALLER_WORKSPACE_PROFILE.checkerSha256,
      ],
      [
        "private.initial_feedback_operation_ready",
        CALLER_OPERATION_PROFILE.checkerSha256,
      ],
      [
        "public.claim_initial_feedback_dispatch",
        CALLER_OPERATION_PROFILE.claimSha256,
      ],
      ["private.initial_feedback_ready", CALLER_FULL_PROFILE.checkerSha256],
      [
        "public.claim_initial_feedback_dispatch",
        CALLER_FULL_PROFILE.claimSha256,
      ],
    ])
      expect(hash(callerBody(n))).toBe(pin);
    expect(CURRENT_CALLER_SOURCE_PROFILE.schemaVersion).toBe(
      "ai-budget-source-readiness/2.0.0",
    );
    expect(CURRENT_CALLER_SOURCE_PROFILE.profileVersion).toBe(
      "ai-budget-source-profile/2.0.0",
    );
  });
  it("pins each changed/new source body and preserves the original private budget arithmetic", () => {
    expect(callerPins).toHaveLength(48);
    for (const p of callerPins) {
      const n = p.signature.split("(")[0];
      if (
        callerPatches.some((x) => x.signature === p.signature) ||
        callersDraft.includes(`create function ${n}(`)
      )
        expect(hash(callerBody(n))).toBe(p.sha256);
    }
    expect(
      callerPatches.some((p) =>
        /ai_budget_transition|ifo_policy|legacy_scoring_lease|ai_budget_source_operation_id|ai_budget_source_uuid/u.test(
          p.signature,
        ),
      ),
    ).toBe(false);
    expect(
      callerPins.find(
        (p) =>
          p.signature === "private.ai_budget_transition(uuid,uuid,jsonb,text)",
      )?.sha256,
    ).toBe("b2ee84cc0468cd21f68865bdabfca570b830b60a61ecc1f4c453c84c015f60e9");
  });
  it("excludes registration through the exact owner mutex across fresh generic classification and transition", () => {
    const gate = callerBody("private.ai_budget_source_generic_allowed");
    expect(gate.indexOf("private.try_lock_candidate_owners")).toBeLessThan(
      gate.indexOf("private.candidate_write_blocked"),
    );
    expect(gate.indexOf("private.candidate_write_blocked")).toBeLessThan(
      gate.indexOf("private.ai_budget_source_typed"),
    );
    expect(gate).toContain("('read committed','read uncommitted')");
    expect(gate).not.toContain("try_candidate_privacy_write");
    for (const n of [
      "public.ai_budget_reserve",
      "public.ai_budget_reserve_next",
      "public.ai_budget_claim_dispatch",
    ])
      expect(callerBody(n)).toContain(
        "private.ai_budget_source_generic_allowed",
      );
    expect(callerBody("private.ai_budget_source_typed")).toContain(
      "s.kind in ('canonical_rewrite','initial_feedback')",
    );
  });
  it("uses service-denied private reservation/claim after actual typed proof, never a caller/GUC tag", () => {
    const reserve = callerBody("public.ai_budget_reserve_source_next");
    expect(reserve).toContain(
      "reply:=private.ai_budget_source_reserve_next_core",
    );
    expect(reserve).not.toContain("reply:=public.ai_budget_reserve_next");
    const ordinal = callerBody("private.ai_budget_source_reserve_next_core");
    expect(hash(ordinal)).toBe(
      "db7c59b3c08143c81c0c5792c813ddfc1aa2414769286f0d7f59fc2369098fe7",
    );
    for (const n of [
      "public.claim_canonical_rewrite_dispatch",
      "public.claim_initial_feedback_dispatch",
    ]) {
      const b = callerBody(n);
      expect(b).toContain("private.ai_budget_transition");
      expect(b).not.toContain("public.ai_budget_claim_dispatch(");
      expect(b).toContain("private.ai_budget_operation_sources");
    }
    expect(callerBody("public.claim_canonical_rewrite_dispatch")).toContain(
      "private.canonical_rewrite_consent",
    );
    expect(callerBody("public.claim_initial_feedback_dispatch")).toContain(
      "private.lock_analysis_stage_lease",
    );
    for (const p of callerPins.filter((p) =>
      p.signature.startsWith("private.ai_budget_source_"),
    ))
      expect(p.acl).toBe("private");
    expect(callersDraft).not.toContain("set_config(");
  });
  it("proves transient A13 lease/attempt/ordinal/policy and deterministic scoped A12 attempt", () => {
    const b = callerBody("public.ai_budget_reserve_source_next");
    expect(b).toContain("private.legacy_scoring_lease(p_source->'lease')");
    expect(b).toContain("private.lock_analysis_stage_lease(analysis_id_value");
    expect(b).toContain(
      "p_request->>'attemptId' is distinct from a.attempt_id::text",
    );
    expect(b).toContain("is distinct from a.ordinal::numeric");
    expect(b).toContain("f.binding->'policy'->>'budgetPolicyVersion'");
    expect(b).toContain("f.binding->'policy'->>'maxOutputTokens'");
    expect(b).toContain(
      "c.binding_sha256 is distinct from p_source->>'bindingSha256'",
    );
    expect(callerBody("private.ai_budget_source_attempt_admit")).toContain(
      "a.state='reserved'",
    );
    expect(callerBody("private.ai_budget_source_attempt_admit")).toContain(
      "'canonical-rewrite/1'",
    );
    expect(callerBody("private.ai_budget_source_guard")).toContain(
      "elsif tg_op='INSERT' then",
    );
  });
  it("refuses all retained historical collisions and never adopts old unregistered rows", () => {
    const b = callerBody("public.ai_budget_reserve_source_next");
    expect(b).toContain("kind_value in ('legacy_rewrite','build_account')");
    expect(b).toContain(
      "elsif kind_value='canonical_rewrite' then old_op:=nonce::uuid",
    );
    expect(b).toContain(
      "exists(select 1 from private.ai_budget_operations where id=op_id) and not exists(select 1 from private.ai_budget_operation_sources where operation_id=op_id)",
    );
    expect(b.match(/where id=old_op/g)).toHaveLength(2);
    expect(b).not.toMatch(/where id=old_op[^;]*(?:state|status)/u);
    expect(b).toContain("exception when sqlstate 'P0S01'");
  });
  it("keeps Build account-only/Auth-admitted, null-safe exportable, and unrelated to root retirement", () => {
    expect(callerBody("private.ai_budget_source_account_lock")).toContain(
      "from auth.users where id=p_owner",
    );
    expect(callerBody("private.ai_budget_source_current")).toContain(
      "private.ai_budget_source_account_lock",
    );
    const capture = callerBody(
      "private.capture_owned_ai_operation_dispositions",
    );
    expect(capture).toContain("registration.kind='build_account'");
    expect(capture).toContain("if p_request is null or p_resume is not null");
    expect(capture).toContain(
      "null,null,null,'account_only','account_preparation'",
    );
    const ex = callerBody("public.export_owned_ai_disposition_records");
    expect(ex).toContain("s.kind='build_account' and exists");
    expect(ex).toContain(
      "is not distinct from (s.owner_id,s.organization_id,s.analysis_id,s.resume_id,s.resume_version_id)",
    );
    expect(callerBody("public.export_owned_ai_budget_sources")).toContain(
      "s.kind<>'build_account' and (not exists",
    );
  });
  it("preserves legacy OP2 and old closed seal while sealing only the actual successor schema", () => {
    expect(callersDraft).not.toContain(
      "update private.ai_budget_source_catalogue_seal",
    );
    expect(callersDraft).not.toContain(
      "insert into private.ai_budget_source_catalogue_seal(",
    );
    expect(
      callersDraft.match(
        /insert into private.ai_budget_source_v2_catalogue_seal/g,
      ),
    ).toHaveLength(1);
    expect(callerBody("private.ai_budget_source_catalogue")).toContain(
      "'private.ai_budget_source_v2_catalogue_seal'::regclass",
    );
    expect(callerBody("private.ai_budget_source_ready")).toContain(
      "from private.ai_budget_source_v2_catalogue_seal",
    );
    expect(callerBody("private.ai_budget_source_identity")).toContain(
      "return private.ai_budget_source_operation_id",
    );
    expect(callerBody("private.ai_budget_source_identity")).toContain(
      "elsif p_kind='legacy_qualitative' then return p_analysis",
    );
    expect(callerBody("private.ai_budget_source_identity")).toContain(
      "elsif p_kind='initial_feedback' then return p_nonce::uuid",
    );
  });
});

const allCallerVectors = [
  {
    atoms: [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "canonical_rewrite",
      "33333333-3333-4333-8333-333333333333",
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
    ],
    operationId: "8cb42107-f602-89c3-838f-2c05c01c79c8",
    framedUtf8Hex:
      "41494255444745542d4f50320a5433363a31313131313131312d313131312d343131312d383131312d3131313131313131313131313b5433363a32323232323232322d323232322d343232322d383232322d3232323232323232323232323b5431373a63616e6f6e6963616c5f726577726974653b5433363a33333333333333332d333333332d343333332d383333332d3333333333333333333333333b5433363a34343434343434342d343434342d343434342d383434342d3434343434343434343434343b5433363a35353535353535352d353535352d343535352d383535352d3535353535353535353535353b",
  },
  {
    atoms: [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "canonical_rewrite",
      "66666666-6666-4666-8666-666666666666",
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
    ],
    operationId: "244a1e4c-00fa-8c96-82ea-b5eb5e14a853",
    framedUtf8Hex:
      "41494255444745542d4f50320a5433363a31313131313131312d313131312d343131312d383131312d3131313131313131313131313b5433363a32323232323232322d323232322d343232322d383232322d3232323232323232323232323b5431373a63616e6f6e6963616c5f726577726974653b5433363a36363636363636362d363636362d343636362d383636362d3636363636363636363636363b5433363a34343434343434342d343434342d343434342d383434342d3434343434343434343434343b5433363a35353535353535352d353535352d343535352d383535352d3535353535353535353535353b",
  },
  {
    atoms: [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "canonical_rewrite",
      "33333333-3333-4333-8333-333333333333",
      "77777777-7777-4777-8777-777777777777",
      "55555555-5555-4555-8555-555555555555",
    ],
    operationId: "a91ff81a-14c6-8661-9ceb-c6cf211cae0e",
    framedUtf8Hex:
      "41494255444745542d4f50320a5433363a31313131313131312d313131312d343131312d383131312d3131313131313131313131313b5433363a32323232323232322d323232322d343232322d383232322d3232323232323232323232323b5431373a63616e6f6e6963616c5f726577726974653b5433363a33333333333333332d333333332d343333332d383333332d3333333333333333333333333b5433363a37373737373737372d373737372d343737372d383737372d3737373737373737373737373b5433363a35353535353535352d353535352d343535352d383535352d3535353535353535353535353b",
  },
  {
    atoms: [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "build_account",
      "shared-request",
    ],
    operationId: "b47ea95f-21e8-8049-99fb-7df1fe878b9b",
    framedUtf8Hex:
      "41494255444745542d4f50320a5433363a31313131313131312d313131312d343131312d383131312d3131313131313131313131313b5433363a32323232323232322d323232322d343232322d383232322d3232323232323232323232323b5431333a6275696c645f6163636f756e743b5431343a7368617265642d726571756573743b",
  },
  {
    atoms: [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "build_account",
      " ",
    ],
    operationId: "f07631ae-cf6d-886a-912a-bb5be37f0d5c",
    framedUtf8Hex:
      "41494255444745542d4f50320a5433363a31313131313131312d313131312d343131312d383131312d3131313131313131313131313b5433363a32323232323232322d323232322d343232322d383232322d3232323232323232323232323b5431333a6275696c645f6163636f756e743b54313a203b",
  },
  {
    atoms: [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "build_account",
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    ],
    operationId: "4d249a64-2a19-87ae-a3e1-9244fbb4b420",
    framedUtf8Hex:
      "41494255444745542d4f50320a5433363a31313131313131312d313131312d343131312d383131312d3131313131313131313131313b5433363a32323232323232322d323232322d343232322d383232322d3232323232323232323232323b5431333a6275696c645f6163636f756e743b543132383a61616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161616161613b",
  },
] as const;

describe("all-caller independent codec/prefight controls, not Native execution", () => {
  for (const [i, v] of allCallerVectors.entries())
    it(`matches independent A12/Build byte vector ${i + 1}`, () => {
      const frame =
        "AIBUDGET-OP2\n" +
        v.atoms.map((a) => `T${Buffer.byteLength(a, "utf8")}:${a};`).join("");
      expect(Buffer.from(frame).toString("hex")).toBe(v.framedUtf8Hex);
      const bytes = createHash("sha256").update(frame).digest().subarray(0, 16);
      bytes[6] = (bytes[6] & 15) | 128;
      bytes[8] = (bytes[8] & 63) | 128;
      const x = bytes.toString("hex");
      expect(
        `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`,
      ).toBe(v.operationId);
    });
  it("locks the prior sealed schema and proves old readiness before any ALTER/bootstrap", () => {
    const lock = callersDraft.indexOf("in access exclusive mode"),
      preflight = callersDraft.indexOf("do $caller_preflight$"),
      alter = callersDraft.indexOf(
        "alter table private.ai_budget_operation_sources",
      ),
      bootstrap = callersDraft.indexOf(
        "insert into private.ai_budget_source_v2_catalogue_seal",
      );
    expect(lock).toBeGreaterThan(-1);
    expect(lock).toBeLessThan(preflight);
    expect(preflight).toBeLessThan(alter);
    expect(alter).toBeLessThan(bootstrap);
    expect(callersDraft.slice(preflight, alter)).toContain(
      AI_BUDGET_SOURCE_PROFILE.checkerSha256,
    );
    expect(callersDraft.slice(preflight, alter)).toContain(
      "private.ai_budget_source_ready() is not true",
    );
    const catalog = callerBody("private.ai_budget_source_catalogue");
    expect(catalog).toContain(
      "c.relname='ai_budget_source_v2_catalogue_seal' and t.tgname='ai_budget_source_seal_closed'",
    );
    expect(catalog).not.toContain(
      "c.relname in ('ai_budget_source_catalogue_seal'",
    );
  });
  it("keeps the successor verifier privileged/mutating/rollback-only and unexecuted", () => {
    const v = read("scripts/verify-ai-budget-source.sql");
    expect(v).toContain(
      "PRIVILEGED MUTATING ROLLBACK-ONLY DRAFT. SQL UNPARSED/UNEXECUTED",
    );
    expect(v).toContain("all_caller_identity_golden");
    expect(v).toContain("invalid_native_worker_id");
    expect(v.trimEnd().endsWith("rollback;")).toBe(true);
  });
});

it("bridges retained-usage current profiles while preserving every historical source assertion", () => {
  const text = readFileSync(
    new URL(
      "../../supabase/migrations/20261115172527_owned_legacy_ai_usage_retention.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const rows = JSON.parse(text.split("$usage_patches$")[1]) as Array<{
    before: string;
    after: string;
    old: string;
    new: string;
  }>;
  const sha = (value: string) =>
    createHash("sha256").update(value).digest("hex");
  {
    const p = rows.find(
      (p) => p.before === CURRENT_CALLER_SOURCE_PROFILE.checkerSha256,
    )!;
    expect(sha(p.old)).toBe(CURRENT_CALLER_SOURCE_PROFILE.checkerSha256);
    expect(p.before).toBe(CURRENT_CALLER_SOURCE_PROFILE.checkerSha256);
    expect(sha(p.new)).toBe(
      USAGE_RETENTION_CURRENT_CALLER_SOURCE_PROFILE.checkerSha256,
    );
    expect(p.after).toBe(
      USAGE_RETENTION_CURRENT_CALLER_SOURCE_PROFILE.checkerSha256,
    );
  }
  {
    const p = rows.find(
      (p) => p.before === CURRENT_CALLER_DISPOSITION_PROFILE.checkerSha256,
    )!;
    expect(sha(p.old)).toBe(CURRENT_CALLER_DISPOSITION_PROFILE.checkerSha256);
    expect(p.before).toBe(CURRENT_CALLER_DISPOSITION_PROFILE.checkerSha256);
    expect(sha(p.new)).toBe(
      USAGE_RETENTION_CURRENT_CALLER_DISPOSITION_PROFILE.checkerSha256,
    );
    expect(p.after).toBe(
      USAGE_RETENTION_CURRENT_CALLER_DISPOSITION_PROFILE.checkerSha256,
    );
  }
  {
    const p = rows.find((p) => p.before === CALLER_FULL_PROFILE.checkerSha256)!;
    expect(sha(p.old)).toBe(CALLER_FULL_PROFILE.checkerSha256);
    expect(p.before).toBe(CALLER_FULL_PROFILE.checkerSha256);
    expect(sha(p.new)).toBe(USAGE_RETENTION_CALLER_FULL_PROFILE.checkerSha256);
    expect(p.after).toBe(USAGE_RETENTION_CALLER_FULL_PROFILE.checkerSha256);
  }
  {
    const p = rows.find((p) => p.before === CALLER_FULL_PROFILE.usageSha256)!;
    expect(sha(p.old)).toBe(CALLER_FULL_PROFILE.usageSha256);
    expect(p.before).toBe(CALLER_FULL_PROFILE.usageSha256);
    expect(sha(p.new)).toBe(USAGE_RETENTION_CALLER_FULL_PROFILE.usageSha256);
    expect(p.after).toBe(USAGE_RETENTION_CALLER_FULL_PROFILE.usageSha256);
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
    USAGE_RETENTION_CURRENT_CALLER_SOURCE_PROFILE,
  )) {
    const successor = terminal.find((p) => p.before === value);
    expect(
      (
        MANDATORY_BUDGET_USAGE_RETENTION_CURRENT_CALLER_SOURCE_PROFILE as Record<
          string,
          string
        >
      )[key],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(
    USAGE_RETENTION_CURRENT_CALLER_DISPOSITION_PROFILE,
  )) {
    const successor = terminal.find((p) => p.before === value);
    expect(
      (
        MANDATORY_BUDGET_USAGE_RETENTION_CURRENT_CALLER_DISPOSITION_PROFILE as Record<
          string,
          string
        >
      )[key],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(CALLER_CANONICAL_PROFILE)) {
    const successor = terminal.find((p) => p.before === value);
    expect(
      (MANDATORY_BUDGET_CALLER_CANONICAL_PROFILE as Record<string, string>)[
        key
      ],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(CALLER_WORKSPACE_PROFILE)) {
    const successor = terminal.find((p) => p.before === value);
    expect(
      (MANDATORY_BUDGET_CALLER_WORKSPACE_PROFILE as Record<string, string>)[
        key
      ],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(CALLER_OPERATION_PROFILE)) {
    const successor = terminal.find((p) => p.before === value);
    expect(
      (MANDATORY_BUDGET_CALLER_OPERATION_PROFILE as Record<string, string>)[
        key
      ],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(
    USAGE_RETENTION_CALLER_FULL_PROFILE,
  )) {
    const successor = terminal.find((p) => p.before === value);
    expect(
      (
        MANDATORY_BUDGET_USAGE_RETENTION_CALLER_FULL_PROFILE as Record<
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
    MANDATORY_BUDGET_USAGE_RETENTION_CURRENT_CALLER_SOURCE_PROFILE,
  )) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (
        EXPIRY_CURRENT_MANDATORY_BUDGET_USAGE_RETENTION_CURRENT_CALLER_SOURCE_PROFILE as Record<
          string,
          string
        >
      )[key],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(
    MANDATORY_BUDGET_USAGE_RETENTION_CURRENT_CALLER_DISPOSITION_PROFILE,
  )) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (
        EXPIRY_CURRENT_MANDATORY_BUDGET_USAGE_RETENTION_CURRENT_CALLER_DISPOSITION_PROFILE as Record<
          string,
          string
        >
      )[key],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(
    MANDATORY_BUDGET_CALLER_CANONICAL_PROFILE,
  )) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (
        EXPIRY_CURRENT_MANDATORY_BUDGET_CALLER_CANONICAL_PROFILE as Record<
          string,
          string
        >
      )[key],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(
    MANDATORY_BUDGET_CALLER_WORKSPACE_PROFILE,
  )) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (
        EXPIRY_CURRENT_MANDATORY_BUDGET_CALLER_WORKSPACE_PROFILE as Record<
          string,
          string
        >
      )[key],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(
    MANDATORY_BUDGET_CALLER_OPERATION_PROFILE,
  )) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (
        EXPIRY_CURRENT_MANDATORY_BUDGET_CALLER_OPERATION_PROFILE as Record<
          string,
          string
        >
      )[key],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(
    MANDATORY_BUDGET_USAGE_RETENTION_CALLER_FULL_PROFILE,
  )) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (
        EXPIRY_CURRENT_MANDATORY_BUDGET_USAGE_RETENTION_CALLER_FULL_PROFILE as Record<
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
    EXPIRY_CURRENT_MANDATORY_BUDGET_USAGE_RETENTION_CURRENT_CALLER_SOURCE_PROFILE,
  )) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (
        GENERATION_CURRENT_EXPIRY_CURRENT_MANDATORY_BUDGET_USAGE_RETENTION_CURRENT_CALLER_SOURCE_PROFILE as Record<
          string,
          string
        >
      )[key],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(
    EXPIRY_CURRENT_MANDATORY_BUDGET_USAGE_RETENTION_CURRENT_CALLER_DISPOSITION_PROFILE,
  )) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (
        GENERATION_CURRENT_EXPIRY_CURRENT_MANDATORY_BUDGET_USAGE_RETENTION_CURRENT_CALLER_DISPOSITION_PROFILE as Record<
          string,
          string
        >
      )[key],
    ).toBe(successor ? successor.after : value);
  }
  for (const [key, value] of Object.entries(
    EXPIRY_CURRENT_MANDATORY_BUDGET_USAGE_RETENTION_CALLER_FULL_PROFILE,
  )) {
    const successor = rows.find((p) => p.before === value);
    expect(
      (
        GENERATION_CURRENT_EXPIRY_CURRENT_MANDATORY_BUDGET_USAGE_RETENTION_CALLER_FULL_PROFILE as Record<
          string,
          string
        >
      )[key],
    ).toBe(successor ? successor.after : value);
  }
});
