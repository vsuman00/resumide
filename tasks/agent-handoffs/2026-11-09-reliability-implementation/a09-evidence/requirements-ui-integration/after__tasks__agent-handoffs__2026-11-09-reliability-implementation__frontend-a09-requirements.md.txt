# A09 typed JD review UI

The typed requirements page renders stored clauses, aliases and duration bounds. Current typed saves pause when the writer capability is off. Four focused rendering cases and scoped static checks passed. Root owns the integrated gate and final acceptance.

The three-file allocation covers `analysis.requirements.tsx`, its existing `job-requirement-route.test.ts` and this handoff. The worktree remains at base `a0b239299d75b0bd64b588fe743ebe2975fb28b9` with preserved dirty inputs. The frozen wire hash is `181ed171444fdb114e00c45e771dcb4419cba9ac70f25daba62de7e6c50f9d3b`.

## Reproduced failures

Two actual React Router static-render cases failed on the original route because current and historical v2 JDs lacked the typed clause review. The output instead used the existing flat observations display. After drafting the typed display, a separate static-render case reproduced Save remaining visible for a current v2 JD with the typed writer off. Both failing receipts preserve the rendered behavior and stable source hashes.

## Rendering and save behavior

The route selects the typed display by the stored schema version. It presents literal clauses, OR and AND groups, aliases, unknown interpretations, duration comparators and included or excluded bounds. Raw source quotations remain visible. Separate disclosures contain literal observations, retained source clauses and the recorded version, producer and policy fingerprints. The advanced warning label describes pending review and scoring support while the stored warning value is preserved.

The loader provides the server's typed-writer setting. An off setting pauses current v2 saves while keeping the saved view readable. Historical views retain their read-only status. Current typed saves with the writer enabled use the existing native form fields. The initial and legacy views retain their existing forms. Backend and SQL admission own the independent downgrade protection.

## Verification

The four named cases passed after synchronization. Each fixture copies the approved fields from existing local discovery into an explicit v2 body, then validates it with the actual frozen `JobRequirementRelationsSchema` before providing it to the mocked owned reader. Assertions cover grouped literals and bounds, escaped unknown text, recorded policy metadata, current writer-off behavior, current native form fields with the writer on, and historical readability. This run covers local SSR with validated fixtures and mocked ownership/storage. Managed database and browser acceptance remain open.

All eight previous test declarations remain byte-identical, including the twelve prior cases they represent. Those cases were unselected by the focused filter. The server action and feature guard remain byte-identical. The affected file now has sixteen cases for the integrated gate. Scoped TypeScript passed with two roots, three ambient inputs, 460 source files and zero diagnostics. Scoped lint, formatting and diff checks passed.

The receipts in `/private/tmp/resumide-a09-requirements-1291456g/` include `red.json/log`, `pause-red.json/log`, `green.json/log`, `types.json`, `static-final.json`, the static logs, `assertion-preservation.json` and `baseline.json`. Sealed Node 22 runs used synthetic configuration. Source hashes stayed stable and owned process groups were absent after each run. The final focused receipt binds the synchronized admission, dual reader, Unicode and config inputs.

## Frozen files

| File                                       | SHA-256                                                            |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `app/routes/analysis.requirements.tsx`     | `7882ec477852f56cd0a0627d6e0ae6673e5e57ba5c028320e58fc0942ebd3f38` |
| `tests/unit/job-requirement-route.test.ts` | `0e235284079511db15f72b123a4f6db34481217f69e780f13d602e8341ad35ed` |

The baseline receipt records the original route and test hashes. The scoring abstention change has a separate allocation.
