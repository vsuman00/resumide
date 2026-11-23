# Technical caller fixture followup

Status: three observed fixture failures repaired and locally verified. Product implementation and all producer profiles are unchanged. Root owns the combined gate and current shared context. Native, owner and release acceptance remain separate; deployment stays HOLD. Base HEAD is a0b239299d75b0bd64b588fe743ebe2975fb28b9.

Scope is the exact three files in ai-callers-runtime-followup-allocation.json: canonical-rewrite-service.test.ts, initial-feedback-stage.test.ts and qualitative-stage-outage.test.ts. Their preimages are archived under /tmp/resumide-ai-callers-followup-preimages and checked against the allocation. No other source/test file was edited in this followup.

The focused baseline reproduced all eleven Root failures: 52 passed and eleven failed across three files, with no skipped cases. A12's fixture handled the old generic reserve RPC and lacked current source readiness, so it could not exercise its intended exhaustion/blocked/denied/disabled response. A13's selected-worker harness handled only generic reserve, preventing its budget-on SDK case. Qualitative budget fixtures omitted the now-selected immutable resume_version_id and lacked current source metadata/admission. Reading the actual callers confirmed these were fixture gaps; no product change was required.

The updated doubles import the actual source profile and return the exact current metadata, preserving independent capabilities. They validate the owned source tuple before responding to ai_budget_reserve_source_next. A12 validates the derived technical operation against the actual typed operation and immutable version; A13 validates the prepared server operation/current attempt/version/lease; qualitative validates the actual selected version and analysis identity. Generic reserve explicitly throws in the fixtures.

All original 63 cases remain. The authorized positive RPC identifier updates now assert ai_budget_reserve_source_next and include the real readiness call. No old RPC event label is fabricated. Original429/503 statuses, recovery values, no-provider cases, deterministic partial content, admitted ordinal/cap, accounting order, unknown holds and cancellation assertions remain. A separate positive worker case confirms one admitted SDK execution, exactly one source reserve and zero generic reserve calls. The suite now contains64 cases.

Finite evidence:

- /tmp/resumide-ai-callers-followup-A61NCw: baseline52 passed/11 failed/0 skipped, 912 stable runtime inputs, PG53021 closed. Root's separate failed bulk receipt and its926-input snapshot remain historical and unchanged.
- /tmp/resumide-ai-callers-followup-51bczp: first successor64 passed/0 failed/0 skipped, 912 stable inputs, PG53193 closed.
- /tmp/resumide-ai-callers-followup-bmJgyp: scoped formatting exit0, PG53274 closed. Its generic stable-input status reports the intentional formatting changes to the three owned test files; the original receipt is retained.
- /tmp/resumide-ai-callers-followup-yNhE2r: scoped three-file formatting/lint and full tsc --noEmit passed, 912 stable inputs, PG53303/53310/53317 closed.
- /tmp/resumide-ai-callers-followup-jQRfH3: exact final formatted64 passed/0 failed/0 skipped, 912 stable inputs, PG53346 closed.

All groups are independently rechecked absent in /tmp/resumide-ai-callers-followup-release.json. It binds the exact three pre/post hashes, unchanged six product hashes, all six actual readonly producer profiles, contract/dependency/allocation hashes, source snapshots, receipt/log hashes and process start identities. Pinned Node22.23.4 ran with empty HOME, explicit synthetic environment/private marker, OS network/root dotenv read and Git write denials. The supervisor ran outside Seatbelt. No DB, Native parsing/execution, provider network, services, browser, dependency installation, Git mutation or deployment ran. No broad suite or app build was repeated. Root can carry its271 unchanged passing files and integrate these fresh three files with its separate neutral cases/statics/builds; this author receipt does not claim a fresh whole-suite result.
