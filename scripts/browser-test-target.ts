import { appendFile } from "node:fs/promises";

export function requireBrowserTestTarget(url: string) {
  if (["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname))
    return;
  if (
    process.env.BROWSER_SUPABASE_AUTHORIZATION !==
      "synthetic-owned-records-only" ||
    process.env.BROWSER_TEST_SUPABASE_URL !== url ||
    process.env.AI_ENABLED !== "false" ||
    !/^\/tmp\/resumide-auth-audit-[a-z0-9-]+\.jsonl$/.test(
      process.env.BROWSER_TEST_LEDGER ?? "",
    )
  )
    throw new Error(
      "Managed browser tests require an explicit target, disabled AI and private cleanup ledger",
    );
}

export async function recordBrowserFixture(
  url: string,
  record: { ownerId: string; storageKey?: string },
) {
  requireBrowserTestTarget(url);
  if (["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname))
    return;
  await appendFile(
    process.env.BROWSER_TEST_LEDGER!,
    JSON.stringify(record) + "\n",
    { mode: 0o600 },
  );
}
