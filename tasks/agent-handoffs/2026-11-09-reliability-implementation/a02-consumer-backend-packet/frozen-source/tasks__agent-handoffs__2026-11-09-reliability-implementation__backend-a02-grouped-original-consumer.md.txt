# Grouped original server consumer

Implemented the five-file backend allocation for CR-A02-S02 under consumer contract `345471201c04774836c0245808d950fe2de5a8463d8f551b774e2685a13f8032` and allocation `44f3d6e7c8fa0a12b9155dd5f921bff0c69fa8bce644887b9bdf031aba4a6937`. This is source and synthetic verification progress. Native execution, managed concurrency, restore acceptance, writer activation and release remain open.

The repository reads one owned SQL snapshot, validates the stored envelope through the existing bounded association helper and full replay schema, and returns derived groups with values and citation links. The raw envelope stays on the server. All candidate groups remain visible; only selections have the existing 32-group bound. Compatibility readiness and commit permission remain separate. Fresh previews require the actual import predicate and null head. Retained commits preserve their original captures, locale, key and hash after head or revision movement.

Preview reuses the frozen command preparation. Commit normalizes the original command, checks capability, calls the legacy constructor once and submits one writer RPC. A denied writer causes neither construction nor submission. The constructor still produces `canonical-engine/1.0.1`; SQL owns the grouped placement. Strict receipts distinguish a new result from an idempotent replay without comparing the replay result against a newly generated prospective UUID. Ambiguous read, write and result failures keep the exact retry available. There is no automatic retry.

The new form reader consumes one URLencoded body with fatal UTF-8 decoding and a 16,384-byte encoded limit. It rejects duplicate decoded fields, nested JSON keys, unknown fields and oversized nesting/token work. Commit requires the named `relationshipAcknowledgement=accepted` field. The command's prospective acknowledgement does not replace that checkbox. Readers are cancelled and released on success and failure. Existing form parsers are unchanged.

The forward read migration uses the writer's actual scope and latest attempt under the same locks. It returns actual revision/head pairs, compatibility readiness, fresh-import eligibility and permission. The response limit is 16 MiB. Only the new read RPC receives service-role execution permission in source; the grouped writer remains revoked. The guarded readiness successor preserves all 68 predecessor catalog entries and every existing table, column, foreign-key, trigger and ACL check, adding the read RPC as entry 69. The predecessor body hash is `07d338cc1cbd2c79df76dcbc21bd814b3612c43a0e748531f574974b55c25958`; successor is `c2098f91ee32e4035ff30dd5db71c4d7e95944cef24e4b137c8c489841edd5db`. The external pin avoids a self-hash cycle.

## Frozen source

| File                                                                     | SHA-256                                                            |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `app/lib/server/grouped-import-repository.ts`                            | `93ffeea3a4616548caa363ac62a17daed021bf48408fe2d9ab25c4435e6c54ad` |
| `tests/unit/grouped-import-repository.test.ts`                           | `99dc86ddb3f8efd9727d606dcae95f15fdd12c86263fcf433d78e19614dd44c8` |
| `supabase/migrations/20261113142537_grouped_original_workspace_read.sql` | `cef10fae7f2257726a275eff39ad65d0776118a8754d5d1a8b22786eab89ed02` |
| `scripts/verify-grouped-original-read.sql`                               | `213eb56d27541ac3178d1b1e0a0eace372ad92e36a97b4bcf0c801cd1bbf53ee` |

The fifth owned file is this handoff. Its hash and the complete preservation manifest are recorded in the final private packet.

## Checks and failures

Exact Node `v22.23.4` ran sealed synthetic checks with dotenv disabled, no live credentials, AI disabled and no database/provider requests. Final receipts are in `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a02-consumer-g_14_vtx`:

- `focused-terminal.json`: 66 tests in one file passed on final source.
- `types-fixed.json`: four roots, 35 source files, zero diagnostics.
- `lint-fixed.json` and `format-fixed.json`: scoped checks passed.

Each terminal check recorded 722 unchanged source inputs and confirmed process-group cleanup. Root owns integrated route/component checks and full types, lint, web and worker builds.

Earlier receipts remain preserved. Initial module types failed because TypeScript did not narrow through an inferred arrow returning `never`; an explicit function declaration repaired the type flow. The first behavioral run passed 56 of 57 cases; its expected citation URL omitted the actual `native-` span prefix. The fixture expectation was corrected. Later scoped test types exposed mock RPC transport types and implicit callback types; test-local adapters and annotations repaired them. Initial lint caught unused mock parameters. Formatter mutation receipts report incomplete source stability because formatting intentionally changed owned files; separate read-only formatting checks passed.

The 66 controls use actual neutral extraction, association derivation, command normalization and legacy construction with mocked storage. They cover malformed ownership/source/pairs/capability, all groups beyond 32, explicit locale, stale fresh previews, retained replay after movement, one constructor, constructor bounds, fixed refusals, strict receipts, network ambiguity, named acknowledgement, decoded and JSON duplicates, exact byte boundaries and stream cleanup. Source checks independently apply the actual guarded profile transform and compare the frozen JS oracle to its actual normal form, hash and atoms.

The rollback-only SQL verifier is UNPARSED, UNAPPLIED and UNEXECUTED. Its source includes explicit admission refusal, exact source/prefix/capability checks, privileged synthetic fixture construction, latest-attempt separation and privacy denial. Source-pattern checks supply no SQL syntax or native parity proof. No existing migrations, legacy producers, C02 operations, constructor bytes, flags, schemas or shared repository code were edited. There was no Git, SQL parser, native database, provider, dependency, environment, deployment or publication operation.
