import {
  itemHint,
  itemLabel,
  type AtsReport,
  type ReportItem as Requirement,
} from "~/lib/ats-report";
import type { TypedCoverage } from "~/lib/server/schema";
import { ONET_ATTRIBUTION } from "~/lib/onet-attribution";

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const length = (total: number) =>
  total >= 12
    ? `${Math.floor(total / 12)} yr${total >= 24 ? "s" : ""}${total % 12 ? ` ${total % 12} mo` : ""}`
    : `${total} mo`;

/** Parse health and JD match, side by side. No blended number. */
export function TwoResults({ report }: { report: AtsReport }) {
  const { parseHealth, minimum } = report;
  return (
    <div className="two-results" role="group" aria-label="Your two results">
      <section aria-labelledby="parse-health-title">
        <p className="workspace-eyebrow">Can an ATS read it?</p>
        <h2 id="parse-health-title">Parse health</h2>
        <p className="two-results-value">
          {parseHealth.passed} of {parseHealth.total} checks pass
        </p>
        <p>
          Contact details, sections, dates, layout and file problems such as
          hidden text, checked on the file you uploaded.
        </p>
      </section>
      <section aria-labelledby="jd-match-title">
        <p className="workspace-eyebrow">Does it meet the role?</p>
        <h2 id="jd-match-title">JD match</h2>
        <p className="two-results-value">
          {minimum.total
            ? `${minimum.met} of ${minimum.total} minimum qualifications met`
            : "No minimum qualifications found"}
        </p>
        <p>
          {minimum.partial} partly met, {minimum.missing} not found. Preferred
          items are listed separately and never hide a missing minimum.
        </p>
      </section>
    </div>
  );
}

function Item({ item }: { item: Requirement }) {
  const note = itemHint(item);
  return (
    <li className={`jd-item is-${item.state}`}>
      <span className="jd-state">{itemLabel(item)}</span>
      <div>
        <p className="jd-phrase">{item.phrase}</p>
        {item.detail ? <p>{item.detail}</p> : null}
        {item.satisfiedBy ? (
          <p>Met through the alternative: {item.satisfiedBy}.</p>
        ) : null}
        {item.state !== "missing" &&
        item.resumeEvidence.length &&
        item.kind !== "years" ? (
          <small>Found: {item.resumeEvidence[0].text.slice(0, 140)}</small>
        ) : null}
        {item.lastYear ? (
          <small> Last used in a role ending {item.lastYear}.</small>
        ) : null}
        {note ? <p className="jd-hint">{note}</p> : null}
      </div>
    </li>
  );
}

const TITLE_TEXT = {
  aligned: "matches",
  adjacent: "is close to",
  different: "differs from",
  unknown: "could not be compared with",
} as const;

export function JdMatchPanel({ report }: { report: AtsReport }) {
  const required = report.minimumItems;
  const preferred = report.preferredItems;
  const t = report.title;
  const minimum = report.minimum;
  return (
    <section className="jd-match" aria-labelledby="jd-match-heading">
      <div className="result-section-heading">
        <div>
          <p className="workspace-eyebrow">
            Matcher {report.versions.matcher.split("/")[1]}
          </p>
          <h2 id="jd-match-heading">Minimum qualifications</h2>
        </div>
        <span>
          {minimum.met} of {minimum.total} met
        </span>
      </div>
      {t.jdTitle && t.resumeTitle ? (
        <p className="jd-title-line">
          The role title &quot;{t.jdTitle}&quot; {TITLE_TEXT[t.alignment]} your
          most relevant role &quot;{t.resumeTitle}&quot;
          {t.seniority !== "unknown"
            ? `, and your level ${t.seniority === "at" ? "matches the posting" : `looks ${t.seniority} the posting's level`}`
            : ""}
          . This is shown as evidence only.
        </p>
      ) : null}
      {required.length ? (
        <ul className="jd-list">
          {required.map((item) => (
            <Item key={`${item.kind}:${item.phrase}`} item={item} />
          ))}
        </ul>
      ) : (
        <p>
          No minimum qualifications were found in the job description. Paste the
          full posting, including its qualifications section.
        </p>
      )}
      {preferred.length ? (
        <>
          <h3>Preferred qualifications</h3>
          <ul className="jd-list">
            {preferred.map((item) => (
              <Item key={`${item.kind}:${item.phrase}`} item={item} />
            ))}
          </ul>
        </>
      ) : null}
      {report.applicationChecks.length ? (
        <>
          <h3>Answer these in the application</h3>
          <p>
            These are asked in the employer&apos;s form. They never change your
            result.
          </p>
          <ul className="jd-list">
            {report.applicationChecks.map((c, i) => (
              <li key={i} className="jd-item is-note">
                <span className="jd-state">{c.kind}</span>
                <div>
                  <p>{c.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {report.truncated ? (
        <p className="jd-footnote">
          This job description was long, so only its first 80 requirements are
          shown and counted.
        </p>
      ) : null}
      <p className="jd-footnote">
        Compared with the job description you provided, using vocabulary{" "}
        {report.versions.vocabulary.split("/")[1]} as of {report.versions.asOf}.
        This is guidance, not an employer decision.
      </p>
      <p className="jd-footnote">{ONET_ATTRIBUTION}</p>
    </section>
  );
}

/** What a keyword ATS could store from this resume, with gaps flagged (ATS-14). */
export function ParsedProfile({
  typed,
  contact,
}: {
  typed: TypedCoverage;
  contact: {
    name: string | null;
    email: string | null;
    phone: string | null;
    location: string | null;
  };
}) {
  const { roles, education, totalMonths } = typed.profile;
  const fmt = (m: number) => `${MONTH_NAMES[m % 12]} ${Math.floor(m / 12)}`;
  const notFound = <em>Not found</em>;
  return (
    <section
      className="parsed-profile"
      aria-labelledby="parsed-profile-heading"
    >
      <div className="result-section-heading">
        <div>
          <p className="workspace-eyebrow">What an ATS could store</p>
          <h2 id="parsed-profile-heading">Parsed profile</h2>
        </div>
        <span>
          {totalMonths === null
            ? "No dated roles"
            : `${length(totalMonths)} of dated roles`}
        </span>
      </div>
      <p>
        This is our reading of your resume text, not any vendor&apos;s parser.
        If a field says Not found, an ATS may not find it either.
      </p>
      <dl className="parsed-contact">
        {(
          [
            ["Name", contact.name],
            ["Email", contact.email],
            ["Phone", contact.phone],
            ["Location", contact.location],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value ?? notFound}</dd>
          </div>
        ))}
      </dl>
      <h3>Roles</h3>
      {roles.length ? (
        <table className="parsed-table">
          <caption className="sr-only">Roles found in the resume</caption>
          <thead>
            <tr>
              <th scope="col">Title</th>
              <th scope="col">Employer</th>
              <th scope="col">Dates</th>
              <th scope="col">Length</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r, i) => (
              <tr key={i}>
                <td>{r.title ?? notFound}</td>
                <td>{r.employer ?? notFound}</td>
                <td>
                  {fmt(r.startMonth)} –{" "}
                  {r.current ? "Present" : fmt(r.endMonth)}
                </td>
                <td>{length(r.endMonth - r.startMonth + 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p>
          No dated roles were found. Put each role&apos;s title, employer and
          dates on one line, for example &quot;Software Engineer, Example Corp,
          Jan 2020 – Present&quot;.
        </p>
      )}
      <h3>Education</h3>
      {education.length ? (
        <ul className="jd-list">
          {education.map((e, i) => (
            <li key={i} className="jd-item is-note">
              <div>
                <p>{e.text}</p>
                {e.year === null ? <small>Year not found</small> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p>No Education section was found.</p>
      )}
    </section>
  );
}
