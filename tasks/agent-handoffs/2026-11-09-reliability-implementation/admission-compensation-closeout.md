# Verified compensation for tracked uploads

CR-R17-S03 repairs two outcomes in the tracked upload path on dirty `main` based on `a0b2392`. A positively acknowledged upload could remain pending when finalization explicitly denied the request. A losing duplicate could be marked cleaned after its Storage delete returned success, with the key still visible.

For an explicit denial, the server first requests the existing exact pending transition for the owner, operation, and upload. That transition refuses an adopted upload and prevents a later adoption of the pending upload. An exact losing-duplicate receipt already records the pending transition. Before removal, the server checks the configured bucket and compares the current Storage object ID with the acknowledged ID. It then requires an explicit object-missing response for the exact key. A distinct object ID or ambiguous response leaves the cleanup obligation open. The original denial or duplicate result still reaches the caller. Unknown finalization or upload responses remain held.

Six red cases reproduced the missing cleanup behavior. The focused 98-case gate exercised the tracked upload, durable state, and actual SDK with synthetic responses. The [PostgreSQL 17 fixture](admission-compensation-native-fixture.py.txt) executed the existing admission, privacy-write and compensation SQL with a substitute for the legacy queue writer. It checked both operation orderings, foreign owner and adopted upload refusal, role privileges, and replay after the deletion request failed. The fixture ran on a private Unix socket. [Verification receipt](admission-compensation-evidence.json).

The final local suite passed all 6,780 tests across 323 files. Formatting, types, lint, and web and worker builds passed. Lint reported four existing warnings.

This verifies compensation in the normal upload request and the existing database transition. Durable account-level retirement still needs writer reconciliation, a fenced recovery path for interrupted requests, and managed Storage verification. Bound-admission records continue to hold account deletion until that work is done. The 84 migration files are unchanged.
