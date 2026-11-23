# B02 metadata helper: independent review

2026-11-09. **ACK for the proposed single metadata-staging operation, subject to its existing operator boundaries. No blocking source finding.** This is source review, not a fetch allocation, successful transfer, signature result or scanner admission. Only this review handoff was written. The backend's three frozen files were read without edits; no helper/verification module, test, network, credential, provider, DB, Docker, signature-verification or fetch operation ran.

## Frozen inputs

| File                                 | SHA-256                                                            |
| ------------------------------------ | ------------------------------------------------------------------ |
| `scripts/prefetch-trivy-metadata.py` | `271453f870ffffccb114a2ec11f20c5556ab08db7eb919f60d5701bd3bd8b22a` |
| `tests/unit/trivy-metadata.test.ts`  | `670ae6b79b66a3f3d585640afcb1c8cf2b9aef9ec1d47db5255c6d3d5dffc214` |
| `backend-trivy-metadata.md`          | `d9d4d2f6e5b489c3be270897c5ad68178999c41022343c00a5702eb28a495ae5` |

All three independently match the coordinator's assigned hashes. The review covered the complete 588-line helper, 423-line tests and 74-line handoff. The author's 58-test result remains author evidence; this review does not relabel it an independently executed result. The read-only allocation takes precedence over the review skill's mutation-test suggestion.

## Contract checks

- **Transfer and redaction:** fixed URL/hash/cache and exact CLI action have no external override. The direct HTTPS adapter supplies no authorization, cookie, proxy or GH handler (helper lines 403–431). Redirect admission confines scheme, reviewed hosts, default port, userinfo, fragments and controls; the loop permits three redirects, no retry, and reads at most the overflow byte after 64 KiB (434–505). Selected duplicate/conflicting framing and compression are rejected. Redirect URLs and raw exception strings never enter the metadata receipt.
- **Filesystem:** parent components use directory descriptors with nofollow; a pre-existing cache is refused, not adopted. Owner/mode/inode and receipt regular-file/link checks remain bound to the newly opened cache (259–304). Temporary receipt/bundle files use exclusive nofollow creation. Bundle readback/hash, mode 0444, no-overwrite link publication and final link-count checks precede success (306–381). Cleanup addresses only the helper-created partial with its recorded inode. Nothing authorizes broad cleanup or overwriting an existing foreign bundle.
- **Parser and source binding:** raw size and the exact hash are checked before JSON parsing (534–540). Strict UTF-8, decoded duplicate keys, finite/bounded numeric tokens, surrogate rejection, lexical depth/node bounds and post-parse string/container limits are present (34–130). The lexical pass does not replace the standard syntax parser. The summary emits finite media/content/algorithm values and bounded field-presence counts, without treating certificates/signatures as valid cryptographic evidence (133–181).
- **Deadline/failure state:** the watchdog is armed before cache setup; request/read/close/publication operations and the original 30-second aggregate are checked (184–249, 469–505, 520–563). Its hard exit performs no potentially blocking receipt/stdout work. Nonzero/unknown process exit invalidates any staged receipt, including a final-publication race. The tests explicitly exercise that unknown-state rule rather than demanding a fictitious successful timeout receipt.

## Boundaries that remain mandatory

Final `_emit` in `main` occurs after `_fetch_and_stage` has stopped its watchdog (548–563, 582–584). Therefore helper source alone does not prove a bound on final stdout delivery or whole-process exit. The existing handoff already requires an independent root wall-clock/process observation and matching normal exit zero; retain that requirement in the actual allocation. A staged file or receipt alone is insufficient. This is an acknowledged operator boundary, not a new privilege expansion or a reason to retry a consumed operation.

Field presence is deliberately weaker than Sigstore validation. Nonempty signature/digest strings are not base64, DER, identity or signature acceptance. Recognizing an untrusted DSSE shape does not authorize a DSSE verification path. A malformed non-dictionary alternate content field can fall through to a sanitized source/shape failure; it does not permit staging without the exact pin or turn trust true. These are not blocking vulnerabilities in this metadata-only contract.

Before any separately allocated fetch, root must still bind the integrated source/interpreter and exact absent cache, preserve original HOME with the stated startup whitelist, enforce its outer process bound, and independently inspect the terminal receipt/file sizes, hashes, modes, link counts and absence of temporary files. The final state remains `UNTRUSTED_FOR_EXECUTION`, with signature/scanner/TUF false. Current trust recovery, scanner/archive/catalog admission, worker advisories and release are open.

Terminal review: **ACK.** No source change requested. No unchanged broad suite or unallocated probe was repeated.
