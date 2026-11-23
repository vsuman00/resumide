import { z } from "zod";
import { getServerConfig } from "~/lib/server/config";
import { getAuthenticatedUser } from "~/lib/server/auth";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "~/lib/server/supabase";
import { assertSameOrigin } from "~/lib/server/security";
import {
  readJdClauseOrderHttpForm,
  executeJdClauseOrderHttp,
  JdClauseOrderHttpError,
  JdClauseOrderHttpSuccessSchema,
  jdClauseOrderHttpErrorResponse,
  jdClauseOrderPrivateHeaders,
  type JdClauseOrderHttpInput,
} from "~/lib/server/jd-clause-order-http";

type Args = { request: Request; params: { id?: string } };
export function loader() {
  const headers = jdClauseOrderPrivateHeaders();
  headers.set("Allow", "POST");
  return jdClauseOrderHttpErrorResponse(
    new JdClauseOrderHttpError(405, "invalid_input", "unavailable"),
    headers,
  );
}
export async function action({ request, params }: Args) {
  const headers = jdClauseOrderPrivateHeaders();
  let input: JdClauseOrderHttpInput | undefined;
  try {
    if (request.method !== "POST") {
      headers.set("Allow", "POST");
      throw new JdClauseOrderHttpError(405, "invalid_input", "unavailable");
    }
    const config = getServerConfig();
    if (
      !config.SCORING_V2_ENABLED ||
      !config.AUTHORING_ENABLED ||
      !config.TYPED_AUTHORING_ENABLED
    )
      throw new JdClauseOrderHttpError(404, "unavailable", "unavailable");
    try {
      assertSameOrigin(request, config.APP_ORIGIN);
    } catch {
      throw new JdClauseOrderHttpError(403, "invalid_input", "unavailable");
    }
    const user = await getAuthenticatedUser(
      createSupabaseServerClient(request, headers),
    );
    if (!user)
      throw new JdClauseOrderHttpError(401, "unavailable", "unavailable");
    if (
      !z
        .uuid()
        .regex(/^[a-f0-9-]+$/u)
        .safeParse(params.id).success ||
      !z
        .uuid()
        .regex(/^[a-f0-9-]+$/u)
        .safeParse(user.id).success
    )
      throw new JdClauseOrderHttpError(422);
    input = await readJdClauseOrderHttpForm(request);
    const result = await executeJdClauseOrderHttp(
      createSupabaseAdminClient(),
      params.id ?? "",
      user.id,
      input,
      { signal: request.signal },
    );
    return Response.json(JdClauseOrderHttpSuccessSchema.parse(result), {
      headers,
    });
  } catch (error) {
    return jdClauseOrderHttpErrorResponse(error, headers, input?.action);
  }
}
