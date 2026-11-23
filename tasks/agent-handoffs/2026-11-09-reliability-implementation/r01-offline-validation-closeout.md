# CR-R01 offline configuration validation

The AI doctor previously reported three unusable settings as plausible. The allocated path rejected keys over 4,096 characters and malformed organization or project settings only after offline diagnosis. Both modes now apply those limits in the shared resolver. Offline output reports the issue and source without exposing the value. Allocated live mode still stops before dispatch for each invalid setting. [Operator runbook](../../../docs/operations/RUNBOOKS.md#offline-ai-configuration-doctor)

## Verification

On dirty `main` based on `a0b239299d75b0bd64b588fe743ebe2975fb28b9`, three new regression cases initially failed because the offline command exited zero. After the repair, all 78 tests passed under Node.js 22. The new cases also verify that the allocated path refuses all three settings without calling the SDK transport. The real npm command accepted synthetic values at the existing size limits and refused values one character over the limits. It emitted zero requests in both cases.

Typecheck, lint, Prettier and the web and worker builds passed. Lint reported four existing React hook warnings in the JD review components.

| Artifact          | SHA-256                                                            |
| ----------------- | ------------------------------------------------------------------ |
| Resolver source   | `97e56c107c9cac0c3166c66c8c31d38e3afefd2fcdb4c384cedf8fed875a2718` |
| Regression source | `697adbbe72dfee4490dd6cdfac65a96112efe449ef1a26011e59ed09dc3ac729` |
| Failing test log  | `0e7487dc2c3d89bcbb626eb9f0fa5a197cf19b44dfa847d420aaddaa8f9665d4` |
| Passing test log  | `57e5bf7715e7c25ec1fda19b335272b22129badd0bd2f9181e6f26736f0123e5` |

No configured credential was used. The prior model-access receipt remains valid for its dated run. Fresh allocated provider acceptance and useful writing with the current application remain open. [Prior live evidence](r01-live-validation.md)
