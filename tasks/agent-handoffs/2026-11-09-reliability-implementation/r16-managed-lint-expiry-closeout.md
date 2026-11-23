# CR-R16 monthly expiry projection repair

The monthly expiry projection used `overage` as both a PL/pgSQL scalar and a query column. PostgreSQL reproduced SQLSTATE `42702` on the exact aggregate query. The [forward migration](../../../supabase/migrations/20261121225000_owned_ai_expiry_overage_resolution.sql) removes the unused scalars, qualifies the overage aggregate, and updates the dependent catalogue seals.

## Verification

The [native fixture](cr-r16-native-expiry-projection.sql.txt) ran on dirty `main` at `a0b239299d75b0bd64b588fe743ebe2975fb28b9` using disposable PostgreSQL 17.11. It replayed the exact 96-operation packet, reproduced the failure, and then ran the same fixture with the 97th operation. The native setup used synthetic Auth and Storage structures.

- The actual expiry routine refused a due accounting record with `P0E01` because the adoption verifier is absent. The expiry work table, aggregate table, and underlying ledger retained their expected state. The service role still lacked permission to sweep.
- The fixture then ran only the exact monthly SELECT from the stored routine in a temporary function. Neutral test reservations passed through the real accounting RPCs. The query reported 800 settled tokens, a 500-token unknown hold, and one unreconciled overage in the original month. The foreign reservation did not contribute. No purge or provider request ran.
- All 137 focused tests passed. The repaired expiry routine reported zero lint errors. The full local lint scan had 85 entries using application rejection codes and one database-level diagnostic for the intentionally absent adoption verifier. Those counts are local observations from the synthetic schema.

The first aggregate lint rerun omitted the legacy queue alias repair in operation 94 and reported its known error. The final run materialized and replayed the complete predecessor instead. It also reran the account and root disposition fixture on the exact 96-operation packet, correcting the earlier disposition receipt's scope.

| Artifact             | SHA-256                                                            |
| -------------------- | ------------------------------------------------------------------ |
| Forward migration    | `3e40e673da779c06d0036f844c57d84c721493eb49b24b6693295c4213c04b7f` |
| Native SQL fixture   | `995221f717f391b3cde0148d5eae7f88f0f143ed5aef88a8355ad48161ff1a2d` |
| Before-fix failure   | `b606c77f3f58477e2fc0018652f2eeab9ca6fb669d669cde55dc76584e1d5bb8` |
| Exact packet receipt | `461b0cf0d596ea6112e21a95d54cba13179c10c02c6bf61de655ee662105905b` |

The [97-operation packet](managed-schema-expiry-projection-successor-97.json) materializes with `--expiry-projection-repair`. Its first 96 operations match their predecessors byte for byte. The runtime profiles, approved managed run, and full expiry adoption remain open. The managed browser cutover and restore also remain open.
