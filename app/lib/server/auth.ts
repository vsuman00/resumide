import type { User } from "@supabase/supabase-js";

export interface SessionReader {
  auth: {
    getUser: () => Promise<{ data: { user: User | null }; error: unknown }>;
  };
}

export function safeReturnTo(value: string | null): string {
  if (
    !value?.startsWith("/") ||
    value.startsWith("//") ||
    invalidPathCharacters(value)
  )
    return "/";
  const origin = "https://resumide.invalid";
  try {
    const url = new URL(value, origin);
    const decodedPath = decodeURIComponent(url.pathname);
    if (
      url.origin !== origin ||
      decodedPath.startsWith("//") ||
      invalidPathCharacters(decodedPath) ||
      /^\/auth(?:\/|$)/iu.test(decodedPath)
    )
      return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}

function invalidPathCharacters(value: string) {
  for (const character of value) {
    if (character === "\\" || character < " " || character === "\u007f")
      return true;
  }
  return false;
}

export function authResponseHeaders(source?: Headers): Headers {
  const headers = new Headers(source);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Referrer-Policy", "no-referrer");
  return headers;
}

export async function getAuthenticatedUser(
  client: SessionReader,
): Promise<User | null> {
  const { data, error } = await client.auth.getUser();
  if (error) return null;
  return data.user;
}
