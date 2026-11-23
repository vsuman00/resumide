# AA8 corpus metadata CLI

Implemented and integrated `scripts/verify-evaluation-corpus.ts`. Focused Prettier and ESLint pass under Node 22. All 14 actual integrated CLI subprocess checks pass, with source hashes unchanged. The coordinator's separate pure-module suite passes 44 tests.

With no arguments, the CLI assesses the three synthetic demo records using their declared actor and fixed November 7 clock. For an explicit metadata manifest, supply `--manifest <file> --as-of <timestamp> --group <opaque-group>`. Repeat `--group` for multiple memberships, up to 32. Explicit input never inherits demo access groups or time. The coordinator owns the package command.

The CLI reads at most 1 MiB plus an overflow byte from a regular file. Symlinks and special files are refused; strict UTF-8 and JSON decoding precede the pure admission helper. Output contains counts, fixed reason codes and false representative/release flags. An excluded record, invalid argument or read/parse failure returns nonzero. Valid synthetic metadata may return zero while release readiness stays false.

The actual checks cover identical demo output twice, explicit membership, missing and wrong membership, partial unauthorized input, unknown metadata, malformed JSON, invalid UTF-8, oversized files, symlink refusal, invalid time, unknown arguments and missing files. No raw metadata, private path, verification marker or Zod error appeared in stdout or stderr. Exact cleanup removed seven owned metadata files and their temporary directory. No database, Docker, provider or AA7 verification ran.

`check-cli.mjs` is the retained runnable check; actual-cli-receipt.json records every result and before/after source hash. The original pre-integration handoff is preserved. These are synthetic metadata checks, not document acquisition, independently verified rights, annotation, calibration, domain validity or release approval. AA080 representative acquisition remains open. No raw corpus, UI, dependency, deployment or Git publication change is included.
