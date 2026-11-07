# Build toolbar control repair

Date: 2026-10-31, Asia/Kolkata. Owner-requested visual repair of Example options and Download PDF on `/build`. Tested on the dirty working tree based on `a0b239299d75b0bd64b588fe743ebe2975fb28b9`; no commit or deployment.

## Reproduction and changes

The options control used a font glyph and measured only 35.63 pixels wide on desktop and 25.23 pixels on mobile. Download PDF changed from a 145.45-by-44-pixel disabled button into a borderless link measuring 117.53 by 40.40 pixels on desktop, or 34 pixels high on mobile. The screenshot's visual inconsistency was reproduced with neutral synthetic source.

`app/routes/latex.tsx` now uses decorative SVG chevron/download icons, named control classes and an explicit expanded-panel relationship. `app/components/LatexConverter.module.css` gives the options control a 44-pixel square target and the download control a consistent outlined style. All three actions are 44 pixels high. Download PDF measures 146.81 by 44 pixels in both disabled and ready states at the reported desktop viewport. Theme tokens supply readable foreground/surface pairs; the narrowest mobile layout gives Download PDF its own full-width row.

## Verification

Six headed Chromium cases ran sequentially against localhost:5173: light/dark at 970 pixels, light/dark at 390 pixels, dark at 320 pixels and light at 1440 pixels. Every case passed target-size, matching-height, no-overlap, no-page-overflow, options-panel keyboard activation and visible download-focus checks. Desktop, dark mobile and narrow mobile screenshots were visually inspected.

Compilation returned HTTP 200 for the existing neutral two-page fixture. Downloaded PDF parsing passed, editor bytes were unchanged and no browser runtime errors occurred. The final desktop axe scan reported zero violations. This is focused Chromium evidence, not formal cross-browser or accessibility acceptance.

- Node 22 `npm run check:latex:source`, `npm run lint`, `npm run test:latex` (**5 files / 106 tests**), `npm run typecheck` and `npm run build` passed. The build retained existing dependency annotation warnings; it completed successfully.
- [Before measurements](BUILD_TOOLBAR_BEFORE_20261031.json), [after measurements](BUILD_TOOLBAR_AFTER_20261031.json).
- [Desktop result](build-toolbar-after-light-970-20261031.png), [dark mobile](build-toolbar-after-dark-390-20261031.png), [320-pixel layout](build-toolbar-after-dark-320-20261031.png).

Managed Supabase supplied authentication for two temporary synthetic owners. Exact auth/session/profile/organization/membership/rate cleanup counts were verified as zero. Shared global rate metadata was preserved. No candidate source, candidate screenshot, provider call, migration, database reset, Docker image change or backend policy change was needed. Temporary browser/probe files and the private auth ledger were removed. Full application CI and worker builds were not repeated for this presentation-only change; formal AA7/release gates remain separate.
