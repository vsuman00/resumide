import { Link, useParams } from "react-router";
import { useEffect, useState } from "react";
import { StageTimeline } from "~/components/StageTimeline";
import WorkspaceShell from "~/components/WorkspaceShell";
import EvidenceScene3D from "~/components/EvidenceScene3D";

const terminalStatuses = new Set([
  "completed",
  "partial",
  "failed",
  "cancelled",
  "rejected",
  "needs_ocr",
]);

const terminalCopy: Record<
  string,
  { title: string; description: string; heading: string }
> = {
  completed: {
    title: "Your analysis is ready",
    description: "Your saved result is available to review.",
    heading: "Analysis complete",
  },
  partial: {
    title: "Your partial result is ready",
    description:
      "Your deterministic evidence is saved. Qualitative feedback is unavailable.",
    heading: "Evidence saved",
  },
  cancelled: {
    title: "Analysis cancelled",
    description:
      "This analysis has stopped. It will not continue if you leave this page.",
    heading: "Processing stopped",
  },
  failed: {
    title: "Analysis could not be completed",
    description:
      "Processing stopped without a score. You can start another analysis.",
    heading: "Processing stopped",
  },
  rejected: {
    title: "This file could not be processed",
    description: "Review the PDF requirements before trying another file.",
    heading: "File rejected",
  },
  needs_ocr: {
    title: "Extraction needs review",
    description:
      "Saved extraction evidence needs review before scoring can continue.",
    heading: "Evidence needs review",
  },
};

type StatusResponse = {
  status: string;
  stage_updated_at: string;
  completed_at: string | null;
};

export function meta() {
  return [{ title: "Resumide | Analysis Progress" }];
}

export default function AnalysisProgress() {
  const { id } = useParams();
  const [result, setResult] = useState<StatusResponse | null>(null);
  const [error, setError] = useState("");
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [isCancelling, setIsCancelling] = useState(false);
  const copy = result ? terminalCopy[result.status] : undefined;
  const canCancel = Boolean(
    result && ["quarantined", "queued"].includes(result.status),
  );

  const handleCancel = async () => {
    if (!result || !id) return;
    setIsCancelling(true);
    try {
      const response = await fetch(`/api/analysis/${id}/cancel`, {
        method: "POST",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload?.error?.message ?? "Unable to cancel analysis.",
        );
      }
      setResult({
        ...result,
        status: "cancelled",
        completed_at: new Date().toISOString(),
      });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to cancel analysis.",
      );
    } finally {
      setIsCancelling(false);
    }
  };

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let delay = 1_000;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;

    const schedulePoll = () => {
      timer = setTimeout(() => {
        timer = undefined;
        void poll();
      }, delay);
    };

    const poll = async () => {
      if (document.hidden) {
        schedulePoll();
        return;
      }
      controller = new AbortController();
      try {
        const response = await fetch(`/api/analysis/${id}`, {
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok)
          throw new Error(
            payload?.error?.message ?? "Unable to load analysis status.",
          );
        if (cancelled) return;
        setResult(payload);
        setError("");
        if (terminalStatuses.has(payload.status)) return;
        delay = Math.min(delay * 2, 10_000);
      } catch (caught) {
        if (
          cancelled ||
          (caught instanceof DOMException && caught.name === "AbortError")
        )
          return;
        setError(
          caught instanceof Error
            ? caught.message
            : "Unable to load analysis status.",
        );
        delay = Math.min(delay * 2, 10_000);
      }
      schedulePoll();
    };

    const onVisibilityChange = () => {
      if (!document.hidden && timer) {
        clearTimeout(timer);
        timer = undefined;
        void poll();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    void poll();
    return () => {
      cancelled = true;
      controller?.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [id, retryAttempt]);

  return (
    <WorkspaceShell
      eyebrow="Secure analysis"
      title={copy?.title ?? "Analyzing your resume"}
      description={
        copy?.description ??
        (result
          ? "Your analysis is stored safely and will keep running if you leave this page."
          : "Checking the latest durable analysis status.")
      }
      action={
        canCancel ? (
          <button
            type="button"
            className="back-button"
            disabled={isCancelling}
            onClick={handleCancel}
          >
            {isCancelling ? "Cancelling" : "Cancel analysis"}
          </button>
        ) : (
          <Link to="/upload" className="primary-button w-fit">
            New analysis
          </Link>
        )
      }
    >
      <section
        className="analysis-progress-layout"
        aria-label="Analysis progress"
      >
        <EvidenceScene3D
          variant="analysis"
          active={Boolean(result && !terminalStatuses.has(result.status))}
          label={
            copy?.heading ?? "Resume evidence being scanned and transformed"
          }
        />

        <div className="analysis-progress-content">
          <div className="analysis-progress-intro">
            <p className="workspace-eyebrow">Live status</p>
            <h2>{copy?.heading ?? "Evidence is being prepared"}</h2>
            <p role="status" aria-live="polite">
              {error
                ? "We could not refresh this analysis."
                : result
                  ? `Current status: ${result.status.replaceAll("_", " ")}.`
                  : "Loading analysis status."}
            </p>
          </div>

          {result ? (
            <StageTimeline
              status={result.status}
              updatedAt={result.stage_updated_at}
            />
          ) : !error ? (
            <div className="stage-timeline-skeleton" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          ) : null}

          {error ? (
            <section className="analysis-state-panel is-error" role="alert">
              <span className="analysis-state-mark" aria-hidden="true">
                !
              </span>
              <h2>We could not load the latest status</h2>
              <p>{error}</p>
              <button
                type="button"
                className="back-button"
                onClick={() => {
                  setError("");
                  setRetryAttempt((attempt) => attempt + 1);
                }}
              >
                Retry status check
              </button>
              <Link to="/upload" className="back-button w-fit">
                Start another analysis
              </Link>
            </section>
          ) : null}

          {result?.status === "completed" ? (
            <section className="analysis-state-panel is-complete">
              <h2>Your result is ready</h2>
              <p>Review the score, evidence, and highest-impact fixes.</p>
              <Link to={`/resume/${id}`} className="primary-button w-fit">
                View result
              </Link>
            </section>
          ) : null}

          {result?.status === "partial" ? (
            <section className="analysis-state-panel is-partial">
              <h2>Deterministic evidence is ready</h2>
              <p>
                Qualitative feedback is unavailable right now. Your ATS evidence
                remains available to review.
              </p>
              <Link to={`/resume/${id}`} className="primary-button w-fit">
                View partial result
              </Link>
            </section>
          ) : null}

          {result?.status === "failed" ? (
            <section className="analysis-state-panel is-error" role="alert">
              <h2>Analysis could not be completed</h2>
              <p>
                Your resume was not scored. Upload it again to start a new
                analysis.
              </p>
              <Link to="/upload" className="back-button w-fit">
                Upload another resume
              </Link>
            </section>
          ) : null}

          {result?.status === "cancelled" ? (
            <section className="analysis-state-panel">
              <h2>Analysis cancelled</h2>
              <p>Processing stopped before a result was saved.</p>
              <Link to="/upload" className="back-button w-fit">
                Start another analysis
              </Link>
            </section>
          ) : null}

          {result?.status === "rejected" ? (
            <section className="analysis-state-panel is-error" role="alert">
              <h2>This file could not be processed</h2>
              <p>
                Review the PDF requirements and upload a supported text-based
                file.
              </p>
              <Link to="/upload" className="back-button w-fit">
                Choose another PDF
              </Link>
            </section>
          ) : null}

          {result?.status === "needs_ocr" ? (
            <section className="analysis-state-panel is-partial" role="alert">
              <h2>Extraction needs review</h2>
              <Link to={`/analysis/${id}/evidence`}>
                Review extracted evidence
              </Link>
              <p>
                Scores are unavailable while extraction evidence needs review.
                Missing text may require a new text-based PDF.
              </p>
              <Link to="/upload" className="back-button w-fit">
                Upload a text-based PDF
              </Link>
            </section>
          ) : null}
        </div>
      </section>
    </WorkspaceShell>
  );
}
