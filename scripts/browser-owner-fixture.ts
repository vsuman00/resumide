import { randomUUID } from "node:crypto";
import { getServerConfig } from "../app/lib/server/config";
import { createSupabaseAdminClient } from "../app/lib/server/supabase";
import {
  requireBrowserTestTarget,
  recordBrowserFixture,
} from "./browser-test-target";

export async function createBrowserOwner() {
  const config = getServerConfig();
  requireBrowserTestTarget(config.SUPABASE_URL);
  const admin = createSupabaseAdminClient();
  const email = `browser-audit-${randomUUID()}@example.test`;
  const password = randomUUID() + randomUUID();
  const result = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (result.error || !result.data.user)
    throw new Error("Synthetic browser owner creation failed");
  const ownerId = result.data.user.id;
  const cleanup = async () => {
    if ((await admin.auth.admin.deleteUser(ownerId)).error)
      throw new Error("Synthetic browser owner cleanup failed");
  };
  try {
    await recordBrowserFixture(config.SUPABASE_URL, { ownerId });
    const org = await admin
      .from("organizations")
      .select("id")
      .eq("owner_id", ownerId)
      .single();
    if (org.error) throw new Error("Synthetic browser workspace unavailable");
    return {
      admin,
      ownerId,
      organizationId: org.data.id as string,
      email,
      password,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
