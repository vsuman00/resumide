import {
  data as routeData,
  redirect,
  Link,
  useLoaderData,
  useParams,
} from "react-router";
import { useEffect, useState } from "react";
import type { Route } from "./+types/resume";
import { useAnalysisStore } from "~/lib/store";
import { convertPdfToImages } from "~/lib/pdf2img";
import Summary from "~/components/Summary";
import Details from "~/components/Details";
import ATS from "~/components/ATS";
import ParseView from "~/components/ParseView";
import { readOwnedNativeLayout } from "~/lib/server/layout-read-model";
import Heatmap from "~/components/Heatmap";
import ResumeWriter from "~/components/ResumeWriter";
import ResultTabs from "~/components/ResultTabs";
import EvidenceScene3D from "~/components/EvidenceScene3D";
import WorkspaceShell from "~/components/WorkspaceShell";
import { presentLegacyScore } from "~/lib/server/score-v2-contract";
import { BASELINE_SEMANTICS } from "~/lib/server/qualitative-prose";
import { scoreBand } from "~/lib/score-band";
import { AnalysisResultSchema } from "~/lib/server/schema";
import { getAuthenticatedUser } from "~/lib/server/auth";
import { recordAuditEvent } from "~/lib/server/privacy";
import { createRequestId } from "~/lib/server/request-context";
import { visibleFeedbackGroups } from "~/lib/result-feedback";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "~/lib/server/supabase";

export const meta = () => [
  { title: "Resumide | Review" },
  { name: "description", content: "Detailed overview of your resume" },
];

function buildEvidenceReport(result: AnalysisResult, unscored = false): string {
  const lines = [
    "Resumide evidence report",
    `Legacy analysis score: ${result.feedback.overallScore}/100 (not comparable with v2)`,
    "",
    "Score breakdown:",
    `- ATS compatibility: ${result.feedback.ATS.score}/100`,
    ...(unscored
      ? ["Qualitative categories: cited prose only, no ratings."]
      : [
          `- Legacy tone and style: ${result.feedback.toneAndStyle.score}/100`,
          `- Legacy content: ${result.feedback.content.score}/100`,
          `- Legacy structure: ${result.feedback.structure.score}/100`,
          `- Legacy skills: ${result.feedback.skills.score}/100`,
        ]),
    "",
    "Deterministic checks:",
    ...result.ruleTrace.map(
      (rule) =>
        `- ${rule.label}: ${rule.outcome === "not_evaluated" ? "Skipped" : rule.passed ? "Pass" : "Needs attention"} (${rule.detail})`,
    ),
    "",
    "Keyword coverage:",
    ...result.jdKeywords.map((keyword) => {
      const status = result.uncertainKeywords.includes(keyword)
        ? "Uncertain evidence"
        : result.matchedKeywords.includes(keyword)
          ? "Found in resume"
          : "Missing from resume";
      return `- ${keyword}: ${status}`;
    }),
    "",
    "This report is guidance from a parse simulation, not a guarantee from a specific employer ATS.",
  ];
  return lines.join("\n");
}

export async function loader({ params, request, url }: Route.LoaderArgs) {
  const headers = new Headers({
    "Cache-Control": "private, no-store",
    "X-Robots-Tag": "noindex, nofollow",
  });
  const user = await getAuthenticatedUser(
    createSupabaseServerClient(request, headers),
  );
  if (!user) {
    const next = encodeURIComponent(url.pathname);
    throw new Response(null, {
      status: 302,
      headers: { Location: `/auth?next=${next}` },
    });
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("analyses")
    .select(
      "id, status, analysis_results(feedback, parse_view, rule_trace, keyword_coverage, created_at), analysis_deterministic_results(ruleset_version), writer_drafts(draft), resume_versions(storage_key, organization_id)",
    )
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (error || !data) {
    throw new Response("Resume analysis not found.", {
      status: 404,
      statusText: "Resume analysis not found",
    });
  }

  const evidence = await admin
    .from("document_evidence_attempts")
    .select("id")
    .eq("analysis_id", params.id!)
    .eq("owner_id", user.id)
    .limit(1);
  if (evidence.error)
    throw new Response("Evidence unavailable", { status: 503 });
  if (evidence.data?.length)
    return redirect(`/analysis/${params.id}/evidence`, { headers });

  if (data.status !== "completed" && data.status !== "partial") {
    throw new Response(`Analysis is ${data.status}.`, {
      status: data.status === "failed" ? 500 : 202,
      statusText: `Analysis is ${data.status}`,
    });
  }

  const stored = Array.isArray(data.analysis_results)
    ? data.analysis_results[0]
    : data.analysis_results;
  const keywords = stored?.keyword_coverage as Record<string, unknown>;
  const result = AnalysisResultSchema.parse({
    feedback: stored?.feedback,
    parseView: stored?.parse_view,
    ruleTrace: stored?.rule_trace,
    jdKeywords: keywords.job,
    matchedKeywords: keywords.matched,
    missingKeywords: keywords.missing,
    uncertainKeywords: keywords.uncertain ?? [],
    keywordEvidence: keywords.evidence ?? [],
    writer: data.writer_drafts?.[0]?.draft,
  });
  const signedResumeUrl = `/analysis/${params.id}/source`;
  await recordAuditEvent({
    userId: user.id,
    action: "analysis.read",
    targetType: "analysis",
    targetId: data.id,
    requestId: createRequestId(),
  });

  const nativeLayout = await readOwnedNativeLayout(data.id, user.id);
  const unscoredProse = stored?.feedback?.scoreSemantics === BASELINE_SEMANTICS;
  const deterministicVersion = Array.isArray(
    data.analysis_deterministic_results,
  )
    ? data.analysis_deterministic_results[0]
    : data.analysis_deterministic_results;
  const legacy = stored?.created_at
    ? presentLegacyScore({
        value: result.feedback.overallScore,
        createdAt: stored.created_at,
        scoringVersion: unscoredProse
          ? (deterministicVersion?.ruleset_version ?? null)
          : null,
        kind: unscoredProse ? "deterministic_baseline" : "legacy_blended",
      })
    : null;
  return routeData(
    {
      result,
      signedResumeUrl,
      nativeLayout,
      unscoredProse,
      legacy,
      qualitativeUnavailable: data.status === "partial",
    },
    { headers },
  );
}

const Resume = () => {
  const {
    result,
    signedResumeUrl,
    nativeLayout,
    unscoredProse,
    legacy,
    qualitativeUnavailable,
  } = useLoaderData<typeof loader>();
  const { id } = useParams();
  const entry = useAnalysisStore((s) => (id ? s.entries[id] : undefined));
  const [imageUrl, setImageUrl] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [previewError, setPreviewError] = useState("");
  const [resumeUrl, setResumeUrl] = useState(signedResumeUrl);
  const [reportUrl, setReportUrl] = useState("");
  const feedback = result.feedback;
  const score = feedback?.overallScore ?? 0;
  const scoreLabels = {
    needs_work: "Needs attention",
    good_start: "Good start",
    strong: "Strong",
  } as const;
  const scoreLabel = scoreLabels[scoreBand(score)];

  useEffect(() => {
    const url = URL.createObjectURL(
      new Blob([buildEvidenceReport(result, unscoredProse)], {
        type: "text/plain",
      }),
    );
    setReportUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [result, unscoredProse]);
  const feedbackGroups = visibleFeedbackGroups(
    feedback,
    qualitativeUnavailable,
  );
  const repairQueue = feedbackGroups
    .flatMap((group) =>
      group.tips
        .filter((tip) => tip.type === "improve")
        .map((tip) => ({ ...tip, source: group.source })),
    )
    .slice(0, 3);
  const strengthCount = feedbackGroups.reduce(
    (count, group) =>
      count + group.tips.filter((tip) => tip.type === "good").length,
    0,
  );
  const improvementCount = feedbackGroups.reduce(
    (count, group) =>
      count + group.tips.filter((tip) => tip.type === "improve").length,
    0,
  );

  // Render the first page of the source PDF while keeping the original PDF
  // available. Local analyses already have a Blob; persisted analyses use the
  // short-lived signed URL returned by the loader.
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    let revokeImgs: string[] = [];
    let revokePdf: string | null = null;

    setImageUrl("");
    setImageUrls([]);
    setPreviewError("");

    const renderSourcePreview = async () => {
      let sourcePdf: Blob;

      if (entry) {
        const pdfUrl = URL.createObjectURL(entry.pdf);
        revokePdf = pdfUrl;
        setResumeUrl(pdfUrl);
        sourcePdf = entry.pdf;
      } else if (signedResumeUrl) {
        setResumeUrl(signedResumeUrl);
        const response = await fetch(signedResumeUrl, {
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("The source PDF could not be downloaded.");
        }
        const remotePdf = await response.blob();
        sourcePdf = remotePdf.type.includes("pdf")
          ? remotePdf
          : new Blob([remotePdf], { type: "application/pdf" });
      } else {
        throw new Error("No source PDF is available for this analysis.");
      }

      const converted = await convertPdfToImages(sourcePdf);
      if (cancelled) {
        converted.imageUrls.forEach((url) => URL.revokeObjectURL(url));
        return;
      }
      if (!converted.imageUrl) {
        throw new Error(
          converted.error ?? "The source preview could not be rendered.",
        );
      }

      revokeImgs = converted.imageUrls;
      setImageUrl(converted.imageUrl);
      setImageUrls(converted.imageUrls);
    };

    renderSourcePreview().catch((error: unknown) => {
      if (
        cancelled ||
        (error instanceof DOMException && error.name === "AbortError")
      ) {
        return;
      }
      setPreviewError(
        error instanceof Error
          ? error.message
          : "The source preview could not be rendered.",
      );
    });

    return () => {
      cancelled = true;
      controller.abort();
      revokeImgs.forEach((url) => URL.revokeObjectURL(url));
      if (revokePdf) URL.revokeObjectURL(revokePdf);
    };
  }, [entry, signedResumeUrl]);

  return (
    <WorkspaceShell
      eyebrow="Saved analysis"
      title="Resume review"
      description="Inspect the evidence behind your score, then make the highest-impact improvements first."
      action={
        <Link to="/upload" className="primary-button w-fit">
          New analysis
        </Link>
      }
    >
      <p>
        {unscoredProse
          ? "Deterministic baseline; model ratings are excluded."
          : "Historical blended result; qualitative ratings below belong to the legacy scoring method."}{" "}
        This result is not comparable with v2 scores.
        {legacy
          ? ` Saved ${legacy.createdAt}; version: ${legacy.scoringVersion ?? "unrecorded"}.`
          : " Original date and scoring version are unavailable."}
      </p>
      <section className="result-score-header" aria-label="Analysis summary">
        <div className="result-score-primary">
          <div className="result-score-lockup">
            <span className={`result-score-value is-${scoreBand(score)}`}>
              {score}
            </span>
            <div>
              <p>{scoreLabel}</p>
              <span>Legacy analysis score</span>
            </div>
          </div>
          <p className="result-score-note">
            ATS compatibility guidance based on a parse simulation, not a
            guarantee from a specific employer system.
          </p>
        </div>
        <a
          className="result-report-link"
          href={reportUrl}
          download={`resumide-${id ?? "analysis"}-evidence.txt`}
        >
          Download evidence report
        </a>
        <div className="result-score-meter">
          <div>
            <span>Legacy baseline</span>
            <span>{score}/100</span>
          </div>
          <progress value={score} max="100" aria-label="Legacy analysis score">
            {score}%
          </progress>
        </div>
        <dl className="result-score-metrics">
          <div>
            <dt>Strengths</dt>
            <dd>{strengthCount}</dd>
          </div>
          <div>
            <dt>Items to improve</dt>
            <dd>{improvementCount}</dd>
          </div>
          <div>
            <dt>Evidence checks</dt>
            <dd>{result.ruleTrace.length}</dd>
          </div>
        </dl>
        <a
          className="result-mobile-viewer-link"
          href={resumeUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open source PDF
        </a>
      </section>

      {feedback ? (
        <div className="result-workspace">
          <aside className="result-resume-viewer" aria-label="Source resume">
            <div className="result-viewer-toolbar">
              <div>
                <p className="workspace-eyebrow">Evidence stack</p>
                <h2>Source document</h2>
              </div>
              <a href={resumeUrl} target="_blank" rel="noopener noreferrer">
                Open PDF
              </a>
            </div>
            {imageUrl ? (
              <a
                className="result-preview-image"
                href={resumeUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img src={imageUrl} alt="Resume preview" />
              </a>
            ) : resumeUrl ? (
              <div className="result-preview-pdf">
                <iframe
                  src={`${resumeUrl}#toolbar=0&navpanes=0`}
                  title="Original resume PDF preview"
                />
                <p role="status">
                  {previewError
                    ? "The image preview is unavailable. The original PDF remains available above."
                    : "Preparing an image preview of page 1…"}
                </p>
              </div>
            ) : (
              <div className="result-preview-placeholder">
                <span className="result-document-sheet" aria-hidden="true" />
                <p>Your source PDF remains private and available to open.</p>
              </div>
            )}
          </aside>

          <div className="result-analysis-workspace">
            <ResultTabs
              content={{
                overview: (
                  <div className="result-overview">
                    <section
                      className="repair-queue"
                      aria-labelledby="repair-queue-heading"
                    >
                      <div className="result-section-heading">
                        <div>
                          <p className="workspace-eyebrow">Repair queue</p>
                          <h2 id="repair-queue-heading">Suggested repairs</h2>
                        </div>
                        <span>{repairQueue.length} priority actions</span>
                      </div>
                      {repairQueue.length > 0 ? (
                        <ol>
                          {repairQueue.map((item, index) => (
                            <li key={`${item.source}-${index}-${item.tip}`}>
                              <span aria-hidden="true">{index + 1}</span>
                              <div>
                                <div className="repair-queue-meta">
                                  <small>{item.source}</small>
                                  <span>Priority {index + 1}</span>
                                </div>
                                <h3>{item.tip}</h3>
                                <p>
                                  {item.explanation ??
                                    "Review the related evidence before updating your resume."}
                                </p>
                              </div>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="result-empty-copy">
                          No priority repairs were identified in the available
                          feedback.
                        </p>
                      )}
                    </section>
                    <section
                      className="result-evidence-layers"
                      aria-labelledby="result-evidence-layers-heading"
                    >
                      <div className="result-section-heading">
                        <div>
                          <p className="workspace-eyebrow">Evidence layers</p>
                          <h2 id="result-evidence-layers-heading">
                            Every recommendation has a trail
                          </h2>
                        </div>
                      </div>
                      <div className="result-evidence-layer-grid">
                        <EvidenceScene3D
                          variant="result"
                          compact
                          label="Source, parse and evidence layers"
                        />
                        <ol>
                          <li>
                            <span>Source</span>
                            <p>Your original resume remains the reference.</p>
                          </li>
                          <li>
                            <span>Parse</span>
                            <p>
                              Extracted fields show what the simulation found.
                            </p>
                          </li>
                          <li>
                            <span>Proof</span>
                            <p>
                              Rules and evidence explain each recommendation.
                            </p>
                          </li>
                        </ol>
                      </div>
                    </section>
                    {qualitativeUnavailable ? (
                      <section role="status">
                        <h2>Writing feedback unavailable</h2>
                        <p>
                          The saved deterministic checks remain available.
                          Writing feedback was not completed and is excluded
                          from the repair counts.
                        </p>
                      </section>
                    ) : unscoredProse ? (
                      <section>
                        <h2>Cited writing suggestions</h2>
                        <p>Qualitative ratings are unavailable.</p>
                        {(
                          [
                            "toneAndStyle",
                            "content",
                            "structure",
                            "skills",
                          ] as const
                        ).map((key) => (
                          <article key={key}>
                            <h3>
                              {key === "toneAndStyle" ? "Tone and style" : key}
                            </h3>
                            <ul>
                              {feedback[key].tips
                                .filter((tip) => tip.quote)
                                .map((tip, index) => (
                                  <li key={index}>
                                    {tip.tip} {tip.explanation}
                                    {tip.quote ? (
                                      <blockquote>{tip.quote}</blockquote>
                                    ) : null}
                                  </li>
                                ))}
                            </ul>
                          </article>
                        ))}
                      </section>
                    ) : (
                      <>
                        <Summary feedback={feedback} />
                        <Details feedback={feedback} />
                      </>
                    )}
                  </div>
                ),
                evidence: (
                  <div className="result-evidence">
                    <ATS
                      score={feedback.ATS.score || 0}
                      suggestions={feedback.ATS.tips || []}
                    />
                    <section
                      className="rule-trace"
                      aria-labelledby="rule-trace-heading"
                    >
                      <div className="result-section-heading">
                        <div>
                          <p className="workspace-eyebrow">
                            Deterministic evidence
                          </p>
                          <h2 id="rule-trace-heading">
                            How the score was computed
                          </h2>
                        </div>
                        <span>{result.ruleTrace.length} checks</span>
                      </div>
                      <div className="rule-trace-list">
                        {result.ruleTrace.map((rule) => (
                          <article key={rule.ruleId} className="rule-trace-row">
                            <span
                              className={`rule-trace-status ${
                                rule.outcome === "not_evaluated"
                                  ? "is-skipped"
                                  : rule.passed
                                    ? "is-passed"
                                    : "is-attention"
                              }`}
                            >
                              {rule.outcome === "not_evaluated"
                                ? "Skipped"
                                : rule.passed
                                  ? "Pass"
                                  : "Needs attention"}
                            </span>
                            <div>
                              <h3>{rule.label}</h3>
                              <p>{rule.detail}</p>
                              {rule.evidence?.length ? (
                                <small>
                                  Evidence: {rule.evidence.join(", ")}
                                </small>
                              ) : null}
                            </div>
                            <span className="rule-trace-weight">
                              Weight {rule.weight}
                            </span>
                          </article>
                        ))}
                      </div>
                    </section>
                  </div>
                ),
                parse: (
                  <ParseView
                    parseView={result.parseView}
                    imageUrl={imageUrl}
                    imageUrls={imageUrls}
                    nativeLayout={nativeLayout}
                  />
                ),
                keywords: (
                  <Heatmap
                    jdKeywords={result.jdKeywords}
                    matchedKeywords={result.matchedKeywords}
                    missingKeywords={result.missingKeywords}
                    uncertainKeywords={result.uncertainKeywords}
                    keywordEvidence={result.keywordEvidence}
                  />
                ),
                rewrite: <ResumeWriter writer={result.writer} />,
              }}
            />
          </div>
        </div>
      ) : (
        <section className="analysis-state-panel is-error" role="alert">
          <h2>Result details are unavailable</h2>
          <p>Return to your analyses and start a new review.</p>
          <Link to="/upload" className="back-button w-fit">
            Start a new analysis
          </Link>
        </section>
      )}
    </WorkspaceShell>
  );
};
export default Resume;
