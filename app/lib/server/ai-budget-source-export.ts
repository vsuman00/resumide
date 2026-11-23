import { z } from "zod";
import {
  AiBudgetSourceSchema,
  AiBudgetSourceUuidSchema,
  assertAiBudgetSourceJson,
  createSourceBoundAiBudgetOperationId,
  withAiBudgetSourceReadiness,
  type AiBudgetSourceProfileSelection,
  type AiBudgetSourceRpcClient,
  type AiBudgetSourceOptions,
} from "./ai-budget-source";
const row = z.strictObject({
  operationId: AiBudgetSourceUuidSchema,
  ownerId: AiBudgetSourceUuidSchema,
  organizationId: AiBudgetSourceUuidSchema,
  kind: z.enum([
    "legacy_rewrite",
    "legacy_qualitative",
    "canonical_rewrite",
    "initial_feedback",
    "build_account",
  ]),
  analysisId: AiBudgetSourceUuidSchema.nullable(),
  resumeId: AiBudgetSourceUuidSchema.nullable(),
  resumeVersionId: AiBudgetSourceUuidSchema.nullable(),
  requestNonce: AiBudgetSourceSchema.shape.requestNonce,
  bindingSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  registeredAt: z.iso
    .datetime()
    .regex(/^(?!0000)\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/u),
});
const envelope = z.strictObject({
  schemaVersion: z.literal("owned-ai-budget-sources/2.0.0"),
  ownerId: AiBudgetSourceUuidSchema,
  sources: z.array(row).max(4096),
});
export type AiBudgetSourceExport = z.infer<typeof envelope>;
export class AiBudgetSourceExportError extends Error {
  constructor() {
    super("AI budget source export is unavailable.");
    this.name = "AiBudgetSourceExportError";
  }
}
export function validateAiBudgetSourceExport(
  raw: unknown,
  ownerId: string,
): AiBudgetSourceExport {
  try {
    AiBudgetSourceUuidSchema.parse(ownerId);
    assertAiBudgetSourceJson(raw);
    const value = envelope.parse(raw),
      seen = new Set<string>();
    if (value.ownerId !== ownerId) throw new AiBudgetSourceExportError();
    for (const item of value.sources) {
      let identity: string;
      if (item.kind === "build_account") {
        if (
          item.analysisId !== null ||
          item.resumeId !== null ||
          item.resumeVersionId !== null
        )
          throw new AiBudgetSourceExportError();
        identity = createSourceBoundAiBudgetOperationId({
          userId: item.ownerId,
          organizationId: item.organizationId,
          source: {
            schemaVersion: "ai-budget-source/2.0.0",
            kind: item.kind,
            requestNonce: item.requestNonce,
          },
        });
      } else {
        if (!item.analysisId || !item.resumeId || !item.resumeVersionId)
          throw new AiBudgetSourceExportError();
        if (item.kind === "legacy_qualitative") {
          AiBudgetSourceUuidSchema.parse(item.requestNonce);
          if (item.requestNonce !== item.analysisId)
            throw new AiBudgetSourceExportError();
          identity = item.analysisId;
        } else if (item.kind === "initial_feedback") {
          identity = AiBudgetSourceUuidSchema.parse(item.requestNonce);
        } else
          identity = createSourceBoundAiBudgetOperationId({
            userId: item.ownerId,
            organizationId: item.organizationId,
            source:
              item.kind === "legacy_rewrite"
                ? {
                    schemaVersion: "ai-budget-source/1.0.0",
                    kind: item.kind,
                    analysisId: item.analysisId,
                    resumeVersionId: item.resumeVersionId,
                    requestNonce: item.requestNonce,
                  }
                : {
                    schemaVersion: "ai-budget-source/2.0.0",
                    kind: item.kind,
                    analysisId: item.analysisId,
                    resumeVersionId: item.resumeVersionId,
                    operationId: AiBudgetSourceUuidSchema.parse(
                      item.requestNonce,
                    ),
                    bindingSha256: item.bindingSha256,
                  },
          });
      }
      if (
        item.ownerId !== ownerId ||
        seen.has(item.operationId) ||
        item.operationId !== identity
      )
        throw new AiBudgetSourceExportError();
      seen.add(item.operationId);
    }
    return value;
  } catch {
    throw new AiBudgetSourceExportError();
  }
}
export async function readAiBudgetSourceExport(
  client: AiBudgetSourceRpcClient,
  ownerId: string,
  profile: AiBudgetSourceProfileSelection,
  options: AiBudgetSourceOptions = {},
): Promise<AiBudgetSourceExport> {
  try {
    AiBudgetSourceUuidSchema.parse(ownerId);
    return await withAiBudgetSourceReadiness(
      client,
      profile,
      "exportExecutable",
      async (call) =>
        validateAiBudgetSourceExport(
          await call("export_owned_ai_budget_sources", { p_user_id: ownerId }),
          ownerId,
        ),
      options,
    );
  } catch {
    throw new AiBudgetSourceExportError();
  }
}
