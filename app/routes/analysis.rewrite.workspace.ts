import { canonicalRewriteWorkspaceAction } from "~/lib/server/canonical-rewrite-workspace";
export const action = ({
  request,
  params,
}: {
  request: Request;
  params: { id?: string };
}) => canonicalRewriteWorkspaceAction(request, params.id);
export const loader = ({
  request,
  params,
}: {
  request: Request;
  params: { id?: string };
}) => canonicalRewriteWorkspaceAction(request, params.id);
