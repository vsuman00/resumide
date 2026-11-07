import { createHash } from "node:crypto";
import { appendFile } from "node:fs/promises";
import { createLatexOwner } from "./latex-auth";
export const BUILD_AI_SOURCE =
  "\\documentclass{article}\n\\begin{document}\n% FAR_PRIVATE_CANARY before.\nNearby first context.\nNearby second context.\nHelped reduce incidents 12 percent.\nNearby third context.\nNearby fourth context.\n% FAR_PRIVATE_CANARY after.\n\\end{document}\n";
export async function createBuildAssistOwner() {
  const owner = await createLatexOwner();
  const result = await owner.admin
    .from("organizations")
    .select("id")
    .eq("owner_id", owner.ownerId)
    .single();
  if (result.error) {
    await owner.cleanup();
    throw Error("Synthetic assist organization unavailable");
  }
  const orgId = result.data.id as string,
    month = new Date().toISOString().slice(0, 7);
  const keys = [
    `build-ai:user:${createHash("sha256").update(owner.ownerId).digest("hex")}`,
    `build-ai:month:${month}:${createHash("sha256").update(orgId).digest("hex")}`,
  ];
  await appendFile(
    process.env.AA7_AUTH_RECEIPT_FILE!,
    JSON.stringify({
      recordType: "build-ai",
      ownerId: owner.ownerId,
      orgId,
      keys,
    }) + "\n",
    { mode: 0o600 },
  );
  return {
    ...owner,
    orgId,
    async cleanup() {
      const consents = await owner.admin
        .from("consents")
        .select("*")
        .eq("user_id", owner.ownerId);
      const audit = await owner.admin
        .from("audit_events")
        .select("*")
        .eq("actor_id", owner.ownerId);
      if (consents.error || audit.error)
        throw Error("Synthetic assist metadata inspection failed");
      if (
        JSON.stringify([consents.data, audit.data]).includes(
          "Helped reduce incidents",
        )
      )
        throw Error("Source leaked into consent/audit metadata");
      await owner.cleanup();
      for (const [table, column] of [
        ["consents", "user_id"],
        ["audit_events", "actor_id"],
      ] as const) {
        const remaining = await owner.admin
          .from(table)
          .select("id")
          .eq(column, owner.ownerId);
        if (remaining.error || remaining.data.length)
          throw Error("Synthetic assist metadata cleanup failed");
      }
    },
  };
}
