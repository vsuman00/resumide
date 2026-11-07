# AA7 current frontend acceptance review

Reviewer: `aa7_frontend_review`, 2026-11-06. Read-only production/test audit using ponytail. Base HEAD `a0b239299d75b0bd64b588fe743ebe2975fb28b9`; current dirty root files were inspected directly. No production edits, services, browser runs, provider calls or database operations by this reviewer.

## Review result

The current `BuildAiAssistant.tsx` popup uses a `div` heading wrapper while retaining the dialog role, accessible name from `build-ai-title`, matching `h2` identifier, close control and existing styles. This is the shared semantic correction for the duplicate-banner/landmark finding. No Axe exclusions were introduced.

Existing browser checks supply the appropriate regression: the hover/selection case scans the whole page with the popup open, and the mobile edit/cancellation case scans the popup again. The selected-editor Escape sequence explicitly checks both keydown and keyup dismissal, zero provider requests and a fresh selection reopening the controls. Component coverage separately checks this native event sequence.

The PDF preview now checks the active effect immediately after deferred byte loading and before `getDocument`. Its two component cases exercise dismissal and unmount while bytes remain pending. Browser transport cancellation is a different race and does not replace those cases.

The existing converter cases retain real macro compilation/download and legacy POST coverage, add 44-pixel toolbar targets and disabled/ready download geometry, and inspect mobile keyboard options/current-buffer preservation at 390 and 320 pixels. The screenshot path is dated Nov6 and preserves the Oct31 image.

## Evidence and limits

The coordinator personally inspected durable results for three converter browser scenarios passing in 25.9 seconds and three controlled-provider AI scenarios passing in 15.1 seconds after the semantic fix. This reviewer inspected the source and assertions; the tester/coordinator own those execution results and cleanup. The inherited full 1,203-test verification preceded the final two-line semantic change; final affected checks must be cited separately.

The selected six scenarios are coherent current-candidate evidence, not a rerun of every browser case. The new deferred-byte cases prove the mocked component boundary. Neither these tests nor whole-page Axe supplies formal assistive-technology acceptance, tagged-PDF conformance, live provider product-flow acceptance or release approval. Database fixture cleanup remains tester-owned and must be reported from exact recorded IDs/keys, without broad deletion.

No additional concrete frontend defect was established by this scoped review. Preserve the current tests and semantic fix; no further production edit is proposed.
