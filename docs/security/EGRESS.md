# Phase 7 egress policy

Status: **IMPLEMENTED LOCALLY, DEPLOYMENT NETWORK POLICY REQUIRED FOR A4**

The application accepts only `https://api.openai.com/v1` as its OpenAI base URL.
The URL cannot contain credentials, query parameters, or a fragment. The
qualitative worker and the legacy direct analysis client use this same validated
endpoint, and the default is safe when `OPENAI_BASE_URL` is omitted.

Supabase remains the only other application service boundary. The deployment
must enforce outbound network policy to the configured Supabase origin and the
approved OpenAI origin, and deny all other egress. DNS, firewall, proxy, and
provider-region evidence is deployment-owned and remains an A4 attachment.

## Source additions, 2026-11-10

The technical AI budget, analysis admission and lease/stage-fencing modules add
Supabase RPC/Storage traffic, not a new external service. Their flags default
off. A budget record contains linkable owner/organization/operation/attempt
identifiers, payload hashes, model/policy versions and usage; it does not attach
raw resume/JD content to its ledger RPCs. Admission records exact upload intent
and the private object path before sending the PDF to the configured private
bucket. Ambiguous outcomes retain that intent for exact recovery; they do not
permit a broader delete or an unreviewed recipient.

Qualitative and explicit rewrite processing still send their authorized resume,
source and JD payloads to OpenAI. Build constructs only selected text and bounded
context for that provider; its full server-side buffer, owner and lease context
are not added to the provider body. Qualitative/rewrite idempotency headers can
carry opaque attempt identifiers, which remain linkable metadata. Operational
lease tokens must stay inside the worker/database boundary and out of provider
payloads, logs and telemetry. Technical accounting does not establish provider
retention, a zero-data-retention agreement or personal-data expiry.

The qualitative, explicit rewrite and Build SDK transports request `store: false`,
disable SDK logging/retries and reject redirects. Those application settings do not enforce DNS/firewall/proxy
policy or prove provider deletion. The separately configured Paddle adapter is
default off and has its own disclosure/host admission contract; this document
does not activate or generally allow that additional external boundary. Local
compiler/OCR worker transfer is separate from external provider egress.

The new migrations and privacy write barrier have not been executed as part of
this source work. Grants, cross-tenant access, actual outbound traffic, old
caller cutover, session revocation, export/deletion coverage and retention of
the new ledgers remain acceptance work. See the [privacy map](PRIVACY_DATA_MAP.md)
and [threat model](THREAT_MODEL.md); no raw prompts, resume/JD text, tokens,
cookies, signed URLs or provider bodies belong in logs or these documents.
