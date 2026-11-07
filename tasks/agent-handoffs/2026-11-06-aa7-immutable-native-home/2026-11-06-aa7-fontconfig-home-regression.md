# Fontconfig failure-branch regression proposal

2026-11-06, aa7_validation. TEST DESIGN plus ONE APPROVED CURRENT-IMAGE RED. The focused benign native-library probe has run; no compiler, database or provider call ran. Existing fc8 acceptance and80-HIGH matrix remain unchanged. Root owns integration and execution approval; frontend owns the production HOME proposal.

## Source and scope

The frontend's versioned Debian Fontconfig2.15.0-2.3 source is HTTPS/hash-bound, not newly archive-authenticated. `fcinit.c:38-99` defines built-in fallback XML with XDG user includes and selects it after the requested configuration fails to load. `fccfg.c:2489-2558` gets HOME directly from the environment and derives XDG config location from HOME when XDG_CONFIG_HOME is absent; this path does not use getpwuid. Source receipt SHA256 `db76962f44eb052f32052211da4753618f682102597a7e9ddc2b8175638684da` is retained in the frontend's `2026-11-06-aa7-pdf-inspector-call-path/fontconfig-source-receipt.json`.

The existing successful sealed-config canary does not exercise this fallback branch. The new probe forces only a benign missing FONTCONFIG_FILE. It does not simulate OOM, reproduce a non-public Expat trigger, or show that hostile TeX can create directories. Native branch exposure and a production exploit are separate claims.

## Probe behavior

New test-only helper: `scripts/latex-runtime/verify-fontconfig-home.py`. It is injected through the existing bounded worker helper as trusted Python source; no image COPY or production dependency is needed. Each observation starts fresh isolated Python with a fixed environment, no inherited XDG variables and no native configuration cache from an earlier case.

1. Record ordinary sealed-config matches under scratch HOME and the image's actual HOME.
2. Create one fixed harmless alias in `/scratch/.config/fontconfig/fonts.conf` with private permissions. No candidate data is used.
3. Force the missing-config branch under `os.environ['HOME']` first, then under the writable scratch control. Record actual native config enumeration and a substituted family marker that shows whether the canary XML was consumed.
4. If the proposed immutable HOME exists, observe that same forced failure under `/opt/latex/home`. The old image can still record actual scratch consumption when this directory is absent.
5. Recheck ordinary sealed40 family/style tuples and exact config/font/cache enumerations. Remove only the known canary and its newly created empty parent directories in finally; confirm absence.
6. Inspect the image's trusted supervisor/C environment definitions without executing them. Require both HOME values and the image's actual HOME to be `/opt/latex/home`, no XDG variables, and root-owned empty0555 directory metadata. Require the writable control to consume the canary, actual/proposed HOME failure paths to consume no scratch config, and sealed XML hashes/matches to remain equal.

The helper emits fixed-path observations before returning a strict nonzero failure. Thus the required old-fc8 RED must include actual fallback canary consumption, not merely a missing immutable directory. The native probe has an18-second overall snapshot deadline, at most5 seconds per child and bounded output checks, inside existing worker limits. These checks do not alter production or original test timeouts.

## Proposed verifier integration

The verifier adds one24th group, `fontconfig-failure-branch-immutable-home`. It reads/hash-binds the helper, injects it with `python3 -I -B -c` and requires all safety/parity/cleanup booleans. The original23 groups and20 PDF cases remain intact. `latex-test-fixtures.ts` gains only the helper path in its source hash list. No production source is changed in this worktree.

| File | Proposed SHA256 | Current root baseline |
| --- | --- | --- |
| `verify-fontconfig-home.py` | `9757360e4346be68fbd544afdaab05983621b5af938dc18abc35f6dc3dc37940` | New test-only helper |
| `verify-latex-sandbox.ts` | `a7044b72df8af8d3df5196163635ada37bbfd828625a8139b0a61e0e088919c5` | `bc9adeaa70af6903611772d6fb636da687f9964cd71d2c55f9838d65863fd391` |
| `latex-test-fixtures.ts` | `99417cf8a6016dbad7fad5e996d6a644b50d2a0fbd1e16c6b914508147949c07` | `d206b1e2372692f7080e296f11a86693952639e0bcce1245910cf62cb8b4fbce` |

AST parsing of the helper and embedded child program, Node22 Prettier/ESLint on both TypeScript files and scoped diff whitespace checks exit0. No native result is claimed. Root must review these frozen sources before allocating the strict current-fc8 RED, followed by a minimal immutable-HOME candidate's focused GREEN. Full unchanged suites are not requested for this preparation slice; the eventual native-frame image still needs its complete source-bound acceptance.

## Approved actual RED result

Root reviewed the complete helper and explicitly allocated one focused probe on immutable fc8. Session17193 reached terminal: driver0/no signal; actual strict helper child1/no signal. The outer Python0 is harness transport only, because the unchanged rawLatexAttempt requires container0. It runs the exact helper as a fresh isolated child and preserves its real status/full sanitized JSON. Missing JSON, another helper status, missing observations or cleanup failure would fail the driver and would not count as the intended RED.

Observed actual HOME is `/scratch`; forced native configuration failure consumed `/scratch/.config/fontconfig/fonts.conf` and applied the known marker. The separate writable control also consumed it. All40 ordinary sealed matches were preserved; the canary and its two new empty directories were removed. The proposed immutable directory is absent on this old image, but the desired RED is established by actual HOME canary consumption before the immutable-directory safety check. This is a benign fallback-branch result, not an OOM/unknown-CVE or hostile-TeX reproduction.

The exact raw helper removed its owned container and asserted absence. Independent checks found zero converter containers, zero anchored driver processes and no listener on3110. Helper/source hashes remained stable. The slot was released to root immediately afterward. No second probe or full matrix ran; focused GREEN awaits reviewed immutable-HOME integration and a new image/allocation.

Execution driver: `2026-11-06-aa7-fontconfig-red.ts`. Full sanitized observations, source/input/image hashes, configuration, actual statuses and cleanup are in `2026-11-06-aa7-fontconfig-red.json`, SHA256 `f0c18b0ab6cd999ed418aa8e1533308db75e89cbbeca541f9cdc216fa5c45262`.
