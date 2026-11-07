# FreeType V4 ordering correction

The previous native attempt failed and remains preserved. Normal Debian packaging returned 0, and the old-header library binding, exports and two known-font metric comparisons passed. The later adapter source-hash check failed; no adapter compilation, fresh SDK tests or artifact acceptance followed.

The actual build log shows `dpkg-source --after-build` unapplying the security patch and all five original patches. The failed attempt did not print the post-build CID source hash. Reconstructing the authenticated original after the successful reverse operation gives the original `ca5b9411` hash; this is not presented as an observed read from the failed snapshot.

V4 generates the same hash-bound literal adapter immediately after authenticated preparation, while the patched source is present. It preserves the resulting C file outside the source tree, checks that saved program hash and compiles/runs it later with unchanged commands and assertions. Normal package cleanup remains enabled. The next build will record the actual post-build CID digest as diagnostics.

No patch, packaging rule, compiler flag, test assertion, font, asset or missing-evidence claim changes. The fresh SDK and original dynamic/static tests remain mandatory. V1-V3 stay byte-identical.

The proposed new admission is 7,000,000,000 bytes with the same 5,176,082,432-byte active floor, leaving 1,823,917,568 bytes at admission. The prior partial run observed 626,847,744 bytes of host consumption. Its APT prefix verified 120 archives totalling 107,724,592 bytes and estimated 439 MB of installed space. A complete successful export/fresh-install peak is still unknown; cache eligibility is not a guarantee. The same deadline, polling, log, package/export bounds and exact cleanup stay mandatory. A new named one-attempt allocation is required; no retry has run.
