import { useEffect, useRef, useState } from "react";
import { BUILD_TEMPLATES } from "~/lib/build-templates";
import styles from "./LatexConverter.module.css";

export type OnboardingChoice =
  { kind: "template"; id: string } | { kind: "paste" } | { kind: "restore" };
type Props = {
  hasDraft: boolean;
  onChoose(choice: OnboardingChoice): void;
  onDismiss(): void;
};

export default function BuildOnboarding({
  hasDraft,
  onChoose,
  onDismiss,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const returnTo = useRef<Element | null>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    returnTo.current = document.activeElement;
    if (!element.open) element.showModal?.();
    return () => {
      if (element.open) element.close?.();
      (returnTo.current as HTMLElement | null)?.focus?.();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={styles.onboarding}
      aria-labelledby="build-onboarding-title"
      aria-describedby="build-onboarding-intro"
      onCancel={(event) => {
        event.preventDefault();
        onDismiss();
      }}
    >
      <div className={styles.onboardingHead}>
        <div>
          <h2 id="build-onboarding-title">Start your resume</h2>
          <p id="build-onboarding-intro">
            Pick a template that compiles out of the box, paste your own LaTeX,
            or pick up where you left off. Your code stays in this browser.
          </p>
        </div>
        <button type="button" aria-label="Close" onClick={onDismiss}>
          ×
        </button>
      </div>
      <div className={styles.onboardingPaths}>
        {hasDraft && (
          <button
            type="button"
            className={styles.onboardingPrimary}
            onClick={() => onChoose({ kind: "restore" })}
          >
            Restore your draft
          </button>
        )}
        <button type="button" onClick={() => onChoose({ kind: "paste" })}>
          Paste your LaTeX
        </button>
      </div>
      <h3>Start from a template</h3>
      <ul className={styles.templateGrid}>
        {BUILD_TEMPLATES.map((template) => (
          <li key={template.id}>
            <button
              type="button"
              className={styles.templateCard}
              onClick={() => onChoose({ kind: "template", id: template.id })}
            >
              <img
                src={template.preview}
                alt=""
                width={240}
                height={340}
                loading="lazy"
              />
              <strong>{template.name}</strong>
              <span>{template.description}</span>
            </button>
          </li>
        ))}
      </ul>
    </dialog>
  );
}

const TIPS = [
  {
    title: "Recompile any time",
    body: "Press ⌘/Ctrl + Enter in the editor to update the PDF.",
  },
  {
    title: "Ask AI about any lines",
    body: "Select up to 20 lines, then choose ✦ Ask AI or press ⌘/Ctrl + K. You review every change before it lands.",
  },
  {
    title: "Check it against a job",
    body: "When the PDF is ready, choose Check this resume to open it in the resume checker.",
  },
];
export function BuildTips({ onDone }: { onDone(): void }) {
  const [step, setStep] = useState(0);
  const tip = TIPS[step];
  const last = step === TIPS.length - 1;
  return (
    <aside className={styles.tips} aria-label="Build tips" aria-live="polite">
      <p>
        <strong>{tip.title}.</strong> {tip.body}
      </p>
      <span className={styles.tipsCount}>
        {step + 1} of {TIPS.length}
      </span>
      <button
        type="button"
        onClick={() => (last ? onDone() : setStep(step + 1))}
      >
        {last ? "Done" : "Next tip"}
      </button>
      {!last && (
        <button type="button" onClick={onDone}>
          Skip tips
        </button>
      )}
    </aside>
  );
}

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: "⌘/Ctrl + Enter", action: "Recompile the PDF" },
  { keys: "⌘/Ctrl + K", action: "Ask AI about the selected lines" },
  {
    keys: "Tab / Esc",
    action: "Accept or reject an AI suggestion shown in the editor",
  },
  { keys: "⌘/Ctrl + /", action: "Comment or uncomment the selected lines" },
  { keys: "⌘/Ctrl + F", action: "Search in your code" },
  { keys: "⌘/Ctrl + Z", action: "Undo (⇧ to redo)" },
  { keys: "Esc then Tab", action: "Leave the editor without inserting a tab" },
  { keys: "?", action: "Show this list" },
];
export function ShortcutSheet({ onClose }: { onClose(): void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const returnTo = useRef<Element | null>(null);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    returnTo.current = document.activeElement;
    if (!element.open) element.showModal?.();
    return () => {
      if (element.open) element.close?.();
      (returnTo.current as HTMLElement | null)?.focus?.();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className={styles.onboarding}
      aria-labelledby="build-shortcuts-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <div className={styles.onboardingHead}>
        <h2 id="build-shortcuts-title">Keyboard shortcuts</h2>
        <button type="button" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <dl className={styles.shortcuts}>
        {SHORTCUTS.map((item) => (
          <div key={item.keys}>
            <dt>
              <kbd>{item.keys}</kbd>
            </dt>
            <dd>{item.action}</dd>
          </div>
        ))}
      </dl>
    </dialog>
  );
}
