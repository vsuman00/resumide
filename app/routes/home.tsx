import type { Route } from "./+types/home";
import {
  data as routeData,
  isRouteErrorResponse,
  Link,
  useLoaderData,
  useNavigate,
  useNavigation,
  useRevalidator,
  useRouteLoaderData,
} from "react-router";
import PublicShell from "~/components/PublicShell";
import WorkspaceShell from "~/components/WorkspaceShell";
import EvidenceScene3D from "~/components/EvidenceScene3D";
import { getAuthenticatedUser } from "~/lib/server/auth";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "~/lib/server/supabase";

const PAGE_SIZE = 12;

interface RootLoaderData {
  user: { email?: string } | null;
}

interface HistoryEntry {
  id: string;
  status: string;
  created_at: string;
  jobs: { title: string; company_name: string } | null;
  analysis_results: { feedback: unknown } | null;
}

export async function loader({ request, url }: Route.LoaderArgs) {
  const headers = new Headers();
  const user = await getAuthenticatedUser(
    createSupabaseServerClient(request, headers),
  );
  if (!user)
    return routeData(
      {
        entries: [] as HistoryEntry[],
        page: 1,
        sort: "recent" as const,
        hasMore: false,
      },
      { headers },
    );

  const searchParams = url.searchParams;
  const requestedPage = Number(searchParams.get("page"));
  const page =
    Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const sort = (["recent", "highest", "lowest"] as const).includes(
    searchParams.get("sort") as "recent" | "highest" | "lowest",
  )
    ? (searchParams.get("sort") as "recent" | "highest" | "lowest")
    : "recent";
  const { data, error } = await createSupabaseAdminClient()
    .from("analyses")
    .select(
      "id, status, created_at, jobs(title, company_name), analysis_results(feedback)",
    )
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .range(0, 999);
  if (error)
    throw new Response("Resume history is unavailable.", { status: 503 });

  const rows: HistoryEntry[] = (data ?? []).map((row) => ({
    id: row.id,
    status: row.status,
    created_at: row.created_at,
    jobs: Array.isArray(row.jobs) ? (row.jobs[0] ?? null) : row.jobs,
    analysis_results: Array.isArray(row.analysis_results)
      ? (row.analysis_results[0] ?? null)
      : row.analysis_results,
  }));
  const sorted = [...rows].sort((left, right) => {
    if (sort === "recent") {
      return right.created_at.localeCompare(left.created_at);
    }
    const leftScore = scoreForEntry(left) ?? -1;
    const rightScore = scoreForEntry(right) ?? -1;
    return sort === "highest"
      ? rightScore - leftScore ||
          right.created_at.localeCompare(left.created_at)
      : leftScore - rightScore ||
          right.created_at.localeCompare(left.created_at);
  });
  const from = (page - 1) * PAGE_SIZE;
  return routeData(
    {
      entries: sorted.slice(from, from + PAGE_SIZE),
      page,
      sort,
      hasMore: sorted.length > from + PAGE_SIZE,
    },
    { headers },
  );
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Resumide | ATS evidence desk" },
    {
      name: "description",
      content:
        "Inspect parsed resume evidence and improve the highest-impact issues first.",
    },
  ];
}

function scoreForEntry(entry: HistoryEntry) {
  const feedback = entry.analysis_results?.feedback;
  if (!feedback || typeof feedback !== "object") return null;
  const score = (feedback as { overallScore?: unknown }).overallScore;
  return typeof score === "number" ? score : null;
}

function targetForEntry(entry: HistoryEntry) {
  return (
    [entry.jobs?.title, entry.jobs?.company_name]
      .filter((value): value is string => Boolean(value))
      .join(" at ") || "No target role"
  );
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function formattedDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Recently";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function actionForEntry(entry: HistoryEntry) {
  const isResultReady = ["completed", "partial"].includes(entry.status);
  return {
    label: isResultReady ? "View result" : "Continue",
    to: isResultReady ? `/resume/${entry.id}` : `/analysis/${entry.id}`,
  };
}

function PublicHome() {
  return (
    <PublicShell>
      <main className="public-home" aria-labelledby="public-home-heading">
        <section className="public-hero">
          <div className="public-hero-copy">
            <p className="workspace-eyebrow">ATS compatibility guidance</p>
            <h1 id="public-home-heading">See what the ATS sees.</h1>
            <p>
              Inspect your parsed resume, understand every score, and fix the
              highest-impact issues first.
            </p>
            <div className="public-hero-actions">
              <Link to="/upload" className="primary-button w-fit">
                Analyze your resume
              </Link>
              <a href="#scoring" className="back-button w-fit">
                How scoring works
              </a>
            </div>
            <ul className="public-trust-list">
              <li>Private result history</li>
              <li>Evidence-backed scoring</li>
              <li>Review-before-use rewrites</li>
            </ul>
          </div>
          <EvidenceScene3D
            variant="hero"
            className="public-hero-scene"
            label="Three dimensional source, parse, and proof evidence stack"
          />
        </section>

        <section id="product" className="public-explanation">
          <div>
            <p className="workspace-eyebrow">Evidence stack</p>
            <h2>Turn a document into a repair plan.</h2>
          </div>
          <ol>
            <li>
              <strong>Source</strong>
              <span>
                Your original resume stays available as the reference.
              </span>
            </li>
            <li>
              <strong>Parse</strong>
              <span>
                Review the fields and sections the simulation extracted.
              </span>
            </li>
            <li id="scoring">
              <strong>Proof</strong>
              <span>
                Follow the deterministic checks and grounded suggestions.
              </span>
            </li>
          </ol>
        </section>

        <section
          className="public-result-story"
          aria-labelledby="result-story-heading"
        >
          <div className="public-result-story-copy">
            <p className="workspace-eyebrow">From score to action</p>
            <h2 id="result-story-heading">A result you can actually use.</h2>
            <p>
              Start with three high-impact repairs, inspect the evidence behind
              each one, and preserve the strengths that already work.
            </p>
            <Link to="/upload" className="back-button w-fit">
              Start an evidence review
            </Link>
          </div>

          <article
            className="public-result-preview"
            aria-label="Example resume analysis"
          >
            <header>
              <div>
                <p className="workspace-eyebrow">Example analysis</p>
                <h3>ATS readiness</h3>
              </div>
              <span>Strong foundation</span>
            </header>
            <div className="public-preview-score">
              <strong>78</strong>
              <span>/100</span>
              <progress
                value="78"
                max="100"
                aria-label="Example ATS readiness score"
              >
                78%
              </progress>
            </div>
            <dl className="public-preview-metrics">
              <div>
                <dt>Strengths</dt>
                <dd>12</dd>
              </div>
              <div>
                <dt>Repairs</dt>
                <dd>6</dd>
              </div>
              <div>
                <dt>Role match</dt>
                <dd>78%</dd>
              </div>
            </dl>
            <div className="public-preview-queue">
              <div className="public-preview-queue-heading">
                <h4>Repair queue</h4>
                <span>Top priorities</span>
              </div>
              <ol>
                <li>
                  <span>1</span>
                  <p>Add quantified impact to the most recent role</p>
                  <small>High</small>
                </li>
                <li>
                  <span>2</span>
                  <p>Include relevant language from the target role</p>
                  <small>High</small>
                </li>
                <li>
                  <span>3</span>
                  <p>Clarify scope and team size</p>
                  <small>Medium</small>
                </li>
              </ol>
            </div>
          </article>
        </section>
      </main>
    </PublicShell>
  );
}

function AnalysisWorkspace({
  entries,
  page,
  sort,
  hasMore,
}: {
  entries: HistoryEntry[];
  page: number;
  sort: "recent" | "highest" | "lowest";
  hasMore: boolean;
}) {
  const navigation = useNavigation();
  const navigate = useNavigate();
  const latest = entries[0];

  return (
    <WorkspaceShell
      eyebrow="Your evidence desk"
      title="Resume workspace"
      description="Continue a saved analysis or start a new compatibility review."
      action={
        <Link to="/upload" className="primary-button w-fit">
          Analyze resume
        </Link>
      }
    >
      <section
        className="analysis-history"
        aria-labelledby="analysis-history-heading"
      >
        {navigation.state !== "idle" ? (
          <p className="workspace-loading" role="status">
            Loading analysis history.
          </p>
        ) : null}

        {latest ? (
          <section
            className="latest-analysis"
            aria-labelledby="latest-analysis-heading"
          >
            <div className="result-section-heading">
              <div>
                <p className="workspace-eyebrow">Most recent</p>
                <h2 id="latest-analysis-heading">Latest analysis</h2>
              </div>
              <span>{formattedDate(latest.created_at)}</span>
            </div>
            <article>
              <EvidenceScene3D variant="workspace" compact />
              <div className="latest-analysis-copy">
                <p>{targetForEntry(latest)}</p>
                <span>{statusLabel(latest.status)}</span>
              </div>
              <div className="latest-analysis-score">
                <span>ATS score</span>
                <strong>{scoreForEntry(latest) ?? "--"}</strong>
              </div>
              <Link
                to={actionForEntry(latest).to}
                className="back-button w-fit"
              >
                {actionForEntry(latest).label}
              </Link>
            </article>
          </section>
        ) : (
          <section
            className="workspace-empty-state"
            aria-labelledby="empty-workspace-heading"
          >
            <EvidenceScene3D variant="workspace" compact />
            <div>
              <p className="workspace-eyebrow">Start here</p>
              <h2 id="empty-workspace-heading">
                Run your first ATS visibility check
              </h2>
              <p>
                Upload a text-based resume to see its parsed structure and the
                evidence behind each score.
              </p>
              <Link to="/upload" className="primary-button w-fit">
                Analyze resume
              </Link>
            </div>
          </section>
        )}

        {entries.length > 0 ? (
          <section
            className="analysis-history-table"
            aria-labelledby="analysis-history-heading"
          >
            <div className="result-section-heading">
              <div>
                <p className="workspace-eyebrow">Saved reviews</p>
                <h2 id="analysis-history-heading">Analysis history</h2>
              </div>
              <span>{entries.length} shown</span>
            </div>
            <label className="history-sort-control">
              <span>Sort analyses</span>
              <select
                aria-label="Sort analyses"
                value={sort}
                onChange={(event) =>
                  navigate(`/?page=1&sort=${event.target.value}`)
                }
              >
                <option value="recent">Latest first</option>
                <option value="highest">Highest score</option>
                <option value="lowest">Lowest score</option>
              </select>
            </label>
            <div className="analysis-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Target role</th>
                    <th scope="col">Status</th>
                    <th scope="col">Score</th>
                    <th scope="col">Updated</th>
                    <th scope="col">
                      <span className="sr-only">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const action = actionForEntry(entry);
                    const score = scoreForEntry(entry);
                    return (
                      <tr key={entry.id}>
                        <td data-label="Target role">
                          {targetForEntry(entry)}
                        </td>
                        <td data-label="Status">
                          <span className={`history-status is-${entry.status}`}>
                            {statusLabel(entry.status)}
                          </span>
                        </td>
                        <td data-label="Score" className="history-score">
                          {score === null ? "--" : `${score}/100`}
                        </td>
                        <td data-label="Updated">
                          {formattedDate(entry.created_at)}
                        </td>
                        <td>
                          <Link to={action.to} className="analysis-row-action">
                            {action.label}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {page > 1 || hasMore ? (
          <nav className="history-pagination" aria-label="Resume history pages">
            {page > 1 ? (
              <Link
                to={`/?page=${page - 1}&sort=${sort}`}
                className="back-button"
              >
                Previous
              </Link>
            ) : null}
            {hasMore ? (
              <Link
                to={`/?page=${page + 1}&sort=${sort}`}
                className="back-button"
              >
                Next
              </Link>
            ) : null}
          </nav>
        ) : null}
      </section>
    </WorkspaceShell>
  );
}

export default function Home() {
  const { entries, page, sort, hasMore } = useLoaderData<typeof loader>();
  const rootData = useRouteLoaderData("root") as RootLoaderData | undefined;

  if (!rootData?.user) return <PublicHome />;
  return (
    <AnalysisWorkspace
      entries={entries}
      page={page}
      sort={sort}
      hasMore={hasMore}
    />
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  const revalidator = useRevalidator();
  const message = isRouteErrorResponse(error)
    ? error.statusText || "Resume history is unavailable."
    : "Resume history is unavailable.";
  return (
    <WorkspaceShell
      eyebrow="Your evidence desk"
      title="Resume workspace"
      description="Your saved analyses are safe. The history list needs another attempt."
    >
      <section className="analysis-state-panel is-error" role="alert">
        <h2>Could not load analysis history</h2>
        <p>{message}</p>
        <button
          type="button"
          className="back-button w-fit"
          onClick={() => revalidator.revalidate()}
        >
          Retry history
        </button>
      </section>
    </WorkspaceShell>
  );
}
