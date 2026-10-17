import {
  data,
  redirect,
  Form,
  Link,
  useLoaderData,
  useActionData,
  useNavigation,
  useRouteError,
  useParams,
  isRouteErrorResponse,
  type HeadersFunction,
} from "react-router";
import WorkspaceShell from "~/components/WorkspaceShell";
import { getServerConfig } from "~/lib/server/config";
import { getAuthenticatedUser } from "~/lib/server/auth";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "~/lib/server/supabase";
import { CanonicalError } from "~/lib/server/canonical-repository";
import {
  loadArtifactPreview,
  readArtifactForm,
  renderOwnedArtifact,
} from "~/lib/server/artifact-repository";
import { assertSameOrigin } from "~/lib/server/security";
import {
  artifactIdentity,
  artifactError,
  privateArtifactHeaders,
} from "~/lib/server/artifact-route-helpers";
type Args = { request: Request; params: { id?: string } };
export const headers: HeadersFunction = ({
  loaderHeaders,
  actionHeaders,
  errorHeaders,
}) => {
  const h = privateArtifactHeaders();
  for (const source of [loaderHeaders, actionHeaders, errorHeaders])
    if (source)
      for (const c of source.getSetCookie()) h.append("Set-Cookie", c);
  return h;
};
export const meta = () => [{ title: "Preview and export | Resumide" }];
export async function loader({ request, params }: Args) {
  const h = privateArtifactHeaders();
  try {
    const user = await artifactIdentity(request, h);
    return data(
      await loadArtifactPreview(
        createSupabaseAdminClient(),
        params.id ?? "",
        user.id,
      ),
      { headers: h },
    );
  } catch (error) {
    if (
      error instanceof CanonicalError &&
      error.status === 404 &&
      !getServerConfig().ARTIFACT_RENDERING_ENABLED
    )
      throw artifactError(error, h);
    if (error instanceof CanonicalError && error.status === 404) {
      const user = await getAuthenticatedUser(
        createSupabaseServerClient(request, h),
      );
      if (!user)
        throw redirect(
          `/auth?next=${encodeURIComponent(`/analysis/${params.id ?? ""}/export`)}`,
          { headers: h },
        );
    }
    throw artifactError(error, h);
  }
}
export async function action({ request, params }: Args) {
  const h = privateArtifactHeaders();
  try {
    if (request.method !== "POST") {
      h.set("Allow", "POST");
      return data(
        { error: "Use POST.", report: null, options: null },
        { status: 405, headers: h },
      );
    }
    assertSameOrigin(request, getServerConfig().APP_ORIGIN);
    const user = await artifactIdentity(request, h),
      options = await readArtifactForm(request);
    const result = await renderOwnedArtifact(
      createSupabaseAdminClient(),
      params.id ?? "",
      user.id,
      options,
      request.signal,
    );
    return data(
      { error: null, report: result.report, options },
      { status: result.report.state === "verified" ? 200 : 422, headers: h },
    );
  } catch (error) {
    return artifactError(error, h);
  }
}
export default function ExportWorkspace() {
  const model = useLoaderData<typeof loader>(),
    feedback = useActionData<typeof action>(),
    navigation = useNavigation();
  const busy = navigation.state !== "idle",
    plan = model.plan;
  const valid =
    feedback?.report?.state === "verified" &&
    feedback.report.versionId === model.headId;
  return (
    <WorkspaceShell
      eyebrow="Resume export"
      title="Preview your saved resume"
      description="Review the content, check an export, then download it."
    >
      <div style={{ overflowWrap: "anywhere", maxWidth: "100%" }}>
        <Link to={`/analysis/${model.analysisId}/canonical`}>
          Edit structured resume
        </Link>
        {" · "}
        <Link to={`/analysis/${model.analysisId}/score`}>Back to analysis</Link>
        <p>
          Each export is checked for recovered text, reading order, links and
          layout. These checks do not predict employer acceptance or certify
          screen-reader compatibility.
        </p>
        <article aria-label="Resume preview" lang={plan.locale}>
          {plan.blocks.map((block) =>
            block.kind === "name" ? (
              <h2 key={block.id}>{block.text}</h2>
            ) : block.kind === "heading" ? (
              <h3 key={block.id}>{block.text}</h3>
            ) : (
              <p key={block.id}>
                {block.link ? (
                  <a href={block.link} rel="noreferrer">
                    {block.text}
                  </a>
                ) : (
                  block.text
                )}
              </p>
            ),
          )}
        </article>
        <Form method="post">
          <fieldset disabled={busy}>
            <legend>Check export</legend>
            <input type="hidden" name="versionId" value={plan.versionId} />
            <input
              type="hidden"
              name="templateId"
              value="software-engineering-single-column"
            />
            <label htmlFor="export-format">Format</label>{" "}
            <select id="export-format" name="format">
              <option value="pdf">PDF</option>
              <option value="docx">DOCX</option>
            </select>{" "}
            <label htmlFor="export-page">Page size</label>{" "}
            <select id="export-page" name="pageSize">
              <option value="A4">A4</option>
              <option value="LETTER">US Letter</option>
            </select>{" "}
            <button type="submit">Check export</button>
          </fieldset>
        </Form>
        {busy && <p role="status">Preparing and checking your export…</p>}
        {feedback?.error && <p role="alert">{feedback.error}</p>}
        {feedback?.report && (
          <section aria-label="Export check">
            <h2>
              {valid ? "Export parity verified" : "Export verification failed"}
            </h2>
            <p>
              Saved version: {feedback.report.versionId}.{" "}
              {feedback.report.pages !== null
                ? `${feedback.report.pages} PDF pages.`
                : `Estimated ${feedback.report.estimatedPages ?? "unknown"} DOCX pages; actual flow depends on your viewer.`}
            </p>
            <ul>
              {feedback.report.diagnostics.map((message, i) => (
                <li key={i}>{message}</li>
              ))}
            </ul>
            {valid && feedback.options && (
              <form
                method="post"
                action={`/analysis/${model.analysisId}/artifact`}
              >
                {Object.entries(feedback.options).map(([key, value]) => (
                  <input key={key} type="hidden" name={key} value={value} />
                ))}
                <button type="submit">
                  Download checked {feedback.options.format.toUpperCase()}
                </button>
                <p>
                  The saved version and export are checked again when you
                  download.
                </p>
              </form>
            )}
          </section>
        )}
      </div>
    </WorkspaceShell>
  );
}
export function ErrorBoundary() {
  const error = useRouteError();
  const { id } = useParams();
  return (
    <WorkspaceShell
      eyebrow="Resume export"
      title="Export unavailable"
      description={
        isRouteErrorResponse(error) && typeof error.data?.error === "string"
          ? error.data.error
          : "Try again later."
      }
    >
      {id ? (
        <>
          <Link to={`/analysis/${id}/canonical`}>
            Review and confirm structured resume facts
          </Link>
          <p>
            <a href={`/analysis/${id}/source`}>Open original resume</a>
          </p>
        </>
      ) : (
        <Link to="/">Return to analyses</Link>
      )}
    </WorkspaceShell>
  );
}
