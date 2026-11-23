import { z } from "zod";
import { getServerConfig } from "~/lib/server/config";
import { getAuthenticatedUser } from "~/lib/server/auth";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "~/lib/server/supabase";
import { assertSameOrigin } from "~/lib/server/security";
import {
  readTypedAuthoringHttpForm,
  executeTypedAuthoringHttp,
  TypedAuthoringHttpError,
  TypedAuthoringHttpSuccessSchema,
  typedAuthoringHttpErrorResponse,
  typedAuthoringPrivateHeaders,
  type TypedAuthoringHttpInput,
} from "~/lib/server/typed-authoring-http";

type Args = { request: Request; params: { id?: string } };
export function loader() {
  const headers = typedAuthoringPrivateHeaders();
  headers.set("Allow", "POST");
  return typedAuthoringHttpErrorResponse(
    new TypedAuthoringHttpError(405, "invalid_input", "unavailable"),
    headers,
  );
}
export async function action({ request, params }: Args) {
  const headers = typedAuthoringPrivateHeaders();
  let input: TypedAuthoringHttpInput | undefined;
  try {
    if (request.method !== "POST") {
      headers.set("Allow", "POST");
      throw new TypedAuthoringHttpError(405, "invalid_input", "unavailable");
    }
    const config = getServerConfig();
    if (
      !config.SCORING_V2_ENABLED ||
      !config.AUTHORING_ENABLED ||
      !config.TYPED_AUTHORING_ENABLED
    )
      throw new TypedAuthoringHttpError(404, "unavailable", "unavailable");
    try {
      assertSameOrigin(request, config.APP_ORIGIN);
    } catch {
      throw new TypedAuthoringHttpError(403, "invalid_input", "unavailable");
    }
    const user = await getAuthenticatedUser(
      createSupabaseServerClient(request, headers),
    );
    if (!user)
      throw new TypedAuthoringHttpError(401, "unavailable", "unavailable");
    if (
      !z.uuid().safeParse(params.id).success ||
      !z.uuid().safeParse(user.id).success
    )
      throw new TypedAuthoringHttpError(422);
    input = await readTypedAuthoringHttpForm(request);
    const result = await executeTypedAuthoringHttp(
      createSupabaseAdminClient(),
      params.id ?? "",
      user.id,
      input,
    );
    return Response.json(TypedAuthoringHttpSuccessSchema.parse(result), {
      headers,
    });
  } catch (error) {
    return typedAuthoringHttpErrorResponse(error, headers, input?.action);
  }
}
