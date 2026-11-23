# R16: deterministic public-ledger fixture

2026-11-09. **TEST FIX / verified under umasks 077 and 022.** Own only `tests/unit/managed-test-target.test.ts` and this handoff. No production guard, global umask, suite policy, assertion or other source changed. No DB, Docker, provider, network, credential-file or Git operation occurred.

ROOT and worktree inputs matched before work: test SHA-256 `d97047606ba618ee0201f83c18ab6a64e9e90b6488bdbfe99aaed0ea6f5eae6e`; production guard `be04eefb20fdbd05f23921597c2f035ba4bd9eb2204a22abb27177c42067cb5a`. No synchronization or overwrite was needed. Integrate the released test only after matching that precise prior ROOT test hash.

The root verify06 failure was caused by the fixture, not an incorrect guard. The public-file negative created its empty ledger with mode 0644, but creation permissions are reduced by the process umask. Under 077 the file was actually private 0600, so the unchanged expectation that admission throw could not hold. The secure guard correctly accepted that private ledger. Root's original failed verify06 log and receipt remain historical and untouched.

The minimal repair adds `chmodSync(original, 0o644)` immediately after creation, then asserts the actual permission bits are 0644 before the existing rejection assertion. Later restoration to 0600 and all missing/symlink/hardlink/parent checks remain intact. The new stat assertion makes the intended negative fixture observable; no production policy is weakened.

## Evidence

Separate empty-file probes reported only permission metadata and one-file counts, never file paths or contents. Before the repair, mode was 0600 under 077 and 0644 under 022. After explicit chmod, both report 0644. Each exact temporary probe file/directory was removed by its owner.

| Check                               | Umask 077                               | Umask 022    |
| ----------------------------------- | --------------------------------------- | ------------ |
| Original single negative test       | Failed at unchanged `toThrow`, line 371 | Passed       |
| Corrected complete guard file       | 75/75 passed                            | 75/75 passed |
| Corrected actual fixture permission | 0644                                    | 0644         |

The initial focused runs selected the one failing test; other cases were filtered, with no source-level skip/disable. Both final runs execute the entire 75-case file with no filtering. They use pinned Node 22, the package test entry's Vitest runner, `--no-cache`, a sealed fake-provider environment and `RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic`. Python's child-only umask option sets each test process independently; the coordinator's or host shell's umask is not changed. Test fixtures clean their exact synthetic paths normally.

Focused lint, formatting, whitespace and prose checks apply to these two files only. The production guard still hashes to `be04eefb20fdbd05f23921597c2f035ba4bd9eb2204a22abb27177c42067cb5a`. No unchanged application build or broader suite was repeated. Root owns integration and any combined verification; these are local permission-fixture results, not a hosted Supabase test.
