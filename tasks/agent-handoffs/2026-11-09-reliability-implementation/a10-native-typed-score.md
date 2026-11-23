# CR-A10-S05 native relationship context and dated coverage

The typed JD writer rejected a synthetic skill-specific duration with SQLSTATE `22023`. PostgreSQL expected `unsupported_scope_review` for the unresolved skill expression, while the TypeScript writer supplied `unparsed_scope_or_operand_review`. Both implementations recovered the same literal clause and duration bound.

New typed writes now emit the database's scope-review code. The TypeScript reader still accepts either exact source-derived representation and preserves the supplied document. It rejects altered reasons outside those exact reconstructions. The diagnostic sidecar continues to interpret supported duration subjects from the literal clause.

## Local verification

The [runner](../../../scripts/verify-local-typed-score.py) replayed 100 operations on socket-only PostgreSQL 17.11. The ordered digest was `4e253744226912aab1c9411cb03e528f8fbdaa10984aa5933a88ff380601293a`. It verified the frozen relationship operator's hash, adapted the expected readiness digest and private source key, and used an exact bootstrap organization for the temporary fixture. The archived operator checked historical selection, header restore, invalidation after an edit, foreign-owner and pending-deletion refusal, and bounded relationship work. Its rollback left the fixture inventories empty.

A second fixture used the real evidence writer, privileged grouped import, and service-role JD saves and relationship reads. Both the two-year and four-year JD versions were stored. The scoring code validated and consumed their native relationship responses for the same canonical resume. The two overlapping Python intervals yielded a union of 1,096 to 1,097 days. The observed interval met the historical two-year bound and fell short of the current four-year bound. Both remained candidate-review observations with no confirmed source duration and no eligible numeric dimension. Identical input produced identical diagnostics.

On dirty `main` at `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, all 472 affected tests, type checking, lint and the web and worker builds passed with Node 22.23.4. Lint reported four existing JD clause-order warnings. The synthetic scoring benchmark passed engineering mode. Its release gate remains open, along with the authenticated browser journey, managed acceptance, and representative validation.

## Selected-version navigation

Two route regressions exposed links that used the latest saved inputs instead of the selected pair. The repair-priority links now preserve the selected resume and JD versions. The export link appears for the current resume and passes its exact version so an intervening edit can trigger the existing conflict response. Historical resumes can still be reviewed, and their score pages omit the export shortcut because the export route supports the current resume only.

On the same dirty base, all 133 affected tests in six files passed, along with type checking, lint and the web and worker builds. The first focused run failed on a new assertion that assumed there would be no other HTML attributes after `href`. The corrected assertion checks the link text and exact version URL. The existing correction-to-export journey also passed in Chromium after extracting the shared local browser and database adapter.

## Selected versions in Chromium

The [same native runner](../../../scripts/verify-local-typed-score.py) with `--browser` replayed the 100-operation schema and served the built scoring page over loopback. It saved a second canonical version through the repository, then loaded both the current pair and the historical pair. Chromium verified private caching, the scoring explanation and all three unavailable dimensions. It showed the claimed intervals meeting the old two-year bound and falling short of the current four-year bound. Historical links retained the exact saved versions. The current export link included its saved resume version, the historical export shortcut was absent, and a stale expected JD head returned 409. The anonymous request redirected before the synthetic account signed in.

The first browser attempt had no completion receipt. A focused probe showed the CLI could exit before reading its input stream. Reading the pipe synchronously then reproduced an `EAGAIN` error. The runner now uses a disposable input file and requires the browser completion receipt. The final run emitted that receipt and passed the database rollback checks.

The database was real local PostgreSQL. The harness simulated Supabase Auth and routed the exercised Data API shapes to the database. Managed Supabase, proposal preview and apply races, representative validity, comprehension and scoring-policy admission remain open. CR-U04 and CR-A15 remain PARTIAL.
