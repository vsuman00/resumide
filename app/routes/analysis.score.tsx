import { createHash } from "node:crypto";
import {
  data,
  redirect,
  Link,
  useLoaderData,
  useActionData,
  useRouteError,
  isRouteErrorResponse,
  type HeadersFunction,
} from "react-router";
import AuthoringWorkspace, {
  type AuthoringFeedback,
} from "~/components/AuthoringWorkspace";
import { loadAuthoring } from "~/lib/server/authoring-repository";
import WorkspaceShell from "~/components/WorkspaceShell";
import RequirementCoverageReview from "~/components/RequirementCoverageReview";
import TypedAuthoringBridge from "~/components/TypedAuthoringBridge";
import CanonicalRewritePanel from "~/components/CanonicalRewritePanel";
import ScoreAdmissionNotice from "~/components/ScoreAdmissionNotice";
import JdRecommendations from "~/components/JdRecommendations";
import JdClauseOrderBridge from "~/components/JdClauseOrderBridge";
import { loadJdClauseOrderWorkspace } from "~/lib/server/jd-clause-order-repository";
import {
  validateClauseOrderWorkspace,
  sameClauseOrderValue,
  type JdClauseOrderWorkspace,
} from "~/lib/jd-clause-order-decisions";
import { JdClauseOrderPlanReview } from "~/components/JdClauseOrderReview";
import { JdClauseOrderPlanSchema } from "~/lib/server/jd-clause-order-drafting";
import {
  loadCanonicalRewriteWorkspaceState,
  CanonicalRewriteWorkspaceStateSchema,
  type CanonicalRewriteWorkspaceState,
} from "~/lib/server/canonical-rewrite-workspace";
import type { CanonicalRewriteWorkspace } from "~/lib/server/canonical-rewrite-contract";
import { loadTypedAuthoringWorkspace } from "~/lib/server/typed-authoring-repository";
import {
  TypedAuthoringWorkspaceSchema,
  type TypedAuthoringWorkspace,
} from "~/lib/server/typed-authoring-protocol";
import { getServerConfig } from "~/lib/server/config";
import { getAuthenticatedUser } from "~/lib/server/auth";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "~/lib/server/supabase";
import { CanonicalError } from "~/lib/server/canonical-repository";
import { loadScoreDiagnostics } from "~/lib/server/score-v2-repository";
type Args = { request: Request; params: { id?: string } };
const privateHeaders = () =>
  new Headers({
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow",
  });
export const headers: HeadersFunction = ({
  parentHeaders,
  loaderHeaders,
  actionHeaders,
  errorHeaders,
}) => {
  const h = privateHeaders();
  for (const source of [
    parentHeaders,
    loaderHeaders,
    actionHeaders,
    errorHeaders,
  ])
    if (source)
      for (const c of source.getSetCookie()) h.append("Set-Cookie", c);
  return h;
};
export const meta = () => [{ title: "Scoring diagnostics | Resumide" }];
function ownedClauseOrderPlan(
  model: Awaited<ReturnType<typeof loadScoreDiagnostics>>,
  ownerId: string,
  analysisId: string,
) {
  if (model.jdClauseOrderPlan === undefined) return undefined;
  const parsed = JdClauseOrderPlanSchema.safeParse(model.jdClauseOrderPlan);
  const coverage = model.typedCoverage;
  if (!parsed.success || coverage?.state !== "available" || !model.requirements)
    throw new CanonicalError(
      503,
      "JD drafting previews are unavailable. Reload before continuing.",
    );
  const plan = parsed.data,
    binding = plan.binding,
    owned = coverage.binding,
    score = model.diagnostics.score;
  if (
    model.analysisId !== analysisId ||
    binding.source.analysisId !== analysisId ||
    binding.source.ownerId !== ownerId ||
    score.ownerId !== ownerId ||
    score.analysisId !== analysisId ||
    score.organizationId !== binding.source.organizationId ||
    binding.source.attemptId !== owned.attemptId ||
    score.evidenceVersionId !== owned.attemptId ||
    JSON.stringify(binding.source) !== JSON.stringify(owned.source) ||
    JSON.stringify(binding.canonical) !== JSON.stringify(owned.canonical) ||
    JSON.stringify(binding.requirements) !==
      JSON.stringify(owned.requirements) ||
    binding.profilesSha256 !==
      createHash("sha256")
        .update(JSON.stringify(owned.profiles))
        .digest("hex") ||
    binding.canonical.versionId !== model.canonical.versionId ||
    binding.canonical.revision !== model.canonical.revision ||
    score.canonicalVersionId !== model.canonical.versionId ||
    binding.requirements.versionId !== model.requirements.versionId ||
    binding.requirements.revision !== model.requirements.revision ||
    score.requirementVersionId !== model.requirements.versionId ||
    binding.heads.canonicalHeadId !== model.canonical.headId ||
    binding.heads.requirementHeadId !== model.requirements.headId ||
    (!model.historical &&
      (binding.heads.canonicalHeadRevision !== model.canonical.revision ||
        binding.heads.requirementHeadRevision !==
          model.requirements.revision)) ||
    (plan.reason === "historical_inputs") !== model.historical
  )
    throw new CanonicalError(
      503,
      "JD drafting previews are unavailable. Reload before continuing.",
    );
  return plan;
}
export async function loader({ request, params }: Args) {
  const h = privateHeaders();
  try {
    if (!getServerConfig().SCORING_V2_ENABLED)
      throw new CanonicalError(404, "Scoring diagnostics are not enabled.");
    const user = await getAuthenticatedUser(
      createSupabaseServerClient(request, h),
    );
    if (!user)
      throw redirect(
        `/auth?next=${encodeURIComponent(`/analysis/${params.id ?? ""}/score`)}`,
        { headers: h },
      );
    const options: Record<string, string> = {};
    let focus: string | undefined;
    const url = new URL(request.url);
    for (const [key, value] of url.searchParams) {
      // React Router retains its route selector on targeted data requests.
      if (key === "_routes" && url.pathname.endsWith(".data")) continue;
      if (key === "focus" && getServerConfig().AUTHORING_ENABLED) {
        if (focus !== undefined)
          throw new CanonicalError(422, "Choose one contribution.");
        focus = value;
        continue;
      }
      if (
        ![
          "canonical",
          "requirements",
          "expectedCanonical",
          "expectedRequirements",
        ].includes(key) ||
        Object.hasOwn(options, key)
      )
        throw new CanonicalError(
          422,
          "Choose supported, distinct input versions.",
        );
      options[key] = value;
    }
    const authoringEnabled = getServerConfig().AUTHORING_ENABLED;
    const client = createSupabaseAdminClient();
    const model = await loadScoreDiagnostics(
      client,
      params.id ?? "",
      user.id,
      options,
      undefined,
      { clauseOrderPreview: authoringEnabled },
    );
    const safeModel = { ...model };
    delete safeModel.jdClauseOrderPlan;
    if (authoringEnabled) {
      const plan = ownedClauseOrderPlan(model, user.id, params.id ?? "");
      if (plan) safeModel.jdClauseOrderPlan = plan;
    }
    const clauseOrderPlan = safeModel.jdClauseOrderPlan;
    const clauseOrderSource =
      authoringEnabled &&
      getServerConfig().TYPED_AUTHORING_ENABLED &&
      clauseOrderPlan
        ? clauseOrderPlan.binding.source
        : null;
    let clauseOrderWorkspace: JdClauseOrderWorkspace | null = null;
    if (
      clauseOrderSource &&
      clauseOrderPlan?.state === "available" &&
      !model.historical &&
      model.requirements &&
      model.canonical.versionId === model.canonical.headId &&
      model.requirements.versionId === model.requirements.headId
    ) {
      try {
        const candidate = await loadJdClauseOrderWorkspace(
          client,
          params.id ?? "",
          user.id,
          {
            canonicalVersionId: model.canonical.versionId,
            requirementVersionId: model.requirements.versionId,
          },
          { enabled: true, signal: request.signal },
        );
        if (candidate) {
          const workspace = await validateClauseOrderWorkspace(candidate);
          if (sameClauseOrderValue(workspace.binding, clauseOrderPlan.binding))
            clauseOrderWorkspace = workspace;
        }
      } catch {
        // A failed or mismatched writer read grants no decision capability; owned diagnostics remain available.
        clauseOrderWorkspace = null;
      }
    }
    const authoring =
      getServerConfig().AUTHORING_ENABLED && !model.typedCoverage
        ? await loadAuthoring(client, params.id ?? "", user.id, model, focus)
        : null;
    let typedAuthoring: TypedAuthoringWorkspace | null = null;
    const typedBinding = model.typedCoverage?.binding;
    const typedScore = model.diagnostics.score;
    if (
      getServerConfig().AUTHORING_ENABLED &&
      getServerConfig().TYPED_AUTHORING_ENABLED &&
      model.typedCoverage &&
      typedBinding &&
      model.requirements &&
      !model.historical &&
      model.analysisId === params.id &&
      typedBinding.source.analysisId === model.analysisId &&
      typedBinding.source.ownerId === user.id &&
      model.canonical.versionId === model.canonical.headId &&
      model.requirements.versionId === model.requirements.headId &&
      typedBinding.canonical.versionId === model.canonical.versionId &&
      typedBinding.canonical.revision === model.canonical.revision &&
      typedBinding.requirements.versionId === model.requirements.versionId &&
      typedBinding.requirements.revision === model.requirements.revision &&
      typedScore.canonicalVersionId === model.canonical.versionId &&
      typedScore.requirementVersionId === model.requirements.versionId &&
      typedScore.ownerId === user.id &&
      typedScore.organizationId === typedBinding.source.organizationId &&
      typedScore.analysisId === model.analysisId &&
      typedScore.evidenceVersionId === typedBinding.attemptId
    ) {
      try {
        const parsed = TypedAuthoringWorkspaceSchema.safeParse(
          await loadTypedAuthoringWorkspace(client, params.id ?? "", user.id, {
            canonicalVersionId: model.canonical.versionId,
            requirementVersionId: model.requirements.versionId,
          }),
        );
        if (parsed.success) {
          const workspace = parsed.data,
            binding = workspace.binding,
            coverage = model.typedCoverage.binding,
            score = model.diagnostics.score;
          if (
            binding.source.ownerId === user.id &&
            binding.source.analysisId === model.analysisId &&
            model.analysisId === params.id &&
            JSON.stringify(binding.source) ===
              JSON.stringify(coverage.source) &&
            JSON.stringify(binding.canonical) ===
              JSON.stringify(coverage.canonical) &&
            JSON.stringify(binding.requirements) ===
              JSON.stringify(coverage.requirements) &&
            binding.canonical.versionId === model.canonical.versionId &&
            binding.canonical.revision === model.canonical.revision &&
            binding.requirements.versionId === model.requirements?.versionId &&
            binding.requirements.revision === model.requirements.revision &&
            binding.heads.canonicalHeadId === model.canonical.headId &&
            binding.heads.canonicalHeadRevision === model.canonical.revision &&
            binding.heads.requirementHeadId === model.requirements.headId &&
            binding.heads.requirementHeadRevision ===
              model.requirements.revision &&
            score.canonicalVersionId === binding.canonical.versionId &&
            score.requirementVersionId === binding.requirements.versionId &&
            score.ownerId === user.id &&
            score.organizationId === binding.source.organizationId &&
            score.analysisId === model.analysisId &&
            workspace.diagnosticDigest === score.inputSha256 &&
            workspace.coverageDigest === model.typedCoverage.digest
          )
            typedAuthoring = workspace;
        }
      } catch {
        // Diagnostics remain readable when a fresh owned authoring read cannot be admitted.
        typedAuthoring = null;
      }
    }
    const rewriteEnabled = Boolean(
      getServerConfig().CANONICAL_REWRITE_ENABLED &&
      getServerConfig().AUTHORING_ENABLED,
    );
    let canonicalRewrite: CanonicalRewriteWorkspace | null = null;
    let canonicalRewriteInitialization: Extract<
      CanonicalRewriteWorkspaceState,
      { status: "initialization_required" }
    > | null = null;
    if (
      rewriteEnabled &&
      typedBinding &&
      model.requirements &&
      typedBinding.source.ownerId === user.id &&
      typedBinding.source.analysisId === model.analysisId &&
      model.analysisId === params.id
    ) {
      try {
        const parsed = CanonicalRewriteWorkspaceStateSchema.safeParse(
          await loadCanonicalRewriteWorkspaceState(
            client,
            model.analysisId,
            user.id,
            {
              canonicalVersionId: model.canonical.versionId,
              requirementVersionId: model.requirements.versionId,
            },
          ),
        );
        if (parsed.success) {
          const state = parsed.data;
          const binding =
            state.status === "available"
              ? state.workspace.binding.authoring
              : state.binding;
          if (
            JSON.stringify(binding.source) ===
              JSON.stringify(typedBinding.source) &&
            JSON.stringify(binding.canonical) ===
              JSON.stringify(typedBinding.canonical) &&
            JSON.stringify(binding.requirements) ===
              JSON.stringify(typedBinding.requirements) &&
            binding.canonical.versionId === model.canonical.versionId &&
            binding.canonical.revision === model.canonical.revision &&
            binding.requirements.versionId === model.requirements.versionId &&
            binding.requirements.revision === model.requirements.revision &&
            typedScore.canonicalVersionId === binding.canonical.versionId &&
            typedScore.requirementVersionId ===
              binding.requirements.versionId &&
            typedScore.ownerId === user.id &&
            typedScore.organizationId === binding.source.organizationId &&
            typedScore.evidenceVersionId === binding.source.attemptId
          ) {
            if (state.status === "available") {
              canonicalRewrite =
                model.historical || !getServerConfig().AI_ENABLED
                  ? { ...state.workspace, canGenerate: false }
                  : state.workspace;
            } else {
              canonicalRewriteInitialization = {
                ...state,
                canInitialize: state.canInitialize && !model.historical,
              };
            }
          }
        }
      } catch {
        // Prior drafts remain owned by the rewrite read model; a failed read supplies no substitute.
        canonicalRewrite = null;
      }
    }
    return data(
      {
        ...safeModel,
        ...(clauseOrderSource
          ? {
              jdClauseOrderSource: clauseOrderSource,
              jdClauseOrderWorkspace: clauseOrderWorkspace,
            }
          : {}),
        authoring,
        typedAuthoring,
        rewriteEnabled,
        canonicalRewrite,
        canonicalRewriteInitialization,
        artifactEnabled: getServerConfig().ARTIFACT_RENDERING_ENABLED,
      },
      { headers: h },
    );
  } catch (error) {
    if (error instanceof Response) throw error;
    throw data(
      {
        error:
          error instanceof CanonicalError
            ? error.message
            : "Scoring diagnostics are unavailable.",
      },
      {
        status: error instanceof CanonicalError ? error.status : 503,
        headers: h,
      },
    );
  }
}
export function action() {
  const h = privateHeaders();
  h.set("Allow", "GET");
  return data(
    { error: "Scoring diagnostics are read-only." },
    { status: 405, headers: h },
  );
}
const labels = {
  ats_compatibility: "ATS compatibility",
  job_alignment_required: "Required job alignment",
  job_alignment_preferred: "Preferred job alignment",
};
const words = (value: string) => value.replaceAll("_", " ");
export default function ScoreDiagnostics() {
  const model = useLoaderData<typeof loader>(),
    d = model.diagnostics;
  const feedback = useActionData<AuthoringFeedback>();
  const base = `/analysis/${model.analysisId}`;
  const canonicalTarget = `${base}/canonical?version=${encodeURIComponent(model.canonical.versionId)}`;
  const requirementsTarget = `${base}/requirements${model.requirements ? `?version=${encodeURIComponent(model.requirements.versionId)}` : ""}`;
  const evidenceTargets = {
    evidence: `${base}/evidence`,
    canonical: canonicalTarget,
    requirements: requirementsTarget,
  };
  const canExport =
    model.artifactEnabled &&
    model.canonical.versionId === model.canonical.headId;
  return (
    <WorkspaceShell
      eyebrow="Evidence review"
      title="Review scoring diagnostics"
      description="Inspect recovered evidence, job requirements, and the checks that keep numerical scores unavailable."
    >
      <div style={{ overflowWrap: "anywhere" }}>
        {model.authoring && (
          <AuthoringWorkspace
            model={model.authoring}
            analysisId={model.analysisId}
            feedback={feedback}
          />
        )}
        <nav aria-label="Evidence workspace">
          <Link to={`${base}/evidence`}>Review source evidence</Link>
          {" · "}
          <Link to={canonicalTarget}>Review structured resume</Link>
          {" · "}
          <Link to={requirementsTarget}>Review job requirements</Link>
          {canExport && " · "}
          {canExport && (
            <Link
              to={`${base}/export?version=${encodeURIComponent(model.canonical.versionId)}`}
            >
              Preview and export resume
            </Link>
          )}
        </nav>
        <ScoreAdmissionNotice
          dimensions={d.score.dimensions}
          readiness={d.readiness}
          base={base}
          canonicalVersionId={model.canonical.versionId}
          requirementVersionId={model.requirements?.versionId}
        />
        {model.historical && (
          <p role="status">
            Historical input versions. This view includes an older resume or job
            requirements version. Open these input versions to revisit the same
            pair.
          </p>
        )}
        {model.jdRecommendations && (
          <JdRecommendations plan={model.jdRecommendations} base={base} />
        )}
        {model.jdClauseOrderSource ? (
          <JdClauseOrderBridge
            analysisId={model.analysisId}
            source={model.jdClauseOrderSource}
            workspace={model.jdClauseOrderWorkspace ?? null}
            previewPlan={model.jdClauseOrderPlan ?? null}
          />
        ) : model.jdClauseOrderPlan ? (
          <JdClauseOrderPlanReview plan={model.jdClauseOrderPlan} />
        ) : null}
        {model.typedCoverage && (
          <>
            {model.typedAuthoring ? (
              <TypedAuthoringBridge
                analysisId={model.analysisId}
                workspace={model.typedAuthoring}
              />
            ) : (
              <p role="status">
                {model.jdClauseOrderSource
                  ? "Equivalent-action-word authoring is unavailable for this view. The JD-focused clause-order review is separate."
                  : model.jdClauseOrderPlan?.drafts.length
                    ? "Reviewed saving is unavailable for these projected previews. They have not been saved. You can still review and edit your structured resume independently."
                    : "Proposals are paused for typed job requirements while their version and evidence bindings are completed. You can still review and edit your structured resume independently."}
              </p>
            )}
            <RequirementCoverageReview
              coverage={model.typedCoverage}
              analysisId={model.analysisId}
            />
          </>
        )}
        {model.rewriteEnabled && (
          <CanonicalRewritePanel
            analysisId={model.analysisId}
            workspace={model.canonicalRewrite}
            initialization={model.canonicalRewriteInitialization}
            ownerId={model.diagnostics.score.ownerId}
          />
        )}
        <section aria-label="Score dimensions">
          {d.score.dimensions.map((dimension) => (
            <article key={dimension.id}>
              <h2>{labels[dimension.id]}</h2>
              <p>Unavailable</p>
              <p>{dimension.blockers.map(words).join("; ")}</p>
            </article>
          ))}
        </section>
        <section>
          <h2>Evidence readiness</h2>
          <p>
            {words(d.readiness.state)}.{" "}
            {d.readiness.observedPageCoverage === null ? (
              <>
                The original page count is unknown; page coverage is
                unavailable.
              </>
            ) : (
              <>
                Recovered text appears on{" "}
                {Math.round(d.readiness.observedPageCoverage * 100)}% of the
                declared or retained pages.
              </>
            )}{" "}
            This is an observation, not confidence in accuracy.
          </p>
          <ul>
            {d.readiness.blockers.map((b) => (
              <li key={b}>{words(b)}</li>
            ))}
          </ul>
          {d.readiness.sourceWarnings.map((w) => (
            <p key={w}>{words(w)}</p>
          ))}
          <p>Application Readiness aggregate: unavailable.</p>
        </section>
        <section>
          <h2>Next repair priorities</h2>
          <p>
            Ordered by missing evidence and review needs. No estimated score
            gains.
          </p>
          <ol>
            {d.improvements.map((i) => (
              <li key={i.id}>
                {i.reason}{" "}
                <Link to={evidenceTargets[i.target]}>Review this evidence</Link>
              </li>
            ))}
          </ol>
        </section>
        <section>
          <h2>Recovered observations</h2>
          {d.strengths.length ? (
            <ul>
              {d.strengths.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          ) : (
            <p>No complete observations available.</p>
          )}
        </section>
        <section>
          <h2>Technical evidence checks</h2>
          {d.rules.map((r) => (
            <article key={r.id}>
              <h3>{r.label}</h3>
              <p>
                {words(r.state)}: {r.reason}
              </p>
              <p>
                Observed rule credit:{" "}
                {r.credit === null ? "unavailable" : r.credit}; policy weight:
                unavailable.
              </p>
              <ul>
                {r.citations.map((c) => (
                  <li key={`${c.kind}:${c.id}`}>
                    <Link
                      to={
                        c.kind === "fact"
                          ? `${base}/canonical?version=${model.canonical.versionId}#fact-${c.id}`
                          : `#span-${c.id}`
                      }
                    >
                      {words(c.kind)} {c.id}
                    </Link>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </section>
        <section>
          <h2>Cited source excerpts</h2>
          {model.sourceExcerpts.map((span) => (
            <article key={span.id} id={`span-${span.id}`}>
              <h3>Source span {span.id}</h3>
              <blockquote>{span.text}</blockquote>
              {span.truncated && (
                <p>Excerpt truncated; review the complete source evidence.</p>
              )}
            </article>
          ))}
        </section>
        {(["required", "preferred", "contextual", "unknown"] as const).map(
          (importance) => (
            <section key={importance}>
              <h2>{words(importance)} requirements</h2>
              {d.alignment
                .filter((a) => a.importance === importance)
                .map((a) => (
                  <article key={a.id}>
                    <h3>
                      {a.type}: {a.value}
                    </h3>
                    <p>
                      Evaluation: {words(a.state)}. Candidate observation:{" "}
                      {words(a.proposedState)}.
                    </p>
                    <p>{a.reason}</p>
                    <p>
                      {a.sourceRequirementIds.length} source clause(s), grouped
                      once.
                    </p>
                    <Link
                      to={`${base}/requirements${model.requirements ? `?version=${model.requirements.versionId}` : ""}`}
                    >
                      Inspect quoted requirement
                    </Link>
                    {a.factIds.map((id) => (
                      <p key={id}>
                        <Link
                          to={`${base}/canonical?version=${model.canonical.versionId}`}
                        >
                          Inspect fact {id}
                        </Link>
                      </p>
                    ))}
                  </article>
                ))}
            </section>
          ),
        )}
        <details>
          <summary>Input versions and scoring policy</summary>
          <p>
            Structured resume revision {model.canonical.revision}:{" "}
            {model.canonical.versionId}
          </p>
          <p>
            Job requirements:{" "}
            {model.requirements
              ? `${model.requirements.revision}: ${model.requirements.versionId}`
              : "missing"}
          </p>
          <p>Evidence: {d.score.evidenceVersionId}</p>
          <p>Policy: {d.score.policyId}; draft; calibration unavailable.</p>
          <p>
            Engine: {d.score.producerVersion}; input fingerprint:{" "}
            {d.score.inputSha256}
          </p>
          <Link
            to={`${base}/score?canonical=${model.canonical.versionId}${model.requirements ? `&requirements=${model.requirements.versionId}` : ""}`}
          >
            Open these input versions
          </Link>
        </details>
      </div>
    </WorkspaceShell>
  );
}
export function ErrorBoundary() {
  const error = useRouteError();
  return (
    <WorkspaceShell
      eyebrow="Scoring diagnostics"
      title="Diagnostics unavailable"
    >
      <p>
        {isRouteErrorResponse(error) && typeof error.data?.error === "string"
          ? error.data.error
          : "Reload or review your evidence workspace."}
      </p>
    </WorkspaceShell>
  );
}
