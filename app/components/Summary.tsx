const Category = ({ title, score }: { title: string; score: number }) => {
  return (
    <div
      className="result-score-category"
      role="group"
      aria-label={`${title} score`}
    >
      <div>
        <strong>{title}</strong>
        <span className="result-category-band is-uncalibrated">
          Historical rating
        </span>
      </div>
      <span className="result-category-value is-uncalibrated">{score}/100</span>
    </div>
  );
};

const Summary = ({ feedback }: { feedback: Feedback }) => {
  return (
    <section
      className="result-score-breakdown"
      aria-labelledby="score-breakdown-heading"
    >
      <div className="result-section-heading">
        <div>
          <p className="workspace-eyebrow">Score breakdown</p>
          <h2 id="score-breakdown-heading">Historical ratings</h2>
        </div>
        <span>0 to 100</span>
      </div>
      <p className="result-score-breakdown-intro">
        These saved ratings belong to the legacy method. They are not validated
        measures of writing quality, skills or job alignment.
      </p>
      <div className="result-score-category-list">
        <Category title="ATS compatibility" score={feedback.ATS.score} />
        <Category title="Tone and style" score={feedback.toneAndStyle.score} />
        <Category title="Content" score={feedback.content.score} />
        <Category title="Structure" score={feedback.structure.score} />
        <Category title="Skills" score={feedback.skills.score} />
      </div>
    </section>
  );
};
export default Summary;
