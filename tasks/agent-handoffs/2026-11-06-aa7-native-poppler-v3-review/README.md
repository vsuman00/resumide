# AA7 Poppler V3 independent review

2026-11-06. Reviewer: `/root/aa7_frontend_review`. Status: scoped review PASS, ready for coordinator consideration of one native retry. This is not build authorization, native validation or release acceptance.

The frozen backend V3 manifest `57383aba269ed5c9354f7adb61daeaacc46f16259c242809aa1353cb5d9fc134` matches all59 listed files. V1 `f6f3a3bbe7a55c6a8e1f4e4c534499e1d9e94a18b768b129be2d8be0ec7ab54d` and V2 `ef124759f7e4e69ea139a8d314e7a5ad84024cde250979ce31b99f60077a2f57` remain preserved. Source hashes were rechecked after this review.

## Delta and correctness

`build-v3.py` adds one assignment after pkg-config tokenization. It classifies external `-I` paths as system includes, preserving `-I-`. Removing exactly that assignment recovers the original builder AST without any other semantic change. The V3 Dockerfile/context changes select that new builder as `/recipe/build.py`; the original builder and earlier manifests remain intact.

The standalone old-header client retains C++20, `-Wall`, `-Wextra` and `-Werror`. The change affects diagnostics from external headers rather than replacing those flags. No vendor header, client assertion, original package compiler flag, package test, discovery list or test threshold changes. Fatal71-executable CTest registration/execution,56 actual Qt outcome checks,107 consumer cases, baseline old-header execution, installed package identity, coherent cohort and later native verification remain the same builder logic. Source/native package test execution remains pending; preserved logic is not test success.

Seven independently evaluated flag cases pass: joined include, separate include, include path with spaces, unchanged warning flags, existing system include, legacy delimiter and an embedded `-I` sequence outside an include option. Only the isolated trusted assignment was evaluated; the builder module and downloaded source were never imported or executed.

## Host compiler check

Three syntax-only compilations use tiny owned header/client fixtures. No executable or object file is produced or run.

| Fixture | Exit | Observed result |
| --- | ---: | --- |
| Vendor fixture through ordinary include | 1 | External unused parameter is fatal. |
| Same fixture through the exact remapped system include | 0 | External-header warning is excluded. |
| System include plus an unused parameter in our client | 1 | Our client warning remains fatal; the vendor warning is absent. |

[review.json](review.json) preserves exact compiler/version/argv, source hashes, seven flag cases and diagnostic log hashes. These results establish host Clang behavior only. The actual Linux compiler, old-header binary, native package and all upstream tests still require the reviewed source build.

No concrete defect was found in this narrow delta. Root owns E-009 renewal, disk admission/restoration reserve and any source-build retry. Native Poppler adoption and the complete converter verification gates remain separate. This review changed only its owned handoff and neutral fixtures; no Docker, database, provider or production action occurred.
