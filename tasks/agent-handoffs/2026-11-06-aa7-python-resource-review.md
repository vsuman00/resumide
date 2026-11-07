# AA7 CPython offline test-resource review

Reviewer: aa7_validation. Decision: a bounded private build-environment exception is technically appropriate for coordinator review. This note supplies no workspace-owner, security-owner or release approval. Root concurred and will record E-008 explicitly before implementation; no setting or build ran in this review.

CONSTRAINTS section1 forbids new skipped tests without a reviewed exception and requires a named owner, rationale, evidence and expiry/replacement target when relaxing a constraint. Section6 forbids silently adding an exception. It does not reserve every private engineering environment exception to the workspace owner. Existing authority covers isolated native engineering with no runtime/build-step network. A named coordinator may review this narrow environment selection; it cannot waive required security execution, failures, thresholds or formal acceptance.

The authenticated baseline Debian rules default TEST_RESOURCES=all at572, append only -network,-urlfetch for genuine on_buildd at573–575, and pass the resource choice through TESTOPTS at576. The proposed explicit TEST_RESOURCES=all,-network,-urlfetch accurately describes the network-disabled builder. It must not fake /CurrentlyBuilding, USER/LOGNAME=buildd or container identity, because that would also change unrelated exclusions. Original TEST_EXCLUDES remain unchanged; CPU remains enabled. SSL/asyncio are already excluded by Debian at617, so package test success alone cannot establish the security fixes.

Minimal exception contract:

1. Owner: root coordinator. Scope: only the future hermetic CPython native source build; exactly network/urlfetch resources omitted, with no source assertion/test deletion, new TEST_EXCLUDES, CPU disablement or relaxed timeouts/failure handling.
2. Preserve complete debug/static/shared original result logs and hashes. Require positive execution and exactly one successful final state per variant; fail missing/zero/failure/error/environment-change/rerun/interruption. Dpkg exit0 is insufficient: original Debian result-script wrappers ignore failures and emit DONE.
3. Inventory every skipped/resource-denied file or method with name/reason and distinguish original platform exclusions from these two resource choices. Aggregate counts alone do not prove the scope; the prepared result parser retains counts/logs but the final build contract must supply the named classification.
4. Run every frozen required security method outside the original broad SSL/asyncio exclusions. Require executed/pass records and fail on skip: HTMLParserTestCase.test_incremental_no_quadratic_complexity (CPU resource); SSLObjectTests hostname/server-parameter/unwrap and both SNI lifetime methods (MemoryBIO); SslProtoHandshakeTests hostname and EOF methods (local/mocked SSL); TestExtractionFilters.test_sneaky_hardlink_relocation (actual symlink/hardlink support). Preserve the separately reviewed XML/Expat/Python7210 regression/source/ABI contract; do not invent an upstream method or claim Expat-only completion.
5. Keep all network/urlfetch omissions visible, with no claim of unrestricted upstream-suite coverage. Expiry: before package/worker adoption or any build-contract change, whichever comes first. Re-review the exact execution receipts and required-method coverage then; unrestricted-network coverage needs separately authorized environment and execution before such a claim.

These conditions keep engineering progress within the approved private boundary. If a proposed exception excuses a required security skip/failure, changes acceptance thresholds, removes a production control or grants formal gate acceptance, it exceeds this decision and requires the applicable owner review. Do not request user approval merely because this bounded environment exception exists.

## Source evidence

All paths below are under the frontend worktree, `/Users/vaibhavsuman/.codex/worktrees/aa7-20261106-accessible-preview/resume_ats/`. Files were read only; no Python candidate, tests, services, container, database or provider executed.

| Path suffix | SHA256 | Relevant proof |
| --- | --- | --- |
| tasks/agent-handoffs/2026-11-06-aa7-native-python-proposal/baseline-packaging/debian/rules |a3331a9a89bef0466d176ec16ee7f96471e5a20d629d38861e94464a3791a701 |on_buildd29; resources572–576; exclusions617; ignored wrapper status646–700 |
| maintained-source/Python-3.13.18/Lib/test/test_ssl.py |b89dd5a87ff11ea5cf734fbe5176d1b501511d0720b515c8dc4e32d852f8f830 |SSLObjectTests2070 has no class resource decorator; methods2076/2109/2134/2198/2232 are local/MemoryBIO |
| maintained-source/Python-3.13.18/Lib/test/test_htmlparser.py |e472b02e738497694caa519a5ccf9b9ae84442cfe3d027ec760f533460a1c175 |1045 explicitly requires CPU |
| maintained-source/Python-3.13.18/Lib/test/test_asyncio/test_sslproto.py |9543ebae5add0212f43fcc83fa7e8f80a470a27db037d5861a3a1002560b7f18 |class28 requires SSL availability; hostname73/86 and EOF117 do not require external endpoints |
| maintained-source/Python-3.13.18/Lib/test/test_tarfile.py |cf83e4959aa6ebe5bb60a891e5802bd853820058c26f783c38c2a8b4fafdff21 |4465 requires symlink/hardlink support; mandatory skip must fail |
| maintained-source/Python-3.13.18/Lib/test/support/__init__.py |c816c165f0b06450fcd731220d5da0702bf5405e7150e4d72e8c050b6f821b46 |requires_resource returns a real unittest skip when disabled |
| maintained-source/Python-3.13.18/Lib/test/libregrtest/cmdline.py |ca56580fba32bb7acc933abffaa108496ee746358f389bfb44d150ae38538f7a |resource parser/help includes urlfetch and all-resource expansion |

The maintained-source suffixes are relative to tasks/agent-handoffs/2026-11-06-aa7-native-python-proposal/. The existing scripts/latex-runtime/native-python/test-results.py was reviewed: it preserves all three raw logs/counts and fails incomplete or unsuccessful summaries, but does not alone certify each required method or classify skip reasons. Those remain mandatory in the reviewed execution contract.
