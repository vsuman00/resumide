# R18: scanner metadata and trust admission

2026-11-09. **SOURCE-ONLY PROPOSAL; no transfer or signature verification executed.** Exclusive scope: this handoff. ROOT owns integration and operation allocations. No scanner, catalog, new tool, configured credential or Docker operation follows from this packet.

Current compiler `sha256:5e5c2436bcac0a97c4616d7392d1089ecf7ef7d6d5df9063c02e4498d1e0d431` has an admitted local inventory and bounded synthetic functional evidence. Its advisories remain **UNKNOWN**. The old 947/80-high/zero-critical counts concern the November 7 image; they cannot be reused. Root's current npm audit reports zero known advisories in 554 dependencies, separately from worker-image scanning. R14 repair checks may proceed under master section 5 while R18 remains open. No public-input suitability, release or flag promotion is supplied.

## Fixed vendor and verifier policy

[Aqua's incident advisory](https://github.com/aquasecurity/trivy/security/advisories/GHSA-69fq-xp46-6x23) excludes compromised release/action paths; it does not establish compromise of this machine. The proposed scanner is the fixed [v0.76.2 release](https://github.com/aquasecurity/trivy/releases/tag/v0.76.2), not a mutable latest tag or installation script. Its [published assets](https://github.com/aquasecurity/trivy/releases/expanded_assets/v0.76.2) provide research pins. Hash matching alone does not authenticate a signer.

The expected certificate identity comes from [Aqua's verification policy](https://trivy.dev/docs/latest/getting-started/signature-verification/), independently of any fetched bundle:

```text
identity: https://github.com/aquasecurity/trivy/.github/workflows/reusable-release.yaml@refs/tags/v0.76.2
OIDC issuer: https://token.actions.githubusercontent.com
subjectAlternativeName regex: ^https://github\.com/aquasecurity/trivy/\.github/workflows/reusable-release\.yaml@refs/tags/v0\.76\.2$
```

The installed verifier treats the SAN policy as a regex; preserve the anchors and escaped dots. Require the exact issuer extension as well. Reject a public-key-hint fallback, absent certificate identity, unexpected content kind/algorithm, or missing signature/log/timestamp evidence. Do not select expected identity, trusted roots or verification thresholds from the bundle. Keep `ctlogThreshold`, `tlogThreshold` and `timestampThreshold` at one or stricter; a compatibility failure is not permission to lower them.

The release page's earlier short commit `3f6334d` is insufficient as immutable workflow-source provenance. The complete release commit, exact reusable workflow bytes and referenced signing step are not admitted yet. Resolve and hash those from the official repository in a separately bounded source-metadata step before scanner execution. A verified workflow certificate authenticates the declared signer/content; it is not a claim that the scanner is harmless.

The existing GH 2.100.0 anonymous `release verify v0.76.2` method returned exit 4, authentication required, before download. Preserve [that failed receipt](r18-release-verification.json). Do not retry unchanged, read configured tokens or substitute global GH configuration. This packet proposes an existing-library alternative, not a new verifier installation.

## Installed source admission, no module execution

Read-only inspection found these npm-vendored packages under `/opt/homebrew/lib/node_modules/npm/node_modules`. Fingerprints bind the inspected local bytes; they do not independently authenticate their distribution or clear all dependency advisories.

| Package                    | Version | Package-tree SHA-256                                               |
| -------------------------- | ------- | ------------------------------------------------------------------ |
| `@sigstore/verify`         | 3.1.1   | `9313bf698c578a41e112df90a89e9504f7c32b81fce83b0fd50ebeb6781cd152` |
| `@sigstore/bundle`         | 4.0.0   | `f3bd88e8531c61f4e3ff5cb0c6e839f55b980a44c85f0910555e9357b54c73fc` |
| `@sigstore/core`           | 3.2.1   | `72cd95bd94508d39890d832086d08fd6c598b19d29fd5ade03b26ff0e0a13269` |
| `@sigstore/protobuf-specs` | 0.5.1   | `be54d80879f4f250a07a58210b2fa3767dc53d049c430f51bb6ac376a1874c6b` |
| `@sigstore/tuf`            | 4.0.2   | `cfefa4b0ee091986b052601fb148d42b14cb287c0459feb54e63026edd3b0d28` |
| `tuf-js`                   | 4.1.0   | `573a4f4bc1d919b5b8995b75ae21c42ad1548382bb3b7c33082ad085852216fe` |
| `@tufjs/models`            | 4.1.0   | `858c5082a098cabede38986b0d34ab49a76934ffc48d6718ca2819f9a79dbf24` |
| `@tufjs/canonical-json`    | 2.0.0   | `b0ce9449454decfb3756ba9a45af2c0cde0812f4c411014c27d70ec3052af864` |

Tree algorithm: recursively hash regular files, excluding nested `node_modules`; reject symlinks. Hash sorted compact JSON mapping relative POSIX paths to file SHA-256. The recursively resolved offline verification graph is four packages/76 files/384,101 bytes, SHA-256 `4aa1a148af6f98eca3ade08451720f0480f52608470209d3896caac862521d3f`. The separate TUF refresh graph is 42 packages/380 files/2,292,503 bytes, SHA-256 `ff462ce6d9220f6f686e6dcc213dd21119607caf5da54d162d755dd6a920a449`. Graph hashing includes each resolved absolute package path, name, version, relative file map and byte count in sorted compact JSON. Renew these exact inventories before any execution; changed resolution fails admission.

Selected official advisories were checked: [verify timestamp binding](https://github.com/sigstore/sigstore-js/security/advisories/GHSA-xgjw-pm74-86q4) is fixed in installed 3.1.1; [core DSSE PAE](https://github.com/sigstore/sigstore-js/security/advisories/GHSA-jfc7-64v2-mr8c) in installed 3.2.1; and [high-level OID enforcement](https://github.com/sigstore/sigstore-js/security/advisories/GHSA-52v5-jr5w-gjxr) in installed sigstore 4.1.1. The proposed low-level graph avoids high-level signing/OCI upload code. This selected review is not a complete advisory scan of those graphs.

Proposed offline API, after artifact and trust admission: `bundleFromJSON`, then `toSignedEntity(bundle, exactArchiveBytes)`, then official `Verifier(toTrustMaterial(admittedTrustedRoot), thresholds).verify(entity, fixedPolicy)`. The installed message-signature implementation checks the actual artifact bytes through the maintained library; no homegrown signature verification is proposed. Check the fetched bundle's actual media type/content first: supported parser code does not prove that this Aqua asset uses `messageSignature` rather than DSSE. Do not call high-level `sigstore.verify/createVerifier` for an offline guarantee: it imports broader code and refreshes TUF automatically. `forceCache` can fall back to the network on expired/missing metadata.

## First proposed allocation: bundle metadata only

This is the smallest next operation. **No allocation or executable fetcher exists yet.** Root must review the exact small transport source/hash before granting the one chain; preparation of this document is not permission to execute it.

| Field            | Fixed proposal                                                                                                                                                                                                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URL              | `https://github.com/aquasecurity/trivy/releases/download/v0.76.2/trivy_0.76.2_macOS-ARM64.tar.gz.sigstore.json`                                                                                                                                                                        |
| Expected SHA-256 | `82014df63f12ffe65bf49c6fd844d7fe39efa7e7abdc12bfe1f5a69682a56747`                                                                                                                                                                                                                     |
| Bound            | One transfer chain; 65,536 bytes maximum, reject byte 65,537; 30 s overall, 10 s per operation; at most three HTTPS redirects; zero automatic retries                                                                                                                                  |
| Transport        | Initial exact GitHub repository asset path; redirects only to reviewed `release-assets.githubusercontent.com` or `objects.githubusercontent.com`; HTTPS/default port; no credentials, cookies, proxy, downgrade or other host; signed redirect queries never retained in logs/receipts |
| Files            | New absent-to-created owned 0700 `/private/tmp/resumide-r18-bundle-metadata-20261109`; one regular nonsymlink 0444 bundle plus 0600 metadata receipt; exclusive nofollow writes and bounded descriptor reads                                                                           |
| Runtime          | Existing Python 3.14 SHA-256 `4f00ea2ad53d62437a6a3946b73c73614a97e8accdc5b96dc095ea1a0d9c6a56`; original HOME preserved; sealed environment; no subprocess/tool/provider/DB/Docker access                                                                                             |
| Receipt          | URL without signed redirect queries, expected/actual bytes/hash, elapsed time, redirect count and `networkAttempts: one transport chain`; no claim of a single HTTP exchange                                                                                                           |

Validate size/hash before bounded JSON parsing. Report only media type, content kind/digest algorithm, proof/certificate field presence and bounded shape counts. Raw public bundle bytes may stay in that private cache; do not publish certificate or signed-URL data in the handoff. A shape match is not signature/trust acceptance. Stop on the first failure and preserve its receipt; do not broaden hosts, bytes or format expectations automatically. No scanner archive, checksums asset, TUF refresh, crypto verification or catalog download is included.

## Current trust recovery: a later separate allocation

The installed `@sigstore/tuf/seeds.json` is SHA-256 `1300a33af16967e998983b364ab9988cd5c20e94c44e75d642dbeda1dbc255d9`. Its decoded root 14 is 5,490 bytes/SHA-256 `c8c41ec13f06ccabf5b48541ee2550098b4c7b5349e1d180390c29a7d5c2642c`, root threshold 3/5, expiry **2026-06-22T13:27:01Z**. Its bundled `trusted_root.json` is 6,787 bytes/SHA-256 `6494e21ea73fa7ee769f85f57d5a3e6a08725eae1e38c755fc3517c9e6bc0b66`. These bytes are not a current authenticated trust result.

Installed `tuf-js` explicitly permits an expired initial root as a bootstrap anchor. Each next root must advance exactly one version and pass both the previous delegation and new self-signature. Timestamp processing rejects an expired final root; timestamp/snapshot/targets expiry, version, hash and delegation checks remain enabled. Use this official rotation path, not an expiry bypass, clock change, bundle-supplied root or unauthenticated replacement anchor. Root must explicitly admit the inspected local seed/toolchain as the bootstrap source before this operation; that admission cannot be inferred from this inventory.

Propose a later fresh private cache using exact `https://tuf-repo-cdn.sigstore.dev`, no redirects/auth/proxy, zero retries, real current time and original HOME unchanged. Direct official `tuf-js.Updater` permits bounded configuration that the high-level wrapper does not fully expose. Candidate limits for review: eight root rotations, four delegations; root 64 KiB, timestamp 16 KiB, snapshot 128 KiB, targets 256 KiB, trust target 64 KiB; 16 HTTP requests/2 MiB aggregate; 60 s overall/5 s per operation. A small transport must enforce host, count, aggregate and streaming body limits; default library fetch options alone do not prove them. If eight consecutive next roots consume the rotation cap, stop before target admission rather than assume the final observed root is current. No automatic cap increase.

The future receipt must bind all accepted root versions/thresholds/hashes, final expiry, timestamp/snapshot/targets versions/hashes/expiry, exact authenticated `trusted_root.json` target hash/length and the library/runtime graphs. Freeze that cache, then run the low-level artifact verifier under actual network denial with the exact fixed vendor policy. No current root version or successful rotation is invented here. Signature failure, stale trust or unsupported bundle format stops scanner admission; no hash-only or GH-token fallback.

## Boundaries after metadata and trust

Only after separate archive/checksums transfer and successful signature/provenance admission may the scanner binary be safely extracted, hashed and run. Later vulnerability-catalog admission needs the actual manifest/layer sizes and digest, schema/update/expiry and strict transfer/extraction bounds. The old 1 GiB decoded proposal is withdrawn: the historical main catalog was already 1,686,421,504 decoded bytes. Derive a realistic cap against current metadata, image-export/scratch budgets and the unchanged 8 GiB disk floor; do not increase it blindly or claim `--download-db-only` enforces transport limits.

Current-image scan/SBOM and advisory disposition remain unrun. Preserve every severity, unfixed/suppressed finding, custom native package mapping, vendor applicability and residual-risk decision. E-010 remains the narrow Poppler vendor 70/71 result/56 Qt summaries; it supplies no new vendor rerun or advisory waiver. Neither a successful download nor a zero scanner collection exit closes R18, G01/G03 or release approval.

Preparation checks for this handoff are limited to local source inspection, prose/Markdown/whitespace checks and its final hash. No package installation, module import, signature operation, public fetch, scanner/catalog execution, Docker, DB, provider, Git or deployment occurred.
