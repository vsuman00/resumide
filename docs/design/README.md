# Resumide Design System

Status: design implementation complete across all routed surfaces. The category research is in [`COMPETITIVE_UX_RESEARCH.md`](COMPETITIVE_UX_RESEARCH.md), the concept decision is preserved in [`../archive/DESIGN_CONCEPTS.md`](../archive/DESIGN_CONCEPTS.md), and the final page structure and verification boundary are in [`PRODUCT_DESIGN_BLUEPRINT.md`](PRODUCT_DESIGN_BLUEPRINT.md). Public and signed-out flows pass responsive light/dark browser and accessibility checks. Seeded authenticated visual regression and field performance measurement remain verification work.

## Product thesis

Resumide makes the ATS black box visible. The interface should feel like a calm editorial review desk paired with a precise analysis instrument.

The memorable first impression is: **I can see exactly what the ATS saw, what failed, and what to fix next.**

The visual system is inspired by Claude's warm editorial restraint, but it is not an Anthropic clone. Resumide uses its own identity, type, iconography, data visuals, and product language.

## Design direction: Editorial Intelligence

- Warm, paper-like canvas for reading and reflection.
- Ink-like typography with coral action color and teal evidence color.
- Dense product areas use calm, flat surfaces instead of card mosaics.
- Glass is limited to navigation, floating controls, and overlays.
- 3D is used as a lightweight evidence language across the product: source documents, scan progress, score layers, privacy controls, and recovery states each have a purposeful scene.
- Gradients create atmosphere behind content. They never reduce text contrast or encode score meaning alone.
- Every important screen works completely without animation, blur, or WebGL.

## Experience principles

1. **Evidence before decoration.** Results prioritize the score explanation, parser evidence, and next actions.
2. **One dominant action per screen.** Upload, cancel, view result, retry, or apply a rewrite must be obvious.
3. **Progress is honest.** Show real stages and timestamps. Never show a fake percentage or fake ETA.
4. **Calm density.** Prefer aligned regions, dividers, and whitespace over stacking everything in rounded cards.
5. **Motion explains change.** Animation connects upload to processing to result. It does not delay access.
6. **Two designed themes.** Dark mode is not an inverted light mode. Both themes have intentional contrast and elevation.
7. **Trust at every edge.** Privacy, consent, partial results, limitations, and recovery actions stay visible.

## Theme architecture

Use semantic CSS variables. Components consume semantic tokens and never branch on literal light or dark colors.

Theme selection order:

1. Saved user preference.
2. System `prefers-color-scheme` preference.
3. Light theme fallback.

Apply the resolved theme before first paint. Persist it locally and, for signed-in users, in the account preference. The theme toggle has Light, Dark, and System options.

### Light theme

```css
:root {
  color-scheme: light;
  --canvas: #f7f3ec;
  --canvas-subtle: #f1ebe2;
  --surface: #fcfaf6;
  --surface-raised: #ffffff;
  --surface-strong: #e9e1d5;
  --surface-inverse: #1b1a18;
  --glass: rgb(252 250 246 / 78%);
  --ink: #1b1b18;
  --ink-strong: #11110f;
  --ink-muted: #64615b;
  --ink-faint: #817d75;
  --ink-inverse: #faf7f1;
  --border: #dcd4c8;
  --border-strong: #c7bcad;
  --brand: #b5563f;
  --brand-hover: #a64a33;
  --brand-soft: #f3d9cf;
  --evidence: #287a72;
  --evidence-soft: #d7ece7;
  --success: #2f7657;
  --warning: #a66013;
  --danger: #b54545;
  --focus: #2563eb;
  --shadow-color: 25 22 18;
}
```

### Dark theme

```css
[data-theme="dark"] {
  color-scheme: dark;
  --canvas: #121210;
  --canvas-subtle: #171613;
  --surface: #1b1a17;
  --surface-raised: #23211e;
  --surface-strong: #2c2924;
  --surface-inverse: #f7f3ec;
  --glass: rgb(27 26 23 / 76%);
  --ink: #eee8de;
  --ink-strong: #fffaf2;
  --ink-muted: #aaa39a;
  --ink-faint: #8c857c;
  --ink-inverse: #191815;
  --border: #3d3932;
  --border-strong: #554f45;
  --brand: #e08a6d;
  --brand-hover: #ef9c7f;
  --brand-soft: #4a2b23;
  --evidence: #68b9ac;
  --evidence-soft: #183d38;
  --success: #68b88b;
  --warning: #dda34f;
  --danger: #e37d7d;
  --focus: #8bb4ff;
  --shadow-color: 0 0 0;
}
```

### Gradient recipes

Use gradients only through named recipes:

- **Canvas aura:** three radial fields using coral, amber, and teal at 8 to 14 percent opacity. Decorative only.
- **Evidence glow:** teal radial gradient behind the parse comparison or keyword visualization. Maximum 12 percent opacity.
- **Action wash:** coral-to-warm-amber linear gradient for small emphasis bands, never for the primary button.
- **Score ring:** semantic conic segments with a visible numeric label and text status. Color is supplemental.
- **Dark depth:** warm graphite linear gradient from `--surface-raised` to `--canvas`, with a 1px border.

Do not use purple-blue AI gradients, full-screen blur, animated gradient text, or gradients behind long-form text.

## Typography

- **Display:** Newsreader Variable, weights 450 to 600. Editorial but highly readable.
- **Interface and body:** Manrope Variable, weights 400 to 700.
- **Evidence and numeric data:** IBM Plex Mono, weights 400 to 600, with tabular numbers.
- Self-host WOFF2 subsets. Preload only the primary UI regular and medium faces.

Type scale:

| Token      | Desktop | Mobile | Use                       |
| ---------- | ------: | -----: | ------------------------- |
| Display    |   64/66 |  42/44 | Marketing hero only       |
| H1         |   44/50 |  34/40 | Page title                |
| H2         |   32/38 |  27/33 | Major workspace region    |
| H3         |   22/29 |  20/27 | Result section            |
| Body large |   18/29 |  17/27 | Introductory copy         |
| Body       |   16/25 |  16/25 | Default content           |
| Small      |   14/21 |  14/21 | Secondary metadata        |
| Label      |   13/18 |  13/18 | UI labels and badges      |
| Data       |   14/22 |  13/20 | Parser evidence and trace |

Headings use balanced wrapping where supported. Body copy is capped at 68 characters per line. Scores and percentages use tabular numbers.

## Layout and spacing

- 4px base unit.
- Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64, 96.
- App shell max width: 1440px.
- Reading/result column max width: 760px.
- Marketing content max width: 1200px.
- Desktop grid: 12 columns with 24px gutters.
- Tablet grid: 8 columns with 20px gutters.
- Mobile grid: 4 columns with 16px gutters.
- Touch target minimum: 44 by 44px.

Radius is hierarchical, not bubbly:

- Controls: 8px.
- Panels: 12px.
- Hero artifact and large modal: 18px.
- Pills: status labels only.

Use 1px borders and surface contrast before shadows. Limit shadows to floating overlays and the 3D resume artifact.

## App shell and navigation

### Public and authentication shell

- 64px top navigation with wordmark, Product, How scoring works, Privacy, theme control, and one Analyze Resume CTA.
- Navigation may use restrained glass over the canvas aura. Fallback is an opaque surface.
- On mobile, use a clear menu sheet. Do not hide the primary Analyze action.

### Signed-in workspace shell

- Desktop: 232px left rail with Resumes, New analysis, Account, Privacy, and future Billing.
- Tablet: 72px icon rail with accessible labels.
- Mobile: top app bar plus four-item bottom navigation. New analysis remains the emphasized action.
- The content header owns the page title, status, and primary action. Do not repeat the same title inside a card.

## Page-by-page blueprint

### Home `/`

Purpose: orient the user and resume useful work in under five seconds.

First visual order:

1. `Resume workspace` heading and Analyze Resume action.
2. Latest analysis with score, status, target job, and Continue/View Result action.
3. Paginated analysis history.

Replace the large resume card grid with a responsive list or table. Each row shows resume name, target role/company, overall score, status, updated date, and overflow actions. On mobile, each row becomes a compact two-line item, not a decorative card.

Pagination moves focus to the history heading, and changing the sort keeps focus on the select. Status labels use readable text in both themes. Chromium verified keyboard pagination and the original PDF action at 200% page zoom with synthetic accounts. [Zoom verification](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-u19-history-source-browser-zoom.json)

Empty state: a small 3D paper stack, `Run your first ATS visibility check`, a one-sentence explanation, and the Analyze Resume button.

### Sign in `/auth`

Purpose: establish trust and finish authentication with minimal friction.

- Two-column composition on desktop: concise trust statement and product artifact on the left, email magic-link form on the right.
- Single focused form on mobile.
- Explain why sign-in is needed: durable private results and cross-device history.
- Success state replaces the form with a clear email check state and resend timer.
- Invalid or expired links offer resend, change email, and return actions.
- Focus follows the sign-in outcome. An invalid email returns focus to the field. A resend failure focuses the service error and preserves the address for retry. An expired link or successful send focuses its heading. [W3C error identification](https://www.w3.org/WAI/WCAG22/Understanding/error-identification.html) · [W3C focus order](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html)

### Upload `/upload`

Purpose: submit a resume and optional job context confidently.

- Desktop split: 7-column form and 5-column live summary/preview.
- Section 1: Target job, explicitly marked optional.
- Section 2: Resume PDF dropzone with file metadata and replace/remove controls.
- Section 3: AI consent and privacy disclosure in plain language.
- Sticky submission footer shows file readiness, expected next step, and Analyze Resume.
- Validate each section inline. Keep user input after recoverable failures.

The dropzone is a tactile paper tray. On drag, the top paper rises 4px and the border changes to evidence teal. No full-panel blur or bouncing animation.

### Analysis progress `/analysis/:id`

Purpose: reduce uncertainty during slow work and provide control.

- Left: lightweight 3D scan artifact made with CSS transforms and SVG scan line.
- Right: real stage timeline: Secure upload, Extract text, Parse structure, Score evidence, Generate feedback, Save result.
- Current stage has one active motion. Completed stages remain static.
- Show last update time and `You can safely leave this page` when processing is durable.
- Keep Cancel visible only while cancellation is valid.
- Partial, failed, cancelled, rejected, and needs-OCR states each get distinct explanation and next action.
- A status retry moves keyboard focus to the live status while the check runs. The next Tab can reach the evidence link once review is available. [Zoom verification](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-u19-progress-browser-zoom.json)

### Result `/resume/:id`

Purpose: convert analysis into prioritized action, not an endless stack of cards.

Desktop composition:

- 5-column sticky resume viewer.
- 7-column analysis workspace.
- Sticky in-page tabs: Overview, ATS Evidence, Parse View, Keywords, Rewrite.
- Result header contains overall score, confidence/limitations, target job, and the three highest-impact actions.

Sections:

1. **Overview:** score breakdown, strengths, top fixes, and estimated impact.
2. **ATS Evidence:** deterministic checks with rule name, evidence, effect, and remediation.
3. **Parse View:** original and extracted structure synchronized by page and section. Warnings link to evidence.
4. **Keywords:** coverage groups, matched/missing terms, and context evidence. Call it Heatmap only after a real overlay exists.
5. **Rewrite:** original and suggested text in a diff-like layout with Copy, Accept, and Undo. Never imply invented experience is acceptable.

On mobile, the viewer becomes a Preview tab or full-screen sheet. Do not place a sticky 100vh PDF above or below all analysis content.

### Privacy `/privacy`

Purpose: make sensitive controls clear and recoverable.

- Explain retention and request consequences before actions.
- Separate Export data and Delete account into distinct rows.
- Deletion uses a confirmation dialog with re-authentication and explicit scope.
- Focus starts on **Cancel** in the deletion dialog. Tab stays inside the dialog, and closing it returns focus to **Review deletion**. [W3C modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
- Chromium verified sign-in retry and both deletion dialog steps at 200% page zoom with simulated services. The tested retry and final deletion controls were visible at 320 CSS pixels. [Zoom verification](../../tasks/agent-handoffs/2026-11-09-reliability-implementation/cr-u19-account-browser-zoom.json)
- Request history uses a status list with submitted date, current state, and completion details.

### Error, 404, and expired session

- Use the same shell and typography as the product.
- State what happened, what data is safe, and what the user can do next.
- Include a request ID for server errors.
- Never show a blank page, raw stack trace, or generic `Oops` in production.

### Future billing

- Calm plan comparison with one recommended plan, clear quota, renewal date, and invoice history.
- No dark-pattern urgency, hidden renewal terms, or decorative pricing card grid.

### Future enterprise administration

- Reuse the workspace rail.
- Members use a dense table with role, status, last activity, and actions.
- Policies, audit events, and retention settings use clear sections and change histories.
- Destructive controls are isolated from routine settings.

## Component vocabulary

- `AppShell`, `PublicShell`, `WorkspaceRail`, `MobileTabBar`
- `PageHeader`, `SectionHeader`, `ActionBar`
- `Button`, `IconButton`, `MenuButton`, `ThemeControl`
- `Field`, `Textarea`, `Checkbox`, `FileDropzone`
- `StatusBadge`, `ScoreRing`, `ScoreBreakdown`, `ConfidenceLabel`
- `StageTimeline`, `EmptyState`, `ErrorState`, `Skeleton`
- `ResumeViewer`, `EvidenceRow`, `ParseComparison`, `KeywordCoverage`
- `RewriteDiff`, `RequestHistory`, `DataTable`, `Dialog`, `Toast`

Cards are permitted only when the object itself is independently selectable or portable. Use sections and dividers for continuous analysis content.

## Glass, 3D, and motion rules

### Glass

Allowed:

- Top navigation.
- Result sub-navigation.
- Resume viewer controls.
- Modal or bottom-sheet chrome.

Not allowed:

- Form fields, score panels, evidence rows, tables, long-form content, or full-page backgrounds.
- More than two overlapping blurred surfaces.

Use `backdrop-filter: blur(12px)` only on bounded elements. Provide an opaque fallback. Do not animate blur.

### 3D

Start with CSS 3D transforms and SVG, not Three.js.

- Hero: a three-layer resume stack showing source PDF, parser structure, and evidence overlay.
- Upload: one paper lift interaction on drag.
- Progress: a document plane with a single scan line linked to the real current stage.
- Results: a subtle perspective transition when switching between Resume and Parse layers.

Pointer tilt is desktop-only, max 4 degrees, updates through `requestAnimationFrame`, and stops when the element is offscreen. Disable it for touch, low-power preferences, reduced motion, and hidden tabs.

WebGL is a later enhancement only if it proves a clear improvement and adds no more than 80KB compressed to the initial experience. It must be lazy-loaded after the primary content is interactive.

### Motion tokens

```css
:root {
  --duration-instant: 80ms;
  --duration-fast: 140ms;
  --duration-base: 220ms;
  --duration-slow: 360ms;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
}
```

- Hover and press: 80 to 140ms.
- Panel/tab transition: 180 to 220ms.
- Route/hero entrance: up to 360ms.
- Never use a one-second fade for standard content.
- Only animate `transform` and `opacity` during routine interactions.
- `prefers-reduced-motion: reduce` removes parallax, tilt, scan travel, and stagger. State changes remain immediate and understandable.

## Interaction state contract

| Feature  | Loading                   | Empty                          | Error                       | Success                             | Partial                        |
| -------- | ------------------------- | ------------------------------ | --------------------------- | ----------------------------------- | ------------------------------ |
| History  | Row skeletons             | First-analysis action          | Retry with preserved shell  | Paginated rows                      | Stale data label if cached     |
| Upload   | Button and local progress | Dropzone guidance              | Inline recovery             | Navigate to durable progress/result | Upload saved, analysis queued  |
| Progress | Initial status skeleton   | Not applicable                 | Retry or upload again       | View result                         | Deterministic result available |
| Result   | Section skeletons         | Honest no-evidence message     | Retry/read-safe recovery    | Prioritized analysis                | Missing AI sections labeled    |
| Parse    | Page skeleton             | No detected structure guidance | Page-level retry/error      | Synchronized evidence               | Unsupported pages labeled      |
| Keywords | Compact loader            | Add a job description          | Keep resume result usable   | Coverage plus context               | Some terms unavailable         |
| Rewrite  | Section loader            | No grounded rewrite available  | Retry without losing result | Copy/accept feedback                | Some suggestions unavailable   |
| Privacy  | Row skeletons             | No requests yet                | Clear retry                 | Request ID and state                | Processing state with timeline |

## Responsive behavior

Verify 390, 768, 1024, 1366, and 1440 CSS-pixel widths.

- Mobile navigation and result tabs are intentionally redesigned, not merely stacked.
- Data tables expose the same actions in compact rows.
- Charts and score visuals always have text equivalents.
- Resume preview opens in a sheet when space is constrained.
- No horizontal page scroll at 320px or 200 percent zoom.
- Touch targets remain at least 44px and do not depend on hover.

## Accessibility

- WCAG 2.2 AA minimum.
- Body text contrast at least 4.5:1; large text at least 3:1; UI boundaries at least 3:1 where required.
- Visible focus ring uses `--focus` and is never removed.
- Theme control, tabs, accordions, dialogs, dropzone, score, and progress use correct keyboard and screen-reader patterns.
- Success, warning, and failure never rely on color alone.
- Live regions announce upload, processing, cancellation, and retry changes without repeating continuously.
- PDF preview is supplementary. Extracted text and findings remain accessible without it.

## Performance and reliability budget

User-facing targets on a mid-range mobile device and normal 4G:

- LCP under 2.5 seconds at p75.
- INP under 200ms at p75.
- CLS under 0.1 at p75.
- Initial route JavaScript under 170KB compressed, excluding route-lazy PDF tooling.
- Theme application before first paint with no visible flash.
- First useful server-rendered content does not wait for 3D, motion, PDF rendering, or AI calls.

Implementation constraints:

- Replace large GIF loaders with CSS/SVG motion or compact WebM/AVIF assets.
- Lazy-load PDF rendering and result-only visualization code.
- Do not load a global animation runtime for simple transitions.
- Use route-level code splitting and defer non-critical result sections.
- Pause polling and animation in hidden tabs.
- Use fixed media dimensions to prevent layout shift.
- Use `content-visibility: auto` for long result sections only after accessibility testing.
- Blur is bounded and disabled on constrained devices when it harms frame time.
- Every route has a branded error boundary and a useful retry or recovery action.

## Rollout plan

### Phase D0: Baseline and design acceptance

- Capture current screenshots and Core Web Vitals at the five target widths.
- Approve light and dark tokens, typography, and the result information hierarchy.
- Create one high-fidelity result screen and one upload/progress flow before broad implementation.

### Phase D1: Foundation

- Add semantic tokens, font loading, theme bootstrap, theme control, and reduced-motion rules.
- Build the public and signed-in shells.
- Add Storybook or an equivalent component preview only if it is maintained by tests.

### Phase D2: Critical journey

- Redesign Upload, Analysis Progress, and Result first.
- Prove direct-open, refresh, partial-result, error, cancel, and mobile behavior.
- Keep current data contracts stable unless a separately approved product change is required.

### Phase D3: Supporting routes

- Redesign Home, Auth, Privacy, error, 404, and expired-session states.
- Replace card grids with lists, aligned regions, and intentional empty states.

### Phase D4: Motion and 3D enhancement

- Add CSS 3D resume artifact and stage-linked scan motion.
- Measure frame rate, INP, power use, and reduced-motion behavior before enabling by default.
- Use a feature flag or kill switch for expensive enhancements.

### Phase D5: Production hardening

- Run visual regression, keyboard, screen-reader, axe, theme, zoom, and browser tests.
- Enforce performance budgets in CI.
- Validate both themes for every loading, empty, error, success, and partial state.

## Acceptance gates

The redesign is ready to ship only when:

- The critical journey works with JavaScript-delayed enhancements and reduced motion.
- Light and dark screenshots are approved at all target widths.
- There is no theme flash, unreadable gradient text, or color-only status.
- Upload, progress, result, privacy, 404, and authentication recovery states pass browser tests.
- The result page exposes the three highest-impact actions before detailed findings.
- The Parse View clearly distinguishes simulation from proprietary ATS behavior.
- Performance targets pass on production builds, not only development builds.
- A human approves the design gate before page-by-page implementation expands.

## Explicitly not in the first redesign slice

- Full WebGL scenes.
- Constant cursor-following effects.
- Animated backgrounds behind forms or analysis text.
- New billing or enterprise product behavior.
- Rewriting scoring, persistence, or worker architecture as a side effect of visual work.
- Copying Anthropic logos, marks, proprietary fonts, or exact layouts.
