# CR-A02 local PostgreSQL grouping and placement

PostgreSQL 17.11 matched the application’s expected source grouping for all 61 synthetic fixtures. The same run matched the complete document and source-link mappings in all 47 placement fixtures and refused all 54 invalid inputs. The unchanged [SQL verifier](../../../scripts/verify-grouped-import-source.sql) also checked character handling and equivalent integral JSON values. A separate Node 22 run passed 339 tests across five related files.

The verifier ran on dirty `main` based on `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. It used the [93-operation packet](managed-schema-worker-successor-93.json) with digest `310f2c7174f4b6f9ab69bd38fc59b6d84ffeabdee55b2d2cdc5da6ffa034ed76` and the [disposable native driver](cr-a01-native-worker-lifecycle.py.txt). The first full attempt stopped when the driver’s fail-closed JSON Schema stand-in reached placement validation. A separate run verified all 61 projections and the 16 source and binding refusals while the native validator was being built.

The successful run loaded the upstream `jsonb_matches_schema` C function from `pg_jsonschema` v0.3.4 into the disposable database in place of the compatibility stand-in. The build used the locked Rust dependencies, PostgreSQL 17 headers and the installed macOS SDK. An initial build of v0.3.3 failed in binding generation. The local driver registered the original C function directly and checked that it accepted a valid value and rejected an invalid one before running the original SQL verifier. Auth and Storage used the existing local scaffold. [Upstream validator source](https://github.com/supabase/pg_jsonschema/tree/v0.3.4)

| Input                                | SHA-256                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| Grouping source verification SQL     | `5f94e7af34bba4523f6cc7314710bab90e94249eca52537fdb770d217db78b24` |
| Grouping source validation migration | `6107961ce83f268ca6ee35ed9f06d43abc396d75d3a58c7ac56b2388da311f29` |
| Upstream v0.3.4 source archive       | `3bfddb105d71df10078f935a5ac1328660a1a2fe290f2342c2b4a142d4f47d91` |
| Local v0.3.4 library                 | `b47a49e7d20621ff98136637bf433815d7f24b311086beb055b12fde3c1aecda` |

The transaction rolled back and the Auth, analysis job and privacy request tables were empty afterward. The driver stopped the PostgreSQL process and removed its temporary cluster. Managed Supabase execution, atomic approval and import, concurrent replay, effective writer privileges, browser acceptance and release remain open.
