import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { z } from "zod";
import {
  createJobRequirementRelations,
  jobRelationSemanticSha256,
} from "../app/lib/server/job-requirement-admission";

assert.equal(process.env.RESUMIDE_PRIVATE_VERIFY, "aa7-owned-synthetic");
const scope = z
  .strictObject({
    ownerId: z.uuid(),
    organizationId: z.uuid(),
    analysisId: z.uuid(),
    jobId: z.uuid(),
  })
  .parse(JSON.parse(readFileSync(0, "utf8")));
const document = createJobRequirementRelations(
  "🌏 Neutral role\nRequirements\nJS required\nPostgres required\nFastAPI or Flask required\nPython and SQL required\n1-4 years experience required\nZephyrCircuit required",
  {
    ...scope,
    parentVersionId: null,
    locale: "en-IN",
    domain: "software-engineering",
  },
);
process.stdout.write(
  JSON.stringify({
    document,
    semanticHash: jobRelationSemanticSha256(document),
  }),
);
