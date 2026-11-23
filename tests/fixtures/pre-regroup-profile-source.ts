import assert from "node:assert/strict";
import { createHash } from "node:crypto";

// These are exact edits made after the mandatory-budget, expiry and privacy
// generation snapshots. Check each removed block before reconstructing a snapshot.
const addedDeclarations = new Map<
  string,
  {
    start: string;
    end?: string;
    sha256: string;
  }
>([
  [
    "canonical-rewrite-readiness-profile.ts",
    {
      start: "\nexport const CANONICAL_REWRITE_REGROUP_READINESS_PROFILE ",
      sha256:
        "6f66a118b47f344726be7d9df3cf936f5d7bc855e036f17fe3092bee072cbd99",
    },
  ],
  [
    "canonical-rewrite-workspace-profile.ts",
    {
      start: "\nexport const CANONICAL_REWRITE_REGROUP_WORKSPACE_PROFILE ",
      sha256:
        "b1f3c697f0314877028e70e6df149955f7b4f921851ada015e0c8dab122fec12",
    },
  ],
  [
    "initial-feedback-profile.ts",
    {
      start: "\nexport const INITIAL_FEEDBACK_REGROUP_PROFILE ",
      end: "\nexport const OWNED_AI_RETIREMENT_PROFILE ",
      sha256:
        "7bc3aef9544c5044721d38ec99991eeea656f6471b4d500adc58a897be19c17e",
    },
  ],
  [
    "ai-budget-source-profile.ts",
    {
      start: "\nexport const AI_BUDGET_SOURCE_REGROUP_PROFILE ",
      sha256:
        "6c1aa7232a4888eb69338e7fae3d6b3d84bd6a3ac44133bae9886a0466eb8d79",
    },
  ],
  [
    "owned-ai-disposition-profile.ts",
    {
      start: "\n// The entry-regroup repair updates the checker",
      sha256:
        "ac172c6935549ac979b809bd70bab1ca3ce5a50a0e8fb6890e1f87c897ea829d",
    },
  ],
]);

export function preRegroupProfileSource(file: string, source: string): string {
  const name = file.split("/").at(-1)!;
  const addition = addedDeclarations.get(name);
  if (!addition) return source;

  const start = source.indexOf(addition.start);
  assert(start >= 0, `Missing regroup declaration in ${file}`);
  const end = addition.end
    ? source.indexOf(addition.end, start + addition.start.length)
    : source.length;
  assert(end > start, `Missing regroup declaration boundary in ${file}`);
  assert.equal(
    createHash("sha256").update(source.slice(start, end)).digest("hex"),
    addition.sha256,
    `Unexpected regroup declaration bytes in ${file}`,
  );

  const predecessor = source.slice(0, start) + source.slice(end);
  if (name !== "ai-budget-source-profile.ts") return predecessor;
  const addedHeader =
    "// Exact fingerprints for the export-generation and regroup-repair catalogs.\n";
  assert(predecessor.startsWith(addedHeader), `Unexpected header in ${file}`);
  return (
    "// Actual source pins only; data grants denied, Native/adoption unverified.\n" +
    predecessor.slice(addedHeader.length)
  );
}
