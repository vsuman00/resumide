# fc8 HIGH findings: complete evidence matrix

2026-11-06. Exact worker `sha256:fc8c0ace5e3bc53b3db1e23e0df11caed38161bb716b5c388d96169abe0e8203`. Read-only reconciliation of all80 raw HIGH package/CVE matches across28 CVEs. Every row remains in the unsuppressed947-match scan. Counts represent package matches, not exploits. Root owns acceptance; this matrix supplies no security-owner or release approval.

The [JSON](AA7_FC8_HIGH_EVIDENCE_MATRIX_20261106.json) contains all80 package rows, exact versions/source joins/raw scanner fields, per-CVE proof references and invalidation conditions. SHA256 `b913c7934964f13b4271d83433aa4999015013ed283b1600bff0023958215d8e`.

## Dispositions

| Engineering evidence | CVEs | Raw HIGH matches |
| --- | ---: | ---: |
| Prior-image engineering concurrence | 9 | 44 |
| Scoped proposal | 14 | 28 |
| Source fixed; raw present | 3 | 3 |
| Material open | 1 | 4 |
| Unknown applicability; open | 1 | 1 |
| Total | 28 | 80 |

Unaccounted raw HIGH findings:0. Accepted/suppressed/removed findings:0. The44 historical concurrence matches concern exact3829; they have not been relabeled as reviewed fc8 non-applicability. The28 proposal matches retain their qualified review status.

## Per-CVE coverage

| CVE | Source / package matches | Evidence status | Proof keys in JSON |
| --- | --- | --- | --- |
| CVE-2022-4055 | xdg-utils / 1 | Prior-image engineering concurrence | utilityProposal, coordinatorConcurrence, currentRuntime |
| CVE-2025-69720 | ncurses / 4 | Prior-image engineering concurrence | utilityProposal, coordinatorConcurrence, currentRuntime |
| CVE-2026-109089 | libxi / 1 | Scoped proposal | pythonX11Proposal, currentRuntime |
| CVE-2026-109090 | libxi / 1 | Scoped proposal | pythonX11Proposal, currentRuntime |
| CVE-2026-113351 | expat / 1 | Source fixed; raw present | nativeExpatSourceTests, currentRuntime |
| CVE-2026-117610 | expat / 1 | Source fixed; raw present | nativeExpatSourceTests, currentRuntime |
| CVE-2026-118370 | expat / 1 | Source fixed; raw present | nativeExpatSourceTests, currentRuntime |
| CVE-2026-119373 | sqlite3 / 1 | Unknown applicability; open | remainingSix, remainingImports |
| CVE-2026-12064 | curl / 1 | Scoped proposal | remainingSix, remainingImports, remainingPopplerSource, currentRuntime |
| CVE-2026-15308 | python3.13 / 4 | Scoped proposal | pythonX11Proposal, currentRuntime |
| CVE-2026-16742 | systemd / 2 | Scoped proposal | remainingSix, remainingImports, remainingPopplerSource, currentRuntime |
| CVE-2026-19445 | python3.13 / 4 | Scoped proposal | pythonX11Proposal, currentRuntime |
| CVE-2026-19553 | python3.13 / 4 | Scoped proposal | pythonX11Proposal, currentRuntime |
| CVE-2026-24882 | gnupg2 / 2 | Prior-image engineering concurrence | utilityProposal, coordinatorConcurrence, currentRuntime |
| CVE-2026-36849 | tiff / 1 | Scoped proposal | tiffProposal, tiffImports, tiffSource, currentRuntime |
| CVE-2026-52490 | tiff / 1 | Scoped proposal | tiffProposal, tiffImports, tiffSource, currentRuntime |
| CVE-2026-54369 | acl / 1 | Scoped proposal | remainingSix, remainingImports, remainingPopplerSource, currentRuntime |
| CVE-2026-7210 | python3.13 / 4 | Material open | currentSupervisor, currentRuntime, pythonX11Proposal |
| CVE-2026-76642 | util-linux / 8 | Prior-image engineering concurrence | utilityProposal, coordinatorConcurrence, currentRuntime |
| CVE-2026-76844 | zlib / 1 | Prior-image engineering concurrence | zlibProposal, zlibSymbols, coordinatorConcurrence |
| CVE-2026-78408 | util-linux / 8 | Prior-image engineering concurrence | utilityProposal, coordinatorConcurrence, currentRuntime |
| CVE-2026-78409 | util-linux / 8 | Prior-image engineering concurrence | utilityProposal, coordinatorConcurrence, currentRuntime |
| CVE-2026-78410 | util-linux / 8 | Prior-image engineering concurrence | utilityProposal, coordinatorConcurrence, currentRuntime |
| CVE-2026-82049 | python3.13 / 4 | Scoped proposal | pythonX11Proposal, currentRuntime |
| CVE-2026-8458 | curl / 1 | Scoped proposal | remainingSix, remainingImports, remainingPopplerSource, currentRuntime |
| CVE-2026-88806 | libx11 / 2 | Scoped proposal | pythonX11Proposal, currentRuntime |
| CVE-2026-88807 | libxrender / 1 | Scoped proposal | pythonX11Proposal, currentRuntime |
| CVE-2026-9538 | perl / 4 | Prior-image engineering concurrence | utilityProposal, coordinatorConcurrence, currentRuntime |

## Image and path qualifications

The current scan joins every HIGH record to its exact PkgID and corresponding package/source version. Its all947 package/CVE/version keys match3829 with zero additions/removals. That metadata equality does not establish identical component bytes or transitive callers. The previous125-ELF component audit remains bound to3829. Any current applicability decision must explicitly rebind the relevant components/callers or authenticated layer evidence; this matrix does not supply that missing proof.

Current source hashes independently match the historical supervisor, sandbox, Landlock and texmf configuration. The inspector differs: reviewed07b6 adds the actual per-inspection external-decoder configuration guard. The fc8 runtime receipt separately records23 groups, including direct/legacy decoder rejection before subprocess/temp work. That hardening is relevant to the bounded caller graph; it does not automatically clear older proposals or every optional backend.

The three HIGH Expat records have stronger current evidence: fc8 rechecks the exact source/test receipt, installed2.10 library hashes and actual Python mapping. The complete authenticated fix cohort also includes115506 outside this HIGH subset. Its raw distro matches remain unchanged; upstream-open66382 is a separate MEDIUM finding.

Python7210 remains materially open because the verified supervisor still parses candidate-derived bbox XML through ElementTree. The native transport/source-build proposal and maintained Python preparation are unadopted. SQLite119373 remains open with unknown full-workflow applicability: the installed native extension and query APIs exist, while the specific FTS5 route has not been excluded by a complete helper/body review. The frontend owns that review and lazy-XMP analysis; neither was duplicated here.

TIFF52490 refers to the tiffcrop CLI, while the installed match is the library. TIFF36849 refers to read/strip/tile allocation; the measured fixed graph uses Poppler TIFF writer APIs. Both remain scoped proposals with new reader/helper/codec routes as invalidators. No native PDF/image/font decoder is dismissed through unsupported LaTeX syntax or lexical screening.

The zlib raw title retains its unrelated webpack wording verbatim. The scoped proposal uses the captured zlib advisory, failed-write/error-clear/retry prerequisite and exact symbol/source evidence; raw scanner text was not rewritten.

## Checks and limits

The reconciliation asserts80 unique CVE/PkgID pairs,28 assigned CVEs, exact proposal package/version agreement, bucket totals80 and an empty unaccounted set. All23 input evidence files were hashed. Original utility/zlib review, Python/X11 proposal, remaining-six and TIFF packets are preserved unchanged. Evidence files and raw scan were rehashed after generation. No new scan, native build, browser, container, database, provider or inspected/vendor code execution occurred.

This covers HIGH only. The947 raw findings also include186 MEDIUM,670 LOW and11 UNKNOWN matches. OpenJPEG39327 is LOW with a material decoder route; Expat66382 is MEDIUM with a non-public/unfixed trigger. They remain outside this80-match table and open in the broader work. The first native-Poppler build stopped at its existing APT plan guard before source compilation and supplies no fix/adoption evidence. GateAA7 remains open.
