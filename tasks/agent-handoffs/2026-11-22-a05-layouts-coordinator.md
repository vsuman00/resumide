# CR-A05 calibration and locked fixtures

Base revision `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. The coordinator will integrate the two synthetic fixture modules into the dirty main checkout. Each author works in a separate detached worktree and owns only their assigned fixture and handoff.

| Author | Partition | Fixture | Worktree |
| --- | --- | --- | --- |
| Calibration | Calibration | `tests/fixtures/ocr-reliability-calibration.ts` | `/private/tmp/resumide-a05-layouts-daj6gu32/calibration` |
| Locked | Locked | `tests/fixtures/ocr-reliability-locked.ts` | `/private/tmp/resumide-a05-layouts-daj6gu32/locked` |

Each author receives the layout and label contract and works independently of the parser, prior failures and the other partition. The coordinator will check manifests, source grounding and overlap before tuning. Locked outcomes stay withheld until the candidate is frozen. Distinct families and layout sequences do not establish representative accuracy. Local synthetic data only. No database, hosted provider, Git publication or deployment is in scope.

The authored files matched the returned hashes. Manifest generation bound nine PDFs per partition before tuning. The calibration author then reviewed the parser and identified a legacy branch that could use role and date text from another page. The coordinator reproduced the behavior and restricted it in the candidate profile. Both partition labels and locked outcomes stayed outside tuning. [Verification](../../docs/evaluation/OCR_RELIABILITY_PROTOCOL.md#held-out-registration-and-mixed-field-candidate)
