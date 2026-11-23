import { useId } from "react";
import {
  writingClassification,
  writingLabel,
  isFeedbackStrength,
  feedbackProvenanceMessage,
  type FeedbackProvenance,
} from "~/lib/result-feedback";
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
  provenance,
  includeUncited = false,
}: {
  feedback: WritingFeedback;
  provenance?: FeedbackProvenance;
  includeUncited?: boolean;
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
          <p className={styles.eyebrow}>
            {provenance?.status === "available"
              ? "Saved writing feedback"
              : "Unverified writing feedback"}
          </p>
          <h2 id={`${id}-heading`}>Cited writing suggestions</h2>
          <p className={styles.intro}>
            {feedbackProvenanceMessage(provenance)}
          </p>
        </div>
        <span className={styles.disclosure}>
          Qualitative ratings are unavailable.
        </span>
      </div>
      {categories.map(([key, title]) => {
        const tips = feedback[key].tips
          .map((tip, index) => ({
            ...tip,
            classification: writingClassification(provenance, key, index),
          }))
          .filter(
            (tip) =>
              (includeUncited || tip.quote?.trim()) &&
              tip.classification !== "compatibility_only",
          );
        return (
          <section
            className={styles.group}
            key={key}
            aria-labelledby={`${id}-${key}`}
          >
            <div className={styles.groupHeading}>
              <h3 id={`${id}-${key}`}>{title}</h3>
              <span>
                {tips.length} {includeUncited ? "saved" : "cited"}{" "}
                {tips.length === 1 ? "note" : "notes"}
              </span>
            </div>
            {tips.length === 0 ? (
              <p className={styles.empty}>
                {includeUncited
                  ? "No saved suggestions for this area."
                  : "No cited suggestions for this area."}
              </p>
            ) : (
              <ul className={styles.list}>
                {tips.map((tip, index) => (
                  <li className={styles.item} key={index}>
                    <span
                      className={`${styles.status} ${isFeedbackStrength(tip) ? styles.strength : styles.change}`}
                    >
                      <span aria-hidden="true" className={styles.dot} />
                      {writingLabel(tip.type, tip.classification)}
                    </span>
                    <div className={styles.body}>
                      <h4>{tip.tip}</h4>
                      <p className={styles.explanation}>{tip.explanation}</p>
                      {tip.quote?.trim() ? (
                        <figure className={styles.source}>
                          <figcaption>Resume excerpt</figcaption>
                          <blockquote>{tip.quote}</blockquote>
                        </figure>
                      ) : (
                        <p className={styles.empty}>No saved excerpt.</p>
                      )}
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
