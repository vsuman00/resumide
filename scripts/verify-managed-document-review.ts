import type { loadEvidenceReview } from "../app/lib/server/evidence-review";

type Review = Awaited<ReturnType<typeof loadEvidenceReview>>;

export function verifyDocumentReviewEvidence(
  review: Review,
  measuredPdfPageCount: unknown,
) {
  const pages = review.evidence.nativeSource.pages;
  if (
    measuredPdfPageCount !== 2 ||
    review.scoringEligible ||
    review.attemptNumber !== 1 ||
    review.revision !== 0 ||
    pages.length !== 2 ||
    pages[0].pageNumber !== 1 ||
    !pages[0].text.includes("alex@example.test") ||
    pages[1].pageNumber !== 2 ||
    pages[1].text !== ""
  )
    throw new Error("EVIDENCE_MISMATCH");
}

function privateHtml(response: Response, status: number) {
  const cacheDirectives = response.headers
    .get("Cache-Control")
    ?.split(/\s*,\s*/);
  return (
    response.status === status &&
    response.headers.get("Content-Type")?.split(";")[0] === "text/html" &&
    cacheDirectives?.includes("private") &&
    cacheDirectives.includes("no-store")
  );
}

export async function verifyDocumentReviewResponses(
  owner: Response,
  outsider: Response,
) {
  if (!privateHtml(owner, 200) || !privateHtml(outsider, 404))
    throw new Error("EVIDENCE_ROUTE_STATUS_MISMATCH");

  const ownerHtml = await owner.text();
  const outsiderHtml = await outsider.text();
  const first = ownerHtml.indexOf('aria-label="Page 1 extraction review"');
  const second = ownerHtml.indexOf('aria-label="Page 2 extraction review"');
  const blankPageEnd = ownerHtml.indexOf("</article>", second);
  if (
    first < 0 ||
    second <= first ||
    blankPageEnd <= second ||
    !ownerHtml
      .slice(second, blankPageEnd)
      .includes("No native text was extracted.") ||
    !ownerHtml.includes("Scoring is unavailable.") ||
    !ownerHtml.includes("alex@example.test") ||
    outsiderHtml.includes("extraction review") ||
    outsiderHtml.includes("alex@example.test")
  )
    throw new Error("EVIDENCE_ROUTE_CONTENT_MISMATCH");
}
