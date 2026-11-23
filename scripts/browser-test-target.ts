import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  appendPrivateTestLedger,
  requireManagedApiTarget,
  requirePrivateTestLedger,
} from "./managed-test-target.ts";

const REFUSAL =
  "Managed browser tests require an explicit target, disabled AI and private cleanup ledger";

function isLegacyLocalTarget(url: string): boolean {
  try {
    return ["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname);
  } catch {
    throw new Error(REFUSAL);
  }
}

export function requireBrowserTestTarget(url: string) {
  if (isLegacyLocalTarget(url)) return;
  if (
    process.env.BROWSER_SUPABASE_AUTHORIZATION !==
      "synthetic-owned-records-only" ||
    process.env.BROWSER_TEST_SUPABASE_URL !== url ||
    process.env.AI_ENABLED !== "false" ||
    !/^\/tmp\/resumide-auth-audit-[a-z0-9-]+\.jsonl$/.test(
      process.env.BROWSER_TEST_LEDGER ?? "",
    )
  )
    throw new Error(REFUSAL);
  try {
    requireManagedApiTarget(url);
  } catch {
    throw new Error(REFUSAL);
  }
  try {
    requirePrivateTestLedger(process.env.BROWSER_TEST_LEDGER!);
  } catch {
    throw new Error(`${REFUSAL}; fixture ledger is not private`);
  }
}

export async function recordBrowserFixture(
  url: string,
  record: { ownerId: string; storageKey?: string },
) {
  requireBrowserTestTarget(url);
  if (isLegacyLocalTarget(url)) return;
  try {
    appendPrivateTestLedger(
      process.env.BROWSER_TEST_LEDGER!,
      JSON.stringify(record) + "\n",
    );
  } catch {
    throw new Error(REFUSAL);
  }
}

type BrowserAccountPrefix =
  "browser-audit" | "aa2-local" | "aa011-browser" | "aa014-browser";

export async function createBrowserTestAccount(
  url: string,
  admin: Pick<SupabaseClient["auth"]["admin"], "createUser">,
  prefix: BrowserAccountPrefix,
) {
  const ownerId = randomUUID();
  const email = `${prefix}-${ownerId}@example.test`;
  const password = randomUUID() + randomUUID();

  // The UUID is known even if Auth commits the account and the reply is lost.
  await recordBrowserFixture(url, { ownerId });
  try {
    const { data, error } = await admin.createUser({
      id: ownerId,
      email,
      password,
      email_confirm: true,
    });
    if (error || data.user?.id !== ownerId)
      throw new Error("Synthetic account ID mismatch");
  } catch {
    throw new Error("Synthetic browser account creation could not be verified");
  }
  return { ownerId, email, password };
}
