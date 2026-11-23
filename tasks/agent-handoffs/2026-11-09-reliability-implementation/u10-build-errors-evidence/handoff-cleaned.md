# CR-U10 Build failure feedback

Updated 2026-11-13, Asia/Kolkata. Implemented and verified through local synthetic DOM/unit and scoped source checks. Root source review ACKed this candidate; integrated verification and full U10/native/browser/provider-usefulness/release acceptance remain separate.

Only this handoff, `app/components/BuildAiAssistant.tsx` and `tests/components/BuildAiAssistant.test.tsx` were allocated. Allocation SHA256: `7c9a43408730a351bbee9b7e2ce6b097b418f7e8a035b3992c4c7549974b89f6`. Detached HEAD remains `a0b239299d75b0bd64b588fe743ebe2975fb28b9`; unrelated dirty work is preserved. Root owns shared plans and `CONTEXT.md`.

| File                                         | Baseline SHA256                                                    | Final SHA256                                                       |
| -------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `app/components/BuildAiAssistant.tsx`        | `325e7e6deae4ebdb4c5d186ba6d259e312bbb3b4ffe631d0de8793a09e508fd2` | `fc267a2ef49d3a1621e2ab2849abf7d153b7d239046d3a638a3de02578e8abdb` |
| `tests/components/BuildAiAssistant.test.tsx` | `45c3e02d3ee034c7da5a149138b154cebd3c612c9074601babb3a40a1a5295e1` | `ed736478debccec4587c4a52d55eeb007968a6d3197ae065eda625e08dc5b824` |

## Display and preservation

Fixed messages now cover published cancellation, unusable output, request conflict, invalid request, consent requirements and provider unavailability. Budget copy describes service capacity without inferring plans, credits or renewal. Existing fixed-key messages and unknown/malformed-response fallback remain available. A `Map` built from the authored table's own entries prevents inherited property names from being treated as messages. The component still does not echo response error details.

Golden-hash reconstruction restores the exact baseline component by reversing only the message table and dynamic lookup. Request construction, source hashing/version/context, selection, consent, abort/sequence guards, timers/effects, popup/focus/Escape, result/fact confirmation, apply/undo, editor/PDF behavior and the existing abort/fallback strings are otherwise byte-identical. The exact baseline test file is likewise reconstructed after removing added fixture imports/helpers/cases; its Escape test and every expectation remain unchanged. All three frozen server/browser-contract hashes in the allocation still match exactly.

## Actual RED and GREEN

Before product editing, the actual component received published `cancelled`/409, `output_invalid`/422 and `request_conflict`/409 response shapes. Each reached one manually requested fetch with an unaborted signal, unchanged editor source and no `onApply` call before failing only on generic unavailable copy. Three selected cases failed; the baseline Escape case was unselected. Real local WebCrypto and the observer fixture worked; no missing-crypto/module failure was used.

Exact RED command:

```sh
RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic /Users/vaibhavsuman/.codex/tools/resumide-node22/v22.23.4-darwin-arm64/node node_modules/vitest/vitest.mjs run tests/components/BuildAiAssistant.test.tsx --reporter=verbose -t 'renders published Build'
```

The final focused command removed that filter and included `tests/unit/build-assist.test.ts` and `tests/unit/build-assist-service.test.ts`. It passed 218 cases across three files: 28 component, 158 existing browser-helper and 32 existing service cases. New DOM controls cover known/legacy classifications, unknown/prototype/malformed codes without private-detail echo, consent before dispatch, busy controls, one manual request without retry, exact request/source binding, explicit cancellation with ignored late failure, and changed source with an ignored otherwise-valid late suggestion. No failure automatically applies a suggestion.

Scoped lint and Prettier checks passed on the two allocated source files. A TypeScript API program using repository `tsconfig.json`, allocated component/test and `types/index.d.ts` roots plus imports passed with `noEmit: true`, `incremental: false` and no typegen. Official Node `v22.23.4` and `RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic` disabled dotenv loading. No broad suite, full build or closed provider/transport campaign was run by this leaf.

## Private evidence packet

Packet directory, mode `0700`: `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-u10-build-atw7p8uu`. Raw logs, JSON receipts, coherent diff, baseline/RED/candidate source snapshots and hygiene reports remain there for Root custody. All code snapshots use `.txt`; no executable archive was added to the repository.

| Artifact           | SHA256                                                             |
| ------------------ | ------------------------------------------------------------------ |
| `red.log`          | `f45f5224042a08c3ad3585ad1db8a35a6b2881add2951f3d116d239e69d04014` |
| `green.log`        | `d41c46c5ba5dfddb18f860a6b6bef941d0d9d0a5e48d4dcf9cc6ff1eb0d36a93` |
| `candidate.diff`   | `05a274bcaf5b3811b5b10f1a92aab786f09be06a14473fc80afc6738e924d214` |
| `preservation.log` | `81dfcf1153ab2699efb0036254f1829adb13f3987dd1750e842fbc1712430161` |

The installed `clean-user-facing-text` workflow found no suspicious Unicode in extracted UI copy and produced identical bytes; low-density score `0.265` before/after. The same prose pass was applied to this handoff, preserving source identifiers and protocol codes. This is hygiene evidence, not proof of authorship or watermark removal.

Provider refusal remains combined with unusable output in `output_invalid`; provider authentication remains indistinguishable from other `provider_unavailable` failures. No raw provider status, exact countdown, refund/no-charge or provider-authentication cause is inferred. No provider/key probes, native/browser execution, services, database/SQL, real data/environment files, Git, dependencies or deployment were used. Synthetic request mocks and source review do not establish live recovery, source quality or full U10 acceptance.
