# A13 stored-source guard peer review

Reviewed 2026-11-15 by `/root/pricing_validation`. Result: no additional concrete finding in the allocated source review. This is source evidence only; SQL remains unparsed and unexecuted.

The reviewed backend worktree is `/Users/vaibhavsuman/.codex/worktrees/reliability-20261109-backend/resume_ats`, dirty base HEAD `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. Root owns integration and combined verification. No application source, frozen renderer packet or shared task document changed in this review.

The exact reviewed files are:

- `supabase/migrations/20261115064102_stored_scoring_source_access.sql`: `9e857437bbd3d5995d7942b365406f9eb9f96197d3495853747cf950fdb1c1b2`.
- `app/lib/server/legacy-scoring-input-profile.ts`: `f2b2410fe652fbbf1963bbbbba5f9e5e1928f2bb177e5262d9edee30a99a101c`.

The new helper reloads and locks the actual immutable snapshot row with `FOR KEY SHARE SKIP LOCKED`, compares the complete stored row with the previously selected value, then locks the original owned version and active original root with `FOR SHARE SKIP LOCKED`. Version, root, owner and organization must match the stored identities. A missing, tombstoned or locked original source refuses access. The root share lock conflicts with a concurrent status update; the snapshot/version locks protect against physical deletion and its cascading removal while the transaction holds them. These are source-level lock arguments, not an executed concurrency result.

Current analysis ownership, privacy, membership and active-source admission still precede lookup. The additional original-source checks precede the committed worker receipt, exact finish replay and bound saved-context return. A replacement active root cannot substitute for original-source permission. All added row locks skip contention rather than wait in the reverse path of retirement or FK cleanup. Existing earlier admission locks retain their original behavior.

Exact finish replay still compares the stored binding, original static lease tuple and exact result before fresh status, lease or mutable-JD checks. No new lease expiry, current-JD equality or source rebasing was added to the historical branches. The saved context remains the original snapshot, with the existing currentness comparison.

A read-only text comparison matched all four preimages, five postimages and six profile pins. Each of the three changed return bodies is the exact predecessor plus one helper call. The manifest grows from 21 to 22 entries; only those three routine hashes change among the old entries. Checker logic after the manifest is unchanged. The complete account exporter and metadata bodies remain byte-identical. Data calls and the new private helper remain denied; no grant or adoption is supplied.

The deferred verifier contains actual historical-access, tombstone-denial and complete-owned-export assertions using separately admitted producer-created fixtures. It preserves snapshots/results, forces deferred constraints and rolls back. It explicitly leaves multi-session contention, retirement/deletion/FK races, installed catalogs/roles and consumer adoption open. Its same-session mutations are not a lock-contention demonstration.

No tests, builds, SQL parser, native execution, catalog queries, services, provider calls or Git operations ran. The author's 16 textual tests and scoped statics are reported separately and were not repeated. Root received the source ACK before integration. The remaining evidence requires separately authorized direct native execution; source hashes do not establish deployed behavior.
