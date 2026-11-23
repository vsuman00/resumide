# Updated-key AI validation

The updated local OpenAI key works for the configured `gpt-6-luna` model. One model-access request and all five generation requests returned HTTP 200. The generation checks used the actual qualitative, rewrite and three Build service paths with synthetic input. No browser, database or PDF compilation ran in this AI check.

| Path                    | Observed result                                                                            | Input / output tokens |
| ----------------------- | ------------------------------------------------------------------------------------------ | --------------------- |
| Qualitative feedback    | No cited tips or retained changed bullets                                                  | 569 / 45              |
| Explicit resume rewrite | No retained changed bullets                                                                | 383 / 92              |
| Build: fix              | Repaired the missing LaTeX brace; response binding and unchanged surrounding code verified | 291 / 37              |
| Build: rewrite          | No retained replacement                                                                    | 291 / 38              |
| Build: resume           | No retained replacement                                                                    | 289 / 34              |

Five generation requests used 1,823 input and 246 output tokens. There were no retries, missing usage records or observed provider errors. Source bindings were unchanged and the client process group was independently confirmed absent. Credentials, prompts and raw responses were not retained. The [raw sanitized receipt](r01-ai-live-actual-raw.json), [control receipt](r01-ai-live-actual-control.json) and [summary](r01-ai-live-summary.json) preserve the evidence.

The four writing outcomes do not establish a provider failure or a product defect: the small fixture was already concise. The probe did not record proposed-versus-retained counts, so it cannot distinguish an empty proposal from an edit filtered by source-evidence rules. Useful writing, every Build mode's factual safeguards, authenticated browser apply/undo, and the full consumer gate remain open. The original run correctly remains `FAILED_OR_INCOMPLETE`; the narrower successful access and syntax-fix results do not relabel it.

Next: diagnose source selection and proposal filtering locally, using count-only evidence and synthetic regressions before changing safeguards or making further provider requests. The owner's resume remains local and is not included in this live test.

The separate [local PDF diagnostic](frontend-owner-pdf-diagnostic.md) found a readable native-text layer, but none of 14 selected passages passed identity eligibility: seven needed clarification and seven lacked a matching support anchor. This does not establish transcription accuracy or explain the earlier model outcomes. The [synthetic follow-up](frontend-writing-alignment.md) reproduced two source-boundary failures, with 12 controls passing. Those tests remain unfinished in their isolated worktree; no writing repair or broader coverage is claimed.

The integrated source candidate subsequently passed `npm run verify`: 2,217 tests across 178 files, formatting, lint, TypeScript, and web then worker builds, with 649 unchanged inputs. [Receipt](integrated-verify-07.json). This suite excludes the explicitly unfinished alignment diagnostic. The previous permission-fixture failure is preserved; its test now sets and checks the intended public mode before the unchanged denial assertion. Browser, managed database, live-provider and Docker tests were not part of this combined check. The five live AI requests above are separate evidence.
