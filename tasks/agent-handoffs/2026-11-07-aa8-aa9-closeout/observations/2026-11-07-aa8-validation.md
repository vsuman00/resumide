# AA8 synthetic metadata tests

The tester prepared the first AA080 metadata test slice in the separate sandbox worktree. The corpus manifest contains no documents, resume or job-description text, personal data, or acquired corpus. Declared permission references are fixture metadata, not independently verified rights.

Owned files:

- `tests/fixtures/evaluation-corpus.ts`: fresh fixture factories and the deterministic `EVALUATION_CORPUS_DEMO` used by the CLI. The three metadata records cover native, scanned and mixed PDF classes.
- `tests/unit/evaluation-corpus.test.ts`: schema/version/unknown-field rejection; required permission, provenance and purpose; unauthorized source kinds; segment and format exclusions; lifecycle and expiry boundaries; explicit access groups; duplicate IDs and hashes; mixed-batch counts; output privacy; immutable forward-only transitions; and unchanged representative/release readiness.

The backend API was agreed directly with its owner before the tests were written. Its module was copied into the previously missing worktree path solely for local source alignment, with the owner's permission. That copy is not part of the tester patch.

Frozen inputs:

- Fixture SHA256: `a39d653b894c7e3dd1b069961c4f6b679bc0025cde9f89764f348049d307313d`.
- Unit tests SHA256: `0b98a4b7f0c9314218f2f3137e3d0372e465e18be5dc0fe216cb022e13f69013`.
- Backend module SHA256: `212c6dfc732cef2e6d9c7a048ef1d7a8df37058ee5e8b98f2bf5dd5206628fc3`.

Node 22 Prettier completed successfully for both owned files. `git diff --check` exited 0. No test execution occurred in this worktree: the coordinator requested one integrated targeted run, followed by the applicable type, lint and build checks. No AA7 checks, database, Docker, provider, migration or external-data operations ran.

AA080 acquisition and the later annotation, partition, calibration and representative-release requirements remain open. These tests establish metadata behavior only. The coordinator owns integration and canonical task evidence; CLI subprocess checks belong to the CLI owner.
