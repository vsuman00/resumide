# AA7 paperfix-candidate full security: OPEN

Exact candidate: `sha256:8f7cbabfb247412220b1fa3b27aa9dff8e8c7c316173c0edad6b7690ce082fb8`. The private scan completed with exit 1 because 978 findings remain. Runtime, artifact and source-binding validation are separate tester/coordinator work and are not supplied by this scan.

| Image         | Critical | High | Medium | Low | Unknown | Total |
| ------------- | -------: | ---: | -----: | --: | ------: | ----: |
| Baseline 19d2 |        3 |   70 |    206 | 667 |      12 |   958 |
| Paperfix 8f7c |        0 |   89 |    192 | 686 |      11 |   978 |

Fresh raw package joins prove the candidate's full installed inventory and every normalized finding equal the failed 4ea4 inventory. It has 354 unique CVE IDs, 355 source/CVE pairs and 51 affected source groups. The closure repair does not claim package vulnerability remediation. Every high match and all 978 normalized matches remain in the comparison JSON; complete raw Trivy output is separate.

The exact same Trivy 0.76.2 and actual main/Java database files were used. Both DB hashes match before and after. Baseline 19d2 raw evidence was reused only after its durable hash and unchanged actual DB hashes were verified. Paperfix identity was independently bound through the requested Docker29 index, selected arm64 manifest, config, every compressed layer blob and every uncompressed rootfs diff ID. Local inspect, both archive forms and Trivy config/DiffIDs match. Enforced network denial passed EPERM. The scanner used a cleared environment, all-severity options, no ignore filters, unfixed/unknown records included, and all updates/telemetry/version checks off. No container was run or image/SBOM/source uploaded.

The [complete source actionability matrix](AA7_FULL_SECURITY_ACTIONABILITY_20261106.md) applies to the verified unchanged inventory: 145 source/CVE pairs across 26 groups have vendor-fixed source versions outside Trixie; nine vendor-ignored and ten postponed pairs overlap availability. Nine upstream fixes were independently confirmed. The other 346 upstream states remain unverified, and 210 pairs lack an established outside-Trixie fixed version. None is a risk waiver or proof that all remaining fixes are impossible. Exact vendor notes and specific upstream-pending examples remain preserved.

The 9890 report is historical; 22cb and 4ea4 are failed runtime candidates reported by the coordinator. All old image/raw/provenance files remain separate. No functional-pass claim transfers from them to 8f7c.

Evidence: [paperfix raw scan](AA7_FULL_SECURITY_PAPERFIX_RAW_20261106.json), [complete identity, commands, deltas and findings](AA7_FULL_SECURITY_PAPERFIX_COMPARE_20261106.json), [baseline raw scan](AA7_FULL_SECURITY_BASELINE_RAW_20261106.json). The exact task-owned cache/archives remain retained pending tests, source binding and coordinator review; no process is running. Full vulnerability remediation and phase security acceptance remain OPEN.

## Scanner cleanup completed

After coordinator review, only the exact task-owned `0700` scanner directory was removed. Directory and canonical-path absence were verified. All six worker image IDs, all five complete raw reports, historical failures and primary actionability evidence remain. The earlier retained-cache paragraph describes the scan-time state; current cleanup proof and the full temporary artifact hash manifest are in [the cleanup receipt](AA7_FULL_SECURITY_CLEANUP_20261106.json). No image/cache prune or unrelated temporary cleanup occurred. Functional evidence remains separately owned by the coordinator/tester; vulnerability remediation remains OPEN.
