# CR-U10 rewrite failure feedback

Updated 2026-11-13, Asia/Kolkata. Implemented and verified through focused synthetic DOM and scoped source checks. Root owns integrated verification. Full U10, provider usefulness, native/browser and release acceptance remain separate.

Only this handoff, `app/components/RewriteGenerator.tsx` and `tests/components/RewriteGenerator.test.tsx` were allocated. The allocation SHA256 is `87e663e4569499095d75826e3067264017d409487377fdf83910bdf04301a34d`. Detached HEAD remains `a0b239299d75b0bd64b588fe743ebe2975fb28b9`; unrelated dirty work is preserved. Root owns shared plans and `CONTEXT.md`.

| File                                         | Baseline SHA256                                                    | Final SHA256                                                       |
| -------------------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| `app/components/RewriteGenerator.tsx`        | `8ce7ac0affd281c489811a0fbf84a99cad2f56de40f274b0efdc357f23b27a7d` | `92d49a51e4a0bae2e078273559bcec6faf1c982e4b146f88182fc01bd014a9ff` |
| `tests/components/RewriteGenerator.test.tsx` | `21ca68e55d7b8ba6ec9565795aaa4a7bed883cc9db27287c4538b96cfb944ce9` | `daa991e2522ba19dbc84fb50c48ef275bfaa615fa67b975051cd5b63b767572e` |

## Behavior and preservation

The consumer reads the already-published optional `code` and uses a prototype-safe `Map` for fixed known-code feedback. Session sign-in, provider unavailability, disabled generation, refusal, rate limiting, timeout, cancellation, unusable output, service capacity and request-conflict outcomes remain distinct. Unknown/legacy codes retain the safe server message, including ambiguous save results. A code without an error message does not invent an error outcome.

Capacity copy describes the writing service, without inferring candidate credits, plans or payments. Cancellation copy requests saved-draft review rather than claiming retryability. The initial RED snapshot retains its earlier draft cancellation wording; the actual old generic-message failure remains recorded unchanged. No provider authentication cause, exact retry countdown or automatic retry is inferred.

Golden-hash reconstruction recovers both complete baseline files after removing only the message map/selection, optional code field, new cases and supporting test-fixture cleanup/imports. All five original cases and assertion bodies are unchanged. Form action/method, analysis target, consent, busy controls, success copy, request generation and alert behavior otherwise remain byte-identical. Existing saved-writer tests remain untouched. All three validated server-contract hashes in the allocation still match exactly; no source/version guards, service, classifier, budget or storage logic changed.

## Actual verification

Before product editing, the actual component received the real published generic `error` with `AI_REFUSED`, `AI_RATE_LIMITED` and `AI_CANCELLED`. All three selected DOM expectations failed because every alert displayed the same generic message. Imports/rendering succeeded; five original cases were unselected by the filter.

Exact RED command:

```sh
RESUMIDE_PRIVATE_VERIFY=aa7-owned-synthetic /Users/vaibhavsuman/.codex/tools/resumide-node22/v22.23.4-darwin-arm64/node node_modules/vitest/vitest.mjs run tests/components/RewriteGenerator.test.tsx --reporter=verbose -t 'distinguishes published'
```

The final focused command removed that filter and included `tests/components/ResumeWriter.test.tsx`. It passed 38 cases across two files: 28 generator cases, including all five original cases, and ten existing saved-writer cases. New controls cover twelve known codes, unknown/legacy and prototype-name fallback, classified errors while busy, retained drafts, unchanged consent/form target, no automatic fetch/submit, and code-only malformed feedback.

Scoped lint and Prettier checks on the two allocated source files passed. A TypeScript API program using repository `tsconfig.json`, the allocated component/test and `types/index.d.ts` roots plus imports passed with `noEmit: true`, `incremental: false` and no typegen. Official Node `v22.23.4` and private mode disabled dotenv loading. No broad suite or full build was run by this leaf.

## Private evidence packet

Packet directory, mode `0700`: `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-u10-rewrite-vrlrlvkw`. Raw logs, JSON receipts, coherent diff, baseline/RED/candidate code snapshots and prose-hygiene reports are retained there for Root custody. All code snapshots use `.txt`; no executable archive file was added to the repository.

| Artifact           | SHA256                                                             |
| ------------------ | ------------------------------------------------------------------ |
| `red.log`          | `7ca91d566ad3d5e89032c1d657201e13fa1761aad7c859b184eb00f5f00433d0` |
| `green.log`        | `55c3f97161d0491be0b6bc54f5a7be5d02c4116aa34af2753a79fa3310a7a65d` |
| `candidate.diff`   | `fc590366f6f3672b40bc4b39943388dc1f7a8df7913d1098cc654eb33570257d` |
| `preservation.log` | `94398a84442a33cfc00d5ebb72a8a5b21dc90065a3406564e49231f70c9ae191` |

The installed `clean-user-facing-text` workflow found no suspicious Unicode in extracted UI copy and produced identical bytes; low-density score `0.37` before/after. The same prose pass was applied to this handoff. No source identifiers, commands or error-code contracts were rewritten. This is hygiene evidence, not proof of authorship or watermark removal.

No provider/key probes, native/browser execution, database/SQL, real data/environment-file access, services, Git operations, dependencies or deployment occurred. Provider authentication versus other provider unavailability remains indistinguishable in the current public DTO; this leaf does not invent that classification or close full U10.
