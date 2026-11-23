# U03 clarification preview test release

Base `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, existing runtime worktree and preserved dirty inputs. Root approved `u03-preview-contract.json` and the four-file allocation before writes. Root synchronized707 nonsecret inputs; no database, provider, Docker, browser, owner-file, native verifier or Git mutation ran.

## Actual baseline and repair boundary

The original real `applyAuthoring` path accepted a new clarification with answer-only confirmation and no full-value proof. The test expected422 but received an applied receipt. This was one actual failed behavioral case against repository465c694a, not a missing-module test. The fixture uses actual clarification/revision construction and fake owned-read/RPC boundaries. It does not prove Supabase behavior.

Private receipts are currently in `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-u03-runtime-preview-rcg5856k/`: `answer-only-red.json/.log`, `readonly-inputs.json`, `preview-matrix-attempt1.json/.log` and `scoped-types-attempt1.json/.log`. Root should archive them before a pause; this handoff does not claim a durable archive already exists. The red log SHA256 is `19daaeb37de1675b550810d5577ee11379d804aa33a72923477500cb92b0273e`.

Exactly two production dependencies were copied read-only after checking original and author hashes: repository `b3f50f577d57e4a2892afd2170fb356b28a809dd8a9322756a7240f88561cc81`, author route `8aae5e5f62e75633fc4db8767e29d76e2c57ab29733262848ec14890fa714406`. This worker did not edit production code. Backend confirmed those sources remained unchanged after its final static checks.

## Verification

One finite Node22.23.4 sealed run passed43/43 tests across three files:16 repository preview/commit/replay cases,16 native-form cases and11 route cases. All11 preceding form/route controls remain. The run used fake credentials, disabled dotenv loading and made no live requests. Eight recorded inputs stayed stable; the owned process group was absent afterward. Green log SHA256: `a8366695e59d0ba4710beb936a9c4fe9e7c878034e33d492430c52140cbff361`.

Coverage includes full server-derived before/after and exact UTF8 digest without consent or mutation; version/contribution/answer/authority validation; exact edited then confirmed value/actor/version chain; metadata excluded from the SQL wire; supplied mismatch before old receipts; missing proof accepted only for an owned exact old receipt; new-write422, stale-head409 and changed-payload key reuse409; source-access denial before replay; strict preview/final forms; Unicode round trip within the unchanged16KiB encoded envelope; duplicate/unknown/invalid-UTF8 rejection; private POST preview and failure/retry retention. The public digest binds value equality, not evidence that a person read the text.

Scoped ESLint passed on the three test files. Project-options no-emit TypeScript passed with six roots, three ambient inputs,469 source files and zero diagnostics. Formatting and whitespace checks passed. No full282-case campaign or native verifier was repeated. Root owns the final combined affected gate and actual browser/native/transaction/role/consumer acceptance.

## Owned test inputs

| File                                                 | SHA256                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `tests/unit/authoring-forms.test.ts`                 | `4d18a9ca8ae4b98dc60ce060dbf44bf7f3782c88fce9a45079b60f8ed8f70382` |
| `tests/unit/authoring-route.test.ts`                 | `84a147e51cfaac982fbdd7770b51ead2c8172ea4f8d70a71df4c5c9c834c5b47` |
| `tests/unit/authoring-clarification-preview.test.ts` | `e45b4d0c0374dc4a3b8d27027bdeae1bd482d5dbd72743db82d564e06c652106` |

The fourth owned file is this handoff. No late source edits are allocated after the final hash release.
