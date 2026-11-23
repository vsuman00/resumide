# AA7 Python3.13 source and test proposal

Status: SOURCE AUDIT COMPLETE; proposal only. No builder code, compilation, tests, container, installation, provider or database action occurred. Source copies were patched only to check applicability; no downloaded Python code was executed. Scanner cache remains retained and idle.

Image38292747 has four packages from source python3.13: `libpython3.13-minimal`, `libpython3.13-stdlib`, `python3.13` and `python3.13-minimal`, all `3.13.5-2+deb13u5`. They account for80 raw matches:20 HIGH,40 MEDIUM,16 LOW and4 UNKNOWN. Five HIGH CVEs repeat across four packages. [The receipt](2026-11-06-aa7-native-python.json) preserves all80 raw entries.

## Recommended finite repair

Rebuild maintained upstream3.13.18 natively with reconciled Trixie packaging. Proposed honest local version: `3.13.18-1~deb13u5+resumide1`, subject to coordinator review. Keep the four packages coherent, preserving python3-defaults, interpreter paths, binary definitions and dependency checks. No SID binaries.

| CVE | Repair and verified primary references |
| --- | --- |
| CVE-2026-15308 | Incremental HTML buffering; [Debian](https://security-tracker.debian.org/tracker/CVE-2026-15308), [3.13.15 commit7933f4bf](https://github.com/python/cpython/commit/7933f4bf7131aa4140750f9404f5de0aa2969ced) |
| CVE-2026-19445 | SNI callback/context lifetime; [Debian](https://security-tracker.debian.org/tracker/CVE-2026-19445), [3.13.16 commitd8717ed0](https://github.com/python/cpython/commit/d8717ed01717a9641686e6e6f83f0ab8af235e2c) |
| CVE-2026-19553 | Checked SSLObject/BIO hostname validation; [Debian](https://security-tracker.debian.org/tracker/CVE-2026-19553), [3.13.16 commitf4e43ba5](https://github.com/python/cpython/commit/f4e43ba525187282f2011da0e6ffc0d2b08d8062) |
| CVE-2026-7210 | Complete five-file hash-secret/capsule/pyexpat/ElementTree change; [Debian](https://security-tracker.debian.org/tracker/CVE-2026-7210), [3.13.14 commitfc9b11ff](https://github.com/python/cpython/commit/fc9b11ff49cbc82e6f917d07a61517a2b5f3145f) |
| CVE-2026-82049 | Resolve filtered tar hard-link targets; [Debian](https://security-tracker.debian.org/tracker/CVE-2026-82049), [3.13 commitb8f23e30](https://github.com/python/cpython/commit/b8f23e307097552eaea2604383a12ab280520d0d) |

All62 original Trixie patches apply with zero fuzz on the owned3.13.5 fixture. All26 maintained patches apply with zero fuzz on owned3.13.18. None of the five complete upstream fixes applies mechanically to fully patched3.13.5 without adaptation. Failed contexts are preserved: Expat capsule header, HTML buffering, SSL documentation, tar implementation and one SSL test hunk. No partial patch is called ready.

The proposal changes exactly22 packaging files, enumerated in JSON: local changelog; control/control.in adding `uuid-dev` while retaining original dependencies; two required source adapters (`imp.py` uses `_ERR_MSG_PREFIX`; `pymindeps.py` records the `_sitebuiltins` to `_pyrepl` dependency); the26-entry maintained series;15 refreshed common patches; and the replacement min-pyrepl patch. Preserve original Trixie rules, copyright, binary definitions and Debian tests byte-for-byte. Do not import maintained autopkgtest changes that remove assertions, require setuptools80 or add mount.

The maintained series drops37 original entries. Twenty original patches reverse-apply exactly on pristine3.13.18; names/hashes are recorded. Seventeen do not reverse as whole patches after intervening changes; this does not prove their fixes present or absent. Retain their original bytes and failed checks. The authenticated maintained series supplies the proposed vendor reconciliation; do not label all37 individually proven upstreamed.

## Authentication and Expat

The exact active `3.13.18-1` stanza was extracted from retained November6 signed SID Sources. Index hash and signed-release membership were rechecked; prior coordinator-verified signature provenance was reused, with no new signature execution. Dsc SHA256: `b6ba67e05744b11615fb41390ef13aa1ca3035a5425909bcde46e053f4d77892`. Orig SHA256 `abb0102e6d4ae027509bcb82327d9dd85515b44a3ba8ad538cfc5e9847029f68` matches the active stanza and [Python.org](https://www.python.org/downloads/release/python-31318/). Maintained Debian archive SHA256: `8f12d82b3cedd95970133622a48a3c3309a3ce8560e5c026d3438d3aecc8ef8b`.

Baselineu5 dsc/orig/packaging were fetched and hash-checked. No Python stanza exists in the security index: authenticate the baseline dsc against dated signed Trixie main Sources before building. Reverify all archive signatures and hashes inside the future builder; TLS alone is not that gate.

Build against existing native Expat2.10 headers and runtime. Dev package SHA256: `f94f6b0b96a3cee10975e77b11f32481991622e9d87bd5ce68305c2501613e60`; runtime package SHA256: `0c53ef566bfed58944391fb9ac7201c5cc9c0674f4e4c0501fe6863c22671224`. Bind both to their existing source/test receipt. Runtime upgrade alone does not fix CVE-2026-7210: rebuilt built-in pyexpat and coordinated ElementTree/capsule code must use the16-byte API. Use system Expat2.10; upstream's bundled2.9 does not include the later Expat repairs.

Both source archives fit unchanged generic limits:5214/5275 members and106/110MB, below10000 members and160MiB. No generic helper bound change is needed.

## Mandatory verification

Original Debian rules exclude SSL/asyncio and ignore ordinary upstream test-command failures through leading make `-` and an `echo DONE` wrapper. **dpkg exit0 does not mean tests passed.** Preserve those rules/exclusions and every debug/static/shared `test_results`; independently parse actual executed counts, failures, errors and skips.

Run affected modules and new security methods as separate fatal commands: HTMLParser with CPU resource explicitly enabled; SSL and asyncio SSLProtocol; tarfile; pyexpat; pure and accelerated ElementTree. Require actual nonzero execution and no silent skip of the new methods. HTML's CPU regression otherwise skips. Use private neutral tar fixtures and local MemoryBIO SSL tests without external network. No original test assertion or exclusion is removed.

Compile old3.13.5-header extension/capsule clients before replacement, then run baseline and fresh candidate. Check exports, extension loading and module/stdlib parity. In a fresh installed interpreter, verify Expat2.10, mapped library/hash and `XML_SetHashSalt16Bytes` binding. Replacing only Expat or one extension is insufficient.

Require offline APT to install exactly the four packages without removals or force flags, followed by full worker/PDF/font/geometry/render/browser/rollback/license checks and an unsuppressed scan of the approved immutable image.

Retained open/compatibility records include CVE-2025-12781, CVE-2025-15366, CVE-2025-15367, CVE-2026-116566, CVE-2026-12003 and CVE-2026-3479. This proposal does not waive them or claim every Python CVE resolved. Preserve real source repair and raw Debian scanner classifications separately.

Public archives, extracted trees and detailed applicability logs remain in the isolated frontend worktree proposal directory; they were not copied into the coordinator checkout. This is a source/test proposal, not an adopted runtime repair.
