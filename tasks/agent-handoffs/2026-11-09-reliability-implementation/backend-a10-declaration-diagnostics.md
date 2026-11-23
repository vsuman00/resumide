# A10 exact declaration diagnostics

Updated 2026-11-11, Asia/Kolkata. This five-file source leaf follows [Root's A10 contract](a10-declaration-contract.json), SHA256 `62b5f870adc6f69277c62e894fdd448ac08d666ccb37c7af368d63b586220f4d`, on base `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus preserved dirty prerequisites in the existing backend worktree. Root confirmed all four owned baselines matched before changes. Backend changes only `score-v2-engine.ts`, `score-v2-contract.ts`, `scoring-validity-engineering.ts`, the existing engine test and this handoff. This is implemented and locally verified diagnostic behavior; full A09/A10, scoring admission and release acceptance remain open.

The actual first regression ran real canonical certification edit, exact owner/value confirmation, JD parsing and scoring diagnostics. Editing removed the old citation; confirming recorded the new declaration. The unchanged engine nevertheless asked for the same confirmation again because its helper required a citation as well as confirmation. `confirmed-certification-red.json/log` retain that failure on production hashes `d2658437`, `99cbdfa7` and `3747fa66`. One test failed; 19 were filter-unselected.

The repaired requirement diagnostic separates an exact recorded declaration from source support. A declaration must have candidate-confirmed state and a matching owner/value confirmation on that same fact. An uncited declaration is acknowledged using the existing `not_evaluated` state and a supporting-evidence review reason. A declared skill receives a proficiency and skill-specific duration review reason, with no repeated confirmation request. A matching unconfirmed fact still requests confirmation. A cited unconfirmed duplicate cannot lend its citation to a different confirmed uncited fact. Existing exact cited and confirmed non-skill matches retain their proposed satisfied state, with authoritative alignment still withheld.

The cited-plus-confirmed helper and the entire `confirmedExperienceMonths` function are byte-identical to their baseline. Their unchanged requirement for cited role/date facts remains in place; an uncited declared role cannot contribute tenure. Exact citation validation, unknown/negated/domain behavior and calibration blockers are unchanged. No citation, proficiency claim, source support or number is created by acknowledgement. All dimensions, coverage, eligibility, aggregate and calibration remain withheld under the existing draft policy.

Regenerated diagnostics now identify producer `score-v2/1.0.2` in both the input fingerprint and output envelope. Readers retain `score-v2/preparation-1.0.0`, `score-v2/1.0.0` and `score-v2/1.0.1`, and reject unknown producers. The engineering benchmark derives its engine version from the generated envelope. Canonical, suggestion, command, replay, policy, SQL and C02 contracts are unchanged. These diagnostics are regenerated read models; this change does not claim byte-identical old-engine replay or alter a stored score envelope.

## Verification

Receipts are in `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a10-declaration-rz8670k2`. The sealed Node22.23.4 runner never loads dotenv or real credentials, limits each command to 60 seconds and 8 MiB of logs, records exact process identity and verifies owned group cleanup. Its before/after hashes cover 698 nonsecret source inputs with no drift for every completed command.

- `confirmed-certification-red.json`: actual baseline failure retained.
- `affected-first.json`: 40 tests passed across the existing engine (30), contract (8) and scoring-validity (2) files. This includes the actual regression, cited/uncited declared skills, unconfirmed credential controls, mixed duplicate orders, invalid declaration actor/value, source-required role arithmetic, deterministic producer-bound hashing and all old reader variants. The benchmark's release CLI still returns its expected blocked receipt and nonzero exit.
- `types.json`: six roots and 32 project source files, zero diagnostics. `lint.json` and `format.json`: all four owned code/test files passed. Focused whitespace checks also passed.
- `helper-identity.json`: unchanged cited/confirmed helper (144 bytes), SHA256 `f6a2f42d7545bf8490bad4251865b613a7ab9724519a7317faf3388f6eeeec57`; unchanged experience helper (1553 bytes), SHA256 `edbcb8781e81e5fc23b9ab849468c0d070295d5d9ad19d25b972386543449f0b`.

All 19 original engine cases remain present. Exactly two existing cited-SQL expectations now require `not_evaluated` and the explicit proficiency-review reason instead of repeated confirmation. No other prior safety assertion, frozen label or threshold changed. No behavior suite was repeated after the passing 40-case run; production source remained frozen through static checks. U18, U03 and A04 gates were not rerun.

## Frozen packet

| File                                      | SHA256                                                             |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `app/lib/server/score-v2-engine.ts`       | `8eccbb77298ac15a376ba3f5d8a16512163ca45d0ab337d4667f85f26322e09d` |
| `app/lib/server/score-v2-contract.ts`     | `c7cb6368c6cdd1b3866f64cca2d0e295de91f77d2d25eaa4765bd6632dfebb15` |
| `scripts/scoring-validity-engineering.ts` | `711ae03b3a5c07130857c20cb098165792bd4d1a8b4218fe166c77f99bceab72` |
| `tests/unit/score-v2-engine.test.ts`      | `b9fb1206205f85c2a3572d803b102c69165a7fa9fad9b1b1a04a64ba2ba168fe` |

Root owns source review, integration, its final affected gate and canonical context/task updates. No native database/SQL, provider, owner data, Docker/compiler, real environment, Git publication or deployment action ran. Native consumer behavior, full relationship-aware requirement coverage, validity/calibration and release acceptance remain separate. The installed prose skill inspected the new reasons and this handoff; deterministic cleaning preserves all code, exact values and factual claims.
