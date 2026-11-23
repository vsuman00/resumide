# Writing eligibility: source-only diagnosis

2026-11-09. **A local selector/support alignment gap is established; a small synthetic reproduction is justified.** This review changes only this document. No production edit, fixture, test execution, PDF access, provider request, scanner fetch or migration ran. The owner document was not opened, rendered, copied or hashed by this reviewer. The frontend's privacy-safe aggregate report and current ROOT source are the evidence.

## Evidence and limits

The frontend report records one native-text page, 3,778 characters, 50 support anchors/55 clauses, three recognized contributions, all three qualified, 40 qualifier anchors and 14 selected rewrite sources. Its actual identity controls return zero supported, seven clarification and seven `missing_source_anchor`; actual grounding retains zero identity drafts. These unchanged-source controls measure admission, not useful editing or model quality.

`HEADER` means an actual qualifier before the first recognized contribution; `UNKNOWN_ACTION` means one at or after that position. The 18/22 split is positional. It does not prove that 18 harmless contact lines were misclassified. The 47 anchors containing unknown actions include six headings and metadata; they are not 47 lost contributions. There are zero recognized layout entries, but counts do not identify whether their header grammar, punctuation, segmentation or semantic scope caused that result.

Root reports all five actual AI calls returned HTTP 200, one useful Build fix and no retained writing edits in the other four calls. The existing receipt records retained changed-bullet counts and usage, **not pre-filter proposal counts or rejection reasons**. Raw model responses were intentionally not retained. Consequently, this review cannot distinguish no proposal from a filtered proposal for those live calls, or infer that an empty response is an error. No provider repeat is proposed here.

## Source findings

1. **Two producers disagree about source boundaries.** `rewrite-sources.ts:8–36` selects bullet-led blocks and appends adjacent lines until punctuation, a bullet, a recognized heading or its length boundary. `writing-support.ts:573–590` merges only action-led units with lowercase or narrow semicolon/action continuation rules. `writing-support.ts:1065–1072` then requires exactly one whole matching support anchor. `writer-proposals.ts:24–29` correctly restores the selected original from its source ID, but that quotation can still fail the separate support producer's boundary. Seven actual owner-document `missing_source_anchor` outcomes establish the mismatch; they do not identify every private passage's finer cause or imply fabricated quotations.

2. **Qualifier retention explains the three recognized-contribution abstentions.** `writing-support.ts:714–725` appends any unclassified non-heading/non-role/non-contact/non-layout anchor and requires the accumulated list to be empty. Known headings, blanks and later roles do not clear it. `:845–846` checks that context before accepting even an identity rewrite. This is intentionally conservative scope protection. The counts cannot establish which particular qualifiers are safe to exempt.

3. **A narrow metadata usefulness gap exists independently of the private document.** `writing-support.ts:338–356` recognizes a whole mailbox, optionally prefixed `Email:`, or a whitespace-free HTTP(S) URL. A complete explicitly labelled phone line is not recognized. Name-like first-line handling at `:600–610` is narrow and grants no identity authority. Skills lists, free-form summaries, locations and arbitrary title-cased labels cannot safely be made inert solely because they appear before an action. A known heading is already recognized; treating its following arbitrary content as metadata would require a separate reviewed contract.

4. **Other filters remain distinct.** Recognition requires every clause's action to be in the finite grammar (`:611–613`). A recognized action alone does not prove supported context. `writer-grounding.ts:23–38` also requires both the rewrite and its editorial explanation to pass. The finite editorial forms and reviewed transformations can legitimately withhold a novel model paraphrase. None of these observations justifies widening action equivalences, removing relationship checks or promising that every resume must produce edits.

## Next bounded slice: align selected passages with support anchors

Use a neutral synthetic counterexample before production changes. Proposed text, never executed in this review:

```text
Projects
Signal Dashboard
- Built a dashboard with React and PostgreSQL
API reference
- Maintained reliable service endpoints.
```

By current source inspection, the selector joins the first bullet with `API reference`; the support builder stops before that uppercase line. The joined original has no whole support anchor. The first exact contribution itself is unqualified: the later unknown line must remain a qualifier for subsequent material. The proposed useful transformation is `Built` to the already-reviewed `Created`, preserving the remaining object. Its editorial control is `Clarifies the contribution.` This avoids inventing a new action, entity relationship or fact.

First reproduce the mismatch through actual `buildRewriteSources` → source-ID resolution → grounding in a focused synthetic test. If it does not reproduce exactly, preserve the result and refine only the synthetic boundary case; do not claim an executed red from this inspection. Then make selected source boundaries derive from the reviewed support units, or from one shared bounded segmentation contract, rather than teaching the guard to accept arbitrary larger quotations. Prefer the smallest change to the selector; retain the existing whole-source support assessor as the authority. Selection must not turn an unknown/qualified unit into a supported contribution.

Proposed maximum allocation: `app/lib/server/rewrite-sources.ts`, one new focused selector/support test, the existing `tests/unit/writer-grounding.test.ts` only if pipeline coverage is needed, and this handoff. No stored schema, canonical writer, prompt, dependency or provider change. If sharing segmentation requires a new module or modifying the support policy, agree a separate allocation/version boundary before expanding scope. The resulting numeric source IDs must be deterministic for the same source/policy; source-ID restoration must still supply exact original text. Preserve existing caps and avoid rebuilding an unbounded document per selected block.

Acceptance: the selected positive maps to one exact support anchor and retains the useful supported rewrite downstream; a later unknown qualifier remains present; an earlier `A colleague:` or `Things I have never done:` still blocks promotion across the same layout; duplicate originals stay ambiguous; metric/agency/negation and cross-entry transfers remain rejected; uppercase unknown continuations are not silently merged into new factual context. Also cover existing lowercase wrapped positives, Unicode/code-point boundaries, selection ordering/limits and the original frozen five semantic/two downstream negatives. Proposed checks are focused `npm test -- <new selector test> tests/unit/writer-grounding.test.ts tests/unit/writing-support.test.ts tests/unit/writing-support-usefulness.test.ts`, followed by root's coordinated integration checks. None ran during this review.

This slice can close the demonstrated producer mismatch for its accepted cases. It cannot by itself unqualify the three owner-document contributions or close A11/G01.

## Separate follow-up, only after that slice

A bounded whole-contact metadata test can use `Demo Person`, a reserved synthetic `Phone: +1 202 555 0142`, and the existing safe contribution. Expected-by-inspection current behavior is clarification because the explicit phone line becomes a qualifier. A reviewed repair could recognize only a complete explicitly labelled phone grammar, with full-token consumption, bounded digits/length and no prose suffix. Keep the raw anchor and grant no contact truth, subject identity, role or ownership. The negative `Phone: +1 202 555 0142; things I have never done:` must remain meaningful scope, and genuine earlier qualifiers must survive valid contact lines. This is a proposed synthetic case, not a diagnosis of the private document's 18 pre-contribution qualifiers.

Broader free-form skills/summary content and unknown action coverage need independent source-bound cases or reviewed fact interfaces. Do not clear accumulated qualifiers at a heading, infer candidate agency from placement, relabel ordinary layouts unsupported, or solve absent factual support by trusting JSON/model output.

## Bound inputs and review tier

| Input                                       | SHA-256                                                            |
| ------------------------------------------- | ------------------------------------------------------------------ |
| ROOT `app/lib/server/writing-support.ts`    | `6dcac128e26dec55bd3d462281adb5ee621a9e7421b8e5fe955b40d19f89d261` |
| ROOT `app/lib/server/rewrite-sources.ts`    | `5ee8b6152298331f702de5dda33bb47b52384e8df330460a95c705a730ef8356` |
| ROOT `app/lib/server/writer-grounding.ts`   | `486fd5a945339a4bd9014b780fc43bb8fa9d588bcb34071c745bb7df4e38290b` |
| Frontend `frontend-owner-pdf-diagnostic.md` | `e672e04b4ffaf4877042a00ef9933d7c79ef010ee79b15f3b469b19926140b81` |

These code/report hashes were checked in this review. No private file/content hash was computed. Source references above bind to ROOT, not this worktree's stale implementation. Only documentation formatting, prose inspection and owned-file whitespace/hash checks apply to this read-only report. No new behavioral, live, factual, representative, score, canonical/export or release claim is made.
