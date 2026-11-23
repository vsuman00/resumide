import { canonicalRewriteAction } from "~/lib/server/canonical-rewrite-service";
export const action = ({
  request,
  params,
}: {
  request: Request;
  params: { id?: string };
}) => canonicalRewriteAction(request, params.id);
export const loader = ({
  request,
  params,
}: {
  request: Request;
  params: { id?: string };
}) => canonicalRewriteAction(request, params.id);
