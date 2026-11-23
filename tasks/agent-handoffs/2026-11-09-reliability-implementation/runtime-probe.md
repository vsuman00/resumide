# R12 local OCI probe base: materializer source packet

Updated 2026-11-09. This child owns only `scripts/latex-runtime/prepare-oci-probe.py`, `tests/unit/latex-probe-base.test.ts` and this handoff in the runtime worktree. R12(b) wrapper/recipe/fixture files remain frozen. Scope is preparation of one local OCI base for a later cancellation probe; no public materialization, new export, Docker operation, network request, provider call, database operation, dependency, deployment or publication ran here.

## Closed input and identity contract

The helper accepts the reviewed Docker export, its original export receipt and its derivation receipt. It verifies all three hashes before trusting their metadata. The CLI cannot replace the production policy or caps; synthetic tests inject small policies directly into the Python functions.

- Archive: `/private/tmp/resumide-ocr-local-export-cbwzvgnp/image.tar`, **96254464 bytes**, SHA-256 `137b0b6b0f6aa97485f0abcc7a514aa2935e9d44660071887f633f005639499d`.
- Original image descriptor: OCI **index** `sha256:ab1d5c0fab7533a23584bd533df8459fdf2090fb27fbabe3355bbc7fb750b58c`, 856 bytes, observed unchanged before/after the original local export.
- Derived selected Linux/arm64 manifest: `sha256:92d09e80a88e72d1dde96543b80c67a3b29ba1bbf9b18bb04e87c0b2e234a03f`, 1808 bytes.
- Derived config: `sha256:b6d5c39fd0b861309ea4c6ec09900b10cc4e0d1b24399814b6dd094a39c06dcc`, 3922 bytes.
- `export-receipt.json`: SHA-256 `b1d18a76310fcdf48d71ce4148b9e7b3fcec490404bf4fa2dd69ac8add879e5b`.
- `derivation-inspection.json`: SHA-256 `1f258405e1be4db0392add3e13fd22ab12d66831c0a76d4609bb212fed49e910`.

The policy binds every root metadata file, nine unique blob files and eight ordered layer/diff-ID entries. The last empty layer repeats, so seven unique layer blobs is correct. It preserves the original index versus derived manifest/config distinction. The prior receipt supplies the exact daemon RootFS/runtime comparisons; the helper checks that immutable receipt and rehashes every decoded layer. It makes no new claim about current daemon state, attestations, OCR quality or OS vulnerabilities.

## Validation, publication and failure behavior

Verification is the default and creates no layout. Materialization needs explicit `--materialize`, a new empty owner-controlled 0700 output directory and the exact operation fingerprint. That fingerprint binds helper bytes, policy, receipts and limits.

Inputs must be owner-controlled, read-only regular files. Pre-open type checks plus `O_NOFOLLOW | O_NONBLOCK` and descriptor checks reject symlink/FIFO substitution. The whole operation has a 45-second software deadline, with no retries. Arguments are exact, with no abbreviations, duplicates or raw argument/error echo.

The complete outer archive is checked before any transaction output is created. Duplicate/canonical-alias/traversal names, PAX extensions, links, special/nonstandard regular types, unknown root files/blobs, missing members, changed sizes/hashes, external descriptor URLs/data and incomplete blob closure fail. JSON keys must be unique. Platform, manifest/config media types, layer order and diff-IDs must match the closed policy. Gzip layer streams are hashed without unpacking the image filesystem.

Limits:

| Boundary                                                |          Cap |
| ------------------------------------------------------- | -----------: |
| Physical archive and aggregate regular-member bytes     | 128 MiB each |
| One regular member                                      |       64 MiB |
| JSON/receipt metadata                                   |       64 KiB |
| Outer archive entries                                   |           64 |
| Aggregate decoded layer bytes, counting repeated layers |      512 MiB |
| Whole-operation software deadline                       |   45 seconds |
| Free-space reserve during copying                       |       64 MiB |

The known input decodes to **261908992 bytes**. The helper checks space for all copied files plus the reserve before creating its private transaction directory. It copies only `oci-layout`, `index.json` and the nine exact blobs; the optional Docker `manifest.json` is validated but omitted from the output. No generic `extractall` or image-layer extraction is used. This is a deliberately closed probe subset of the [OCI layout format](https://github.com/opencontainers/image-spec/blob/main/image-layout.md), which permits additional files in general.

Files are written exclusively, hashed again, fsynced and made 0444. Final staged admission checks the exact file set, file bytes/inodes and directory identities. Directories become 0555. One rename publishes `layout` inside a fresh private transaction directory; the sibling receipt records verified inputs. The returned result confirms publication and always has `runtimeAccepted:false`. The original archive/receipts remain untouched.

On failure, cleanup removes only recorded owned file/directory identities. An unexpected entry or replacement is preserved and reported as `cleanup_unknown`; the helper does not claim cleanup or publish the layout. No global cleanup, Docker import/tag, registry lookup or fallback is present. A later probe must independently verify the resulting layout before passing it as a local OCI context.

## Test evidence

All tests use small neutral synthetic archives and exact temporary cleanup. They do not read or materialize the public OCR archive.

- Initial red: 26 missing-helper failures.
- First green: 26 cases, after adjusting the two archive-tampering fixtures to alter actual bytes instead of changing the expected policy and failing at the earlier receipt gate.
- Three additional reds reproduced nonstandard contiguous-file acceptance and ambiguous/duplicate CLI arguments. The source now rejects them before output.
- Two final-admission reds reproduced publication of an untracked staged file and a replaced output inode. Another red reproduced a changed directory identity with otherwise unchanged file bytes/inodes. All now fail conservatively, preserve unowned replacements and avoid publication.
- Final **37/37 focused tests pass**. Scoped ESLint/Prettier, Python AST parsing and Node22 typecheck pass. No unchanged full application suite was repeated.
- Test-harness string quoting was corrected during development; no production assertion, cap, pin, native test or accepted E-010 disposition changed.

Current focused commands:

```bash
RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic npm test -- tests/unit/latex-probe-base.test.ts
npx eslint tests/unit/latex-probe-base.test.ts
npx prettier --check tests/unit/latex-probe-base.test.ts
npm run typecheck
```

Use the coordinator's Node22 PATH and sealed private mode for all repository checks. Python syntax inspection uses AST parsing without bytecode output.

## Proposed materialization packet, not executed

Helper SHA-256: `edba68d12154409b65af496b7a7af7bc011aeec7f3246dafd7041e6ff86ef307`.
Operation fingerprint: `9118070f3683f9de94c7eaf49ec7433aed928a344e30e375644c10f798144eae`.
Expected logical layout hash: `48df7e5874dadfb3f9b226e03fbf5c4b182a0da106248b3a3319d6f46dd780f1`, covering the eleven exact regular-file names/content hashes. This hash excludes timestamps; files/directories are separately checked for ownership/type/read-only mode.

After source and exact-input review, the proposed one operation creates the following new private output parent and runs the helper once from ROOT. If the parent exists or is occupied, stop and review; never clear or reuse it blindly.

```bash
mkdir -m 700 /private/tmp/resumide-oci-probe-layout-20261109-runtime
python3 -I -B scripts/latex-runtime/prepare-oci-probe.py \
  --archive /private/tmp/resumide-ocr-local-export-cbwzvgnp/image.tar \
  --export-receipt /private/tmp/resumide-ocr-local-export-cbwzvgnp/export-receipt.json \
  --derivation-receipt /private/tmp/resumide-ocr-local-export-cbwzvgnp/derivation-inspection.json \
  --materialize \
  --output-dir /private/tmp/resumide-oci-probe-layout-20261109-runtime \
  --approved 9118070f3683f9de94c7eaf49ec7433aed928a344e30e375644c10f798144eae
```

The fingerprint above was computed from source/policy metadata only; the helper has not been run on the real archive. Materialization itself repeats full archive/receipt/blob/diff-ID verification, so a separate duplicate public verify is unnecessary unless review identifies a specific reason. Preserve a first concrete failure and do not retry or alter pins automatically.

Review the returned relative layout path, exact eleven-file closure, ownership/modes, logical hash and receipt before a separately allocated cancellation probe. This child does not allocate that probe or the heavy compiler build. Compiler source/resource/image admission, actual compile/confinement/PDF parity and advisory disposition remain open. Root owns integration, shared plans/CONTEXT and any package/runbook update.
