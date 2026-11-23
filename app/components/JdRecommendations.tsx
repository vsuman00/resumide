import { useId } from "react";
import { Link } from "react-router";
import type { JdRecommendationPlan } from "~/lib/server/jd-recommendations";

const observations = {
  source_related_claim: "Related source claim",
  recorded_declaration: "Recorded candidate declaration",
  listed_skill_only: "Skill listing only",
  evidence_gap: "Evidence gap",
  review_scope: "Requirement scope needs review",
};
const structures = {
  atom: "Single requirement",
  all_of: "All parts (AND)",
  any_of: "Alternatives (OR)",
  unknown: "Interpretation unresolved",
};

/** Read-only local guidance; all selection and evidence authority stay on the server. */
export default function JdRecommendations({
  plan,
  base,
}: {
  plan: JdRecommendationPlan;
  base: string;
}) {
  const heading = useId();
  const canonical = `${base}/canonical?version=${encodeURIComponent(plan.binding.canonical.versionId)}`;
  const requirements = `${base}/requirements?version=${encodeURIComponent(plan.binding.requirements.versionId)}`;
  return (
    <section aria-labelledby={heading} style={{ overflowWrap: "anywhere" }}>
      <h2 id={heading}>JD review priorities</h2>
      <p>
        Deterministic local review guidance, not independent verification or an
        assessment of your qualifications. Review the saved requirement against
        what you can truthfully support.
      </p>
      <p>
        Showing {plan.items.length} of {plan.total} review priorities.
      </p>
      <p>
        {plan.remainingCount} more priorities remain in the complete requirement
        review.
      </p>
      <p>
        {plan.retainedClauseCount} retained clauses have no supported mapping.
        Review them separately; they are not treated as met.
      </p>
      <ol>
        {plan.items.map((item, index) => (
          <li key={item.id}>
            <article className="account-card">
              <h3>
                Priority {index + 1}: {item.importance}
              </h3>
              <p>{structures[item.expressionKind]}</p>
              <p>Saved job requirement:</p>
              <blockquote
                aria-label="Saved job requirement"
                style={{ whiteSpace: "pre-wrap" }}
              >
                {item.requirementQuote}
              </blockquote>
              <p>{observations[item.observation]}</p>
              {item.target ? (
                <>
                  <p>Current resume claim:</p>
                  <blockquote
                    aria-label="Current resume claim"
                    style={{ whiteSpace: "pre-wrap" }}
                  >
                    {item.target.value}
                  </blockquote>
                  <p>
                    {item.target.basis === "source_quote"
                      ? "Quoted source claim; not independently verified."
                      : "Recorded candidate declaration; not independent source support."}
                  </p>
                  {item.target.basis === "source_quote" &&
                    item.target.sourceQuote !== null && (
                      <>
                        <p>Recorded source quote:</p>
                        <blockquote
                          aria-label="Recorded source quote"
                          style={{ whiteSpace: "pre-wrap" }}
                        >
                          {item.target.sourceQuote}
                        </blockquote>
                      </>
                    )}
                  <p>
                    <Link
                      to={`${canonical}#fact-${encodeURIComponent(item.target.factId)}`}
                    >
                      Inspect this current fact and version
                    </Link>
                  </p>
                </>
              ) : (
                <p>
                  No single current contribution has been identified for this
                  review.
                </p>
              )}
              {item.observation === "listed_skill_only" && (
                <p>
                  A skill listing alone does not establish contribution,
                  proficiency or duration.
                </p>
              )}
              {item.observation === "evidence_gap" && (
                <p>
                  Missing evidence does not mean you are unqualified. Review the
                  requirement and any evidence you actually have.
                </p>
              )}
              {item.observation === "review_scope" && (
                <p>
                  Review the complete clause and its scope. Unknown, contextual
                  or negated wording is not treated as a positive qualification.
                </p>
              )}
              <p>{item.reason}</p>
              <p>Effort: review required.</p>
              {item.question !== null && (
                <>
                  <h4>Optional question, only if true of this contribution</h4>
                  <p>{item.question}</p>
                  <p>
                    Leave unknown details unanswered; measurements are optional
                    and must be truthful. New facts need the separate canonical
                    review and confirmation flow.
                  </p>
                </>
              )}
            </article>
          </li>
        ))}
      </ol>
      {plan.items.length === 0 && (
        <p>
          No review priorities are available in this plan. Inspect the complete
          requirement review for missing or unresolved inputs.
        </p>
      )}
      <nav aria-label="Complete JD recommendation review">
        <p>
          <Link to={requirements}>
            Review the complete saved job requirements
          </Link>
        </p>
        <p>
          <Link to={`${base}/evidence`}>Review source evidence</Link>
        </p>
      </nav>
      <p>
        Numerical score and score change: unavailable. Qualification credit: not
        assessed. Rewording the same facts does not add qualification evidence.
      </p>
    </section>
  );
}
