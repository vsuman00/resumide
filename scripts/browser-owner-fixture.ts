import { getServerConfig } from "../app/lib/server/config";
import { createSupabaseAdminClient } from "../app/lib/server/supabase";
import { createBrowserTestAccount } from "./browser-test-target";

export async function createBrowserOwner() {
  const config = getServerConfig();
  const admin = createSupabaseAdminClient();
  const { ownerId, email, password } = await createBrowserTestAccount(
    config.SUPABASE_URL,
    admin.auth.admin,
    "browser-audit",
  );
  const cleanup = async () => {
    if ((await admin.auth.admin.deleteUser(ownerId)).error)
      throw new Error("Synthetic browser owner cleanup failed");
  };
  try {
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
