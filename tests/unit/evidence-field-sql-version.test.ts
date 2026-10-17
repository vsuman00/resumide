import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const readMigration = (name: string) =>
  readFileSync(
    new URL(`../../supabase/migrations/${name}`, import.meta.url),
    "utf8",
  );

it("adds only the explicit field parser version guard to the evidence persistence contract", () => {
  const historical = readMigration(
    "20261011140000_document_evidence_review.sql",
  )
    .split("create function public.persist_document_evidence")[1]
    .split("$$;")[0];
  const forward = readMigration(
    "20261017120000_evidence_field_parser_version.sql",
  )
    .split("create or replace function public.persist_document_evidence")[1]
    .split("$$;")[0];
  const withoutVersionGuard = forward.replace(
    "  if (p_envelope ? 'fieldExtractorVersion' and (jsonb_typeof(p_envelope->'fieldExtractorVersion') is distinct from 'string' or p_envelope->>'fieldExtractorVersion' is distinct from 'evidence-fields/1.0.1'))\n     or not private.evidence_keys(p_envelope - 'fieldExtractorVersion',",
    "  if not private.evidence_keys(p_envelope,",
  );
  // A replacement must retain every prior provenance, ownership, immutable
  // attempt, resource-bound, score-withholding and transaction check verbatim.
  expect(withoutVersionGuard).toBe(historical);
});
