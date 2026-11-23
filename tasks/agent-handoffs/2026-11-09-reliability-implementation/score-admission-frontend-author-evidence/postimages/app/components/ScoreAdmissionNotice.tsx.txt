import { useId } from "react";
import { Link } from "react-router";

export interface ScoreAdmissionNoticeProps {
  dimensions: readonly { blockers: readonly string[] }[];
  readiness: { blockers: readonly string[] };
  base: string;
  canonicalVersionId?: string;
  requirementVersionId?: string;
}

const explanations = {
  extraction_review_required:
    "Compare the recovered text with your source document. Review any extraction issues before relying on the text.",
  critical_evidence_missing:
    "Important resume information is missing, uncertain, or conflicting. Check the source evidence and structured resume for gaps.",
  requirements_review_required:
    "Review the required and preferred labels and their source quotes against the job description.",
  job_description_missing:
    "No job description is available for this view. Review the job input in the requirements workspace.",
  calibration_not_approved:
    "The service has not approved the scoring policy. This requires service validation before numerical scores can be shown.",
  coverage_policy_unknown:
    "The minimum evidence coverage needed for a score has not been approved. Observed page coverage does not validate a scoring policy.",
  unsupported_input:
    "This input is outside the currently supported scoring scope. Extraction recovery or candidate confirmation does not establish support for scoring.",
};
const candidateChecks = [
  "extraction_review_required",
  "critical_evidence_missing",
  "requirements_review_required",
  "job_description_missing",
] as const;
const serviceChecks = [
  "calibration_not_approved",
  "coverage_policy_unknown",
  "unsupported_input",
] as const;

export default function ScoreAdmissionNotice({
  dimensions,
  readiness,
  base,
  canonicalVersionId,
  requirementVersionId,
}: ScoreAdmissionNoticeProps) {
  const heading = useId();
  const blockers = new Set([
    ...dimensions.flatMap((d) => d.blockers),
    ...readiness.blockers,
  ]);
  const review = candidateChecks.filter((code) => blockers.has(code));
  const service = serviceChecks.filter((code) => blockers.has(code));
  const unknown = [...blockers].some(
    (code) => !Object.hasOwn(explanations, code),
  );
  const evidence =
    blockers.has("extraction_review_required") ||
    blockers.has("critical_evidence_missing");
  const canonical = blockers.has("critical_evidence_missing");
  const requirements =
    blockers.has("requirements_review_required") ||
    blockers.has("job_description_missing");
  return (
    <section className="account-card" aria-labelledby={heading}>
      <h2 id={heading}>Why scores are unavailable</h2>
      <p>
        Numeric scores are unavailable. Reviewing or confirming your inputs does
        not enable numerical scores. Scoring-policy validation is a separate
        service responsibility.
      </p>
      {review.length > 0 && (
        <>
          <h3>Review your inputs</h3>
          <ul aria-label="Checks you can review">
            {review.map((code) => (
              <li key={code}>{explanations[code]}</li>
            ))}
          </ul>
          <nav aria-label="Scoring input review">
            {evidence && (
              <p>
                <Link to={`${base}/evidence`}>Review source evidence</Link>
              </p>
            )}
            {canonical && (
              <p>
                <Link
                  to={`${base}/canonical${canonicalVersionId ? `?version=${encodeURIComponent(canonicalVersionId)}` : ""}`}
                >
                  Review structured resume
                </Link>
              </p>
            )}
            {requirements && (
              <p>
                <Link
                  to={`${base}/requirements${requirementVersionId ? `?version=${encodeURIComponent(requirementVersionId)}` : ""}`}
                >
                  Review job requirements
                </Link>
              </p>
            )}
          </nav>
        </>
      )}
      {(service.length > 0 || unknown) && (
        <>
          <h3>Service validation is still required</h3>
          <ul aria-label="Service validation checks">
            {service.map((code) => (
              <li key={code}>{explanations[code]}</li>
            ))}
            {unknown && (
              <li>
                <strong>Another scoring check is unresolved</strong>
                <p>
                  The service must verify this check before numerical scores can
                  be shown.
                </p>
              </li>
            )}
          </ul>
        </>
      )}
      <p>These diagnostics do not predict employer acceptance.</p>
    </section>
  );
}
