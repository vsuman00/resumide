import { parseCookieHeader, serializeCookieHeader } from "@supabase/ssr";
import { z } from "zod";
import { getAuthenticatedUser } from "./auth";
import { getServerConfig } from "./config";
import {
  createSupabaseServerClient,
  getSessionCookieOptions,
} from "./supabase";

const prefix = "resumide-deletion-verification-";
const lifetimeSeconds = 600;
export const deletionVerificationIntent = "confirm-account-deletion";
type AuthClient = ReturnType<typeof createSupabaseServerClient>;

export async function getDeletionVerification(
  request: Request,
  headers: Headers,
  primary: AuthClient,
  userId: string,
  mode: "start" | "callback" | "read",
) {
  const cookies = parseCookieHeader(request.headers.get("Cookie") ?? "");
  if (mode !== "start" && !cookies.some(({ name }) => name.startsWith(prefix)))
    return null;
  const { data, error } = await primary.auth.getClaims();
  const primaryId = z.uuid().safeParse(data?.claims.session_id);
  if (error || data?.claims.sub !== userId || !primaryId.success) return null;

  // A verifier and its result are isolated from the regular Auth session and
  // are ignored on logout, account switch or any other primary session.
  const name = prefix + primaryId.data;
  const sessionCookies = cookies
    .map((cookie) => cookie.name)
    .filter((cookie) => cookie === name || cookie.startsWith(`${name}.`));
  if (mode === "read" && !sessionCookies.length) return null;
  if (
    mode === "callback" &&
    !cookies.some((cookie) => cookie.name === `${name}-code-verifier`)
  )
    return null;
  const client = createSupabaseServerClient(request, headers, {
    name,
    maxAgeSeconds: lifetimeSeconds,
  });
  return {
    client,
    async proof(): Promise<string | null> {
      const user = await getAuthenticatedUser(client);
      if (user?.id !== userId) return null;
      const { data, error } = await client.auth.getClaims();
      const claims = data?.claims;
      const verifiedSession = z.uuidv4().safeParse(claims?.session_id);
      const now = Math.floor(Date.now() / 1000);
      if (
        error ||
        !claims ||
        claims.sub !== userId ||
        !verifiedSession.success ||
        verifiedSession.data === primaryId.data ||
        !Array.isArray(claims.amr) ||
        !claims.amr.some(
          (entry) =>
            typeof entry === "object" &&
            entry !== null &&
            (entry.method === "magiclink" || entry.method === "otp") &&
            Number.isSafeInteger(entry.timestamp) &&
            entry.timestamp <= now &&
            now - entry.timestamp < lifetimeSeconds,
        )
      )
        return null;
      return verifiedSession.data;
    },
    clear() {
      // Include fresh chunks emitted by a refresh in this response.
      const written = headers
        .getSetCookie()
        .map((cookie) => cookie.split("=", 1)[0]);
      for (const cookie of new Set([...sessionCookies, ...written])) {
        if (cookie !== name && !cookie.startsWith(`${name}.`)) continue;
        headers.append(
          "Set-Cookie",
          serializeCookieHeader(
            cookie,
            "",
            getSessionCookieOptions(getServerConfig().APP_ORIGIN, 0),
          ),
        );
      }
    },
  };
}
