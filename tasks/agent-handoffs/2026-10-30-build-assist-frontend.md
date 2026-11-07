# Build route rename: frontend handoff

- Updated: 2026-10-30, Asia/Kolkata; worker `/root/aa7_workspace`.
- Base HEAD: `a0b239299d75b0bd64b588fe743ebe2975fb28b9`; uncommitted integrated AA7 baseline and unrelated dirty work preserved.
- Status: IMPLEMENTED route rename; focused checks passed. Integrated route/browser regressions remain testing-owned.
- Authority: [Build coordinator record](2026-10-30-build-assist-coordinator.md). Route/name changes are authorized; AI-specific UI, architecture, tests and provider calls remain on hold pending the credential decision.

## Exact production changes

- `app/routes/latex.tsx`: visible heading and metadata title become Build; compile fetch uses `/build/compile`.
- `app/components/WorkspaceShell.tsx`: enabled converter navigation becomes Build at `/build`.
- `app/routes.ts`: register existing UI/resource modules at `/build` and `/build/compile`; register dedicated compatibility resources for the old URLs.
- `app/routes/latex.legacy.ts`: GET returns 308 to fixed `/build`, private/no-store.
- `app/routes/latex.compile-legacy.ts`: action and GET return 307 to fixed `/build/compile`, preserving method/body redirect semantics. The new endpoint retains backend authentication, origin and admission checks.

Redirect targets never reflect queries, user input or arbitrary return locations. Technical filenames and feature flag remain unchanged. The two-pane layout, keyboard splitter, sibling collapse control, focusable PDF viewport, mobile buffer switching, transient PDF and stale-response guards are unchanged. Historical AA7 receipts were not edited.

Backend owns the separate auth-return update to `/auth?next=%2Fbuild`; testing owns regression suites and browser verification. No dependencies, environment, credentials, backend code or tests were changed by this worker. No services, database operations or provider calls were started.

## Focused verification

- Prettier on the five production files: passed.
- ESLint on the same TypeScript files: passed.
- Node 22 React Router `typegen`, then TypeScript `tsc --noEmit`: passed against this dirty worktree and previously transferred backend prerequisites.
- Direct Node assertions: page 308, compile action/loader 307, fixed Location, private/no-store, empty response body, and ignored hostile query all passed. Full browser redirect method/body verification remains testing-owned.
- `git diff --check`: passed.
- Installed `clean-user-facing-text` workflow applies to the updated Build labels and this handoff; code, exact URLs and status values remain protected.

Next action: coordinator transfers the five reviewed production files, backend's separate auth-return change and testing's focused regressions, then testing validates the integrated candidate. AI work remains held until the coordinator issues a separate approved task.
