# Atomic accounting expiry and worker

Continue ADR-0020 under the frozen expiry-fold contract. Root owns shared contracts, docs, integration and migration order; backend owns the real atomic producer, readiness/profile, source tests and deferred Native verifier; runtime owns the strict one-shot sweep client/CLI and synthetic tests; peer reviews both source and full privacy/admission consequences. Separate existing worktrees are synchronized to the verified mandatory-budget candidate; no services are allocated.

The fold must conserve both accounting measures and unknown/overage blocks while deleting the exact personal closure in one transaction. It must never retain personal dedup receipts or silently omit unrelated/foreign accounting. Missing Auth/org, object/export, restore-floor or other paired authority denies the whole transaction. Those dependencies remain required work; the local slice cannot close the 30-day erasure or release gate. Destructive access remains denied.

Authors provide exact pre/postimages, preserved RED/failed receipts, finite affected checks and owned handoffs. Root reviews and integrates real dependency successors before one appropriate combined gate. No SQL parser/execution, hosted changes, live provider, Git publication or deployment is authorized.
