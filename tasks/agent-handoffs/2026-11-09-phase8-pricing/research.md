# Pricing and payment recommendation

Checked 2026-11-09. This is researched guidance, not a provider selection, merchant approval, implemented catalog or authorization to collect payments. Root source remains main/a0b239299d75b0bd64b588fe743ebe2975fb28b9 plus preserved dirty work.

## Confirmed product terms

India: INR 300/month. Free: ten resume reviews and one resume edit every month. Remove USD 10 entirely. LaTeX editing, compilation, PDF preview and download are free. Build AI fixes and writing suggestions require the paid AI plan. The owner explicitly answered all three clarification questions; do not ask them again.

## Razorpay versus Stripe

For this India-focused monthly plan, recommend Razorpay as the initial integration candidate. Its current subscription product supports cards, UPI AutoPay and eMandates. Stripe's India payments page and support guidance still describe new Indian accounts as invitation-only, which adds an onboarding dependency. This is a product-fit and availability recommendation, not a measured claim that Razorpay has higher uptime, fewer disputes or better support. Neither provider has been selected or contacted.

Stripe also documents India recurring card and UPI e-mandates; do not claim it lacks UPI AutoPay. Actual account eligibility, enabled payment methods and recurring behavior must be verified for the selected merchant before integration acceptance. A provider-neutral adapter in the existing module can preserve a future switch without introducing another service now.

Official sources:

- [Razorpay Subscriptions](https://razorpay.com/subscriptions/): recurring payment methods and current subscription add-on pricing.
- [Razorpay pricing](https://razorpay.com/pricing/): published standard gateway fee of 2% plus applicable GST.
- [Stripe India Payments](https://stripe.com/in/payments): invitation-only onboarding.
- [Stripe India availability](https://support.stripe.com/questions/stripe-accounts-are-invite-only-in-india): new Indian accounts require invitations. The web opener could not fetch its Markdown content, but the official search result supplied the support article body; the separately opened India Payments page corroborates invitation-only status.
- [Stripe India recurring payments](https://docs.stripe.com/india-recurring-payments): card and UPI e-mandate support.

Razorpay currently advertises a limited-time subscription add-on of 0.5%, with 0.9% crossed out, in addition to its standard platform fee. At the displayed 2% gateway plus 0.5% add-on, a successful INR 300 payment implies INR 7.50 in processor fees before applicable GST. This is arithmetic from the published rates, not an account-specific quote. The promotional period, eligibility and actual merchant terms need confirmation; the gateway fee alone is not the full recurring charge. Do not copy a temporary fee into the commercial catalog or assume an offer applies to subscriptions.

## Open-source options

| Option                                               | What it supplies                                                                              | Recommendation for this project                                                                                                                                 |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Hyperswitch](https://github.com/juspay/hyperswitch) | Apache-2.0 payment infrastructure and orchestration across processors.                        | Consider only when multiple processors/routing justify operating another system. It still connects to payment providers and does not make their fees disappear. |
| [Lago](https://getlago.com/)                         | Open-source AGPLv3 billing, metering and invoicing; the processor still collects the payment. | Useful for more complex usage-based products. For two plans, first use the existing module and Supabase rather than adding a separate billing platform.         |

Open-source software can be self-hosted, but hosting, updates, reconciliation and processor fees still have costs. These projects are research references only: none is installed, deployed or approved as a new dependency. Their existence does not permit Docker databases or change the Supabase-only database instruction.

## Paid allowance proposal and cost insight

Propose an initial paid allowance of 50 reviews, 20 AI rewrite batches and 100 Build AI suggestions per paid monthly period. These quantities are proposed starting points, not owner-approved terms, measured demand or production limits. They give the paid plan room beyond the free 10/1 without promising unlimited provider work. Show each allowance plainly before purchase; no automatic overage charges. Review measured usage and total delivery costs before launch.

Recommend one edit mean one successfully saved AI rewrite batch bound to a resume version. Applying a proposal, manual correction, confirmation, undo and ordinary LaTeX typing should not consume further AI edits. A review should provide diagnostic feedback; the existing automatically generated writer proposals must not silently bypass the separate edit allowance. The owner must accept the precise unit and the free-review output policy before enforcement.

The repository default model is `gpt-6-luna` in `app/lib/server/openai-model.ts`; this is not verification of an environment override or live provider. Its [official model page](https://developers.openai.com/api/docs/models/gpt-6-luna) lists Standard short-context text pricing of USD 0.10 per million input tokens and USD 0.50 per million output tokens. As an illustrative workload only, a call with 10,000 uncached input tokens and 1,000 output tokens costs USD 0.0015; 200 such calls cost USD 0.30. Actual prompts, outputs, reasoning, retries, caching, processing tier and model changes alter this. No inference or price probe was run.

That token example excludes currency conversion, taxes, OCR/compiler/worker compute, storage, bandwidth, failed attempts and support. It does not prove that INR 300 is profitable. The present 100,000-token operational default and conservative 25,000-token Build reservation would allow only four Build requests from an otherwise unused budget, so they cannot be reused as the proposed paid allowance. Define commercial quotas separately, then size and verify the operational budget coherently. Preserve cost and abuse controls.

## Next concrete work

The remaining T080 decision is the paid allowance and exact metering/reset/settlement/transition policy, plus the proposed local sequencing exception in ADR-0019 while A4 remains open. Before T081/T082, choose the payment provider and merchant/test-mode setup and settle tax/cancellation/refund terms. Then implement and verify server entitlements, atomic idempotent usage, read-only plan display, default-off checkout/management and signed event reconciliation in that order. Live payments and deployment remain on hold.
