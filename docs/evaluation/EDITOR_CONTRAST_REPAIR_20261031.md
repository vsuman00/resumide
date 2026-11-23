# Editor selection and dropdown contrast repair

Date: 2026-10-31, Asia/Kolkata. Owner-reported Build selection and dark-theme option visibility issues. Tested on the dirty working tree based on `a0b239299d75b0bd64b588fe743ebe2975fb28b9`; no publication or deployment.

## Reproduction and repair

The browser regression reproduced blank selected code in both themes: the selected regions contained zero rendered foreground pixels. The editor's explicit transparent `-webkit-text-fill-color` continued to hide glyphs despite the selection styling. Removed that override and used the supported `::selection` foreground/background pair. The normal transparent textarea still overlays the syntax-highlighted source; forced-colors mode uses CanvasText, Highlight and HighlightText.

Native dropdown options inherited light text without an opaque option background. The OS could supply a light popup surface, as in the owner's screenshot. Options and optgroups now receive both foreground and background from the current theme, and selects inherit its color scheme. This covers the menu theme chooser and Build's example/paper controls without replacing their native keyboard behavior.

Application changes are limited to `app/app.css` and `app/components/LatexConverter.module.css`. Source content, selection ranges, compiler/provider paths and theme persistence logic are unchanged.

## Verification

The sequential Chromium regression uses neutral code, selects the entire buffer and checks actual screenshot pixels inside the selected line rectangles. It also checks option opacity and computed text contrast, unchanged source and no horizontal overflow. [Machine-readable receipt](EDITOR_CONTRAST_RECEIPT_20261031.json).

| Mode                     | Rendered selected foreground pixels | Selection contrast | Minimum authored option contrast |
| ------------------------ | ----------------------------------: | -----------------: | -------------------------------: |
| Light                    |                               2,230 |            12.85:1 |                          17.26:1 |
| Dark                     |                               3,336 |            10.38:1 |                          13.18:1 |
| System resolving to dark |                               3,336 |            10.38:1 |                          13.18:1 |
| Mobile dark, 390px       |                               3,287 |            10.38:1 |                          13.18:1 |
| Forced colors            |                               1,334 |            14.37:1 |                             21:1 |

The 200-pixel rendered-text threshold was preserved. Selected-line masking prevents the forced-colors page background being counted as glyphs. The native macOS popup was also expanded through its keyboard interaction and visually verified: Light, Dark and System were readable. [Native dark popup](theme-native-dark-after-20261031.png). Native platform highlight colors are separate from the authored-color ratios in the table.

- Before: [light selection](editor-selection-light-20261031.png), [dark selection](editor-selection-dark-20261031.png).
- After: [light](editor-selection-light-after-20261031.png), [dark](editor-selection-dark-after-20261031.png), [mobile](editor-selection-mobile-dark-after-20261031.png), [forced colors](editor-selection-forced-colors-after-20261031.png).
- `npm run verify`: formatting/source contracts, lint, **143 files / 1,191 tests**, type checking, web and worker builds passed.
- LaTeX source checks and final affected lint/type checks passed. The visual regression passed all five modes with one worker. Eight public accessibility/theme-persistence/mobile-shell cases also passed with one worker, after the editor run.

The first run failed on the actual bugs. The expanded matrix initially timed out because it tried to open example controls while the mobile Code pane was active; the test was corrected to use the visible PDF preview tab before checking those controls. No assertion was deleted or threshold lowered. Formatting drift in the expanded test was corrected before the final verification. Initial before screenshots are preserved. Native-popup capture initially showed only the closed control; native keyboard expansion supplied the actual popup evidence.

Managed Supabase was used only for disposable synthetic authentication. Five exact fixture owners and their associated metadata were checked for cleanup. The timeout left one fixture behind; its sessions were revoked and the exact synthetic account was removed. Final auth/profile/organization/membership/resume/audit/rate-key counts are zero. No real candidate data, provider request, compile request, migration, database reset or Docker change was needed. The anonymous native-popup browser was closed, and private test ledgers were removed.

These checks cover the repaired UI in Chromium and the observed macOS native popup. Formal cross-browser/accessibility/release acceptance and the earlier compiler/PDF limitations remain separate.
