import { createHash, randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { OWNED_AI_DISPOSITION_PROFILE } from "../../app/lib/server/owned-ai-disposition-profile";
const controls = vi.hoisted(() => ({ relations: false }));
vi.mock("../../app/lib/server/config", () => ({
  getServerConfig: () => ({
    JOB_RELATIONS_ENABLED: controls.relations,
    JOB_INTELLIGENCE_ENABLED: true,
  }),
}));
import {
  JOB_ALIAS_LEXICON_SHA256,
  JOB_ALIAS_POLICY_VERSION,
  resolveJobAlias,
} from "../../app/lib/server/job-aliases";
import {
  LOCAL_JOB_RELATION_POLICY_SHA256,
  LOCAL_JOB_RELATION_POLICY_VERSION,
} from "../../app/lib/server/job-relations";
import {
  loadJobRequirements,
  saveJobRequirements,
} from "../../app/lib/server/job-requirement-repository";
import {
  JobRequirementRelationsSchema,
  jobRelationSemanticSha256,
} from "../../app/lib/server/job-requirement-admission";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const ids = {
  owner: "11111111-1111-4111-8111-111111111111",
  organization: "22222222-2222-4222-8222-222222222222",
  analysis: "33333333-3333-4333-8333-333333333333",
  job: "44444444-4444-4444-8444-444444444444",
  source: "55555555-5555-4555-8555-555555555555",
  resume: "66666666-6666-4666-8666-666666666666",
  version: "77777777-7777-4777-8777-777777777777",
  item: "88888888-8888-4888-8888-888888888888",
};
function handbuiltRow() {
  const sourceText = "Requirements\nJS required";
  const evidence = {
    spanId: "jd-13-24",
    start: 13,
    end: 24,
    quote: "JS required",
  };
  const token = { spanId: "jd-13-15", start: 13, end: 15, quote: "JS" };
  const mapping = resolveJobAlias("JS");
  return {
    schemaVersion: "requirements/2.0.0",
    producerVersion: "jd-relations/1.0.0",
    id: ids.version,
    parentVersionId: null,
    ownerId: ids.owner,
    organizationId: ids.organization,
    analysisId: ids.analysis,
    jobId: ids.job,
    createdAt: "2026-11-11T00:00:00Z",
    retentionPolicyId: "candidate-active-30d/1.0.0",
    inputSha256: sha(sourceText),
    locale: "en-IN",
    domain: "software-engineering",
    state: "review_required",
    sourceText,
    scoringEligible: false,
    mappingPolicy: {
      version: JOB_ALIAS_POLICY_VERSION,
      lexiconSha256: JOB_ALIAS_LEXICON_SHA256,
      externalTaxonomy: null,
    },
    relationPolicy: {
      version: LOCAL_JOB_RELATION_POLICY_VERSION,
      sha256: LOCAL_JOB_RELATION_POLICY_SHA256,
    },
    requirements: [
      {
        id: ids.item,
        type: "skill",
        value: "JS",
        importance: "required",
        importanceBasis: "explicit",
        importanceEvidence: { start: 13, end: 24, quote: "JS required" },
        derivation: "exact",
        minimumYears: null,
        negated: false,
        ambiguity: [],
        dedupGroup: sha("skill:js"),
        evidence,
        confidence: { kind: "uncalibrated", value: null },
        mapping,
        tokenEvidence: [token],
      },
    ],
    retainedClauses: [
      {
        evidence,
        importance: "required",
        negated: false,
        interpretation: "partial_vocabulary",
        reviewRequired: true,
        requirementIds: [ids.item],
      },
    ],
    relations: {
      clauses: [
        {
          id: sha(
            `${LOCAL_JOB_RELATION_POLICY_SHA256}:${ids.version}:${sha(sourceText)}:13:24`,
          ),
          evidence,
          reviewRequired: true,
          scope: { importance: "required", negated: false },
          skillExpression: {
            kind: "atom",
            value: "JS",
            evidence: token,
            requirementIds: [ids.item],
            mapping,
          },
          duration: {
            kind: "not_stated",
            evidence: null,
            lower: null,
            upper: null,
            operatorEvidence: [],
            candidateEvidence: [],
            reason: null,
            subjectBinding: "literal_clause_only",
            evaluated: false,
          },
          prospectiveCreditGroups: [mapping.prospectiveCreditGroup],
          numericCredit: null,
        },
      ],
    },
    warnings: [
      "uncalibrated_requirements",
      "domain_pack_review_pending",
      "local_alias_policy_not_admitted",
      "clause_interpretation_review_pending",
    ],
  };
}
type Common = {
  id: string;
  parentVersionId: string | null;
  createdAt: string;
  sourceText: string;
};
function fixture(
  content: Common | null,
  source = content?.sourceText ?? "SQL required",
) {
  let head = content?.id ?? null;
  const versions = new Map<string, { document: Common; revision: number }>(
    content ? [[content.id, { document: content, revision: 1 }]] : [],
  );
  const receipts = new Map<
    string,
    {
      command: string;
      versionId: string;
      revision: number;
      semanticSha256?: string;
    }
  >();
  const rpc = vi.fn(
    async (
      name: string,
      input: {
        p_body: Common;
        p_expected_version: string | null;
        p_idempotency_key: string;
      },
    ) => {
      const typed = name === "save_job_requirement_relations";
      const semanticSha256 = typed
        ? jobRelationSemanticSha256(input.p_body)
        : undefined;
      const command = JSON.stringify({
        name,
        source: typed ? semanticSha256 : sha(input.p_body.sourceText),
        expectedVersionId: input.p_expected_version,
      });
      const prior = receipts.get(input.p_idempotency_key);
      if (prior)
        return {
          error: null,
          data:
            prior.command !== command
              ? { status: "conflict" }
              : {
                  status: "applied",
                  versionId: prior.versionId,
                  revision: prior.revision,
                  idempotent: true,
                  ...(typed ? { semanticSha256: prior.semanticSha256 } : {}),
                },
        };
      if (head !== input.p_expected_version)
        return { error: null, data: { status: "conflict" } };
      const revision = versions.size + 1;
      versions.set(input.p_body.id, { document: input.p_body, revision });
      head = input.p_body.id;
      receipts.set(input.p_idempotency_key, {
        command,
        versionId: head,
        revision,
        semanticSha256,
      });
      return {
        error: null,
        data: {
          status: "applied",
          versionId: head,
          revision,
          idempotent: false,
          ...(typed ? { semanticSha256 } : {}),
        },
      };
    },
  );
  const privacy = {
    subjects: new Set([ids.owner]),
    preparations: [] as { owner_id: string }[],
    requests: [] as { user_id: string; kind: string; status: string }[],
  };
  const authorityRpc = vi.fn((name: string, args: Record<string, unknown>) => ({
    abortSignal: async (signal: AbortSignal) => {
      if (signal.aborted) throw Error("SYNTHETIC_AUTHORITY_ABORTED");
      if (name === "read_owned_ai_disposition_readiness")
        return {
          data: {
            ...OWNED_AI_DISPOSITION_PROFILE,
            schemaReady: true,
            exportExecutable: false,
            accessExecutable: true,
          },
          error: null,
        };
      const ownerId = String(args.p_user_id);
      if (
        name !== "read_candidate_privacy_access" ||
        !privacy.subjects.has(ownerId)
      )
        return { data: null, error: { code: "42501" } };
      return {
        data: {
          schemaVersion: "candidate-privacy-access/1.0.0",
          ownerId,
          deletionPrepared: privacy.preparations.some(
            (row) => row.owner_id === ownerId,
          ),
          blockingRequest: privacy.requests.some(
            (row) =>
              row.user_id === ownerId &&
              row.kind === "deletion" &&
              !["failed", "cancelled"].includes(row.status),
          ),
        },
        error: null,
      };
    },
  }));
  const client = {
    rpc(name: string, args: Record<string, unknown>) {
      if (
        [
          "read_owned_ai_disposition_readiness",
          "read_candidate_privacy_access",
        ].includes(name)
      )
        return authorityRpc(name, args);
      return rpc(name, args as Parameters<typeof rpc>[1]);
    },
    from(table: string) {
      let columns = "";
      const filters: Record<string, unknown> = {};
      const query = {
        select(value: string) {
          columns = value;
          return query;
        },
        eq(key: string, value: unknown) {
          filters[key] = value;
          return query;
        },
        neq() {
          return query;
        },
        order() {
          return query;
        },
        limit() {
          return query;
        },
        range() {
          return query;
        },
        maybeSingle() {
          return query;
        },
        then(
          yes: (value: unknown) => unknown,
          no: (error: unknown) => unknown,
        ) {
          let data: unknown;
          if (table === "analyses")
            data = {
              id: ids.analysis,
              job_id: ids.job,
              owner_id: ids.owner,
              organization_id: ids.organization,
              resume_version_id: ids.source,
            };
          else if (table === "jobs")
            data = {
              id: ids.job,
              title: "Software Engineer",
              description: source,
              owner_id: ids.owner,
              organization_id: ids.organization,
            };
          else if (table === "resume_versions")
            data = {
              id: ids.source,
              resume_id: ids.resume,
              owner_id: ids.owner,
              organization_id: ids.organization,
              active_resume: {
                id: ids.resume,
                owner_id: ids.owner,
                organization_id: ids.organization,
                status: "active",
              },
            };
          else if (table === "memberships") data = { user_id: ids.owner };
          else if (table === "data_requests") data = [];
          else if (table === "job_requirement_versions") {
            const selected = versions.get(String(filters.id ?? head));
            data =
              columns === "*" || columns === "id,content"
                ? selected
                  ? {
                      id: selected.document.id,
                      analysis_id: ids.analysis,
                      job_id: ids.job,
                      owner_id: ids.owner,
                      organization_id: ids.organization,
                      parent_version_id: selected.document.parentVersionId,
                      revision: selected.revision,
                      content: selected.document,
                      created_at: selected.document.createdAt,
                    }
                  : null
                : columns === "id,revision"
                  ? head
                    ? { id: head, revision: versions.get(head)!.revision }
                    : null
                  : [...versions.values()]
                      .reverse()
                      .map(({ document, revision }) => ({
                        id: document.id,
                        parent_version_id: document.parentVersionId,
                        revision,
                        created_at: document.createdAt,
                      }));
          } else throw Error("Unexpected table");
          return Promise.resolve({ data, error: null }).then(yes, no);
        },
      };
      return query;
    },
  };
  return {
    client: client as unknown as Parameters<typeof loadJobRequirements>[0],
    rpc,
    privacy,
    authorityRpc,
    setSource: (value: string) => {
      source = value;
    },
    head: () => head,
  };
}
beforeEach(() => {
  controls.relations = false;
});

it("loads a handbuilt immutable relation snapshot through the existing owned reader", async () => {
  const content = handbuiltRow(),
    f = fixture(content);
  const result = await loadJobRequirements(f.client, ids.analysis, ids.owner);
  expect(result.current?.document).toEqual(content);
  expect(result.scoringEligible).toBe(false);
  expect(f.rpc).not.toHaveBeenCalled();
});
const composite =
  "🌏 Neutral role\nRequirements\nJS required\nPostgres required\nFastAPI or Flask required\nPython and SQL required\n1-4 years experience required\nZephyrCircuit required";
it("roundtrips complete typed meaning through actual repository constructor, writer and reader with only owned DB mocked", async () => {
  controls.relations = true;
  const f = fixture(null, composite);
  const first = await saveJobRequirements(
    f.client,
    ids.analysis,
    ids.owner,
    { expectedVersionId: null, idempotencyKey: randomUUID() },
    "synthetic-roundtrip",
  );
  expect(f.rpc).toHaveBeenCalledWith(
    "save_job_requirement_relations",
    expect.objectContaining({
      p_user_id: ids.owner,
      p_analysis_id: ids.analysis,
      p_expected_version: null,
    }),
  );
  controls.relations = false;
  const loaded = await loadJobRequirements(f.client, ids.analysis, ids.owner);
  const doc = JobRequirementRelationsSchema.parse(loaded.current?.document);
  expect(doc.id).toBe(first.versionId);
  expect(doc.sourceText).toBe(composite);
  expect(
    doc.requirements.find((item) => item.value === "JS")?.mapping
      ?.canonicalValue,
  ).toBe("JavaScript");
  expect(
    doc.requirements.find((item) => item.value === "Postgres")?.mapping
      ?.canonicalValue,
  ).toBe("PostgreSQL");
  expect(
    doc.relations.clauses.some(
      (item) => item.skillExpression.kind === "any_of",
    ),
  ).toBe(true);
  expect(
    doc.relations.clauses.some(
      (item) => item.skillExpression.kind === "all_of",
    ),
  ).toBe(true);
  expect(
    doc.relations.clauses.find((item) => item.duration.kind === "range")
      ?.duration,
  ).toMatchObject({
    lower: { value: 1, inclusive: true },
    upper: { value: 4, inclusive: true },
  });
  expect(
    doc.relations.clauses.find(
      (item) => item.evidence.quote === "ZephyrCircuit required",
    )?.skillExpression.kind,
  ).toBe("unknown");
  expect(loaded.scoringEligible).toBe(false);
});
it("dispatches exact old-key retries before fresh-head admission without rewinding newer snapshots", async () => {
  controls.relations = true;
  const f = fixture(null, composite),
    command = { expectedVersionId: null, idempotencyKey: randomUUID() };
  const first = await saveJobRequirements(
    f.client,
    ids.analysis,
    ids.owner,
    command,
    "synthetic-first",
  );
  const second = await saveJobRequirements(
    f.client,
    ids.analysis,
    ids.owner,
    { expectedVersionId: first.versionId, idempotencyKey: randomUUID() },
    "synthetic-new-head",
  );
  const replay = await saveJobRequirements(
    f.client,
    ids.analysis,
    ids.owner,
    command,
    "synthetic-replay",
  );
  expect(replay).toMatchObject({
    versionId: first.versionId,
    revision: first.revision,
    idempotent: true,
  });
  expect(f.head()).toBe(second.versionId);
  expect(f.rpc).toHaveBeenCalledTimes(3);
});
it.each(["or", "bounds", "source"])(
  "passes valid changed %s semantics to the RPC and preserves its same-key conflict",
  async (kind) => {
    controls.relations = true;
    const f = fixture(null, composite),
      command = { expectedVersionId: null, idempotencyKey: randomUUID() };
    await saveJobRequirements(
      f.client,
      ids.analysis,
      ids.owner,
      command,
      "synthetic-before-change",
    );
    f.setSource(
      kind === "or"
        ? composite.replace("FastAPI or Flask", "FastAPI and Flask")
        : kind === "bounds"
          ? composite.replace("1-4 years", "1-5 years")
          : composite + "\nTypeScript preferred",
    );
    await expect(
      saveJobRequirements(
        f.client,
        ids.analysis,
        ids.owner,
        command,
        "synthetic-after-change",
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(f.rpc).toHaveBeenCalledTimes(2);
  },
);
it("keeps initial legacy dispatch and v1-parent receipts while refusing a flag-off v1 child of typed v2", async () => {
  const initial = fixture(null);
  const first = await saveJobRequirements(
    initial.client,
    ids.analysis,
    ids.owner,
    { expectedVersionId: null, idempotencyKey: randomUUID() },
    "synthetic-legacy",
  );
  expect(initial.rpc.mock.calls[0][0]).toBe("save_job_requirements");
  const legacy = await loadJobRequirements(
    initial.client,
    ids.analysis,
    ids.owner,
  );
  expect(legacy.current?.document.schemaVersion).toBe("requirements/1.0.0");
  const command = {
    expectedVersionId: first.versionId,
    idempotencyKey: randomUUID(),
  };
  const child = await saveJobRequirements(
    initial.client,
    ids.analysis,
    ids.owner,
    command,
    "synthetic-legacy-child",
  );
  expect(
    (
      await saveJobRequirements(
        initial.client,
        ids.analysis,
        ids.owner,
        command,
        "synthetic-legacy-replay",
      )
    ).versionId,
  ).toBe(child.versionId);
  controls.relations = true;
  const upgraded = await saveJobRequirements(
    initial.client,
    ids.analysis,
    ids.owner,
    { expectedVersionId: child.versionId, idempotencyKey: randomUUID() },
    "synthetic-typed-upgrade",
  );
  controls.relations = false;
  await expect(
    saveJobRequirements(
      initial.client,
      ids.analysis,
      ids.owner,
      command,
      "synthetic-legacy-replay-after-upgrade",
    ),
  ).resolves.toMatchObject({ versionId: child.versionId, idempotent: true });
  expect(initial.head()).toBe(upgraded.versionId);
  const typed = fixture(handbuiltRow());
  await expect(
    saveJobRequirements(
      typed.client,
      ids.analysis,
      ids.owner,
      { expectedVersionId: ids.version, idempotencyKey: randomUUID() },
      "synthetic-no-downgrade",
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(typed.rpc).not.toHaveBeenCalled();
});
it("reports unsupported Unicode runtime as unavailable for v2 while retaining the legacy reader", async () => {
  const descriptor = Object.getOwnPropertyDescriptor(
    process.versions,
    "unicode",
  )!;
  const typed = fixture(handbuiltRow());
  const legacy = fixture(null);
  await saveJobRequirements(
    legacy.client,
    ids.analysis,
    ids.owner,
    { expectedVersionId: null, idempotencyKey: randomUUID() },
    "synthetic-legacy-runtime",
  );
  try {
    Object.defineProperty(process.versions, "unicode", {
      ...descriptor,
      value: "unregistered",
    });
    await expect(
      loadJobRequirements(typed.client, ids.analysis, ids.owner),
    ).rejects.toMatchObject({ status: 503 });
    await expect(
      loadJobRequirements(legacy.client, ids.analysis, ids.owner),
    ).resolves.toMatchObject({
      current: { document: { schemaVersion: "requirements/1.0.0" } },
    });
    controls.relations = true;
    await expect(
      saveJobRequirements(
        typed.client,
        ids.analysis,
        ids.owner,
        { expectedVersionId: ids.version, idempotencyKey: randomUUID() },
        "synthetic-unsupported-runtime",
      ),
    ).rejects.toMatchObject({ status: 503 });
    expect(typed.rpc).not.toHaveBeenCalled();
  } finally {
    Object.defineProperty(process.versions, "unicode", descriptor);
  }
});
it("fails closed on an unknown legacy-parent discriminator without mutating", async () => {
  const parent = { ...handbuiltRow(), schemaVersion: "requirements/99.0.0" };
  const f = fixture(parent);
  await expect(
    saveJobRequirements(
      f.client,
      ids.analysis,
      ids.owner,
      { expectedVersionId: parent.id, idempotencyKey: randomUUID() },
      "synthetic-unknown-parent",
    ),
  ).rejects.toMatchObject({ status: 503 });
  expect(f.rpc).not.toHaveBeenCalled();
});
it.each(["policy", "producer", "scoringEligible"])(
  "rejects a client-selected %s before any writer RPC",
  async (key) => {
    controls.relations = true;
    const f = fixture(null, composite);
    await expect(
      saveJobRequirements(
        f.client,
        ids.analysis,
        ids.owner,
        {
          expectedVersionId: null,
          idempotencyKey: randomUUID(),
          [key]: "untrusted",
        },
        "synthetic-authority",
      ),
    ).rejects.toMatchObject({ status: 422 });
    expect(f.rpc).not.toHaveBeenCalled();
  },
);
it("does not accept a mismatched server replay hash as successful", async () => {
  controls.relations = true;
  const f = fixture(null, composite);
  f.rpc.mockResolvedValueOnce({
    error: null,
    data: {
      status: "applied",
      versionId: ids.version,
      revision: 1,
      idempotent: true,
      semanticSha256: "a".repeat(64),
    },
  });
  await expect(
    saveJobRequirements(
      f.client,
      ids.analysis,
      ids.owner,
      { expectedVersionId: null, idempotencyKey: randomUUID() },
      "synthetic-wrong-receipt",
    ),
  ).rejects.toMatchObject({ status: 503 });
});

it.each(["failed", "cancelled"])(
  "does not admit a typed JD write after prepared %s deletion",
  async (status) => {
    const f = fixture(null, composite);
    f.privacy.requests.push({ user_id: ids.owner, kind: "deletion", status });
    f.privacy.preparations.push({ owner_id: ids.owner });
    await expect(
      saveJobRequirements(
        f.client,
        ids.analysis,
        ids.owner,
        { expectedVersionId: null, idempotencyKey: randomUUID() },
        "synthetic-prepared-jd",
      ),
    ).rejects.toMatchObject({ status: 404 });
    expect(f.rpc).not.toHaveBeenCalled();
    expect(f.authorityRpc).toHaveBeenCalledWith(
      "read_candidate_privacy_access",
      { p_user_id: ids.owner },
    );
  },
);
