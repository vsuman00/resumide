import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const root =
  "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats";
const safeWrite = process.stdout.write.bind(process.stdout);
let suppressedOutputCalls = 0;
process.stdout.write = (() => {
  suppressedOutputCalls++;
  return true;
}) as typeof process.stdout.write;
process.stderr.write = (() => {
  suppressedOutputCalls++;
  return true;
}) as typeof process.stderr.write;
globalThis.fetch = async () => {
  throw new Error("NETWORK_PROHIBITED_FOR_LOCAL_OWNER_CHECK");
};
const emit = (value: unknown) => safeWrite(JSON.stringify(value) + "\n");
let phase = "module_loading";
let inputMetadata: { bytes: number; fileSha256: string } | null = null;
const unexpectedFailure = (error?: unknown) => {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : null;
  const safeCode = [
    "INVALID_PDF",
    "PAGE_LIMIT",
    "TEXT_LIMIT",
    "EMPTY_TEXT",
    "LAYOUT_LIMIT",
  ].includes(code ?? "")
    ? code
    : "NO_PUBLIC_ERROR_CODE";
  emit({
    schemaVersion: "owner-local-pdf-check/1.0.0",
    status: "failed",
    phase,
    reason: "LOCAL_CHECK_FAILED_DETAILS_WITHHELD",
    safeCode,
    inputMetadata,
  });
  process.exit(1);
};
process.on("uncaughtException", unexpectedFailure);
process.on("unhandledRejection", unexpectedFailure);

try {
  if (
    process.env.RESUMIDE_PRIVATE_VERIFY !== "aa7-owned-synthetic" ||
    process.env.AI_ENABLED !== "false"
  )
    throw new Error("SEALED_MODE_REQUIRED");
  const { extractPdfTextLayers, detectPdfTextProfile } = await import(
    `${root}/app/lib/server/ocr/pdf-detection.ts`
  );
  const { buildNativeEvidence } = await import(
    `${root}/app/lib/server/native-evidence.ts`
  );
  const { reconcileDocumentEvidence } = await import(
    `${root}/app/lib/server/document-evidence.ts`
  );
  const { parseContact } = await import(
    `${root}/app/lib/server/parsing/contact.ts`
  );
  const { parseSections } = await import(
    `${root}/app/lib/server/parsing/sections.ts`
  );
  const { importCanonicalEvidence } = await import(
    `${root}/app/lib/server/canonical-content.ts`
  );
  const { buildScoreDiagnostics } = await import(
    `${root}/app/lib/server/score-v2-engine.ts`
  );
  phase = "bounded_read_only_descriptor";
  const descriptor = Number(process.env.LOCAL_OWNER_PDF_FD);
  if (!Number.isInteger(descriptor) || descriptor < 3)
    throw new Error("PRIVATE_DESCRIPTOR_REQUIRED");
  const pdf = new Uint8Array(readFileSync(descriptor));
  if (pdf.byteLength > 10 * 1024 * 1024) throw new Error("LOCAL_INPUT_LIMIT");
  const fileSha256 = createHash("sha256").update(pdf).digest("hex");
  inputMetadata = { bytes: pdf.byteLength, fileSha256 };
  phase = "bounded_native_extraction";
  const layers = await extractPdfTextLayers(pdf, {
    maxPages: 10,
    maxCharacters: 100000,
    includeLayout: false,
  });
  const profile = detectPdfTextProfile(layers);
  phase = "in_memory_parser_and_gating";
  const lines = layers.pageTexts.flatMap((text: string) => text.split("\n"));
  const contact = parseContact(lines);
  const sections = parseSections(lines);
  const native = buildNativeEvidence(layers.pageTexts);
  const ownerId = randomUUID(),
    organizationId = randomUUID(),
    analysisId = randomUUID();
  const evidence = reconcileDocumentEvidence(
    {
      id: randomUUID(),
      ownerId,
      analysisId,
      sourceId: randomUUID(),
      inputSha256: fileSha256,
      createdAt: new Date().toISOString(),
      retentionPolicyId: "owner-local-one-off/no-persistence",
    },
    native,
  );
  const canonical = importCanonicalEvidence(evidence, {
    resumeId: randomUUID(),
    ownerId,
    organizationId,
  });
  const diagnostics = buildScoreDiagnostics({
    evidence,
    canonical,
    requirements: null,
    expectedPageCount: layers.totalPages,
  });
  const sectionTypes = new Set(
    sections.map((section: { type: string }) => section.type),
  );
  const sources = [
    "app/lib/server/ocr/pdf-detection.ts",
    "app/lib/server/extract.ts",
    "app/lib/server/native-evidence.ts",
    "app/lib/server/document-evidence.ts",
    "app/lib/server/evidence-fields.ts",
    "app/lib/server/parsing/contact.ts",
    "app/lib/server/parsing/sections.ts",
    "app/lib/server/canonical-content.ts",
    "app/lib/server/score-v2-engine.ts",
    "package-lock.json",
  ];
  const report = {
    schemaVersion: "owner-local-pdf-check/1.0.0",
    status: "completed",
    executedAt: new Date().toISOString(),
    evidenceScope:
      "one owner-authorized local file; aggregate observations only; no representative ground truth or corpus registration",
    fileSha256,
    bytes: pdf.byteLength,
    extraction: {
      pages: layers.totalPages,
      profile: profile.documentType,
      pageCharacterCounts: profile.pageCharacterCounts,
      nativeUsablePageCount: layers.totalPages - profile.pagesNeedingOcr.length,
      nativePageCoverage:
        (layers.totalPages - profile.pagesNeedingOcr.length) /
        layers.totalPages,
      pagesNeedingOcrCount: profile.pagesNeedingOcr.length,
      extractedCharacterCount: layers.text.length,
      ocrExecuted: false,
      visualRenderingExecuted: false,
    },
    parser: {
      contactPresence: {
        name: contact.name !== null,
        email: contact.email !== null,
        phone: contact.phone !== null,
        location: contact.location !== null,
        links: contact.links.length > 0,
      },
      standardSectionPresence: Object.fromEntries(
        [
          "summary",
          "experience",
          "education",
          "skills",
          "projects",
          "certifications",
          "publications",
        ].map((type) => [type, sectionTypes.has(type)]),
      ),
      sectionCount: sections.length,
      evidenceSpanCount: evidence.spans.length,
      fieldStateCounts: {
        reviewRequired: evidence.fields.filter(
          (f: { state: string }) => f.state === "review_required",
        ).length,
        notEvaluated: evidence.fields.filter(
          (f: { state: string }) => f.state === "not_evaluated",
        ).length,
        conflict: evidence.fields.filter(
          (f: { state: string }) => f.state === "conflict",
        ).length,
      },
      assertionCount: evidence.assertions.length,
      canonicalFactCount: canonical.facts.length,
    },
    gating: {
      evidenceScoringEligible: evidence.scoringEligible,
      evidenceStatus: evidence.status,
      evidenceUncalibrated: evidence.confidence.kind === "uncalibrated",
      scoreState: diagnostics.score.state,
      authoritativeValuesWithheld: diagnostics.score.dimensions.every(
        (d: { value: number | null; eligible: boolean }) =>
          d.value === null && !d.eligible,
      ),
      canonicalFactsAutoConfirmed: canonical.facts.some(
        (f: { state: string }) => f.state === "candidate_confirmed",
      ),
    },
    privacy: {
      inputViaMemoryPipe: false,
      inputViaReadOnlyDescriptor: true,
      candidateFieldsPersisted: false,
      rawTextPersisted: false,
      networkDeniedByOperatingSystem: true,
      providerCalls: 0,
      databaseCalls: 0,
      suppressedOutputCalls,
    },
    sourceHashes: Object.fromEntries(
      sources.map((p) => [
        p,
        createHash("sha256")
          .update(readFileSync(`${root}/${p}`))
          .digest("hex"),
      ]),
    ),
  };
  phase = "complete";
  emit(report);
} catch (error) {
  unexpectedFailure(error);
}
