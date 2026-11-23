import { redirect } from "react-router";
import type { Route } from "./+types/auth.callback";
import {
  authResponseHeaders,
  getAuthenticatedUser,
  safeReturnTo,
} from "~/lib/server/auth";
import { createSupabaseServerClient } from "~/lib/server/supabase";
import {
  deletionVerificationIntent,
  getDeletionVerification,
} from "~/lib/server/deletion-verification";

export async function loader({ request, url }: Route.LoaderArgs) {
  const code = url.searchParams.get("code");
  const returnTo = safeReturnTo(url.searchParams.get("next"));
  const responseHeaders = new Headers();
  if (url.searchParams.get("intent") === deletionVerificationIntent) {
    const failure = () =>
      redirect("/privacy?deletion=invalid", {
        headers: authResponseHeaders(responseHeaders),
      });
    if (!code) return failure();
    try {
      const primary = createSupabaseServerClient(request, responseHeaders);
      const user = await getAuthenticatedUser(primary);
      if (!user) return failure();
      const verificationHeaders = new Headers();
      const verification = await getDeletionVerification(
        request,
        verificationHeaders,
        primary,
        user.id,
        "callback",
      );
      if (!verification) return failure();
      const { data, error } =
        await verification.client.auth.exchangeCodeForSession(code);
      if (error || data.user?.id !== user.id || !(await verification.proof()))
        return failure();
      for (const cookie of verificationHeaders.getSetCookie())
        responseHeaders.append("Set-Cookie", cookie);
    } catch {
      return failure();
    }
    return redirect("/privacy?deletion=verified", {
      headers: authResponseHeaders(responseHeaders),
    });
  }
  const recovery = () => {
    const params = new URLSearchParams({ error: "invalid_link" });
    if (returnTo !== "/") params.set("next", returnTo);
    return redirect(`/auth?${params}`, {
      headers: authResponseHeaders(responseHeaders),
    });
  };

  if (!code) return recovery();

  try {
    const client = createSupabaseServerClient(request, responseHeaders);
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) return recovery();
  } catch {
    return recovery();
  }

  return redirect(returnTo, {
    headers: authResponseHeaders(responseHeaders),
  });
}
