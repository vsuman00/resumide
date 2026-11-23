# FreeType V2 review packet

V1 remains byte-identical in its original 31-file manifest. V2 corrects provenance and resource guards without changing the vendor patch, original packaging, tests, compiler flags, fonts or assertions.

The V1 copied signature receipt covers main and sid, not trixie-security. V2 instead binds the exact prior native Expat build receipt, its security signers and the security release hash, then the immutable 6f image's metadata hash for that receipt. The build still requires fresh gpgv with the pinned archive keyring before extracting anything. The source index expands to 6,366,177 bytes; the four source archives expand to 22,628,588 bytes. These are separate values.

Terminal checks now enforce the same per-phase deadline, global native deadline, individual log cap and aggregate export cap after a process exits. A final check covers package and receipt copies. No successful exit can bypass those bounds.

The proposed host admission is 7,500,000,000 bytes with the active 5,176,082,432-byte floor unchanged. That leaves 2,323,917,568 bytes at admission. Known source input and expansion sizes are modest, but cold dependency unpacking, compiler and cache peak demand remain unknown. The host wrapper samples minimum free space, aborts the exact process group at the floor or deadline and never prunes or retries. This needs its own one-attempt allocation; expired E-011 is not reused.

The budget adapter provides five comparative original/patched controls, not a standalone failing RED run or a font exploit. The old-header metrics client is dynamic. The original Debian static client compiles after fresh SDK installation; old-header static coverage is not claimed. The missing optional upstream font test and actual CVE reproduction remain not run.

Only the source recipe/context is eligible for the requested native build. The separate libfreetype6-only runtime installer is a source proposal for later canonical integration after artifact review. ROOT and its 6f worker are unchanged; no compiler, container or native test has run for FreeType.
