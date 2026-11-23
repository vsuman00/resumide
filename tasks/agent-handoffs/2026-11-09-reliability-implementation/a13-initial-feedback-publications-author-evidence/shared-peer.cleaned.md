# A13 shared usage: independent source review

**SOURCE ACK.** No concrete remaining finding in the allocated shared counter, helper, full metadata or A12 caller. This review did not run tests, parse/execute SQL, access a database, call providers or change production source. Native concurrency, role behavior and adoption remain unverified.

## Exact reviewed snapshot

Root's allocation initially named SQL `047f5355...` / profile `f5a8195d...`. The author supplied a quiescent successor before review: SQL `63ddc8a4...` / profile `bec326d4...`. Its stated delta requires an A13 publication to equal the operation's actual published pointer. Helper and caller bytes were unchanged. I independently hashed all four immutable snapshots listed in:

`/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a13-shared-usage-gfrr1c18/peer-checkpoint.json`

| Runtime file | SHA256 |
| --- | --- |
| `supabase/migrations/20261115082125_owned_ai_usage.sql` | `63ddc8a43deba5e794feef0f6c0fefe73be524d6c75a60b70e67087ae82b44b1` |
| `app/lib/server/owned-ai-usage.ts` | `38561cea225414c6f69690294bc568ecf6bebaa7b5099dd995a82e93f028c495` |
| `app/lib/server/initial-feedback-profile.ts` | `bec326d43086125bed0e962b5d765234a8d17a829f9323fed71b240d8d830580` |
| `app/lib/server/canonical-rewrite-service.ts` | `611f3e5dad383584895a339b3b685accca1c2e61a800823092833971b1295232` |

## Snapshot and accounting

The suspected multi-query publication race is **not present in this source**. Although the outer function is volatile, SQL lines 45–119 use one `WITH ... SELECT ... INTO` statement for materialized scopes, authoritative link validation, global exclusion and all three monthly aggregates. There is no separate SPI query between collecting exclusions and summing claimed spend. A newly committed legacy run cannot become visible to only the later aggregate within that statement snapshot. This is a source conclusion, not a reproduced two-session result.

Link validation and exclusion have no month filter (lines 45–95). A12 pre-compatibility links use the actual operation `run_id`; the frozen original finish at `20261114181344_canonical_rewrite_operations.sql:539` shows the expected owner/org/analysis, OpenAI/model/prompt, binding hash and exact usage tuple. Post-compatibility operations need not have a legacy run. A13 links require the assessed publication, actual published operation pointer, exact attempt and operation relationship, owner/org/analysis/binding, claimed time and matching actual legacy run usage. Foreign links and duplicate run attribution refuse the whole response. The legacy aggregate excludes only those authoritative linked IDs, rather than all runs sharing an analysis ID.

The components then apply their own month filters (lines 96–119): unlinked legacy creation month, A12 original claim month, and A13 original attempt claim month. Claimed known usage is included without filtering away rejected or unpublished attempts. Never-claimed metadata is excluded; claimed null usage contributes an explicit unknown count. Invalid values fail closed, and unknown usage is not admitted as known zero.

## Helper, caller and metadata

`owned-ai-usage.ts:64–127` validates the actual strict thirteen-field reply, exact owner/org/analysis and usage/profile pins, component identity with `BigInt`, current UTC period at completion and the absolute deadline. It refuses null/malformed/foreign responses and nonzero unknown claims. It has no legacy-counter fallback, cache or retry. Its bounded provider-attempt wrapper checks cancellation before invoking RPC and sanitizes failure output.

A12 service lines 285–340 call the shared helper unconditionally in the fresh authorization callback, before either claim/dispatch path. The configured cap comparison uses `BigInt(totalTokens) + BigInt(reserve)`. The unchanged actual repository returns saved or pending operation replay at lines 239–261 before the authorization callback at line 359; replay therefore does not consume new consent, rates, usage checks, budget or provider calls. Both budget modes retain their mandatory native claim.

The actual full metadata has nineteen fields and the profile eleven strings. I independently matched the usage, checker and metadata source-body hashes; publication and forwarded operation pins match the released `6bc869e8...` leaf. The checker composes real publication and A12 source closures, with denied data/private ACLs and only explicit service metadata execution. No fictitious body, enabled policy seed or activation was added.

The quota read remains an observation, not an atomic global token reservation. Publication/settlement races, UTC rollover, catalog CHECK/default reconciliation, roles, retention/privacy lifecycle and Native execution require the deferred acceptance work. These existing limits do not supply a new source finding.
