import { createHash, randomUUID } from "node:crypto";
import { appendFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import type { BrowserContext } from "@playwright/test";

export async function createLatexOwner() {
  const url = process.env.SUPABASE_URL;
  const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
  const secret = process.env.SUPABASE_SECRET_KEY;
  const ledger = process.env.AA7_AUTH_RECEIPT_FILE;
  if (
    !url ||
    !publishable ||
    !secret ||
    process.env.AA7_HOSTED_TEST_AUTHORIZATION !==
      "temporary-synthetic-users-20261030" ||
    process.env.AA7_TEST_SUPABASE_URL !== url ||
    !ledger ||
    !/^\/tmp\/resumide-aa7-[a-z0-9-]+\.jsonl$/.test(ledger)
  ) {
    throw new Error(
      "LaTeX auth fixtures require explicit approval for the configured Supabase test target",
    );
  }
  const admin = createClient(url, secret, { auth: { persistSession: false } });
  const email = `aa7-${randomUUID()}@example.test`;
  const password = randomUUID() + randomUUID();
  const result = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (result.error || !result.data.user)
    throw new Error("Synthetic converter owner creation failed");
  const ownerId = result.data.user.id;
  try {
    await appendFile(
      ledger,
      JSON.stringify({
        ownerId,
        rateKey:
          "latex:user:" + createHash("sha256").update(ownerId).digest("hex"),
        createdAt: new Date().toISOString(),
      }) + "\n",
      { mode: 0o600 },
    );
  } catch {
    await admin.auth.admin.deleteUser(ownerId);
    throw new Error("Synthetic converter cleanup ledger unavailable");
  }
  const organizationResult = await admin
    .from("organizations")
    .select("id")
    .eq("owner_id", ownerId);
  if (organizationResult.error) {
    await admin.auth.admin.deleteUser(ownerId);
    throw new Error("Synthetic converter workspace capture failed");
  }
  const organizationIds = organizationResult.data.map(
    (organization) => organization.id as string,
  );
  const clients: Array<ReturnType<typeof createServerClient>> = [];
  return {
    admin,
    email,
    password,
    ownerId,
    async login(context: BrowserContext, origin = "http://127.0.0.1:3110") {
      if (new URL(origin).hostname !== "127.0.0.1")
        throw new Error("Only local browser fixtures are allowed");
      const cookies: Array<{ name: string; value: string }> = [];
      const client = createServerClient(url, publishable, {
        cookies: {
          getAll: () => cookies,
          setAll: (values) => {
            cookies.splice(
              0,
              cookies.length,
              ...values.map(({ name, value }) => ({ name, value })),
            );
          },
        },
      });
      if ((await client.auth.signInWithPassword({ email, password })).error)
        throw new Error("Synthetic converter login failed");
      clients.push(client);
      await context.addCookies(
        cookies.map((cookie) => ({
          ...cookie,
          url: origin,
          httpOnly: true,
          sameSite: "Lax" as const,
        })),
      );
      return client;
    },
    async cleanup() {
      for (const client of clients) await client.auth.signOut();
      if ((await admin.auth.admin.deleteUser(ownerId)).error)
        throw new Error("Synthetic converter owner cleanup failed");
      for (const [table, column, value] of [
        ["profiles", "id", ownerId],
        ["memberships", "user_id", ownerId],
      ] as const) {
        const remaining = await admin
          .from(table)
          .select(column)
          .eq(column, value);
        if (remaining.error || remaining.data.length)
          throw new Error("Synthetic converter auth cascade cleanup failed");
      }
      if (organizationIds.length) {
        const remaining = await admin
          .from("organizations")
          .select("id")
          .in("id", organizationIds);
        if (remaining.error || remaining.data.length)
          throw new Error(
            "Synthetic converter workspace cascade cleanup failed",
          );
      }
    },
  };
}
