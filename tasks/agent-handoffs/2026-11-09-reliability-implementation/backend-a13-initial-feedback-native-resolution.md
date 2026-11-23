# A13 initial-feedback native renderer: narrow resolution

- Updated: 2026-11-15; reviewer `/root/a01_page_backend`.
- Scope: only the two accepted parity corrections, explicit C collation and exact JavaScript whitespace substitutions. Frozen Node contract `b8419d23`, plan `f4645db2` and writing IR `legacy-source-transforms/1.0.4` are the comparison authority.
- Original findings remain preserved in `backend-a13-initial-feedback-native-peer.md`, SHA256 `410ba53b984b8dcd8fb659f948ff9e7cbe5479bfedf3903a16e474f1f6ea81d8`.
- Evidence tier: source inspection only. No tests, SQL parsing/execution, services, provider calls, environment reads or Git operations.
- Result: SOURCE ACK on terminal native SQL `7a67f96d68eff03ce1efdfe0bdf3c551799af714a9465efe3d4eadb1bfb16ff8` and profile `e9f53e3e9e409fcf69b2c3cf420e3639323fdca8bf1d79f603cf1fc78618e3a1`, both independently rehashed. No remaining concrete finding in the allocated correction delta.

## Correction status

The released native successor `c81ca5f00cbf2ddd0d47bc47653979832e75fe05aee17d08aa89990a8e5d8aa2` closes both original findings. `rewrite_clauses` normalizes each rendered variant before appending and joins those results without normalizing the whole string. Clause/object text is retained in its original form for role/employer proof; `ifp_variant` separately normalizes rendered text. Employer extraction uses code-point capture positions over the unchanged source and compares the original strings. The original double-space counterexample therefore cannot pass by collapsing its proof value.

The new whitespace-class helper enumerates the same characters as the existing JavaScript whitespace handling. It replaces only grammar positions that used JavaScript `\s`, preserving literal spaces inside `response time`, `machine learning` and `full[- ]stack`. Explicit C collation makes the reviewed grammar and raw employer/basic-anchor comparisons independent of the database's default collation.

Two residuals were reported on that checkpoint: the clause negation regex still lacked explicit C collation, and the lower-is-better scope suffix still required literal spaces where Node uses `\s`. The latter could refuse the supported source `Improved latency by 20%\tat Cedar Labs.` (the escape denotes an actual tab). The terminal successor fixes both: the raw negation operand is explicitly C-collated, and only the two scope-suffix whitespace slots use the exact JavaScript class. Known whitespace is mapped for Unicode-domain classification without changing the original suffix/proof value. Literal phrase spaces remain literal.

Runtime supplied quiescent immutable snapshots at `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a13-feedback-native-axb7r9ag/successor-final.sql.txt` and `successor-final-profile.ts.txt`. The final review read only those exact residuals after the c81 comparison; it did not restart the full renderer audit. Root and runtime received the terminal source ACK before runtime's first source checks. Intermediate cde822, c81 and profile snapshots remain preserved by their author.

## Boundaries

This review does not repeat the full renderer or metadata/permissions review. It supplies no native semantic-equivalence, concurrency, deployment or representative-usefulness result. Existing Node/core policies, observation-versus-native proof scopes and published wire fields remain unchanged. Native ownership and publication adoption remain outside this pure renderer leaf.
