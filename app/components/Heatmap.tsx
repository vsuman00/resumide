const Heatmap = ({
  jdKeywords,
  matchedKeywords,
  uncertainKeywords = [],
  keywordEvidence = [],
}: {
  jdKeywords: string[];
  matchedKeywords: string[];
  missingKeywords: string[];
  uncertainKeywords?: string[];
  keywordEvidence?: KeywordEvidence[];
}) => {
  const matched = new Set(matchedKeywords);
  const uncertain = new Set(uncertainKeywords);
  const total = jdKeywords.length;
  const foundCount = jdKeywords.filter(
    (term) => matched.has(term) && !uncertain.has(term),
  ).length;
  const uncertainCount = jdKeywords.filter((term) =>
    uncertain.has(term),
  ).length;
  const missingCount = total - foundCount - uncertainCount;
  const coverage = total > 0 ? Math.round((foundCount / total) * 100) : 0;

  return (
    <section
      className="keyword-coverage"
      aria-labelledby="keyword-coverage-heading"
    >
      <div className="result-section-heading">
        <div>
          <p className="workspace-eyebrow">Job relevance</p>
          <h2 id="keyword-coverage-heading">Keyword coverage</h2>
        </div>
        <span>{coverage}% matched</span>
      </div>
      <p className="keyword-coverage-intro">
        Review the role-specific language found in your resume. Add a term only
        when it accurately reflects your experience. This view checks up to 20
        selected terms; it does not evaluate every job requirement or establish
        proficiency.
      </p>

      {total === 0 ? (
        <div className="keyword-empty-state">
          <h3>Add job context for keyword coverage</h3>
          <p>
            Re-analyze this resume with a job description to compare relevant
            terms.
          </p>
        </div>
      ) : (
        <>
          <div className="keyword-coverage-meter">
            <div className="keyword-coverage-meter-label">
              <span>{foundCount} found</span>
              <span>{uncertainCount} uncertain</span>
              <span>{missingCount} missing</span>
            </div>
            <div
              className="keyword-coverage-track"
              role="progressbar"
              aria-label="Job description keyword coverage"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={coverage}
            >
              <span style={{ width: `${coverage}%` }} />
            </div>
          </div>

          <ul
            className="keyword-coverage-list"
            aria-label="Keyword match details"
          >
            {jdKeywords.map((keyword) => {
              const isMatch = matched.has(keyword);
              const isUncertain = uncertain.has(keyword);
              const evidence = keywordEvidence.find(
                (item) =>
                  item.term.toLocaleLowerCase() === keyword.toLocaleLowerCase(),
              );
              const status = isUncertain
                ? "Uncertain evidence"
                : isMatch
                  ? "Found in resume"
                  : "Missing from resume";
              return (
                <li
                  key={keyword}
                  className={
                    isUncertain
                      ? "is-uncertain"
                      : isMatch
                        ? "is-matched"
                        : "is-missing"
                  }
                >
                  <span
                    className="keyword-coverage-indicator"
                    aria-hidden="true"
                  />
                  <strong>{keyword}</strong>
                  <span>{status}</span>
                  {evidence?.resume.spans.length ? (
                    <small>Evidence: “{evidence.resume.spans[0].text}”</small>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
};

export default Heatmap;
