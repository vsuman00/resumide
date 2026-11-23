# CR-R16 SQL verification before the CI cutover

The existing CI SQL checks stopped before reaching their assertions. Older fixture keys failed the Storage identity guard. Phase 7 still called the pre-fence privacy functions, and the canonical suite tried to reactivate a tombstone. Phase 4 also reached an ambiguous SQL alias in the worker's unfenced compatibility claimant.

The eight fixture scripts now use versioned Storage keys. Phase 7 passes the claim attempt through deletion preparation, failure and completion. The canonical suite asserts that a tombstone cannot be reopened and uses fresh roots to verify the original deletion cases. The forward migration changes only the two ambiguous queries in `public.claim_analysis_job(text,integer)`. It pins the function body before and after the change and checks its existing service-only permissions.

## Verification

Tests ran on dirty `main` at `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. Disposable PostgreSQL 17.11 replayed the frozen 93 operations and then the forward migration `20261121224700`. The fixture used synthetic Auth and Storage schemas and a fail-closed JSON Schema stand-in.

- Phase 4 recovery and persistence, Phase 7 deletion retry, native evidence, document evidence, canonical storage, Paddle admission, field versioning and OCR fusion all passed in rollback transactions. The Auth, analysis, worker and privacy counts returned to zero after each case.
- The original two-session correction script also passed against a separate disposable PostgreSQL instance on loopback. One writer applied revision 1. The other received a conflict. Exactly one correction event was recorded, and no fixture owners, analyses or corrections remained after cleanup.
- The earlier tests preserved both the Storage guard failures and the legacy alias failure. One intermediate Phase 4 run exposed a missing organization membership in the local setup. The final setup supplied the same owner membership as the existing seed.

| Artifact                | SHA-256                                                            |
| ----------------------- | ------------------------------------------------------------------ |
| Forward migration       | `2ed971e30ad27c47cdd1e128bc6b5cd02060b98ae61c154d733f31c07da4600a` |
| Initial SQL log         | `3678496ef234893a4b04593287f160a1658277b0d6c0b9a2ea8a519228a732d4` |
| Legacy failure log      | `12eae7dfbb4d44ce1a30aea664cd0759976f81dfe119ce6c254836300081fa89` |
| Eight-suite passing log | `7cb67793d093504e1f60fcfb44501b338b6fbe1676f2045875b4d8cd00ac2c2e` |
| Two-session passing log | `ed16feb702a839495fef8e45b207dd8f40cef46a7466b11029ea5a5599f896c9` |

CR-R16 remains partial. The repair made the SQL checks runnable against the local schema candidate. The migration still needs a pinned successor packet and approved isolated Supabase execution. The managed runner, CI migration, managed schema lint and browser coverage remain open. Supabase documents a direct connection and a session pooler for persistent PostgreSQL sessions. Its CLI v3 changes the default target and confirmation behavior, so the CI cutover needs an explicit target. [Connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres) · [CLI v3 change](https://supabase.com/changelog/supabase-cli-v3)
