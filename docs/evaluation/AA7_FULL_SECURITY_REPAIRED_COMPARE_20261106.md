# AA7 repaired-candidate full security: OPEN

Exact repaired worker: `sha256:4ea4aabf22823a6d76f6de957a8cead659494ae06fd09995dc81e9d2cda977b1`. The private full-severity scan completed with exit1 because978 findings remain. Runtime/artifact validation is owned by the tester and is not supplied by this scan.

| Image        | Critical | High | Medium | Low | Unknown | Total |
| ------------ | -------: | ---: | -----: | --: | ------: | ----: |
| Baseline19d2 |        3 |   70 |    206 | 667 |      12 |   958 |
| Repaired4ea4 |        0 |   89 |    192 | 686 |      11 |   978 |

The repaired image has354 unique CVE IDs across51 source groups and355 source/CVE pairs. Fresh raw package joins verify its complete installed inventory and every normalized finding equal the historical22cb inventory. The closure repair supplies no package-CVE remediation claim. All89 high matches and all978 normalized matches remain in the comparison JSON, with complete raw Trivy evidence separate.

Trivy0.76.2, the same actual main/Java DB files and identical all-severity options were used. Both database hashes match before and after. Baseline raw evidence was reused only after its durable hash and unchanged DB hashes were verified. For4ea4, the requested Docker29 index, selected arm64 manifest, config, every compressed layer blob and every uncompressed rootfs diffID were independently hashed. Local inspect, both archive forms and Trivy config/DiffIDs match. Enforced network denial passed EPERM; scan used a cleared environment, no telemetry/version/update calls, no ignore filters and included unfixed/unknown findings. No container was run or image/SBOM/source uploaded.

The [51-source actionability matrix](AA7_FULL_SECURITY_ACTIONABILITY_20261106.md) applies to this unchanged package/finding inventory.145 source/CVE pairs across26 groups have a vendor fixed source version outsideTrixie; nine vendor-ignored and ten postponed pairs are overlapping dispositions. Nine upstream fixes were independently confirmed;346 other upstream states remain unverified, and210 pairs lack an established outsideTrixie fixed version. None of those fields is a risk waiver or a claim that all remaining fixes are impossible. Concrete upstream-pending examples and exact primary vendor records remain preserved.

The [9890 report](AA7_FULL_SECURITY_IMAGE_COMPARE_20261106.json) is historical. The [22cb report](AA7_FULL_SECURITY_FINAL_COMPARE_20261106.json) explicitly retains its coordinator-reported failed runtime macro fixture. Those candidates and raw receipts remain separate and unchanged. No functional-pass claim transfers to4ea4 from either image.

Evidence: [repaired raw scan](AA7_FULL_SECURITY_REPAIRED_RAW_20261106.json), [complete identity/commands/deltas/findings](AA7_FULL_SECURITY_REPAIRED_COMPARE_20261106.json), [baseline raw scan](AA7_FULL_SECURITY_BASELINE_RAW_20261106.json). The exact task-owned cache/archives remain retained for coordinator review, with no process running. Full vulnerability remediation and phase security acceptance remainOPEN.
