# R14-S03: current candidate semantic and render checks

2026-11-09. **IMPLEMENTED / author offline checks passed; actual render unrun.** Exclusive files: new `scripts/verify-latex-current-render.ts`, `tests/unit/latex-current-render.test.ts` and this handoff. Root remains coordinator. No shared package/config, legacy paired-render tool, compiler's 66 inputs, frozen 77 operation inputs or private runner artifacts changed.

Root's preceding evidence remains separate: current image `sha256:5e5c2436bcac0a97c4616d7392d1089ecf7ef7d6d5df9063c02e4498d1e0d431` passed 28 runtime groups, six profiles and rollback. The original five-stage run keeps its failure because the license driver was outside Vite's allowed root. The one causal license-only run then passed in 1,453 ms with exact cleanup and unchanged old receipts/prefix. Its 216 package declarations and 57 unresolved metadata entries provide no legal/security approval. This source slice repeats none of those runtime stages.

## Implemented behavior

The new tool accepts exactly one immutable image and an explicitly supplied fresh private output directory. It compiles only `SYNTHETIC_LATEX`, parses that two-page PDF with the existing maintained parser, and checks ordered neutral text, replacement glyph absence, NFKC math recovery (`a2+b2=c2`, `α∈R`), the exact public fixture link and A4 page dimensions within the existing two-point tolerance. Untagged pages are reported rather than relabelled accessible.

One subsequent container runs the fixed `pdffonts`/`pdftoppm` probe copied byte-for-byte from the historical tool. Fonts must be present and embedded; subset/Unicode-map flags are recorded without inventing an all-Unicode-map claim. Both 96 dpi PNGs must have canonical bounded base64, PNG signature/IHDR/IEND envelopes, positive dimensions at most 1,600 pixels and the existing under-two-pixel relationship to PDF page size. Each PNG is at most 2 MiB; PDF/page bounds stay 5 MiB/ten maximum, with this fixture specifically requiring two pages. PNG envelope validation is not an independent full PNG decoder verdict.

The output directory must be canonical under the system's resolved `/tmp`, named `resumide-latex-current-render-<UUID>`, initially empty, nonsymlink, current-user-owned and mode 0700. Its device/inode/permissions are rechecked before host writes. Only `current-page-1.png`, `current-page-2.png` and `current-render.json` are created with exclusive/nofollow opens and mode 0600; no PDF/source is saved. Partial files remain for exact owner recovery if a write fails. The receipt is capped at 256 KiB and binds image, source/probe/verifier/PDF/semantic/PNG hashes, font metadata, dimensions and cleanup. It states current-candidate-only, no baseline comparison, pending visual review and no accessibility/security acceptance.

The image is locally inspected before creation; helper-owned isolation/finally cleanup and zero-converter checks remain unchanged. The old paired command and its baseline assertion remain intact: ROOT legacy file SHA-256 `b994288a4c6f050590b58940f8b980a5ad78662c899514e627500b1276032311`. Probe text SHA-256 `b9815d454a1421130b7a892791a95a3b63d4cc5e9b8bfb09d8f1155c91d60538` is identical to that file; its Python AST parsed without executing it.

## Author evidence

The first focused run could not load the absent new module; this was missing-feature evidence, not executed negative assertions. The completed suite passes 17 cases: command/output admission; text/order/math/glyph/link/page failures; strict PDF/base64 envelopes; bounded PNG headers/dimensions and embedded-font metadata. Its positive one-pixel PNG and fake PDF envelope test only local validation, not real PDF rendering. One sealed subprocess checks the installed Vite CLI's incomplete invocation and rejects before its inert Docker trap is called. A second uses the exact documented `script -- --run-current-render --image … --output-dir …` form, a fresh empty valid output directory and a separate private trap directory. It passes argument/output admission and reaches exactly the first scoped `ps -a -q --filter label=resumide.latex.service=converter` call, where the inert trap deliberately refuses. The output stays empty. This proves actual installed-CLI argument wiring, not a daemon/runtime result. No real Docker, DB, provider or browser runs.

`npm run typecheck`, focused ESLint and formatting pass under Node 22/private mode. No unrelated broad suite/build is repeated. Root must integrate/review the exact source and perform the allocated current-only runtime check before claiming actual current PNG or semantic evidence.

## Proposed bounded operation, not allocated

After root transfer, invoke from ROOT through the existing source-bound Node/shim/owned-process admission:

```sh
RESUMIDE_CURRENT_RENDER_DIR='/private/tmp/resumide-latex-current-render-85bf1984-6950-41e4-911c-0d44ac90156f'
RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic \
node node_modules/vite-node/vite-node.mjs --config vitest.config.ts \
  scripts/verify-latex-current-render.ts -- \
  --run-current-render \
  --image sha256:5e5c2436bcac0a97c4616d7392d1089ecf7ef7d6d5df9063c02e4498d1e0d431 \
  --output-dir "$RESUMIDE_CURRENT_RENDER_DIR"
```

The proposed directory was absent during preparation; root must create it owned 0700 and empty after allocation, separate from the controller files. This command requires the pinned shim first on PATH and the original HOME, with a sealed environment and no live provider/DB credentials. Use ROOT-internal script paths; do not repeat the failed outside-root Vite interaction or broaden filesystem allowance.

Propose one 60-second stage, 12-second close-settlement grace and 120-second overall allocation with 30 seconds reserved for cleanup, 2 MiB logs, at least 12 GiB initial free and the unchanged 8 GiB floor. Two sequential containers at most; existing no-network/no-host-mount/nonroot resource controls stay intact. Host artifacts total at most 4 MiB PNGs plus 256 KiB receipt. Under a fresh allocation, snapshot the current owned journal prefix/hash/offset; permit at most two appended intents for this compile/render only. Never reuse the consumed license allocation or clean earlier names. Unknown lifecycle or late creation means stop/quarantine; retain exact-group/ID/name/image/label checks and all old failed receipts. No automatic retry.

Require a successful nonempty receipt, both PNG hashes, exited owned group, exact new-container absence and unchanged old journal prefix/source/image bindings. Then inspect both neutral PNGs and record that review separately. A successful current-only result does not recover the absent historical baseline, establish pixel parity, validate real resumes/hiring outcomes, supply PDF/UA/assistive acceptance or clear R18. Production flags, launch, DB and providers remain untouched. R18's metadata/trust recovery is the next separate leaf.
