# Enterprise readiness review: architecture and implementation

Date: 2026-11-23 · Reviewed checkout: `main` at `a0b2392` plus the uncommitted working tree · Type: advisory review (no code changed)

## Scope and method

Read: `CONTEXT.md`, `ARCHITECTURE.md`, `CONSTRAINTS.md`, `tasks/todo.md` (structure and status), `docs/design/LATEX_CONVERTER.md`, `docs/operations/LATEX_CONVERTER.md`, ADR-0016, and the code for live scoring (`app/lib/server/analyze.ts`, `atsRules.ts`), the Build compile path (`latex-converter-service.ts`, `latex-sandbox.ts`), deployment (`Dockerfile`, `fly.worker.toml`, `vercel.json`), config flags, and observability. I also used the existing graphify knowledge graph (`graphify-out/`, 3,731 nodes, 147 communities) to check coupling.

Not done: no tests run, no browser checks, no line-by-line review of the 104 migrations, and no review of the OCR, authoring or privacy worker internals beyond their structure.

## Verdict

The engineering discipline is well above typical early-stage products. Versioned deterministic scoring, leased workers, immutable versions, provenance, consent, export and deletion are the right foundations, and the module graph has **no import cycles**. Build (LaTeX) is cleanly decoupled from scoring: the graph has no path from `latex-sandbox.ts` to `scoring-stage.ts`.

The architecture does **not** need a rewrite. It needs changes in four areas before an enterprise launch:

1. **Deployment topology.** Build cannot run in the stated production layout.
2. **Authorization model.** Most data access bypasses RLS.
3. **Product core.** The live ATS score is still the hand-weighted heuristic.
4. **Delivery process.** A large body of uncommitted work and a heavy governance load put velocity and data at risk.

## First, define "enterprise"

`ARCHITECTURE.md` §1 defines three modes: candidate coach (B2C, build first), career-center workspace, and employer workspace (gated behind legal and fairness review). "Enterprise use" can mean two different products:

| Meaning                                              | Implication                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Enterprise-grade B2C (candidates use it)             | The current plan fits. Focus on reliability and security. Add SSO only if universities or career centers buy seats.                                                                                                                                                                                                                 |
| Sold to employers or recruiters to screen candidates | It becomes a regulated hiring tool: high-risk under the EU AI Act (employment, Annex III), bias-audit duties under NYC Local Law 144, and India DPDP Act obligations for candidate data. That requires a fairness program, human-oversight design and legal review before code. The repo explicitly defers this (gates AA9 and A5). |

**Recommendation:** decide this first. Everything below assumes B2C or career-center use with enterprise-grade operations. If you are selling to employers, the compliance work is the critical path, not the code.

## Critical findings

### 1. Build compile cannot run in the declared deployment

- `vercel.json` and `fly.worker.toml` put the **web app on Vercel** and only the **analysis worker on Fly**.
- `latex-converter-service.ts` → `compileLatex()` in `latex-sandbox.ts:229` runs the **`docker` CLI from inside the web request handler** (`spawn("docker", ...)`, line 112).
- Vercel functions have no Docker daemon, so production Build would always return `runtime_unavailable`. Moving the web app onto a host with a Docker socket would be worse: socket access is effectively root on that host, and the runbook itself says a hosted daemon boundary "needs a separate privilege review" (`docs/operations/LATEX_CONVERTER.md:27`).
- The concurrency cap (`active`) and cleanup quarantine (`quarantined`) are **module-level variables** (`latex-sandbox.ts:44-45`). With more than one web instance, the "two active compilations" limit no longer holds globally, and an instance that enters quarantine stays stuck until someone restarts it.
- The compile runs **synchronously inside the HTTP request**, which contradicts the architecture's own rule that long work never holds an HTTP request open (§6).

**Recommendation:** make the compiler a **separate deployable**, a "compile service", on its own isolated pool. Fly Machines with a gVisor or Firecracker-class sandbox per job, or a dedicated VM pool, both work. The web app sends a job over the existing PostgreSQL queue (or internal HTTP with mutual TLS) and polls for it or streams the result. The web tier never touches Docker. Store concurrency and quarantine state centrally (in the queue table), not in process memory. Keep the existing hardening (network none, read-only root, cap-drop, Landlock, limits). It carries over unchanged.

### 2. Authorization relies on application code; RLS is mostly bypassed

- `createSupabaseAdminClient()` (the service-role client) is the **most connected node in the code graph** (105 edges). It is used in **48 files, including 18 route modules**. The user-scoped `createSupabaseServerClient()` appears in 29.
- The service role bypasses RLS, so the 41 policies in `supabase/migrations/` do not protect those code paths. Tenant isolation depends on every query remembering its owner, membership and deletion checks. The repo does this carefully today (CONTEXT shows many "rechecks access" fixes), and that frequency is itself the warning sign.

**Recommendation:** for enterprise, adopt **RLS-first** access. User-facing reads go through the user-scoped client. Privileged writes go through narrow `SECURITY DEFINER` RPCs that check ownership inside the transaction (the cancellation migration already follows this pattern). Add a CI check that fails when a new route imports the admin client without an allow-list entry. Keep a cross-tenant test matrix that runs against real Postgres.

### 3. The primary feature still ships the heuristic score

- The live ATS Compatibility number comes from `atsRules.ts`: nine rules with hand-set weights (email 12, experience section 14, keyword coverage 26, and so on). `ARCHITECTURE.md` §3 calls this a synthetic-regression baseline, not a calibrated score.
- The evidence-gated v2 engine (`score-v2-engine.ts`, typed JD requirements, confidence gates) exists but sits behind default-off flags, and numeric dimensions are still withheld.
- `analyze.ts` throws when the LLM returns nothing instead of returning a deterministic `PARTIAL` result. A repo search found no caller of `analyzeResume()` outside its own file, so it appears to be dead legacy code. Confirm that and delete it.

**Recommendation:** the launch-critical path is **calibration of v2 on a representative, consented corpus** (CR-A05, CR-A08, CR-A10, CR-A15, AA8), not more hardening of adjacent features. Until then, show the score with the "guidance, uncalibrated" label it already carries, and lead the UX with the evidence view (missing sections, unparsed fields, missing JD requirements). That part can be trusted now.

### 4. Delivery process risk

- **1,411 changed files (1,223 untracked) and about 25,600 inserted lines are uncommitted on `main`.** The repo has only 43 commits. One disk failure or a bad `git` command would lose weeks of work.
- `docs/` plus `tasks/` hold about 4,550 files and 393 MB. `tasks/todo.md` is over 2,000 lines. The backlog is 3 verified, 52 partial and 9 planned parent tasks.
- `CONSTRAINTS.md` §6 has grown into hash-level, single-attempt build allocations (E-008 to E-013). These are build logs, not standing constraints.

**Recommendation:**

- Commit the current tree to a feature branch today, and push it to a private remote.
- Move to short-lived branches and pull requests, with CI as the gate.
- Archive evidence JSONs (receipts, scans) as CI artifacts or in object storage, not in Git.
- Keep `CONSTRAINTS.md` to rules and move one-off build exceptions to the handoff folder.
- Cut the backlog to launch blockers only. With 52 partial tasks, finishing beats starting.

## Important findings

| #   | Area                     | Finding                                                                                                                                                                  | Recommendation                                                                                                                                                                                                                                               |
| --- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 5   | Feature flags            | 19 `*_ENABLED` flags in `config.ts`, with legacy and new paths for scoring, authoring and evidence. The combinations cannot all be tested.                               | Keep a flag registry with an owner, default and removal date for each flag. Pick the v2 path per capability and delete the legacy path after migration.                                                                                                     |
| 6   | Observability            | `MetricsRegistry` lives in process memory (`observability.ts:160`). It resets on restart and is per-instance. The docs already list this as a known gap.                  | Use OpenTelemetry traces and metrics exported to a managed backend, with a trace ID that spans web → queue → worker → provider. Alert on queue age, job failure rate and AI spend.                                                                         |
| 7   | LaTeX image supply chain | The candidate image still has 79 open high advisories after extensive hardening of a custom Debian TeX Live build (Poppler, Expat and FreeType backports).               | Keep the rebuild effort sustainable. Rely on the per-job sandbox from finding 1 as the primary control. Accept documented residual CVEs on a regular patch cadence. Evaluate Tectonic or a slimmer TeX distribution to shrink the attack surface. |
| 8   | Recovery objectives      | The approved MVP targets are 99.5% availability, 24-hour RPO and 4-hour RTO. Hosted restore has not been drilled.                                                        | Enterprise buyers usually expect 99.9% availability, an RPO of 1 hour or less (Supabase point-in-time recovery) and a tested restore. Run the restore drill before launch.                                                                                 |
| 9   | Upload safety            | Malware scanning and parser sandboxing are listed as deployment-owned and are still open (§3).                                                                           | Scan uploads before parsing, for example with ClamAV in the worker. Run PDF parsing only in the worker, never in the web tier.                                                                                                                              |
| 10  | Enterprise features      | SSO (SAML/OIDC), SCIM provisioning, org admin and RBAC UI, audit-log export, data-residency options and billing are all still planned (phases 8–9).                      | Build these only after the "enterprise" decision. For career centers, start with SSO, seat management and audit export.                                                                                                                                     |
| 11  | Compliance evidence      | There is a threat model and a privacy data map, but no SOC 2 or ISO 27001 control mapping, DPA template or subprocessor list for OpenAI and Supabase.                     | Prepare a security pack: control mapping, DPA, subprocessor list and a pen-test report. Procurement will ask for it.                                                                                                                                       |

## What to keep as is

- **Modular monolith with separate web and worker processes.** A PostgreSQL-backed leased queue easily handles thousands of analyses per day. Do not add microservices, Kafka or Redis without measured need. The one justified new deployable is the compile service.
- **Deterministic numbers, AI for prose only**, with validated structured output, provenance and candidate confirmation of facts. This is the product's main credibility asset.
- **Immutable versions, consent, export and deletion workflows, and idempotency.**
- **Sandbox controls for LaTeX**: no network, read-only root, dropped capabilities, `no-new-privileges`, PID, memory and file limits, Landlock, and output PDF inspection. These are well designed. Only their hosting location is wrong.
- **Build's separation from the analyzer.** Users download the PDF and upload it to the checker. This keeps both the attack surface and the product claims simple.

## Suggested order of work

1. **Now:** commit the working tree to a branch and push it. Decide what "enterprise" means for this product.
2. **Before any hosted launch:** stand up the separate compile service (finding 1). Add the admin-client guard and RLS-first reads (finding 2). Wire OpenTelemetry (finding 6). Add upload malware scanning (finding 9).
3. **Core value:** finish v2 calibration on a representative corpus, then retire the legacy scoring and flag paths (findings 3 and 5).
4. **Launch gates:** run the restore drill, a staging end-to-end test and an external pen test. Approve the RPO and RTO targets (finding 8).
5. **Enterprise sales:** build SSO, SCIM, audit export and the security pack (findings 10 and 11). Billing follows.
