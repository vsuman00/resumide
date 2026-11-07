import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionItem,
} from "./Accordion";

const ScoreBadge = ({ score }: { score: number }) => {
  return (
    <span className="detail-score-badge is-uncalibrated">{score}/100</span>
  );
};

const CategoryHeader = ({
  title,
  categoryScore,
}: {
  title: string;
  categoryScore: number;
}) => {
  return (
    <div className="detail-category-header">
      <p>{title}</p>
      <ScoreBadge score={categoryScore} />
    </div>
  );
};

const CategoryContent = ({
  tips,
}: {
  tips: { type: "good" | "improve"; tip: string; explanation: string }[];
}) => {
  return (
    <div className="detail-tip-list">
      {tips.map((tip, index) => (
        <article
          key={`${tip.type}-${tip.tip}-${index}`}
          className={`detail-tip-row${tip.type === "good" ? " is-good" : " is-improve"}`}
        >
          <span className="detail-tip-indicator" aria-hidden="true" />
          <div>
            <small>
              {tip.type === "good"
                ? "Strength to preserve"
                : "Recommended repair"}
            </small>
            <h3>{tip.tip}</h3>
            <p>{tip.explanation}</p>
          </div>
        </article>
      ))}
    </div>
  );
};

const Details = ({ feedback }: { feedback: Feedback }) => {
  const categories = [
    { id: "tone-style", title: "Tone and style", data: feedback.toneAndStyle },
    { id: "content", title: "Content", data: feedback.content },
    { id: "structure", title: "Structure", data: feedback.structure },
    { id: "skills", title: "Skills", data: feedback.skills },
  ];
  const defaultOpen = categories.reduce((lowest, category) =>
    category.data.score < lowest.data.score ? category : lowest,
  ).id;

  return (
    <section
      className="result-feedback-details"
      aria-labelledby="details-heading"
    >
      <div className="result-section-heading">
        <div>
          <p className="workspace-eyebrow">Guidance by area</p>
          <h2 id="details-heading">Detailed feedback</h2>
        </div>
      </div>
      <Accordion defaultOpen={defaultOpen} className="result-details-accordion">
        {categories.map((category) => (
          <AccordionItem key={category.id} id={category.id}>
            <AccordionHeader itemId={category.id}>
              <CategoryHeader
                title={category.title}
                categoryScore={category.data.score}
              />
            </AccordionHeader>
            <AccordionContent itemId={category.id}>
              <CategoryContent tips={category.data.tips} />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
};

export default Details;
