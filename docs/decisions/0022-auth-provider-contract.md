# ADR-0022: Identity providers and AI funding

**Status:** Verified documentation for CR-U13, 2026-11-22. Provider implementation and acceptance remain in CR-U14 and CR-U15. The application uses Supabase email sign-in and server-side session verification. [Auth route](../../app/routes/auth.tsx) · [Auth callback](../../app/routes/auth.callback.ts)

## Google

Supabase supports Google OAuth for SSR applications. Use its PKCE flow with a dedicated Google web client, the exact Supabase callback registered with Google, and the exact application callback allowlisted in Supabase. Use basic identity scopes. Keep the Google client secret in Supabase configuration. The existing server-side return-path validator also applies to this callback. [Google setup](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) · [Supabase redirects](https://supabase.com/docs/guides/auth/redirect-urls) · [Return-path validator](../../app/lib/server/auth.ts)

Supabase's ordinary OAuth sign-in can automatically attach a verified same-email provider identity to an existing Auth user. Its manual linking option is separate. The Stage 7 acceptance contract requires proof of ownership before attaching a new sign-in method to an existing Resumide account. Keep ordinary Google login gated until the chosen flow meets that requirement or the owner explicitly accepts Supabase's verified-email policy. Account linking starts from an authenticated session, requires recent account verification and provider consent, and preserves a working recovery method when unlinking. Workspace access follows the canonical Auth user ID and an active membership. [Supabase identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking)

CR-U14 requires an approved Google test client and Supabase target. Verify ordinary sign-in, callbacks that fail or expire, same-email handling, explicit linking, last-method protection, and two-account workspace isolation before activation.

## ChatGPT identity

Website sign-in remains a limited OpenAI partner trial. It requires a registered client, exact callbacks, and the client's provisioned token authentication method. Resolve accounts by the verified issuer, client ID, and subject. Require ownership confirmation for Resumide account links. The provider and account checks must finish before the first-party app session becomes usable. [OpenAI website sign-in](https://developers.openai.com/siwc/website)

Supabase custom OAuth can broker supported OAuth providers. The separate third-party OIDC Dashboard feature verifies external JWTs for Supabase resource access. That Dashboard feature leaves Resumide's client registration, account resolution and session requirements open. CR-U15 needs both OpenAI admission and a broker that verifies OpenAI's required claims and preserves the current Supabase identity and deletion model. [Supabase custom OAuth](https://supabase.com/docs/guides/auth/custom-oauth-providers) · [Third-party OIDC](https://supabase.com/docs/guides/auth/third-party/custom-oidc) · [Dashboard changelog](https://supabase.com/changelog/custom-oidc-third-party-auth)

## AI funding

ChatGPT sign-in grants identity. Using a user's plan for inference requires a separate authorization. OpenAI documents the preview for open-source and locally hosted apps and directs remotely hosted apps to its interest form. The preview omits `max_output_tokens`. Before enabling it in Resumide, verify that the admitted hosted contract supports the app's output, cancellation and usage limits. A failed or disconnected plan request needs an explicit user choice before using another payer. [Plan usage](https://developers.openai.com/siwc/token-sharing-open-source) · [Preview limits](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)

Eligible Pro and Business owners can separately claim a credit benefit for an OpenAI API organization they own. The credit applies to that organization's API usage. Resumide has no authorized user-owned API organization connection. [ChatGPT subscriber API credits](https://developers.openai.com/api/docs/guides/chatgpt-api-credits)
