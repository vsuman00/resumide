# R01 doctor allocation verification

The readiness test slice is implemented and verified with the installed OpenAI 6.47.0 SDK and fake fetch only. The final focused run passed 75 cases in one file, including all 31 original offline cases. This supplies no new credential, model-access, writing-usefulness or release evidence.

Contract: `8e2cff0111cd626c1e8b57dad3874bfc77a53906e502ca04ecad866e558233e7`. Preserved base HEAD: `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. Ownership is limited to `tests/unit/ai-readiness.test.ts` and this handoff in the preserved frontend worktree. Production sources were written by the backend owner and synchronized by Root.

| Frozen input                          | SHA256                                                             |
| ------------------------------------- | ------------------------------------------------------------------ |
| `tests/unit/ai-readiness.test.ts`     | `0aba1a5a2d214c95b69bfb1f5ff3ad9ac9249bdccee7ec89c666d065974ed819` |
| `app/lib/server/ai-readiness.ts`      | `4a78fa139eb59ed1dee143662d0426048617db8514220ca98158cb55cd3bac9d` |
| `scripts/doctor-ai.ts`                | `a1b00636e541b5136c309f6c5d50e9b68d99e2cd7422bfd6e122ce4528d30526` |
| `scripts/verify-live-openai-model.ts` | `17eb0e6465e56d76c6b74682b88051afcb914b2b9ec96f83b6bf1b36ef3bc08f` |

The tests exercise the complete allocated CLI through the actual doctor, SDK construction and `models.retrieve` path. They require one exact selected HTTPS GET, no body, redirects or retries, selected authentication/context headers, silent logging and exclusion of ambient custom headers. All environment values, allocation files and responses are synthetic. A global-fetch tripwire prevents accidental default transport; it remained unused.

Allocation structure, scope, path, file, duplicate-key, byte, time and argument failures refuse before guarded selected-environment getters run. Effective key, endpoint and model mismatches are tested separately after admission: configuration access occurs, dispatch does not. The selected-file case preserves Node parsing and inherited precedence. Provider 401/429/503/network failures, redirect refusal, invalid or mismatched Model responses and response-byte limits remain content-free. The size control uses valid multibyte JSON whose UTF8 bytes exceed 64 KiB while its UTF16 length does not, with a misleading content-length header.

Deadline tests cover pending fetch, response streaming/parsing, caller cancellation and a complete response returned after the injected clock passes expiry. The legacy adapter is imported only after Root synchronized its guarded checkpoint; import performs no request, no arguments refuse, help remains offline, and both explicit and prepended live modes delegate to the same allocated transport. Existing bare `--live` rejection remains unchanged.

Private packet, mode 0700: `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-r01-doctor-tests-7nx78sge`. Exact code snapshots use `.txt`; raw logs and receipts are retained.

| Receipt                      | Result and scope                                                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `red-actual`                 | Genuine old-doctor failure for complete new arguments: invalid_arguments, exit 2, zero dispatches instead of the required successful one. |
| `red-post-response-deadline` | First clock probe was shadowed by colon-URI refusal before dispatch; this is not clock-defect evidence.                                   |
| `red-sdk-colon`              | Actual SDK compatibility failure on e700: an allowed colon model was refused with zero fake dispatches.                                   |
| `red-deadline-isolated`      | Plain-model request dispatched once, advanced the injected clock beyond expiry and incorrectly returned exit 0.                           |
| `focused`                    | Final successor passed all 75 cases, including both actual counterexamples.                                                               |
| `types`, `lint`, `format`    | Three roots/eight project sources/zero diagnostics; lint and formatting passed.                                                           |

The backend corrected the exact safe SDK colon spelling without narrowing the accepted model domain and added absolute deadline checks through final SDK completion. Root approved correcting the newly added URL expectation to that exact SDK spelling; endpoint, method and one-dispatch assertions remain strict. The refusal RED remains archived. A local orchestration variable error occurred before any child command or source write; `setup-notes.json` records it separately.

`preservation.json` independently verifies all 24 original test-call nodes and 156 assertion-call nodes remain exact. Only the three Root-authorized source dependencies and the owned test changed since the initial RED. No assertions were removed, skipped, suppressed or weakened.

The doctor output value `model_access_confirmed` is tested against synthetic responses; it is not a new real authentication result. The allocation marker is declared operator scope, not a signature, ownership proof, cross-process single-use guard or global spend ledger. Existing useful-writing and consumer acceptance remain open. Root owns integration and the combined application gate. No real environment or keys were accessed. No real provider requests, services, database, browser, dependency changes, Git operations, deployment or closed acceptance campaigns were involved.
