import type { LatexDiagnostic } from "~/lib/latex-converter";
import { LATEX_DIAGNOSTIC_TEXT } from "~/lib/latex-diagnostics";
import styles from "./LatexConverter.module.css";

type Props = {
  diagnostics: LatexDiagnostic[];
  stale: boolean;
  onJump(line: number): void;
  onFixWithAi?: (diagnostic: LatexDiagnostic) => void;
};

function Row({
  item,
  stale,
  onJump,
  onFixWithAi,
}: { item: LatexDiagnostic } & Omit<Props, "diagnostics">) {
  const text = LATEX_DIAGNOSTIC_TEXT[item.kind];
  return (
    <li
      className={
        item.severity === "error" ? styles.problemError : styles.problemWarning
      }
    >
      <span>
        {item.line ? `Line ${item.line} · ` : ""}
        {text.title} — {text.help}
      </span>
      {item.line && (
        <span className={styles.problemActions}>
          <button
            type="button"
            disabled={stale}
            onClick={() => onJump(item.line!)}
          >
            Jump to line {item.line}
          </button>
          {onFixWithAi && item.severity === "error" && (
            <button
              type="button"
              disabled={stale}
              onClick={() => onFixWithAi(item)}
            >
              Fix with AI
            </button>
          )}
        </span>
      )}
    </li>
  );
}

export default function CompileProblems({
  diagnostics,
  stale,
  onJump,
  onFixWithAi,
}: Props) {
  if (!diagnostics.length) return null;
  const errors = diagnostics.filter((d) => d.severity === "error");
  const warnings = diagnostics.filter((d) => d.severity === "warning");
  const rowProps = { stale, onJump, onFixWithAi };
  return (
    <section className={styles.problems} aria-label="Compile problems">
      {stale && (
        <p className={styles.problemsStale}>
          Code changed since this compile. Recompile to refresh.
        </p>
      )}
      {errors.length > 0 && (
        <ul>
          {errors.map((item, i) => (
            <Row key={i} item={item} {...rowProps} />
          ))}
        </ul>
      )}
      {warnings.length > 0 && (
        <details>
          <summary>
            {warnings.length} {warnings.length === 1 ? "warning" : "warnings"}
          </summary>
          <ul>
            {warnings.map((item, i) => (
              <Row key={i} item={item} {...rowProps} />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
