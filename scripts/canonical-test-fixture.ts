import { randomUUID, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getServerConfig } from "../app/lib/server/config";
import { createSupabaseAdminClient } from "../app/lib/server/supabase";
import { buildNativeEvidence } from "../app/lib/server/native-evidence";
import { reconcileDocumentEvidence } from "../app/lib/server/document-evidence";
import { createResumeStorageKey } from "../app/lib/server/storage";

export const CANONICAL_FIXTURE_TEXT =
  "Name: Demo Person\nEmail: demo@example.test\nExperience\nEmployer: Fictional Co\nRole: Engineer\nDates: 2020 - 2022\nBuilt reliable tests\nEducation\nEducation: Fictional University\nSkills\nTypeScript\nCertifications\nCertification: Fictional Certificate";

export async function createCanonicalFixture(
  text = CANONICAL_FIXTURE_TEXT,
  sourceBytes?: Uint8Array,
) {
  const config = getServerConfig();
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(
      new URL(config.SUPABASE_URL).hostname,
    )
  )
    throw new Error("AA2 fixtures require an isolated local database");
  const admin = createSupabaseAdminClient();
  const email = `aa2-local-${randomUUID()}@example.test`;
  const password = randomUUID() + randomUUID();
  const result = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (result.error || !result.data.user)
    throw new Error("Synthetic owner creation failed");
  const ownerId = result.data.user.id;
  let sourceStorageKey: string | null = null;
  const user = createClient(
    config.SUPABASE_URL,
    config.SUPABASE_PUBLISHABLE_KEY,
    { auth: { persistSession: false } },
  );
  const cleanup = async () => {
    await user.auth.signOut();
    const storageRemoval = sourceStorageKey
      ? await admin.storage
          .from(config.SUPABASE_RESUME_BUCKET)
          .remove([sourceStorageKey])
      : null;
    const removed = await admin.auth.admin.deleteUser(ownerId);
    if (removed.error) throw new Error("Synthetic owner cleanup failed");
    if (storageRemoval?.error)
      throw new Error("Synthetic source cleanup failed");
  };
  try {
    if ((await user.auth.signInWithPassword({ email, password })).error)
      throw new Error("Synthetic owner sign-in failed");
    const org = await admin
      .from("organizations")
      .select("id")
      .eq("owner_id", ownerId)
      .single();
    if (org.error) throw new Error("Synthetic workspace lookup failed");
    const organizationId = org.data.id as string;
    const resumeId = randomUUID(),
      sourceId = randomUUID(),
      analysisId = randomUUID(),
      attemptId = randomUUID();
    const checksum = sourceBytes
      ? createHash("sha256").update(sourceBytes).digest("hex")
      : "a".repeat(64);
    if (sourceBytes) {
      sourceStorageKey = createResumeStorageKey({
        organizationId,
        resumeId,
        versionId: sourceId,
      });
      const uploaded = await admin.storage
        .from(config.SUPABASE_RESUME_BUCKET)
        .upload(sourceStorageKey, sourceBytes, {
          contentType: "application/pdf",
          upsert: false,
        });
      if (uploaded.error) throw new Error("Synthetic source upload failed");
    }
    const inserts: Array<[string, Record<string, unknown>]> = [
      [
        "resumes",
        {
          id: resumeId,
          organization_id: organizationId,
          owner_id: ownerId,
          display_name: "Synthetic AA2 fixture",
        },
      ],
      [
        "resume_versions",
        {
          id: sourceId,
          resume_id: resumeId,
          organization_id: organizationId,
          owner_id: ownerId,
          storage_key: sourceStorageKey ?? `aa2-local/${sourceId}`,
          checksum,
          bytes: sourceBytes?.byteLength ?? 1024,
          media_type: "application/pdf",
        },
      ],
      [
        "analyses",
        {
          id: analysisId,
          resume_version_id: sourceId,
          organization_id: organizationId,
          owner_id: ownerId,
          status: "extracting",
          idempotency_key: randomUUID(),
        },
      ],
    ];
    for (const [table, record] of inserts)
      if ((await admin.from(table).insert(record)).error)
        throw new Error("Synthetic source setup failed");
    const envelope = reconcileDocumentEvidence(
      {
        id: attemptId,
        ownerId,
        analysisId,
        sourceId,
        inputSha256: checksum,
        createdAt: new Date().toISOString(),
        retentionPolicyId: "local-synthetic-30d/1.0.0",
      },
      buildNativeEvidence([text]),
    );
    const persisted = await admin.rpc("persist_document_evidence", {
      p_analysis_id: analysisId,
      p_envelope: envelope,
      p_process_id: "aa2-local",
      p_request_id: "aa2-local-fixture",
    });
    if (persisted.error || persisted.data !== true)
      throw new Error("Synthetic evidence persistence failed");
    return {
      admin,
      user,
      email,
      password,
      ownerId,
      organizationId,
      resumeId,
      sourceId,
      analysisId,
      attemptId,
      envelope,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
