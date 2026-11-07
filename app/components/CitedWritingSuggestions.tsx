import { useId } from "react";
import styles from "./CitedWritingSuggestions.module.css";

const categories = [
  ["toneAndStyle", "Tone and style"],
  ["content", "Content"],
  ["structure", "Structure"],
  ["skills", "Skills"],
] as const;
type WritingTip = {
  type: "good" | "improve";
  tip: string;
  explanation: string;
  quote?: string;
};
type WritingFeedback = Record<
  (typeof categories)[number][0],
  { tips: readonly WritingTip[] }
>;

export default function CitedWritingSuggestions({
  feedback,
}: {
  feedback: WritingFeedback;
}) {
  const id = useId();
  return (
    <section
      data-testid="cited-writing-suggestions"
      className={styles.review}
      aria-labelledby={`${id}-heading`}
    >
      <div className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>Source-backed feedback</p>
          <h2 id={`${id}-heading`}>Cited writing suggestions</h2>
          <p className={styles.intro}>
            Review each suggestion alongside the resume excerpt that supports
            it. Check accuracy before making a change.
          </p>
        </div>
        <span className={styles.disclosure}>
          Qualitative ratings are unavailable.
        </span>
      </div>
      {categories.map(([key, title]) => {
        const tips = feedback[key].tips.filter((tip) => tip.quote?.trim());
        return (
          <section
            className={styles.group}
            key={key}
            aria-labelledby={`${id}-${key}`}
          >
            <div className={styles.groupHeading}>
              <h3 id={`${id}-${key}`}>{title}</h3>
              <span>
                {tips.length} cited {tips.length === 1 ? "note" : "notes"}
              </span>
            </div>
            {tips.length === 0 ? (
              <p className={styles.empty}>
                No cited suggestions for this area.
              </p>
            ) : (
              <ul className={styles.list}>
                {tips.map((tip, index) => (
                  <li className={styles.item} key={index}>
                    <span
                      className={`${styles.status} ${tip.type === "good" ? styles.strength : styles.change}`}
                    >
                      <span aria-hidden="true" className={styles.dot} />
                      {tip.type === "good"
                        ? "Strength to keep"
                        : "Suggested change"}
                    </span>
                    <div className={styles.body}>
                      <h4>{tip.tip}</h4>
                      <p className={styles.explanation}>{tip.explanation}</p>
                      <figure className={styles.source}>
                        <figcaption>Resume excerpt</figcaption>
                        <blockquote>{tip.quote}</blockquote>
                      </figure>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </section>
  );
}
