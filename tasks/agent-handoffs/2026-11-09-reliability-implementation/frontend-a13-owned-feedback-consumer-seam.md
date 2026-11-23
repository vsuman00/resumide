# A13 owned feedback consumer seam

Read-only discovery against design `079d29f4c797c3c786e46232396060eaacd810169379829ff0aaef2ee162d96e`. No application edits or tests ran. Root's completed foundation gate is separate from this proposed consumer work.

## Actual seam

`resume.tsx` authenticates, reads owner-filtered legacy result/writer projections, redirects evidence analyses, and rejects statuses other than completed/partial before rendering. It returns `qualitativeUnavailable` from analysis status and `unscoredProse` from the feedback marker. Neither represents publication ownership or currentness. `visibleFeedbackGroups(feedback, unavailable=false)` uses quote presence for prose-only envelopes; its output drives strength counts and the repair queue.

`CitedWritingSuggestions` independently filters by quote and labels `type:good` as a strength under “Source-backed feedback.” Fixing only the helper leaves this second path unchanged. Existing legacy tips must remain readable with an explicit unverified label; a quote cannot establish owned support. The content core stays exactly `source_content_only` / `not_provided`; the distinct publication envelope supplies any separately admitted binding.

## Smallest five-file feedback leaf

| File                                                                                                     | Bounded purpose                                                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/routes/resume.tsx`                                                                                  | Call the released owned reader; carry its separate state and checked compatibility projection; preserve auth/private headers, evidence redirect, deterministic numbers, report/source and old result. |
| `app/lib/result-feedback.ts`                                                                             | Accept the checked sidecar/state in addition to the existing arguments; select displayed rows and counts using retained decisions/kind, not quotes alone.                                             |
| `app/components/CitedWritingSuggestions.tsx`                                                             | Consume that same selected view, with current/historical/unbound/unavailable copy and clarification/editorial distinctions; retain existing layout and source excerpts.                               |
| NEW `tests/unit/owned-feedback-consumer.test.tsx`                                                        | One combined helper plus actual loader/RouterSSR file using real producers and fake owned RPC responses. Existing result-feedback tests remain unchanged.                                             |
| NEW `tasks/agent-handoffs/2026-11-09-reliability-implementation/frontend-a13-owned-feedback-consumer.md` | Implementation evidence and remaining gates.                                                                                                                                                          |

This is the feedback leaf. The rewrite tab still passes a plain projection to `ResumeWriter`, whose notice says source support is unknown. Adopting the initial publication's writer provenance needs an explicit subsequent allocation for that existing component; this leaf must not silently certify it or imply canonical/JD-version binding from a legacy scoring snapshot.

## Contract details needed before implementation

- Freeze the actual Node reader export for `read_initial_feedback`, its strict fixed errors and the proposed available/current-or-historical, legacy_unbound and pending union. Keep publication `deterministic_only` distinct from an assessed empty response; it has null prose/support. Currentness compares original scoring/JD snapshots, not invented canonical or requirement-version IDs.
- The server must validate legacy result/writer projection against receipt digests, or return the validated projection. The current route SELECT contains only feedback/parse/rule/keyword/created-at subfields, insufficient for independently checking a whole native row digest. Browser code must not recompute native hashes or import server runtime schemas.
- Provide an exact checked mapping from retained prose to support decisions. Current core `items[].index` indexes the original candidate array; retained prose compresses it and compatibility projection pads it. Joining by displayed index is unsafe. Both title and explanation state/kind, citation offsets and retained identity must survive this mapping.
- Preserve a valid already-owned prior result on recoverable publication/support failure or pending status, without a new assessed/current claim. The early status guard currently prevents this. Ownership/privacy denial must fail closed.
- Use true whole-declaration `import type` in browser consumers. Runtime decoding belongs inside loader/server execution; an inline type specifier can retain an empty runtime import and pull Node code into the client, as the captured bootstrap build failure demonstrated.

## Three consumer oracles

1. **Assessed current/historical:** actual scoring-input fixture → actual content assessment/closed-plan producer → released owned reader with fake RPC → real loader/SSR. Retain useful editorial and supported factual rows; show exact original quote/binding and historical status without current-JD substitution. A supplied good question is normalized to clarification/improve, never strength. Rejected title or explanation never enters counts. Frozen content-only authority literals remain unchanged.
2. **State separation:** feed genuine reader fixtures for legacy_unbound, pending and deterministic_only through the same consumer. Old unbound content stays visibly unverified; pending confirms no new result; deterministic_only shows the unchanged saved checks without qualitative ratings, placeholder repairs or fabricated empty assessed success. No dispatch or mutation occurs on GET/render.
3. **Prior result and refusal:** begin with an actual owned saved projection, then make publication admission unavailable or swap its input/result/writer binding. No new supported badge/result is inferred, old safe content remains distinguishable, and private error detail is absent. Foreign owner/privacy denial refuses access; auth redirect and private headers remain. This checks preservation and correlation without treating fake RPC metadata as native proof.

Read-source pins: resume route `db3fb3c0`, grouping helper `214f85c0`, cited component `02c30d8f`, writer `dd1c6f75`, existing helper tests `cc23f0dd`, support core `602ba4c5`. Full SHA256 values are recorded in private read/hygiene packet `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a13-feedback-seam-fwikrzyh`. No production DTO is invented by this report. Native publication, privacy adoption, worker activation, representative usefulness and release acceptance remain open.
