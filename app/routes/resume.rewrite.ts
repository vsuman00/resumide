import { rewriteAction } from "~/lib/server/rewrite-service";
export const action = ({
  request,
  params,
}: {
  request: Request;
  params: { id?: string };
}) => rewriteAction(request, params.id);
export const loader = ({
  request,
  params,
}: {
  request: Request;
  params: { id?: string };
}) => rewriteAction(request, params.id);
