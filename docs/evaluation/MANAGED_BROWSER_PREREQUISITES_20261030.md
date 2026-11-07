# Managed Supabase test prerequisites

The owner requested sequential authenticated tests against the configured managed project. Read-only inspection found canonical resume, job requirement and authoring tables absent. The deployed evidence function also differs from the repository validator. The first run passed two checks and failed eleven during evidence fixture setup.

Applying the following existing forward migrations changes the managed schema and functions. This requires a hosted rollout decision under the repository runbook. No reset, table deletion or data backfill is proposed. These files have existing local engineering evidence; that evidence does not verify the hosted rollout.

| Order | Existing migration                                                                                                                           | SHA-256                                                            |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1     | [20261012051515_canonical_resume_draft_storage.sql](../../supabase/migrations/20261012051515_canonical_resume_draft_storage.sql)             | `2eed8e55fffc2ca320736bb39c9b9ba2f63e1816062bcd6bd75a0e1192a1957b` |
| 2     | [20261012054243_canonical_resume_transactions.sql](../../supabase/migrations/20261012054243_canonical_resume_transactions.sql)               | `5dd2b09ad3f7deb526d3862630544418f2a87a69cb81396a09ec3f0e67ddfb15` |
| 3     | [20261012064727_job_requirement_versions.sql](../../supabase/migrations/20261012064727_job_requirement_versions.sql)                         | `5e631e2bd8382380341f0f47c92ece4d622ab5da984d26f8d36e916cbf2cd6c3` |
| 4     | [20261012160703_candidate_authoring_transactions.sql](../../supabase/migrations/20261012160703_candidate_authoring_transactions.sql)         | `bc5a4e132144d68bb267cdad506c3a96db66205d12ed1b480956596986048ee5` |
| 5     | [20261017000000_job_requirement_parser_compatibility.sql](../../supabase/migrations/20261017000000_job_requirement_parser_compatibility.sql) | `3112b61638ff76815caafbc32003bad9af80ee0fa881114706b608716ffa03be` |
| 6     | [20261017010000_canonical_producer_compatibility.sql](../../supabase/migrations/20261017010000_canonical_producer_compatibility.sql)         | `2bc5b7c9cdcb376eb3b083f21820b78606316fd2e0f34474b7ff82d2c3bcdf79` |
| 7     | [20261017120000_evidence_field_parser_version.sql](../../supabase/migrations/20261017120000_evidence_field_parser_version.sql)               | `28e1fb7d7341e758bcf6fd34f2152d76ea82b2796bc7458e74c31747df83cd4b` |
| 8     | [20261018072430_ocr_fusion_resource_profile.sql](../../supabase/migrations/20261018072430_ocr_fusion_resource_profile.sql)                   | `c653beb6b3f1158bb4d5d554ed8c56024eb1bbe973f1c2ca5f7c8823f80b8d01` |

Before execution: inspect managed advisors and function/table dependencies, confirm a recovery point, then apply in order through Supabase migration tooling. After execution: verify objects and run the synthetic browser suite with one worker and exact cleanup. Preserve existing migration history and all application release flags. The PaddleOCR admission migration is outside this browser-test prerequisite set.

## Approved rollout

The owner approved the listed hosted rollout in this chat on 30 October 2026. All eight migrations applied successfully in order through the Supabase connector. The pre-existing evidence-function definition was captured in the ignored `.private-resume-test/pre-rollout-evidence-function.sql` as a schema recovery reference. No backup restoration or full data recovery drill was performed. Existing tables and their data were retained; rollback is by application flags and forward repair, not by dropping the added schema.

Supabase assigned remote migration versions 20261030182138, 20261030182139, 20261030182141, 20261030182143, 20261030182144, 20261030182146, 20261030182147 and 20261030182150 respectively. Preserve this mapping when reconciling local and hosted migration histories; do not blindly push the historical filenames as new migrations.

Security advisors before and after returned the same existing warning about [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) and informational no-policy notices on three intentionally private tables. No new security-advisor finding was introduced. Pre-rollout performance notices were unused-index information; no indexes were removed.
