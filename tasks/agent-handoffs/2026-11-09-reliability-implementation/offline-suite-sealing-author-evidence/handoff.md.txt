# Offline suite child environment seal

Added only `RESUMIDE_PRIVATE_VERIFY: "aa7-owned-synthetic"` to the OCR pilot test's child environment. `PATH:""`, all seven original cases, every assertion, argument guard and timeout are unchanged. Reversing this env addition reproduces the original file byte for byte.

Before: `21fa5772a60bc6a8d60e5f45a4b1a50e437bf7cb9008e1d48014eb81b409b3c4`. After: `e05b60ca67305a464c2652a2c2dbd161af5cbdf2ecd44a2693d500accab3811f`.

The before-test was deliberately unavailable: the old child could read real checkout dotenv before its script guard. Installed vite-node/Vite source confirmed that call path; no unsafe baseline was launched. The installed Vite `getEnvFilesForMode` returns an empty list for `false`. A private positive/negative probe read only an authored neutral temporary sentinel and confirmed that `loadEnv(..., false, "")` omits it. No real env file was read.

Private packet: `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-offline-suite-seal-zjgqr5dy`. It preserves source snapshots, `before-not-run.json`, `preservation.json`, commands and receipts/logs. Pinned Node22 ran `vitest run tests/unit/ocr/ocr-pilot-cli.test.ts`: **7/1 PASS**, 6.43 seconds, with an allowlisted synthetic env and fresh empty HOME. Scoped lint and format passed. All 799 author source inputs stayed stable. The final packet records log hashes and independently absent process groups.

No Docker executable was reachable in the child; no recognition, native compiler, DB, provider or browser work occurred. This removes the inventory's concrete child dotenv gap and is ready for Root's single broad regression gate; that gate has not run in this leaf. Inventory handoff remains released at `fee64efd85a60bf2bb9803f902181f0662ff2e4304f7d84f25075afde765a102`. Disposable temporary Git fixtures are authorized separately; workspace Git mutation remains unauthorized.
