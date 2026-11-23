# GPT-6 Luna configuration migration, 2026-10-18

Status: IMPLEMENTED LOCALLY; live-provider verification blocked by HTTP 401. The owner requested migration from GPT-5.6 Luna to GPT-6 Luna for the existing application. OCR adoption remains deferred.

## Scope

The server default and `.env.example` now select `gpt-6-luna`. Both ignored local environment files, `.env` and `.env.production`, explicitly selected the older model and were updated too. API keys and all unrelated environment entries were preserved. No credentials belong to the source diff.

Both qualitative request paths share model options that set `reasoning_effort: "none"` for the selected alias. [Official model guidance](https://developers.openai.com/api/docs/models/gpt-6-luna) documents medium as the default effort and supports none, Chat Completions and structured outputs. Existing output limits, schema validation, source grounding, request idempotency, usage accounting, explicit model overrides and deterministic scoring remain. No numeric score is delegated to the model.

The example and local environment cost estimates use the published standard rates: $0.10 per million input tokens and $0.50 per million output tokens, expressed as $0.0001 and $0.0005 per thousand tokens. These are standard token-rate estimates; caching, processing tiers, regional premiums and actual billing can differ. Historical model IDs, prompts, evaluation receipts and labels are unchanged.

## Verification and limits

Configuration and SDK-boundary tests reproduce the old default and missing explicit reasoning setting before the fix. Targeted tests pass: six files / 23 tests, including the serialized request, JSON schema, output cap, idempotency header, parsed response and token usage. An explicitly configured alternative model remains supported without receiving a Luna-specific reasoning option.

A read-only model-access check used the existing configured connection with a 20-second timeout and no retries. OpenAI returned HTTP 401, so account access, real structured generation, latency and feedback quality on GPT-6 Luna are not verified. No completion or OCR request was made by that check. A valid configured credential is required before retrying live verification; secrets must stay out of chat and reports.

Full `npm run verify:ci` passes: 115 files / 869 unit tests, 56 browser checks, formatting, lint, types, app/worker builds, security checks and existing benchmarks. Production dependency audit reports zero vulnerabilities. Log: `/tmp/resumide-luna6-verify-ci-final.log`. No OCR engine was executed for this migration. This does not establish representative model quality, accuracy calibration, hosted rollout or production activation. The ignored production env file is a local deployment artifact; it does not update Vercel project environment settings automatically. An existing Vercel model override must be updated during an authorized deployment.

GPT-6 Luna documents image inputs, which makes it a future candidate for scanned-page extraction. No image/PDF-to-model path or OCR provider was added or enabled.
