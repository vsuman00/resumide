import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { loadInitialFeedbackConsumer } from "../app/lib/server/initial-feedback-consumer";
import { InitialFeedbackReadinessSchema } from "../app/lib/server/initial-feedback-operation-contract";
import { INITIAL_FEEDBACK_REGROUP_PROFILE } from "../app/lib/server/initial-feedback-profile";
import { INITIAL_FEEDBACK_OPERATION_PROFILE } from "../app/lib/server/initial-feedback-operation-profile";
import { INITIAL_FEEDBACK_PLAN_PROFILE } from "../app/lib/server/initial-feedback-plan-profile";
import { INITIAL_FEEDBACK_PUBLICATION_PROFILE } from "../app/lib/server/initial-feedback-publication-profile";
import { scoreExtractedResume } from "../app/lib/server/scoring-stage";
import { buildPartialFeedback } from "../app/lib/server/qualitative-stage";
import { FeedbackSchema } from "../app/lib/server/schema";
import { createSupabaseAdminClient } from "../app/lib/server/supabase";
import { visibleFeedbackGroups } from "../app/lib/result-feedback";
import {
  connectLocalPostgres,
  localSqlArgument as arg,
  localSqlLiteral as literal,
  localSupabaseFetch,
} from "./local-postgres-supabase";

assert.equal(process.env.RESUMIDE_PRIVATE_VERIFY, "aa7-owned-synthetic");
const sql = connectLocalPostgres(
  process.env.RESUMIDE_A13_SOCKET,
  process.env.RESUMIDE_A13_PSQL,
);
const client = createSupabaseAdminClient(
  localSupabaseFetch({
    origin: "https://local-a13.invalid",
    sql,
    tables: new Set(),
    rpcs: new Set([
      "read_initial_feedback_readiness",
      "read_initial_feedback_operation_readiness",
      "read_initial_feedback_plan_readiness",
      "read_initial_feedback_publication_readiness",
      "read_initial_feedback",
    ]),
  }),
);
const ownerId = randomUUID();
const foreignId = randomUUID();
const analysisId = randomUUID();
const owner = literal(ownerId);
const analysis = literal(analysisId);
const resume = literal(randomUUID());
const source = literal(randomUUID());
const organizationId = sql(
  `
  insert into auth.users(id,email) values
    (${owner},'a13-owner@example.test'),(${literal(foreignId)},'a13-foreign@example.test');
  select id from public.organizations where owner_id=${owner};
`,
  "postgres",
);
const org = literal(organizationId);
const text = "Built services using Python";
const d = scoreExtractedResume({
  text,
  pageCount: 1,
  pageTexts: [text],
  textChecksum: createHash("sha256").update(text).digest("hex"),
  jobDescription: "Python required",
});
const feedback = buildPartialFeedback(d);
feedback.content.tips[0] = {
  type: "good",
  tip: "Created services using Python",
  explanation: "Clarifies wording.",
  quote: text,
};
sql(
  `
  insert into public.resumes (id,organization_id,owner_id,display_name)
    values (${resume},${org},${owner},'Synthetic A13 fixture');
  insert into public.resume_versions (id,resume_id,organization_id,owner_id,storage_key,checksum,bytes,media_type,page_count)
    values (${source},${resume},${org},${owner},private.r17_storage_key(${org},${resume},${source}),${literal(d.inputTextChecksum)},1024,'application/pdf',1);
  insert into public.analyses (id,resume_version_id,organization_id,owner_id,status,idempotency_key)
    values (${analysis},${source},${org},${owner},'completed',gen_random_uuid());
  insert into public.analysis_deterministic_results (analysis_id,organization_id,owner_id,score,parse_view,rule_trace,keyword_coverage,input_text_checksum,result_checksum,parser_version,ruleset_version,normalizer_version,taxonomy_version)
    values (${analysis},${org},${owner},${d.score},${arg(d.parseView)},${arg(d.ruleTrace)},${arg(d.keywordCoverage)},${literal(d.inputTextChecksum)},${literal(d.resultChecksum)},${literal(d.parserVersion)},${literal(d.rulesetVersion)},${literal(d.normalizerVersion)},${literal(d.taxonomyVersion)});
  insert into public.analysis_results (analysis_id,organization_id,owner_id,feedback,parse_view,rule_trace,keyword_coverage,parser_version,ruleset_version,normalizer_version,taxonomy_version,prompt_version,schema_version,model_id)
    values (${analysis},${org},${owner},${arg(feedback)},${arg(d.parseView)},${arg(d.ruleTrace)},${arg(d.keywordCoverage)},${literal(d.parserVersion)},${literal(d.rulesetVersion)},${literal(d.normalizerVersion)},${literal(d.taxonomyVersion)},'legacy-fixture','legacy-fixture','local-fixture');
`,
  "postgres",
);
const inventory = () =>
  sql(
    `select to_jsonb(r) from public.analysis_results r where analysis_id=${analysis};`,
    "postgres",
  );
const before = inventory();
const saved = FeedbackSchema.parse(JSON.parse(before).feedback);
const scope = { ownerId, organizationId, analysisId };
async function metadata(name: string) {
  const { data, error } = await client.rpc(name);
  assert.equal(error, null);
  return data;
}
async function capabilities(readerExecutable: boolean) {
  assert.deepEqual(
    InitialFeedbackReadinessSchema.parse(
      await metadata("read_initial_feedback_readiness"),
    ),
    {
      ...INITIAL_FEEDBACK_REGROUP_PROFILE,
      schemaReady: true,
      readerExecutable,
      prepareExecutable: false,
      claimExecutable: false,
      settleExecutable: false,
      finishExecutable: false,
      usageExecutable: false,
      exportExecutable: false,
    },
  );
}
assert.deepEqual(await metadata("read_initial_feedback_plan_readiness"), {
  ...INITIAL_FEEDBACK_PLAN_PROFILE,
  schemaReady: true,
});
assert.deepEqual(await metadata("read_initial_feedback_operation_readiness"), {
  ...INITIAL_FEEDBACK_OPERATION_PROFILE,
  schemaReady: true,
  prepareExecutable: false,
  claimExecutable: false,
  settleExecutable: false,
});
assert.deepEqual(
  await metadata("read_initial_feedback_publication_readiness"),
  {
    ...INITIAL_FEEDBACK_PUBLICATION_PROFILE,
    schemaReady: true,
    readerExecutable: false,
    exportExecutable: false,
    finishExecutable: false,
  },
);
await capabilities(false);
assert.equal(
  (await loadInitialFeedbackConsumer(client, scope, saved)).status,
  "unavailable",
);

// This read-only capability exists only in the isolated test cluster.
sql(
  "grant execute on function public.read_initial_feedback(uuid,uuid) to service_role;",
  "postgres",
);
try {
  await capabilities(true);
  const provenance = await loadInitialFeedbackConsumer(client, scope, saved);
  assert.equal(provenance.status, "legacy_unbound");
  const tip = visibleFeedbackGroups(saved, false, provenance).find(
    (group) => group.source === "Content",
  )?.tips[0];
  assert.equal(tip?.classification, "unverified");
  assert.equal(inventory(), before);
  sql(`
    do $check$ begin
      perform public.read_initial_feedback(${literal(foreignId)},${analysis});
      raise exception 'Foreign owner read accepted';
    exception when insufficient_privilege then null; end $check$;
  `);
  sql(
    `insert into public.data_requests (organization_id,user_id,kind) values (${org},${owner},'deletion');`,
    "postgres",
  );
  sql(`
    do $check$ begin
      perform public.read_initial_feedback(${owner},${analysis});
      raise exception 'Pending-deletion owner read accepted';
    exception when insufficient_privilege then null; end $check$;
  `);
} finally {
  sql(
    "revoke execute on function public.read_initial_feedback(uuid,uuid) from service_role;",
    "postgres",
  );
}
await capabilities(false);
process.stdout.write(
  "Native feedback verified legacy provenance, ownership, deletion and staged reader denial.\n",
);
