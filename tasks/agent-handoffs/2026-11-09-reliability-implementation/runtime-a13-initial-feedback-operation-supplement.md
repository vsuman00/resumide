# A13 operation wire: exact schema supplement

Proposed 2026-11-15. This supplements immutable operation contract `e6c198b11415cfb267c90bf95ff9ef528f8f5d2af2c9557f62b7cff6ad72a717`; it changes no lifecycle or evidence authority. Documentation only: no code/tests, SQL parser/execution, native calls, services or activation.

## 1. Actual scoring context

`Context.scoringContext` is `z.infer<typeof LegacyScoringInputContextSchema>`, exported as `LegacyScoringInputContext` by `app/lib/server/legacy-scoring-input.ts`. It is the actual strict `legacy-scoring-input/1.0.0` VALUE containing `{schemaVersion,analysisId,ownerId,organizationId,requestId,source,extraction,job,producer,binding}`. It is neither LegacyScoringSavedReadSchema nor its bound/legacy_unbound union. A bound saved read supplies `.context`; its `.result` supplies Context.deterministicResult and its checked currentness supplies Context.currentness. Correlate those actual fields/receipt before constructing the operation context. No mutable source/JD reread, missing-field fill or invented canonical IDs.

## 2. Usage hash domain

`read_initial_feedback_usage(...).usageSha256` means the ACTUAL installed `public.read_initial_feedback_usage(uuid,uuid)` pg_proc.prosrc SHA256 over UTF8 bytes. It is a source-identity pin, never a digest of token totals or the reply. Require equality with both the separately released `INITIAL_FEEDBACK_PROFILE.usageSha256` and the actual readiness reply. Its profileVersion is exactly `initial-feedback-readiness-profile/1.0.0`. Native returns the catalog-derived value; Node compares opaque lowercase SHA strings and validates ownership/month/BigInt totals separately. Never emulate JSONB with JSON.stringify or accept a caller-supplied source pin as catalog proof.

## 3. Readiness and immutable policy selection

`read_initial_feedback_readiness()` returns one STRICT object with exactly these nineteen keys:

```text
schemaVersion: 'initial-feedback-readiness/1.0.0'
profileVersion: 'initial-feedback-readiness-profile/1.0.0'
schemaReady: boolean
readerExecutable: boolean
prepareExecutable: boolean
claimExecutable: boolean
settleExecutable: boolean
finishExecutable: boolean
usageExecutable: boolean
exportExecutable: boolean
checkerSha256: sha256
readerSha256: sha256
prepareSha256: sha256
claimSha256: sha256
settleSha256: sha256
finishSha256: sha256
usageSha256: sha256
exportSha256: sha256
metadataSha256: sha256
```

The nine hashes are actual catalog prosrc hashes for, respectively, the private operation checker and public read/prepare/claim/settle/finish/usage/export/readiness RPCs in e6. The source-only `INITIAL_FEEDBACK_PROFILE` export has exactly the eleven string fields above (both versions plus all nine pins); its real values are generated after final bodies exist. No zero/dummy strings. The checker guards exact dependent producer/profile/renderer and operation routines/structures/ACLs; its own body is externally pinned. Metadata computes actual hashes dynamically, avoiding a self-hash cycle. Native writers independently require the same schema closure; Node comparison does not confer native authority.

Each Executable field is actual effective service_role EXECUTE on that named RPC, with the closure allowing only owner plus optional direct service EXECUTE and no PUBLIC/anon/authenticated/unexpected grants or grant options. Do not use SECURITY DEFINER current_user as caller identity. Staged schemaReady=true/all seven Executable=false is coherent. All private helpers remain denied. Node requires schemaReady plus the capabilities used by its path and exact source pins; neither the booleans nor catalog readiness establish current owner/lease/consent, policy activation, native execution or acceptance. Unknown/missing/malformed/drifted metadata refuses; no old-path fallback.

PublicationPolicy.version is `initial-feedback-publication/1.0.0`. Its sha256 uses a fixed SOURCE codec, separate from every PG JSONB binding/publication digest: UTF8 `INITIAL-FEEDBACK-POLICY/1\n`, followed by ordered atoms framed as `T<UTF8-byte-length>:<exact-value>;`; null is `N;`. No sorting, Unicode/case normalization, locale conversion, whitespace serialization or trailing newline. Integers use canonical decimal strings. Exclude sha256 itself. The exact atom order is:

```text
version, provider, model, promptVersion, maxOutputTokens, attemptLimit,
budgetPolicyVersion, supportVersion, supportSha256, planVersion, planSha256,
writingSupportPolicyVersion,
scoringInputProfile.schemaVersion, scoringInputProfile.profileVersion,
scoringInputProfile.checkerSha256, scoringInputProfile.readerSha256,
scoringInputProfile.finishSha256, scoringInputProfile.contextSha256,
scoringInputProfile.exportSha256, scoringInputProfile.metadataSha256,
planProfile.schemaVersion, planProfile.profileVersion,
planProfile.policyVersion, planProfile.policySha256,
planProfile.checkerSha256, planProfile.rendererSha256, planProfile.metadataSha256
```

This is SHA256 of the actual exported descriptor's framed bytes, independently reproducible by the new native policy validator; it is not a claim that Node JSON serialization equals PG native text. Existing support230f/plan972/scoringf2b241/profilee9f5 are real frozen dependencies. The NEW descriptor/model/max-output/attempt/budget seed exports and their real hashes do not yet exist: backend must produce them from actual code before source freeze, and the coordinator must pin them before dependent checks. This supplement invents no digest, model, runtime setting or seed value.

Budget-off and budget-on are distinct immutable registry entries/hashes. Off has budgetPolicyVersion=null; on has the exact admitted existing R03 policy version, never an invented free/zero price. Both retain the same frozen support/plan rules. Seeds are generated only from reviewed actual descriptor exports; there is no automatic environment import, model default, missing-on-to-off fallback or inferred activation. Start with no enabled organization selection. An owner-controlled native technical selection binds an organization to one exact registry (version,sha256); fresh prepare/claim derives the organization from the owned analysis and requires that selection and selector to agree. p_policy only selects/correlates; it cannot choose budget-off against the native selection. Current server configuration must match the selected descriptor or refuse.

An existing operation retains its original full policy and exact receipt. Resolve owned exact replay before consulting a changed active selection; never rekey/reprice it. Fresh dispatch/retry requires its captured policy still admitted; a changed selection refuses new dispatch rather than silently swapping versions. Registry seeding/selection, R03 opening/price admission, role grants, paired privacy and shared-counter caller cutover require the later explicit native adoption packet. Empty/staged registry is schema-ready but not permission to prepare or spend.
