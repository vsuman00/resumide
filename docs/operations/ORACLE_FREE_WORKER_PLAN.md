# Oracle Always Free analysis worker plan

Status: **PROPOSED; DOCUMENTATION ONLY**

Prepared: 2026-10-31

Owner: workspace owner, unless formally delegated

This plan evaluates one Oracle Cloud Infrastructure (OCI) Always Free Arm VM in
Mumbai for the existing analysis worker. It does not select OCI as the approved
provider or authorize account creation, paid resources, provisioning, hosted
testing, candidate data, deployment, or release. Fly.io remains the recorded
provider decision. The owner previously deferred cloud worker deployment until
the product is functionally complete and feature-tested on localhost. See
[task direction and baseline](../../tasks/todo.md#localhost-first-completion-direction--2026-10-12)
and [deployment architecture](../../ARCHITECTURE.md#15-deployment-architecture).

## Scope and prerequisites

The web application submits durable jobs to Supabase. One analysis worker polls
the existing leased PostgreSQL queue, reads private objects, and stores results.
It needs outbound connectivity but no public application endpoint or new queue,
database, or storage provider. Preserve ownership, consent, deterministic scoring,
lease and version contracts. The [worker runbook](WORKER_DEPLOYMENT.md) records
the current image and historical local Arm64 smoke; the current dirty candidate
has not been verified on OCI.

- Finish the existing localhost feature-testing direction and identify a reviewed
  source snapshot, lockfile, web version, worker image digest, and compatible
  database migrations. Resolve the recorded migration-history mapping before any
  hosted migration operation.
- Confirm an OCI account with Mumbai (`ap-mumbai-1`) as its home region and
  available Always Free Arm capacity. Home region must be checked before signup:
  Always Free compute must be created in the home region. Signup normally requires
  phone and card verification. See [OCI Free Tier](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm).
- Check current tenancy limits, existing usage, eligible VM shape and image,
  storage, networking, logging, notifications, and any charges. A free trial
  credit is not evidence that a resource remains free after the trial. Oracle's
  current documentation lists 2 OCPUs and 12 GB RAM for an Always Free Arm
  tenancy, subject to monthly usage limits; recheck at provisioning time.
  [OCI Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm)
- Select an isolated Supabase staging project and bucket, or a specifically
  authorized synthetic test target with controls that prevent claims from any
  shared production queue. Record target identity, credentials scope, fixtures,
  cleanup ownership, migrations, and stop conditions before hosted tests.
- Name the operations and security owners and agree the acceptable monthly cost,
  queue delay, recovery objective, and fallback. Do not assume one free VM meets
  the existing 99.5% availability or five-concurrent-analysis targets.

## Approval gates

Record the approver, date, scope, and evidence for each gate in the relevant
decision or evidence record. A gate is open until its explicit approval and
verification are recorded.

1. **Provider decision:** owner reviews an ADR covering OCI versus the existing
   Fly choice, Mumbai processing, availability, exit, privacy, security, cost,
   and operating ownership. Approval changes the provider decision only; it
   does not authorize provisioning or production use.
2. **Staging authorization:** after the localhost prerequisite is met, owner
   approves the exact account, region, resources, budget, staging target,
   synthetic fixtures, network and cleanup plan before any hosted mutation.
   Obtain separate approval for any paid resource or provider call.
3. **Staging acceptance:** review synthetic end-to-end, failure recovery,
   isolation, security, capacity, cost, monitoring, and rollback evidence. This
   is an engineering result, not permission to process candidate documents.
4. **Production and release:** complete applicable A4 security, privacy, restore,
   monitoring, independent review and other acceptance requirements, accuracy
   and accessibility gates, then T100 staging/canary/rollback and explicit T101
   deployment and release approval. Record the approved data, features, limits,
   named support owner and stop conditions. No staging result closes these gates.

## Ordered tasks

All tasks are **NOT STARTED**. Execute only after their stated dependencies and
authorization are satisfied. Evidence must identify the tested revision, image,
target, dates, results, omissions, and cleanup without secrets or candidate data.

### OCI-01: Resolve the provider decision

- **Depends on:** the existing product and deployment constraints.
- **Approach:** draft an ADR comparing OCI and Fly, including Mumbai capacity,
  account eligibility, residency, operating burden, free-tier limits, VM
  reclamation, exit and fallback. Keep the current decision in force until accepted.
- **Acceptance:** owner decision and ownership are recorded; staging, real data,
  production and spend remain separate decisions.
- **Spec:** short. **Verify:** review the ADR against current OCI terms and the
  existing architecture and task gates; record the checked date and links.

### OCI-02: Prepare a reproducible worker and test target

- **Depends on:** OCI-01 and completion of the localhost prerequisite.
- **Approach:** select the exact source and lockfile; build the existing
  `Dockerfile.worker` for Linux Arm64. Define an isolated synthetic Supabase
  target, matching web and schema versions, fixture ledger and cleanup procedure.
  Do not run `npm run test:db` against a shared or hosted database.
- **Acceptance:** the image digest, artifact provenance, configuration and test
  target are documented; no production queue can be consumed by the trial.
- **Spec:** short. **Verify:** `npm test -- tests/unit/worker-runner.test.ts
tests/unit/worker-readiness.test.ts`, `npm run typecheck`, `npm run lint`,
  `npm run build:worker`, and `npm run check:container`; build and smoke the
  exact Arm64 image locally with synthetic configuration. Record any missing
  checks and the evidence for matching migrations and storage.

### OCI-03: Provision and harden synthetic staging

- **Depends on:** OCI-02 and explicit staging authorization.
- **Approach:** provision one Always Free-eligible Arm VM in Mumbai. Initial
  sizing proposal: 1 OCPU and 4 GB RAM, subject to current eligibility and
  measured needs. Restrict administration and egress, patch the host, keep
  secrets outside the image and metadata, and run the non-root worker with
  supervised restart. Use only the authorized synthetic target.
- **Acceptance:** resources and costs match the approved scope; no public worker
  endpoint exists; access and data flow are reviewed; startup fails safely when
  schema or configuration is invalid. Optional AI, OCR and review features stay
  disabled unless separately authorized.
- **Spec:** full security and operations configuration. **Verify:** record VM
  settings and eligibility, test effective network rules, startup and reboot,
  credential access and rotation, secret-safe logs, and denied access paths.
  Review deployment-owned malware, sandbox and egress controls before use.

### OCI-04: Prove job processing and recovery

- **Depends on:** OCI-03 and an approved synthetic fixture and cleanup ledger.
- **Approach:** submit synthetic documents through staging and exercise queue
  claim, processing, result persistence, cancellation and worker interruption.
  Test database and storage unavailability, lease expiration and reclaim,
  duplicate prevention, restarts, and rollback to the prior approved artifact.
- **Acceptance:** results and ownership are correct; failures are visible and
  retry or fail safely; exact owned fixtures and objects are removed and checked
  absent. No real candidate data or live AI provider is used.
- **Spec:** short. **Verify:** save sanitized timestamps and observed states for
  each scenario, including interruption during an active job, and verify the
  cleanup ledger against the authorized staging target.

### OCI-05: Measure capacity, cost and recovery

- **Depends on:** OCI-04.
- **Approach:** use the approved synthetic workload to measure queue age,
  completion time, memory, CPU, failures, disk and network use. Exercise alert
  delivery, VM rebuild, secret rotation and documented rollback. Track free-tier
  eligibility and actual usage separately from trial credits.
- **Acceptance:** evidence compares measurements with owner-approved workload,
  latency, cost and recovery targets; unmet targets and fallback are explicit.
  One worker process handles one claimed job at a time. The application's
  `ANALYSIS_CONCURRENCY` admission setting does not establish worker parallelism.
- **Spec:** short. **Verify:** `npm run test:load` and `npm run test:restore`
  provide local synthetic evidence; additionally retain dated staging load,
  notification-delivery, rollback and restore receipts. Local checks alone do
  not prove hosted capacity or disaster recovery.

### OCI-06: Review staging and prepare release decision

- **Depends on:** OCI-05 and the existing A4, accuracy, accessibility, T100 and
  T101 requirements as applicable.
- **Approach:** review the staged candidate, open risks, proposed controls,
  maintenance owner, usage limits, data policy and rollout/rollback plan.
  Obtain the separate human approvals required by the existing gates.
- **Acceptance:** staging evidence and any approvals are dated and linked;
  incomplete gates remain open. Production activation occurs only after explicit
  authorization and the existing staged release requirements.
- **Spec:** none. **Verify:** inspect the evidence and approval records against
  [A4 tasks](../../tasks/todo.md#checkpoint-a4-b2c-production-readiness-implementation-ready-gate-open)
  and [release tasks](../../tasks/todo.md#phase-10-release-and-continuous-assurance).

## Boundaries and operational risks

The analysis worker does not automatically run privacy/export or retention
workers. Those require separately approved scheduling and execution evidence.
Hosted OCR and AI provider use require their own approvals and contracts. The
LaTeX compiler requires a separately reviewed Docker-daemon and Landlock boundary;
this plan does not establish that an OCI VM is suitable. See the
[LaTeX runbook](LATEX_CONVERTER.md).

Oracle may reclaim an Always Free instance considered idle, and free capacity
may not be available when replacing it. Monitor queue age independently of the
web health endpoint, document a fallback, and do not claim an availability SLA
from this plan. Resource limits and pricing can change; verify them at the time
of provisioning. OCI and Supabase remain separate services and regions/providers
even when both are located in Mumbai; assess their network and data flows.
