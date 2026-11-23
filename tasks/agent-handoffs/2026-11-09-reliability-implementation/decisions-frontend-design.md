# CR-A14 clause-order decision browser design

Status: SOURCE DISCOVERY / PROPOSED CONTRACT. No application, test, schema, flag, or protocol file changed. No checks or Native execution ran. Root freezes names, DTOs, policy atoms, authority, and file ownership before implementation. Existing projected cards and old 1.0/1.1 commands remain unchanged.

## Current source boundaries

`TypedAuthoringBridge.tsx:83` strictly validates the old patch/command key sets and versions; its receipt check at line 231 validates a hash shape. `TypedAuthoringReview.tsx:130` likewise correlates old receipts without computing the command hash. Node validates the actual hash. The old codec imports `node:crypto` and uses `A11OP1`; it cannot become a browser runtime dependency.

The current review preserves the original submission through an unknown result, blocks new work until recovery, resets acknowledgement on history restoration, and discards responses from obsolete prepare generations. Same-source head movement must preserve the original pending command, quote, and proof; cross-source navigation must discard them. `typed-authoring-http.ts:376` proves undo against the actual owned event. Keep those semantics in a separate v2 controller rather than widening the old validators.

The existing `JdClauseOrderReview.tsx` explicitly says the preview cannot save or undo changes. Reusing that copy beneath live decisions would contradict the controls. Keep its projected use intact. A new decision review must show the complete wording/source/JD review with accurate proposed, pending, rejected, or saved labels.

## Proposed browser module and wire

Use a new browser-safe module, proposed name `app/lib/jd-clause-order-decisions.ts`, containing runtime Zod schemas, inferred types, and pure correlation helpers. It must not import a server module at runtime, Node crypto, Buffer, providers, or DB code. Type-only server imports do not validate runtime payloads. Either declare the exact closed view schema here or freeze a shared browser-safe schema split without changing the existing draft's ordered hash input.

The strict v2 command matches the backend proposal:

```ts
{
  schemaVersion: 'jd-clause-order-command/2.0.0',
  operation, idempotencyKey, acknowledgement, draftId,
  binding, policies, decisionPolicy: { version, sha256 }, target,
  jdClauseId,
  sourceClauses: [{ index, start, end, sha256 }, { index, start, end, sha256 }],
  transform, afterSha256, sourceCitations
}
```

No free replacement text. Preserve the existing full binding and target shape. The command's captured heads equal its selected canonical/JD pair; a later replay must retain that original pair, not forge a fresh context. Preserve the two indexed code-point spans, original citations, fixed `[1, 0]` transform, renderer, and terminal. Node and independent SQL own hashing and reconstruction.

Proposed prepared proposal: strict `{ schemaVersion, draft, acceptCommand, rejectCommand, acceptCommandSha256, rejectCommandSha256 }`. `draft` is the complete existing 2.0 view. Both commands must match its binding, target, selection, spans, transform, citations, and policy pins; keys differ and acknowledgement is true only for accept. Compare captured after hash and draft ID. Browser view validation checks bounds, exact tuple order, slices via `Array.from`, deterministic rendering, null numbers, and source-support basis. It does not claim semantic or cryptographic authority. Preserve the source schema's union index inference with runtime ordering refinement unless stronger tuple construction is explicitly frozen.

Receipt 2.0 must correlate exact captured command SHA, draft ID, operation, key, base canonical version/revision, JD version/revision, result version/revision, event, and idempotence. No receipt 1.0 fallback. Freeze accept `+2` for atomic edit/confirm and reject `+0` only with the actual Native contract. A separate undo 2.0 response must bind the accepted event and command SHA, its own stable key, accepted result base, and restored result/event; freeze `+1` only if the actual restore operation has that meaning. Hash syntax alone is insufficient receipt correlation.

## Controlled review and recovery

The new controller receives an admitted prepared proposal and real owning-route handlers. A plan, draft ID, browser Boolean, or available callback does not prove save capability. Actual owned Node preparation and atomic Native decision remain required before live controls.

Show full current/proposed wording, original source quote/citations, exact bound JD quote, moved clause/order, and pinned canonical/JD links. Proposed wording receives no saved provenance. After a correlated accept, explain candidate-confirmed edited wording: the original support citations are recorded provenance, not direct proof of the edited saved fact. Rejection records a decision without moving a head. Numeric score/delta and qualification credit remain unavailable.

Fingerprint the full proposal, schema, policies, binding, target, source/JD text, and command proofs. Reset acknowledgement on a new review, BFCache restore, failure, and retry. Use captured scope/generation checks for async prepare. Preserve the exact original command and expected SHA on timeout, invalid receipt, or transport ambiguity; disable new decisions, retain the original full review, and require fresh acknowledgement for manual exact retry. Never mint a replacement key or rebase an unknown command. Source changes clear private review state. Undo retries keep their own event-bound key and cannot appear for rejection or an uncorrelated receipt.

## Minimum implementation evidence

Use actual Node-prepared synthetic proposals for DOM fixtures after dependency sync. Cover full review, malformed/cross-version proof rejection, command-to-draft mismatch, receipt SHA mismatch, accept acknowledgement, rejection without head movement, stale async response, BFCache reset, unknown-result exact retry after head movement, cross-source clearing, and undo correlation. Preserve old codec goldens, tests, controls, and projected cards. DOM/fake transport evidence does not prove Native transaction, ownership, or deployment acceptance. No gates are authorized for this discovery leaf.

## Inspected source hashes

```text
TypedAuthoringBridge.tsx 71640929e75a8e4ca738ed3a543ab88453aa87b04fee8060f8ea76357e3d6c10
TypedAuthoringReview.tsx 7daad5e0623441475e6f19c606683151d26b11d5cb749feb34dd59dcc733fa71
JdClauseOrderReview.tsx 9eaa123c57ece02085684557afd9e1c379ca56a1889b7b2539fb16405b5cd643
jd-clause-order-drafting.ts 0a22cf947e1104181670c5a35a5c9e55b11e1597ae9df5ae705b89932c3fc21d
typed-authoring-contract.ts 7665fa9676069fe25b202d9440d46e693d61a095af4d981d7800d1539db26ff3
typed-authoring-http.ts b7b23cd128678f96189ff2d14f74db5b8f845d800b7a71f950b516287fe299b3
typed-authoring-command-codec.ts e0ef1c5dbac49fbf73c2915f5bd7350074802137b071c5675d65ad5f5915f8a6
```
