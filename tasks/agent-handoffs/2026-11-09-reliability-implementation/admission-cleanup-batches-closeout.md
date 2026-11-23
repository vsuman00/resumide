# Bounded multi-batch upload cleanup

CR-R17-S05 fixes a recovery limit in the privacy worker. It used to process one batch of at most four uploads per deletion attempt. Every additional batch consumed another attempt even when the previous batch succeeded.

The worker now claims another batch after recording the previous batch on the same live deletion claim. It stops when the database returns an empty batch, the claim is refused, a receipt fails validation, or the shared 20-second recovery deadline expires. Every batch is checked before Storage access. A repeated upload ID, repeated key, inconsistent path or count beyond the original captured inventory stops recovery. The deadline reaches the database and Storage transports. A late identity lookup cannot trigger deletion, and a late absence response cannot trigger a completion receipt.

Five regressions reproduced the old one-batch behavior and missing deadline before the repair. The focused suite passed 108 cases across the four affected files. It verified a five-upload recovery across two batches, malformed later batches, deadline expiry during a second batch and transport cancellation. The existing native PostgreSQL 17 recovery fixture also passed with the same SQL. [Verification receipt](admission-cleanup-batches-evidence.json).

The integrated local suite passed all 6,790 tests across 323 files, formatting, typecheck, lint and both builds. Lint reported four existing warnings.

The current account-deletion hold and retry policy still apply. A fresh claim resumes remaining work after a deadline and skips already-cleaned rows. Durable progress across deadline-limited attempts, unresolved writers and historical rows, final retirement of account-linked records, and live Storage verification remain open.
