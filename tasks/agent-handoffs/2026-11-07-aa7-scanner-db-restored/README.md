# Scanner cache restore handoff

The one coordinator-allocated host restore passed. The helper exited 0 without a signal in 4.254 seconds. No scan ran. This restores the private Trivy cache, not the application database.

The read-only preparation reviewed helper `370333a0a999489bf8937859d9404113acd8b29165d98b5274b52a8e92149e62` and verified the saved 12 safeguard results without rerunning them. The target was absent, including dangling symlinks. Named input hashes and metadata matched, and free space exceeded the required 5,176,082,432 bytes. No blocking defect was found for this bounded allocation; this does not establish protection against a hostile process running under the same local UID.

The helper retained the archive, streamed and validated gzip EOF/CRC, size and SHA-256, published through a no-clobber hard link, removed its exact temporary file and verified the result. A separate read-only check confirmed the restored 1,686,421,504-byte database has SHA-256 `acc7850179a48dbe868f97eb59ea186510800ade8ee815392fa2e7b26875c22d`, UID 501, GID 20, mode 0644 and mtime 1793927755000000000 ns.

The gzip archive, Trivy executable, Java database and both metadata files retained identical hashes, sizes, ownership, modes, timestamps and identities before and after. Helper source was unchanged. Free space after verification was 7,612,268,544 bytes. The actual helper process is terminal; there is no restore or scanner process from this task.

`readiness.json` preserves the earlier pre-allocation state. `restore-run/process.json` records the exact command, PID, terminal code, timing, independent before/after fingerprints and successful helper receipt. `restore-run/stdout.json` retains raw helper output; stderr is empty. `review-manifest.json` binds these files.

No Docker action, application database operation, provider request, scan, download, source change or unrelated cache cleanup occurred. The saved safeguard tests were not rerun. The coordinator must allocate any later scan separately; restored cache integrity supplies no vulnerability, runtime, phase-acceptance or release result.
