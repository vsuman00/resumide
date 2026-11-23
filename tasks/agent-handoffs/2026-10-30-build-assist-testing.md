# Build route rename: testing handoff

- Updated: 2026-10-30, Asia/Kolkata; worker `/root/aa7_sandbox`, TESTING.
- Base HEAD: `a0b239299d75b0bd64b588fe743ebe2975fb28b9`; reviewed AA7 baseline and unrelated dirty work preserved.
- Authority: [Build coordinator record](2026-10-30-build-assist-coordinator.md). Only route naming/compatibility verification is authorized here. AI-specific design, code, tests and model calls remain held pending the credential decision.
- Status: integrated Build rename VERIFIED; AI-specific work remains held.

## Exact verification changes

- New `tests/unit/latex-routes.test.ts`: 12 cases covering unique registration of the four current/legacy routes, fixed `/build` page redirects, query/open-redirect resistance, private/no-store headers, empty redirect bodies and method/body-preserving legacy resource redirects.
- `tests/unit/latex-service.test.ts`: existing 30 authentication, default-off, Origin, request bounds, exact-source binding, rate isolation, cancellation and safe-error cases now exercise `/build/compile`; auth return is fixed `/auth?next=%2Fbuild`. Assertions were retained.
- `e2e/latex-converter.spec.ts`: six existing flows now target `/build` and `/build/compile`, assert Build title/heading, exercise old GET/POST compatibility and retain desktop/mobile Axe assertions. An actual authenticated legacy POST recovered its distinct source body from PDF output. The new screenshot path preserves the historical AA7 image.
- Dedicated Playwright configuration is unchanged: explicit approved managed-Supabase environment, AI disabled, private fixture ledger required, no trace/session capture or Docker database.

Backend service, frontend legacy handlers and registry were explicitly copied from their owners for focused testing. No production implementation was edited by this worker.

## Checks and limits

- Node 22.23.4 Vitest: 2 files / 42 tests PASS (`latex-routes` and `latex-service`).
- Focused ESLint, Prettier, `git diff --check`, and `npm run typecheck` PASS.
- Integrated `test:latex`: 5 files / 106 cases PASS. Final full `npm test`: 127 files / 1,064 cases PASS. Full lint, source checks, typecheck, web and worker builds PASS.
- Actual integrated browser flows: 6/6 PASS, 20.4 seconds; desktop/mobile Axe zero violations. Current and legacy URLs both produced real PDFs through the unchanged approved compiler image.
- Five synthetic managed-Supabase users and their profile/membership/organization rows are absent. Two exact user-rate buckets were removed; none of the five private ledger keys remain. SDK and exact scoped SQL verified cleanup. Private credentials/ledger were deleted, port 3110 stopped and no owned compiler container remains. Existing global and earlier AA7 metadata limitations remain disclosed.
- No AI/model call, provider secret provisioning, image build, Docker database, migration/reset, real document, deployment or Git publication occurred. Historical AA7 receipts remain unchanged.
- Separate [Build closeout](../../docs/evaluation/BUILD_ROUTE_RENAME_20261030.md), [machine receipt](../../docs/evaluation/BUILD_ROUTE_RECEIPT_20261030.json) and synthetic success screenshot are saved in the primary checkout.

## Integration and next action

Coordinator integrated the test files and approved updates to only the two existing explicit test/source script targets. This worker completed the affected integrated checks and cleanup. Production ownership remains with frontend/backend agents. The compiler security/benchmark matrix was not repeated for this URL-only change. Coordinator owns canonical context/evidence integration and any later assignment after the pending credential decision; no AI functionality is claimed by this return.
