# U03: acknowledgement binding repair

Status: **IMPLEMENTED; focused authoring UI checks PASS.** Root owns integration and full U03 acceptance. The work uses the existing frontend worktree at base `a0b239299d75b0bd64b588fe743ebe2975fb28b9` plus 707 synchronized nonsecret inputs. Original ownership was `AuthoringWorkspace.tsx`, `WorkspaceRepairs.test.tsx` and this handoff. Root later added source-only `e2e/authoring.spec.ts` adaptation under the approved preview contract. No browser execution was allocated.

## Actual failures and repair

Before production edits, five new component cases failed with eight assertions. A checked clarification acknowledgement survived answer edits and a new version of the same target. A retained-correction acknowledgement survived changes to the current head or retained draft. Proposal and recovery checkboxes stayed checked after a synthetic persisted `pageshow`. After failed confirmation feedback, the main current-fact button posted the old retry version and key despite displaying the current fact.

The new acknowledgement control remounts only its checkbox when the exact owner/source/document/action/target/value binding changes. Draft inputs remain outside that boundary. A persisted `pageshow` clears the review checkbox. Existing clarification history handling still clears its text, and focus changes retain their existing reset behavior. The control keeps native required-checkbox attributes; no button is disabled solely until React records acknowledgement. This is source compatibility with native forms, not a new no-JavaScript browser result.

The main saved-fact confirmation uses the displayed current document and current form key. The separate exact-retry panel preserves the submitted old command, version and key. No immutable stored confirmation, canonical value, rollback rule, server ownership check or score policy changed.

## Checks and limits

The RED run selected only the five new U03 cases; the five old cases were unselected by name, not disabled. After the fix, the complete affected file passed **10/10**. Source comparison independently confirms all five original test bodies remain byte-identical, including focus and history-reset assertions.

Scoped TypeScript then found one unsupported `exact:true` option in the new Testing Library role query. Its string accessible-name query already matches exactly. Removing that option preserved every assertion; only the affected history-reset case ran again and passed. Final scoped types passed with two roots, three ambient inputs, 482 source files and zero diagnostics. Scoped lint and formatting passed. The earlier 282-case integrated campaign was not repeated.

Sealed Node 22 receipts are in `/private/tmp/resumide-u03-ack-vc219k4e/`: `red.json/log`, `green.json/log`, `query-followup.json/log`, `types-red.json`, `types-red-observation.json`, `types.json`, `static.json` and `assertion-preservation.json`. The initial type diagnostic is transcribed from tool output; it is not a preserved raw error log. Behavioral runs retained stable scoped source hashes and ended with their owned process groups absent. No real credentials or dotenv configuration were loaded.

These are synthetic React Router/rendering and source/type results. No database, SQL, provider, Docker, native browser, owner-file, Git or deployment operation ran. Actual browser history restoration, keyboard/native-form acceptance and managed transaction behavior remain separate gates.

At this intermediate checkpoint, full U03 still required the exact merged-value clarification preview. The next section records the approved implementation. The intermediate result and failed receipts remain distinct from final verification.

## Intermediate acknowledgement source

| File                                         | SHA-256                                                            |
| -------------------------------------------- | ------------------------------------------------------------------ |
| `app/components/AuthoringWorkspace.tsx`      | `fbd652d25a79e1e7096495333209cec64ac9f1cf3c38e3d7624225e09a4b16cd` |
| `tests/components/WorkspaceRepairs.test.tsx` | `31cbba42079381489657491a97ec59a51bd2595d05038f2dd4f22c39743adccd` |

Original source baselines were `1059f826db304d395907ccaff91117942af2cfbe2a7f1a86855b66a14a2275cb` and `bc1deceb39cdb0834139752cad184a8b4dd048d8715bd9c0aa93caa6af6bd01b`. Root's allocation and synchronization receipt are authoritative. The intermediate source and test snapshots remain in the private receipt directory.

## Complete clarification review flow

Root approved `u03-preview-contract.json` before dependent UI changes. Three additional actual cases failed on the intermediate UI, with nine assertions: it still sent direct clarification, lacked the complete preview and final native command, showed a failure retry after preview success, and reused an old failed command's binding for a new preview. Those REDs remain in `preview-red.json/log`.

The first native form now posts `preview_clarification` with the answer, target, named version and key. It has no confirmation input and does not save a fact. The server response supplies the exact complete value, before-value and digest. A separate final form displays that full text and question context, links to the exact saved fact/version, and submits the immutable returned command plus digest and one fresh required confirmation checkbox. The valid final button is enabled before checking the box, preserving native form validation rather than depending on a React-only acknowledgement gate.

Changed answers, head/target context or new preview bindings invalidate the prior acknowledgement. A stale preview remains visibly unavailable; it is not retargeted to the current version. Drafts remain available for a fresh preview. Both native form actions preserve only `?focus=<fact UUID>` so a preview for a non-first contribution does not fall back to the default target. Answer text and full reviewed values never enter the URL.

Successful previews do not show the failed-save retry panel. Failed commands retain their original proof and payload for exact retry. A new preview always uses the current document/key. The main current-fact confirmation remains separate from that retry. Server ownership, proof validation, CAS, exact replay and SQL admission are backend/runtime responsibilities, not inferred from these UI checks.

The final affected component file passed **13/13**. It covers full-value rendering, immutable native form fields/hash, one final acknowledgement, non-first focus, draft/head invalidation and exact failed-proof retry, alongside the prior controls. Root explicitly reviewed refinement of the old clarification tests: setup now obtains a server preview before checking the final acknowledgement; a changed target has no final review until its own preview. Focus selection, cleared drafts after focus/history restoration, reset acknowledgement and draft retention assertions remain. The earlier byte-identical-five-test result applies to the intermediate phase; it is not a claim that final test bodies are unchanged.

`e2e/authoring.spec.ts` now previews each clarification, compares the entire displayed merged value, checks the fresh final acknowledgement and then commits. Existing final-fact, undo, access and JavaScript-disabled editing checks remain. This is source adaptation only; no browser or managed fixture ran. Its original hash was `69ac8f474a86cc5fc389640a263e6fd50fe2b83d3cfa3d3febd72b7ca648dc61`.

Final scoped types passed with three roots, three ambient inputs, 511 source files and zero diagnostics. Scoped lint and formatting passed. Read-only dependency transfer verified exact prior/author hashes for backend repository `b3f50f57` and route `8aae5e5f`; these were actual production exports, not replacement stubs. Final integrated evidence must bind the backend's terminal packet. `preview-green.json/log`, `types.json`, `static-preview.json` and `preview-dependency-inputs.json` record this phase. The source, provider, database, native browser and release evidence tiers remain separate. Canonical rejected-draft handling and actual browser/native acceptance remain Root-owned follow-up rather than hidden closure claims.

## Final source packet

| File                                         | SHA-256                                                            |
| -------------------------------------------- | ------------------------------------------------------------------ |
| `app/components/AuthoringWorkspace.tsx`      | `2df2550159d9a600b636fafd5c8d8c57778febb94b2cf8beecdc5d597c21aebc` |
| `tests/components/WorkspaceRepairs.test.tsx` | `44370248cd8cf028e60aa5fd44f5afc73316cf1cacd12da3f135ee49dc92bb26` |
| `e2e/authoring.spec.ts`                      | `a3cc24b1a46aa11e7acebdda33a56ee6986bd8cefa20f08e62c0710333c5a93b` |

## Final whitespace review correction

Root's source review found that browser whitespace collapsing could hide line breaks in the displayed before-value and complete reviewed fact. Only those two read-only blocks now use inline `white-space: pre-wrap` and `overflow-wrap: anywhere`. The prior source hash was `bab10731c32b6855f89db5dc77c16f4940ef5e5e2d7365f5533b524140648e38`; the table above records its replacement. The component tests and E2E source remain unchanged. No style-only test or repeated 13-case campaign ran. Scoped lint and formatting include this delta; Root's first combined gate remains pending. These styles are source evidence, not an actual visual or native browser acceptance result.
