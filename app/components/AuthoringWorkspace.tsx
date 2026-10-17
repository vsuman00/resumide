import { Form, Link, useNavigation } from "react-router";
import { useEffect, useState } from "react";
import { checkWritingQuality } from "~/lib/writing-quality";
import type { loadAuthoring } from "~/lib/server/authoring-repository";
import { QUESTIONS, CLARIFICATION_KINDS } from "~/lib/authoring-ui";
type Model = Awaited<ReturnType<typeof loadAuthoring>>;
export type AuthoringFeedback = {
  error?: string;
  submitted?: {
    action: string;
    expectedVersionId: string;
    idempotencyKey: string;
    targetFactId?: string;
    sectionId?: string;
    questionKind?: string;
    value?: string;
  };
};

function ClarificationInputs({
  kind,
  initialValue,
}: {
  kind: (typeof CLARIFICATION_KINDS)[number];
  initialValue: string;
}) {
  const [value, setValue] = useState(initialValue);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    // A browser history restore can revive a whole page, including native form
    // values. A restored confirmation must never authorize a different draft.
    const resetRestoredDraft = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setValue("");
        setConfirmed(false);
      }
    };
    window.addEventListener("pageshow", resetRestoredDraft);
    return () => window.removeEventListener("pageshow", resetRestoredDraft);
  }, []);
  return (
    <>
      <label htmlFor={`question-${kind}`}>{QUESTIONS[kind]}</label>
      <input
        id={`question-${kind}`}
        name="value"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        maxLength={300}
        required
      />
      <label>
        <input
          type="checkbox"
          name="confirmation"
          value="true"
          required
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        I confirm this answer is accurate.
      </label>
    </>
  );
}

export default function AuthoringWorkspace({
  model,
  analysisId,
  feedback,
}: {
  model: Model;
  analysisId: string;
  feedback?: AuthoringFeedback;
}) {
  const busy = useNavigation().state !== "idle";
  const base = `/analysis/${analysisId}`,
    doc = model.document;
  const linked = new Set(
    doc.sections.flatMap((s) => [
      ...s.factIds,
      ...s.entries.flatMap((e) => [
        ...e.factIds,
        ...e.bullets.flatMap((b) => b.factIds),
      ]),
    ]),
  );
  const unassigned = doc.facts.filter((f) => !linked.has(f.id));
  const groups = [
    ...doc.sections,
    ...(unassigned.length
      ? [
          {
            id: "unassigned",
            type: "other" as const,
            title: "Additional imported facts",
            factIds: unassigned.map((f) => f.id),
            entries: [],
          },
        ]
      : []),
  ];
  const rendered = new Set<string>();
  const fields = (action: string, target: string) => {
    const retry =
      feedback?.submitted?.action === action &&
      (feedback.submitted.targetFactId === target ||
        `${feedback.submitted.targetFactId}:${feedback.submitted.questionKind}` ===
          target ||
        feedback.submitted.sectionId === target)
        ? feedback.submitted
        : null;
    return (
      <>
        <input type="hidden" name="action" value={action} />
        <input
          type="hidden"
          name="expectedVersionId"
          value={retry?.expectedVersionId ?? doc.versionId}
        />
        <input
          type="hidden"
          name="idempotencyKey"
          value={
            retry?.idempotencyKey ??
            model.formKeys[`${action}:${target}`] ??
            model.formKey
          }
        />
      </>
    );
  };
  const finding = (f: Model["findings"]["top"][number]) => (
    <li key={f.id}>
      {f.reason} <span>Effort: {f.effort}.</span>
      {f.targetFactId ? (
        <a href={`#author-fact-${f.targetFactId}`}>Edit the affected fact</a>
      ) : (
        <p>
          {f.nonEditableReason}{" "}
          <Link to={`${base}/evidence`}>Review the source</Link>
        </p>
      )}
    </li>
  );
  return (
    <section aria-labelledby="authoring-heading" className="rule-trace">
      <h2 id="authoring-heading">Edit your resume on this analysis</h2>
      {busy && <p role="status">Saving or loading your current version…</p>}
      <fieldset
        disabled={busy}
        style={{ minWidth: 0, border: 0, padding: 0, margin: 0 }}
      >
        <legend>Resume authoring actions</legend>
        <p>
          Changes create new versions. Imported or edited facts need your
          confirmation; confirmation is your own declaration, not verified
          extraction accuracy.
        </p>
        {feedback?.error && (
          <p role="alert">
            {feedback.error} Your submitted correction is retained below. Review
            the latest version before resolving a stale save.
          </p>
        )}
        {feedback?.submitted?.value && (
          <blockquote aria-label="Your submitted correction">
            {feedback.submitted.value}
          </blockquote>
        )}
        {feedback?.submitted && (
          <Form method="post" action={`${base}/author`}>
            {Object.entries(feedback.submitted)
              .filter(([, v]) => v !== undefined)
              .map(([key, value]) => (
                <input
                  key={key}
                  type="hidden"
                  name={key}
                  value={
                    typeof value === "object"
                      ? JSON.stringify(value)
                      : String(value)
                  }
                />
              ))}
            <button type="submit">Retry this exact submission</button>
          </Form>
        )}
        {!model.editable && (
          <p role="status">
            Historical version: editing and acceptance are disabled.{" "}
            <Link to={`${base}/score`}>Open the current version</Link>
          </p>
        )}
        <section>
          <h3>Top findings to review</h3>
          <p>
            At most five evidence priorities; impact points are unavailable.
          </p>
          <ol>{model.findings.top.map(finding)}</ol>
          <details>
            <summary>
              Remaining findings ({model.findings.remaining.length})
            </summary>
            <ol>{model.findings.remaining.map(finding)}</ol>
          </details>
        </section>
        <nav aria-label="Resume outline">
          {groups.map((s) => (
            <p key={s.id}>
              <a href={`#author-section-${s.id}`}>{s.title}</a>
            </p>
          ))}
        </nav>
        {groups.map((section) => {
          const ids = new Set([
            ...section.factIds,
            ...section.entries.flatMap((e) => [
              ...e.factIds,
              ...e.bullets.flatMap((b) => b.factIds),
            ]),
          ]);
          const facts = doc.facts.filter(
            (f) => ids.has(f.id) && !rendered.has(f.id),
          );
          for (const f of facts) rendered.add(f.id);
          return (
            <section key={section.id} id={`author-section-${section.id}`}>
              <h3>{section.title}</h3>
              {model.editable && section.id !== "unassigned" && (
                <Form method="post" action={`${base}/author`}>
                  {fields("rename", section.id)}
                  <input type="hidden" name="sectionId" value={section.id} />
                  <label htmlFor={`section-title-${section.id}`}>
                    Section title: {section.title}
                  </label>
                  <input
                    key={section.title}
                    id={`section-title-${section.id}`}
                    name="value"
                    defaultValue={
                      feedback?.submitted?.sectionId === section.id
                        ? feedback.submitted.value
                        : section.title
                    }
                    maxLength={100}
                    required
                  />
                  <button type="submit">Save section title</button>
                </Form>
              )}
              {facts.map((fact) => (
                <article key={fact.id} className="account-card">
                  <h4>
                    {fact.type}: {fact.value}
                  </h4>
                  <p>State: {fact.state.replaceAll("_", " ")}</p>
                  <Link
                    to={`${base}/canonical?version=${doc.versionId}#fact-${fact.id}`}
                  >
                    Inspect this fact’s provenance and version
                  </Link>
                  {model.editable && (
                    <>
                      <Form method="post" action={`${base}/author`}>
                        {fields("edit", fact.id)}
                        <input
                          type="hidden"
                          name="targetFactId"
                          value={fact.id}
                        />
                        <label htmlFor={`author-fact-${fact.id}`}>
                          Edit {fact.type}: {fact.value}
                        </label>
                        <textarea
                          key={fact.value}
                          id={`author-fact-${fact.id}`}
                          name="value"
                          defaultValue={
                            feedback?.submitted?.targetFactId === fact.id
                              ? feedback.submitted.value
                              : fact.value
                          }
                          maxLength={2000}
                          required
                        />
                        <button type="submit">Save fact correction</button>
                      </Form>
                      {feedback?.submitted?.action === "edit" &&
                        feedback.submitted.targetFactId === fact.id && (
                          <details>
                            <summary>
                              Save the retained correction after reviewing the
                              current version
                            </summary>
                            <p>Current value: {fact.value}</p>
                            <Form method="post" action={`${base}/author`}>
                              <input type="hidden" name="action" value="edit" />
                              <input
                                type="hidden"
                                name="expectedVersionId"
                                value={doc.versionId}
                              />
                              <input
                                type="hidden"
                                name="idempotencyKey"
                                value={model.formKey}
                              />
                              <input
                                type="hidden"
                                name="targetFactId"
                                value={fact.id}
                              />
                              <input
                                type="hidden"
                                name="value"
                                value={feedback.submitted.value}
                              />
                              <label>
                                <input type="checkbox" required />I reviewed the
                                current value and want to save my retained
                                correction.
                              </label>
                              <button type="submit">
                                Save reviewed correction against current version
                              </button>
                            </Form>
                          </details>
                        )}
                      <Form method="post" action={`${base}/author`}>
                        {fields("confirm", fact.id)}
                        <input
                          type="hidden"
                          name="targetFactId"
                          value={fact.id}
                        />
                        <button
                          type="submit"
                          disabled={fact.state === "candidate_confirmed"}
                        >
                          Confirm this saved fact
                        </button>
                      </Form>
                    </>
                  )}
                  {fact.type === "contribution" && (
                    <Link to={`${base}/score?focus=${fact.id}#writing-review`}>
                      Review writing for this contribution
                    </Link>
                  )}
                </article>
              ))}
            </section>
          );
        })}
        <section id="writing-review">
          <h3>Grounded writing review</h3>
          <Form
            key={model.selectedFactId ?? "no-focus"}
            method="get"
            action={`${base}/score`}
          >
            <label htmlFor="writing-focus">Contribution to review</label>
            <select
              style={{ maxWidth: "100%" }}
              id="writing-focus"
              name="focus"
              defaultValue={model.selectedFactId ?? ""}
            >
              {doc.facts
                .filter((f) => f.type === "contribution")
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.value.slice(0, 100)}
                  </option>
                ))}
            </select>
            <button type="submit">Review contribution</button>
          </Form>
          {model.selectedFactId && (
            <>
              <p>
                Clarify only what you can confirm. Leave unknown answers
                unanswered.
              </p>
              {model.editable &&
                CLARIFICATION_KINDS.map((kind) => (
                  <Form
                    key={`${model.selectedFactId}:${kind}`}
                    method="post"
                    action={`${base}/author`}
                    autoComplete="off"
                  >
                    {fields("clarify", `${model.selectedFactId}:${kind}`)}
                    <input
                      type="hidden"
                      name="targetFactId"
                      value={model.selectedFactId!}
                    />
                    <input type="hidden" name="questionKind" value={kind} />
                    <ClarificationInputs
                      kind={kind}
                      initialValue={
                        feedback?.submitted?.action === "clarify" &&
                        feedback.submitted.targetFactId ===
                          model.selectedFactId &&
                        feedback.submitted.questionKind === kind
                          ? (feedback.submitted.value ?? "")
                          : ""
                      }
                    />
                    <button type="submit">Save {kind} clarification</button>
                  </Form>
                ))}
            </>
          )}
          {model.patches.map((patch) => (
            <article key={patch.id} className="account-card">
              <h4>{patch.pattern.replaceAll("_", " ")}</h4>
              <p>
                State: {patch.state.replaceAll("_", " ")}; confidence:
                uncalibrated.
              </p>
              <p>{patch.rationale}</p>
              <p>
                Factual strength: candidate-declared; domain quality needs
                review.
              </p>
              <ul>
                {checkWritingQuality(
                  patch.operations[0].value,
                  doc.facts.find((f) => f.id === patch.targetFactId)!.value,
                ).warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
              <blockquote>{patch.operations[0].value}</blockquote>
              {patch.clarificationNeeds.length > 0 && (
                <p>
                  Clarification needed: {patch.clarificationNeeds.join(", ")}
                </p>
              )}
              <p>
                Projected before acceptance: unavailable. Actual after a saved
                version: unavailable. Numeric delta: unavailable.
              </p>
              {model.editable && (
                <>
                  <Form method="post" action={`${base}/author`}>
                    {fields("accept", patch.id)}
                    <input
                      type="hidden"
                      name="patch"
                      value={JSON.stringify(patch)}
                    />
                    <label>
                      <input
                        type="checkbox"
                        name="confirmation"
                        value="true"
                        required
                      />
                      I reviewed and confirm every proposed claim.
                    </label>
                    <button type="submit" disabled={patch.state !== "ready"}>
                      Accept {patch.pattern.replaceAll("_", " ")}
                    </button>
                  </Form>
                  <Form method="post" action={`${base}/author`}>
                    {fields("reject", patch.id)}
                    <input
                      type="hidden"
                      name="patch"
                      value={JSON.stringify(patch)}
                    />
                    <button type="submit">
                      Reject {patch.pattern.replaceAll("_", " ")}
                    </button>
                  </Form>
                </>
              )}
            </article>
          ))}
          {!model.patches.length && (
            <p>
              No supported patch target is available. Review the imported
              structure or domain first.
            </p>
          )}
        </section>
        <section>
          <h3>Candidate change history</h3>
          <p>
            Most recent twenty decisions. Full history is included in your
            privacy export.
          </p>
          {model.editable && doc.parentVersionId && (
            <Form method="post" action={`${base}/author`}>
              {fields("undo", "undo")}
              <button type="submit">
                Undo last saved change as a new version
              </button>
            </Form>
          )}
          <ul>
            {model.events.map((e) => (
              <li key={e.id}>
                {e.action} at{" "}
                <time dateTime={e.created_at}>{e.created_at}</time>{" "}
                <Link
                  to={`${base}/canonical?version=${e.result_version_id ?? e.base_version_id}&compare=${e.base_version_id}`}
                >
                  Compare this decision
                </Link>
              </li>
            ))}
          </ul>
          {model.history.map((v) => (
            <article key={v.id}>
              <Link to={`${base}/score?canonical=${v.id}`}>
                View resume version {v.revision}
              </Link>
              {model.editable && v.id !== doc.versionId && (
                <Form method="post" action={`${base}/author`}>
                  {fields("restore", v.id)}
                  <input type="hidden" name="targetVersionId" value={v.id} />
                  <button type="submit">
                    Restore version {v.revision} as a new version
                  </button>
                </Form>
              )}
            </article>
          ))}
          {model.nextOffset !== null && (
            <Link to={`${base}/canonical?offset=${model.nextOffset}`}>
              Review earlier version history
            </Link>
          )}
          <p>
            Actual diagnostics use saved version {doc.versionId}. Numeric
            score/delta: unavailable.
          </p>
        </section>
      </fieldset>
    </section>
  );
}
