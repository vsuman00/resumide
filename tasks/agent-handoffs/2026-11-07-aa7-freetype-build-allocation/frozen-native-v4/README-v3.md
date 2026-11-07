# FreeType V3 review amendment

All V1 and V2 files remain unchanged. The native build driver, source patch, tests, flags, fonts and resource policy are identical to V2.

The host copy helper now checks its 8 KiB stderr bound after the child exits. The host process returns nonzero unless artifacts are accepted, exact container cleanup is verified and source hashes stay unchanged. The actual child build exit remains recorded separately.

The security index expands to 6,366,323 UTF-8 bytes and 6,366,177 decoded characters. V3 records both values; the archive expansion remains 22,628,588 bytes. The source-index SHA256 and signature inputs do not change. Only pin filename/hash alignment changes in the Dockerfile, context and proposed runtime installer.

No compiler, container, native test or build has executed. Execution still requires the coordinator's explicit one-attempt allocation on these final frozen hashes. The missing upstream font test and actual exploit reproduction remain not run.
