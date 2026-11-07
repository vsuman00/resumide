# Native geometry transport proposal

Status: IMPLEMENTED AND PRIVATELY VERIFIED in unpromoted worker `6f623e1c…`; formal security/release acceptance remains open. This document does not authorize runtime promotion. The worker replaces candidate-derived bbox XML/ElementTree with the framed transport and disables the optional Poppler JPEG2000 codec, preserving the standalone contract in [LATEX_CONVERTER.md](LATEX_CONVERTER.md) and [ADR0016](../decisions/0016-standalone-latex-converter.md). [Current verification](../evaluation/AA7_ATOMIC_NATIVE_PRIVATE_CI_20261107.json) records the full application checks; native source tests retain the reviewed E-010 signer failure as actual 70/71, not 71/71. The final `4b83ffec…` worker additionally verifies the FreeType source backport and actual mapped library; its 28 runtime groups and complete private CI pass. Raw image advisories and formal release applicability remain open. See the [current engineering closeout](../evaluation/AA7_FREETYPE_FINAL_CLOSEOUT_20261107.md).

## Scope and invariants

Use the same native Poppler text/word traversal and the same computed page dimensions and absolute word edges. Preserve source bytes, supported packages/fonts/paper settings, word order, Unicode text, current numeric bounds and the public compiler JSON/HTTP response. No analyzer/canonical integration, new dependency, service, persistence, provider or deployment is introduced.

The existing standard `-bbox`, `-bbox-layout` and `-tsv` modes retain their behavior. Add one private, explicit native output mode for this worker; do not change TSV width/height semantics or reconstruct absolute edges by adding separately rounded values. The previous two-decimal TSV failure and the six-decimal rounding counterexample remain failed evidence.

### Unused metadata compatibility case

The pinned public `pdf20-utf8-test.pdf` exposes a reference-format bug: standard bbox emits supplementary Unicode in the TITLE as separate UTF-16 surrogate encodings, making the XML header invalid UTF-8. A baseline-only diagnostic reproduces the error at line 3, column 23; its geometry body separately parses as one page with 19 words. The current production XML consumer rejects that document before using its geometry. The proposed frame intentionally omits unused document metadata, so valid framed geometry may be accepted in this case. Record this as an explicit compatibility repair, not identical whole-document rejection behavior.

Keep that exact fixture and full standard bbox/TSV byte equality. The trusted build-time reference may isolate its unique `<doc>` geometry body only for this pinned fixture/hash, while separately preserving the failed whole-XML result. Every page, word, coordinate, text/control check and precision requirement still applies. Other reference fixtures keep whole-XML parsing. This is not a production XML fallback or permission to ignore malformed geometry; actual private-frame behavior remains unverified until the native build passes its independent gates.

The same reviewed source package may select the upstream `ENABLE_LIBOPENJPEG=none` option. Do not select the unmaintained decoder fallback. Require exact filter-dispatch and no-opj-consumer evidence, normal package/ABI/export checks and native regression tests before adoption. This removes an unsupported codec from this worker's extraction path; it does not claim upstream OpenJPEG fixed or exported PDFs safe in every external reader. The upstream none mode can log an unknown filter and continue text extraction with EOF, so it is not a whole-document rejection guarantee.

## Versioned frame

The producer emits ASCII, LF-terminated records in this exact order. Tabs separate fields. Text is UTF-8 encoded as lowercase hexadecimal bytes, so tabs, newlines and other text cannot introduce records.

| Record | Fields after the marker | Meaning |
| --- | --- | --- |
| `RESUMIDE_BBOX` | literal `1` | Required first record and protocol version |
| `P` | width, height | Start a page; use the same bbox dimensions |
| `W` | xMin, yMin, xMax, yMax, UTF-8 hex | A word in the existing bbox traversal order; empty word text is allowed |
| `E` | none | End the current page, including a page with no words |
| `Z` | page count | Required final record; matches completed pages and independently inspected PDF pages |

Emit all dimensions/edges with the same native C `%f` formatting and the same computed values used by current bbox XML. Do not derive xMax/yMax from rounded widths/heights. The producer must retain UTF-8 word bytes before XML escaping. Omitting unrelated XML document metadata is intentional: the current supervisor consumes only page/word data.

## Consumer boundary

Validate the complete frame once before its values enter layout checks. Require the exact header/version, record order/field counts, closed pages, final count and EOF. Refuse unknown records, trailing data, non-ASCII framing, malformed/odd hex, invalid UTF-8, non-finite numbers and incomplete output. Valid coordinate tokens have the native six-decimal form. No XML or host/parser fallback is permitted.

Retain the existing 2MiB transport-file limit, 1–10 PDF pages, 100,000-character final text limit, nonempty document text and existing one-point layout checks. Preserve word separation with a single space as today; empty pages remain allowed. Preserve XML1.0 text-character acceptance and its CR/CRLF-to-LF normalization in decoded word text, without Unicode normalization or altered facts. The old C-string XML producer truncates embedded NUL; the new length-based format exposes it and must reject it rather than accept a shortened prefix. Record that as unsafe-input hardening, not exact malformed-input equivalence. Preserve structural/text validation before sequential coordinate/layout checks and final document-text checks; classify newly rejected malformed numeric/control cases explicitly. Fixed parse errors map to output_invalid; actual outside-page layout retains layout_overflow. Do not expose raw frame/source content in diagnostics.

## Evidence required before adoption

1. Authenticate exact native source/packaging and preserve original source/tests/build rules except the reviewed optional codec flag, new private formatter and honest local version. No unstable binaries or force-removal flags.
2. Keep normal bbox/TSV modes intact. On the same neutral PDF bytes, compare every page, word, decoded text, absolute edge and order against existing bbox XML. Require exact formatted coordinate equality, not a wider tolerance. Cover Unicode, ampersands, empty text/page cases, delimiter/EOL framing and malformed metadata separately.
3. Exercise malformed/truncated/oversized frames, invalid versions/hex/UTF-8/control characters, count mismatch and layout limits. Verify the byte/text bounds do not reject any declared positive profile.
4. Prove disabled JPX dispatch before native decode, no unmaintained fallback and preserved supported text/font/geometry behavior. Keep upstream-open issues and original raw findings separate from this scoped exposure proof.
5. Verify normal coherent native packages, SONAME/exports/old consumers, exact installed libraries, component/source/license inventory and the complete image identity. Run current runtime/PDF/profile/render/rollback/browser gates and a fresh unsuppressed scan of the adopted candidate.
6. Bind the producer, consumer and frame version atomically to one immutable worker. Only after those checks may the supervisor stop parsing candidate-derived XML. Re-audit remaining Expat callers, including immutable Fontconfig and lazy PDF metadata paths; do not infer non-applicability from a parser import or byte count alone.

The coordinator owns this contract. Backend owns a source-only producer/codec patch and authenticated source preparation; the tester independently checks parity/framing acceptance. Consumer integration and source builds require the frozen proposal review first. Existing Python source-repair work remains isolated and unexecuted until its own review; no discarded work or substituted completion is implied.
