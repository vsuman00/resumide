# Native Poppler attempt 7

The source candidate and fresh installation checks completed. Docker exited 0 after 269.997 seconds. The artifact image is `sha256:f6e24849981889d886b6391d27548a72a7d470f325fed416c9be62b378efbb33`. This is an artifacts image, not the final converter worker.

CTest actually recorded 70 passing executables and one failure. All 56 Qt summaries are complete. The sole failed row matches E-010: original `testPgp(gpg)` at line 311, with an empty signer. That class retains 11 passes and one failure; later assertions 312-315 remain unexecuted. The cause is unresolved. No source, key, clock, feature or assertion changed.

All 107 consumer cases passed. The seven PDF fixtures passed exact standard bbox/TSV bytes, frame coordinates, text/order and font parity. The pinned empty two-page fixture remains rejected by both consumers as `output_invalid`; orientation retains its expected `layout_overflow`. The old-header client passed, all 2,716 baseline exports remain, and all 14 runtime ELF records have no OpenJPEG dependency/import. The disabled-JPX check reports the existing unknown-filter/EOF behavior; it does not establish whole-PDF rejection.

Normal fresh APT upgraded only `libpoppler147` and `poppler-utils` to `25.03.0-5+deb13u4+resumide1`, removing no packages. All other installed packages stayed unchanged. The fresh nonroot CLI, text hash and installed runtime ELF hashes passed. The two DEBs total 2,108,228 bytes; all retained exports total 4,576,422 bytes, within the reviewed limits.

All 81 review and 24 context inputs stayed unchanged. The exact artifact container was never started and was removed; absence was verified. Worker images, failed attempts and scanner evidence are retained. No scanner ran, database was used, environment was promoted or runtime package was adopted. The coordinator must review these artifacts and E-010 before final worker integration, then run the complete worker, profile, rendering, browser and security checks.
