# AA7 current worker license inventory

Status: metadata verified; legal interpretation and release acceptance remain open. The read-only audit returned exit0 on exact Linuxarm64 image `sha256:382927476a7d5b500351835b57cdf9006a2e229e431b7bfd734c19425be472bc`, independently inspected as UID65532. The full [JSON inventory](AA7_FINAL_NATIVE_LICENSES_20261106.json) SHA256 is `d4beede47dc0ee28ea0828601f7a8d45627806bf0715a9a721aecc3aac5db067`.

| Evidence | Result |
| --- | --- |
| Installed Debian packages |216; all versions match packages.lock |
| Recognized DEP5 declarations |159 |
| Explicit non-DEP5 declarations |57; retained for interpretation, not treated as missing copyright files |
| Common-license files hashed |26 |
| Vendored parser |pypdf6.21.4 declares BSD-3-Clause; metadata/license hashes match the locked installation |
| Metadata read |4,290,267 bytes; bounded reader and2MiB output cap retained |
| Actual audit and exact cleanup |Exit0,270.302ms; owned audit container absent |

Compared with the preserved222-package paperfix inventory, exactly `dirmngr`, `gnupg`, `gnupg-l10n`, `gpg-agent`, `gpgsm` and `mount` are removed. No package is added. The only retained package version change is native `libexpat1` from2.9.0-1~deb13u1 to2.10.0-1~deb13u1+resumide1; its installed MIT declaration and copyright hash are unchanged. The JSON binds the exact native package, signed-source inputs, Debian/upstream copyright hashes, source comparisons, ABI checks and both upstream test modes through the3829 metadata receipt. Source/security provenance does not establish legal approval or resolve the separately retained Expat CVE.

Execution reused the existing standard-library auditor through bounded stdin. The worker had no network, host mounts, forwarded environment, ports or credentials; root filesystem was read-only, UID65532, capabilities dropped, no-new-privileges, one CPU,128MiB memory/swap,32 PIDs and fixed CPU/file/descriptor limits. No TeX job, scanner, build, database, provider or application source change ran. Only the exact owned audit container was considered for cleanup; its absence was independently checked. Historical inventories remain unchanged.

This inventory records package declarations and hashes. It does not infer SPDX labels from unstructured prose, interpret every bundled TeX/font file, or grant security, accessibility, license or release acceptance. All57 unresolved declarations remain in the JSON.
