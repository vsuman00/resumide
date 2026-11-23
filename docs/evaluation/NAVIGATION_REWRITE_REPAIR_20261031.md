# Navigation and saved Rewrite repair

Date: 2026-10-31. Engineering evidence on the dirty working tree based on `a0b239299d75b0bd64b588fe743ebe2975fb28b9`; no commit, publication or deployment.

## Owner requests and resulting behavior

The homepage, authenticated pages and LaTeX editor now share `SiteNavigation`. Home `/`, Analyses `/analyses`, New analysis `/upload` and Build `/build` have identical order and destinations. The logo opens the public homepage even when signed in. The dedicated Analyses route retains owned analysis history, sorting and pagination; the public homepage does not query private history. Signed-out history access requires authentication.

The navbar floats above the page with a rounded, blurred surface and an opaque fallback. Links move into Menu on smaller screens. Privacy, Account, theme and session controls remain in Menu. Workspace sidebar and mobile bottom navigation are replaced; the Build editor keeps its editing tools. Sign out stays within the compact dropdown. The evidence report button has a fixed 44px height and no longer stretches to the adjacent grid row.

The owner's reported analysis has a saved writer record with no summary and zero bullets. Only these metadata fields were inspected through Supabase. The record does not establish whether generation omitted wording or the grounding checks removed it. The old UI incorrectly asserted insufficient evidence as the cause. Empty Rewrite now says no rewrite was saved, distinguishes an unavailable writing step and links to Overview or a new analysis. Retained suggestions and Copy remain available. No real resume was regenerated, no provider was called and grounding checks were preserved.

## Verification

Node 22; production Chromium browser runs used one worker and ran sequentially against the configured managed Supabase with AI disabled and exact synthetic-owner ledgers. No Docker database was used.

- `npm run verify`: passed formatting, source contracts, lint, 138 test files / 1,172 tests, type checking, web build and worker build.
- `workspace-navigation.spec.ts`: passed shared links on home/history/upload/Build, signed-in logo destination, no sidebar, menu theme placement, reload persistence, compact session control and no overflow at 1366/853/390/320px. Scoped navbar Axe checks found zero violations.
- `native-layout.spec.ts`: passed empty and retained Rewrite states, Overview recovery, report button height/width, existing parse/cited feedback checks and cross-owner denial. History visibility also checked after saving the synthetic analysis.
- `browser-repairs.spec.ts`, mobile navigation case: passed Privacy navigation, session sign-out and subsequent protected-route denial.
- `audit-repairs.spec.ts`: passed compact medium-width public menu and navigation destinations.
- Public `smoke`, `phase6`, `phase7` and `a11y` suites: 44 passed with one worker. Includes dark/light themes, keyboard, reduced motion, forced colors, zoom, offline recovery, security headers and protected result access. Expected missing-route diagnostics were emitted by deliberate 404 tests.

An initial retained-Rewrite test failed because changing only a URL hash did not refetch a fixture edited directly in Supabase. The test now reloads after that external fixture write; no application assertion or safety check was weakened. A formatting check initially used the system Node version; final formatting and verification used Node 22.

## Evidence and limits

Synthetic screenshots: [desktop navbar](floating-navigation-desktop-20261031.png), [mobile menu](floating-navigation-mobile-20261031.png), [public menu](navigation-public-menu-20261031.png), [report control](navigation-report-button-20261031.png). No candidate content is included.

These checks establish the repaired presentation and routing behavior. They do not establish production latency percentiles or normal real-provider generation. No server non-response was observed in the passing cases. The previously reported intermittent authoring acceptance above five seconds, untagged LaTeX PDFs and formal accuracy/security/accessibility/release acceptance remain open; see the [earlier audit repair report](AUDIT_REPAIRS_20261030.md). The previous approved migration rollout remains applied; no new migration was needed.

Managed cleanup was checked directly through Supabase for the exact ledger of seven synthetic owners and three storage objects, including the failed attempt and reruns. Auth users, profiles, organizations, memberships, resumes, analyses, audit events and those objects all returned zero remaining rows. The private local ledger was then removed. No owner analysis was modified.
