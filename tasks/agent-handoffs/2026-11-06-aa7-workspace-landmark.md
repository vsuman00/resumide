# AA7 workspace main landmark repair

Status: PREPARED and focused regression PASS; coordinator integration and original browser Axe checks PENDING. Root source was not edited.

The full private CI reproduced the unchanged Axe `region` failure on shared workspace headings in artifact export, canonical resume and job requirements. `WorkspaceShell` placed its page heading, description and action before the only main landmark. The isolated source fix promotes the existing workspace stage to the single main and makes the inner workspace-main element a div. Classes, layout, navigation outside main, and the outer root skip target remain unchanged. No CSS, dependency, Axe rule or assertion exclusion changed.

The new real component regression renders the actual navigation and workspace with a memory router. It first failed against copied root baseline SHA256 `62cfd0c9ec4150ee3a212967805311bfcc481370a1be6e5d33fd83e10a8a337e`: the main landmark could not find the visible page heading. It now passes and verifies that the eyebrow, heading, description, action and named content section are inside exactly one main, while navigation and the brand remain outside.

Node22.23.4 focused Vitest:1/1 PASS,459ms. Scoped ESLint and Prettier checks pass. This is a component landmark regression; it does not replace the coordinator/tester's unchanged browser Axe assertions.

Frozen files in `/Users/vaibhavsuman/.codex/worktrees/aa7-20261106-accessible-preview/resume_ats`:

| File | SHA256 |
| --- | --- |
| `app/components/WorkspaceShell.tsx` | `6b33af9e96a11b56aeddd627defebcc04b3aca29a1ca9f761acf7b8b2aed5293` |
| `tests/components/WorkspaceShell.test.tsx` | `37e9a5ab216ef40a7554c071b29e29f04d7dcc8d2dde2f7ff05cf6426dc19b89` |

The [exact two-file patch](2026-11-06-aa7-workspace-landmark.patch) SHA256 is `9095f789b888adb418a82942d23b2f6131e4e02baf8d28d0972d9e8c31e7f64b`. Current SiteNavigation and CSS files were copied byte-for-byte as test dependencies only and are excluded from the patch. The coordinator owns integration after the current test run is terminal.
