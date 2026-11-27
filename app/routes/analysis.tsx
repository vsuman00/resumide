import { Link, useParams } from "react-router";
import { useEffect, useRef, useState } from "react";
import { StageTimeline } from "~/components/StageTimeline";
import WorkspaceShell from "~/components/WorkspaceShell";
import EvidenceScene3D from "~/components/EvidenceScene3D";
import type {
  AnalysisQueueActivity,
  AnalysisRecovery,
} from "~/routes/api.analysis-status";

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
};

const waitingCopy = {
  title: "Resume saved",
  description: "Your upload is saved. You can return here to check its status.",
  heading: "Waiting for a worker",
};
const queueActivityCopy: Record<AnalysisQueueActivity, typeof waitingCopy> = {
  recent_check: {
    ...waitingCopy,
    heading: "A worker checked the queue recently",
  },
  no_recent_check: {
    ...waitingCopy,
    heading: "No recent worker check-in",
  },
};
const recoveryCopy: Record<
  AnalysisRecovery,
  { title: string; heading: string; description: string; review: boolean }
> = {
  text_pdf_required: {
    title: "A text-based PDF is needed",
    heading: "Readable text is required",
    description:
      "Export the original document as a PDF with selectable text, then upload it again.",
    review: false,
  },
  ocr_unavailable: {
    title: "OCR is unavailable",
    heading: "Some pages need OCR",
    description:
      "Some pages lack a usable text layer. Export a PDF with selectable text, or review the saved extraction evidence.",
    review: true,
  },
  ocr_failed: {
    title: "OCR could not finish",
    heading: "Text extraction stopped",
    description:
      "Review the saved extraction evidence or upload a PDF with selectable text.",
    review: true,
  },
  ocr_incomplete: {
    title: "OCR needs more readable text",
    heading: "Extraction is incomplete",
    description:
      "Review the available text, then upload a PDF with a clearer, selectable text layer.",
    review: true,
  },
  native_review: {
    title: "Extracted text needs review",
    heading: "Review the saved PDF text",
    description: "Check the extracted evidence against the original document.",
    review: true,
  },
  ocr_review: {
    title: "OCR evidence needs review",
    heading: "Review the saved OCR text",
    description:
      "Check the extracted text against the original pages before relying on it.",
    review: true,
  },
  review_status_unavailable: {
    title: "Extraction needs attention",
    heading: "Evidence availability is unknown",
    description: "Check the status again or upload a PDF with selectable text.",
    review: false,
  },
};

type StatusResponse = {
  status: string;
  stage_updated_at: string;
  completed_at: string | null;
  recovery?: AnalysisRecovery;
  queueActivity?: AnalysisQueueActivity;
};

// Internal status names that do not read as plain words.
const STATUS_WORDS: Record<string, string> = {
  needs_ocr: "text review needed",
  qualitative_review: "preparing writing feedback",
};
export function meta() {
  return [{ title: "Resumide | Analysis Progress" }];
}

export default function AnalysisProgress() {
  const { id } = useParams();
  return <AnalysisProgressView key={id} id={id} />;
}

function AnalysisProgressView({ id }: { id: string | undefined }) {
  const [result, setResult] = useState<StatusResponse | null>(null);
  const [error, setError] = useState("");
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const statusMessage = useRef<HTMLParagraphElement>(null);
  const cancelRequest = useRef<AbortController | null>(null);
  const stopPolling = useRef<(() => void) | null>(null);
  const canCancel = Boolean(
    result && ["quarantined", "queued"].includes(result.status),
  );
  const recovery =
    result?.status === "needs_ocr"
      ? (result.recovery ?? "review_status_unavailable")
      : undefined;
  const recoveryDetails = recovery
    ? (recoveryCopy[recovery] ?? recoveryCopy.review_status_unavailable)
    : undefined;
  const copy =
    recoveryDetails ??
    (canCancel
      ? (result?.queueActivity && queueActivityCopy[result.queueActivity]) ||
        waitingCopy
      : result
        ? terminalCopy[result.status]
        : undefined);
  const retryStatus = () => {
    statusMessage.current?.focus();
    setCheckingStatus(true);
    setError("");
    setRetryAttempt((attempt) => attempt + 1);
  };

  const handleCancel = async () => {
    if (!result || !id || cancelRequest.current) return;
    const controller = new AbortController();
    cancelRequest.current = controller;
    setIsCancelling(true);
    try {
      const response = await fetch(`/api/analysis/${id}/cancel`, {
        method: "POST",
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (controller.signal.aborted) return;
      if ([401, 403, 404].includes(response.status)) {
        stopPolling.current?.();
        setCheckingStatus(false);
        setResult(null);
        setError(payload?.error?.message ?? "Analysis is unavailable.");
        return;
      }
      if (!response.ok) {
        throw new Error(
          payload?.error?.message ??
            (response.status === 409 ? payload?.message : undefined) ??
            "Unable to cancel analysis.",
        );
      }
      if (payload?.status !== "cancelled")
        throw new Error(
          "Unable to confirm cancellation. Check the latest status.",
        );
      stopPolling.current?.();
      setCheckingStatus(false);
      setError("");
      setResult((current) => ({ ...(current ?? result), status: "cancelled" }));
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(
        caught instanceof Error ? caught.message : "Unable to cancel analysis.",
      );
    } finally {
      cancelRequest.current = null;
      if (!controller.signal.aborted) setIsCancelling(false);
    }
  };

  useEffect(() => () => cancelRequest.current?.abort(), []);

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
        if (cancelled) return;
        setCheckingStatus(false);
        if ([401, 403, 404].includes(response.status)) {
          if (cancelRequest.current) {
            cancelRequest.current.abort();
            setIsCancelling(false);
          }
          setResult(null);
          setError(
            payload?.error?.message ?? "Analysis status is unavailable.",
          );
          stop();
          return;
        }
        if (!response.ok)
          throw new Error(
            payload?.error?.message ?? "Unable to load analysis status.",
          );
        if (!payload || typeof payload.status !== "string")
          throw new Error("Analysis status is unavailable.");
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
        setCheckingStatus(false);
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
    const stop = () => {
      cancelled = true;
      controller?.abort();
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    stopPolling.current = stop;
    document.addEventListener("visibilitychange", onVisibilityChange);
    void poll();
    return () => {
      stop();
      stopPolling.current = null;
    };
  }, [id, retryAttempt]);

  return (
    <WorkspaceShell
      eyebrow="Secure analysis"
      title={copy?.title ?? "Analyzing your resume"}
      description={
        copy?.description ??
        (result
          ? "You can return here to check the latest saved status."
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
          active={Boolean(
            result &&
            ["extracting", "scoring", "qualitative_review"].includes(
              result.status,
            ),
          )}
          label={
            copy?.heading ?? "Resume evidence being scanned and transformed"
          }
        />

        <div className="analysis-progress-content">
          <div className="analysis-progress-intro">
            <p className="workspace-eyebrow">Live status</p>
            <h2>{copy?.heading ?? "Evidence is being prepared"}</h2>
            <p
              ref={statusMessage}
              tabIndex={-1}
              role="status"
              aria-live="polite"
            >
              {checkingStatus
                ? "Checking the latest analysis status."
                : error
                  ? "We could not refresh this analysis."
                  : result
                    ? `Current status: ${STATUS_WORDS[result.status] ?? result.status.replaceAll("_", " ")}.`
                    : "Loading analysis status."}
            </p>
          </div>

          {result ? (
            <StageTimeline
              status={result.status}
              updatedAt={result.stage_updated_at}
              recovery={recovery}
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
                onClick={retryStatus}
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

          {recoveryDetails ? (
            <section className="analysis-state-panel is-partial" role="alert">
              <h2>Scores are withheld</h2>
              {recoveryDetails.review ? (
                <Link
                  to={`/analysis/${id}/evidence`}
                  className="primary-button w-fit"
                >
                  Review extracted evidence
                </Link>
              ) : null}
              {recovery === "review_status_unavailable" ? (
                <button
                  type="button"
                  className="back-button w-fit"
                  onClick={retryStatus}
                >
                  Check evidence status
                </button>
              ) : null}
              {recovery !== "native_review" && recovery !== "ocr_review" ? (
                <Link to="/upload" className="back-button w-fit">
                  Upload a text-based PDF
                </Link>
              ) : null}
            </section>
          ) : null}
        </div>
      </section>
    </WorkspaceShell>
  );
}
