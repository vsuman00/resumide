# Cited writing suggestions: UI repair

Status: IMPLEMENTED and locally verified on dirty base `a0b239299d75b0bd64b588fe743ebe2975fb28b9`.

The owner reported an unstyled block of writing feedback on the Review page. The unscored-prose branch used bare section/article/list markup, so titles, explanations and source quotations ran together. It now renders through `CitedWritingSuggestions` and a scoped CSS module using existing design tokens.

The section has a clear heading and disclosure, capitalized category headings, counts of visible cited notes, Strength to keep/Suggested change labels, separate suggestion titles and explanations, and shaded Resume excerpt blocks. Desktop rows align the status beside the content; mobile rows stack. Text wraps within narrow panes, and empty groups explain that no cited suggestions are available. Supplied suggestion and quotation text is preserved; uncited advice remains excluded, including whitespace-only citations. No scores, suggestions, apply actions or provider calls were added.

Verification:

- Two component regressions pass for exact multiline quotation preservation, titles/labels/counts, omission of uncited advice and empty-state handling.
- `npm run verify` passed 136 files / 1,167 tests, formatting, lint, typecheck and web/worker builds. After the final markup correction, the web build and affected component/browser checks were repeated.
- The sequential authenticated result/layout browser test passed against managed Supabase, including 1366 px light mode, 390 px dark mode, no horizontal overflow and zero Axe findings scoped to the new section. Its screenshots contain synthetic feedback only: [desktop](cited-writing-1366-20261031.png), [mobile](cited-writing-390-20261031.png).
- An initial browser attempt found a duplicate banner landmark introduced by the section header. Replacing the local header wrappers with plain containers fixed that finding; the failed assertion was retained.

Live inspection through the existing in-app browser connection was unavailable. Browser evidence therefore comes from the local production build with synthetic accounts, not the owner's live content. No real resume text or screenshot was copied into project artifacts. The existing scoring, citation storage, authentication and provider contracts were unchanged. Formal release/accessibility acceptance is not inferred from this scoped automated check.

Cleanup: across the initial failed check and two passing browser runs, exact Supabase counts confirm zero remaining recorded users, workspaces, profiles, memberships, analyses, resumes, audit events or storage objects for the five synthetic owners and three object keys. The private ledger and test server were cleared. No global data or counters were reset.
