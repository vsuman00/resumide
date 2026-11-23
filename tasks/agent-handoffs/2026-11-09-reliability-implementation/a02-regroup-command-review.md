# Whole-entry regroup command review

Independent source review completed on 2026-11-13. No required findings.

The review binds to contract `a706deba95f1db92dcc1cc84aaa646ae61c67f67b67f8f461b3241608a987fae` and backend `app/lib/server/canonical-entry-regroup-commands.ts` SHA256 `f0de69cd9f25f4722cc0169a2b465ff2641fad2553aadd0856922a008980b49c`. The author confirmed this production source is frozen. This is an independent source ACK, not native, writer, route or release acceptance.

The module resolves compact source-group lookup IDs and ordered fact UUIDs through the real association helper and regroup core. It rejects unknown fields, sparse arrays, duplicates, reversed group/member order, overflow and mismatched source, base, locale or native hash. Full citations and locations are checked before redundant fields are omitted from atoms. The normal form contains no source values, current values, draft content or opaque observation/target/group hashes.

Normalization requires the owned ORIGINAL immutable base, row revision, native SQL content digest, ancestor suffix and captured GLOBAL review prefix. It requires a coherent history attestation with the original revision/head pair. Later head/history movement cannot replace command captures, locale, key or base. The actual retry control constructs a later edited head and review event, refuses those rebased views, and reproduces the original normalization unchanged.

The prospective `acknowledgement:true` field and `whole_entry_merge_not_fact_confirmation` policy describe command semantics. They do not record a visible checkbox decision or confirm facts. The idempotency key remains outside semantic atoms. The pure core preview hash and JavaScript serialization are not used as native row identities.

Independent bounds arithmetic for 32 groups and 96 fact UUIDs gives 9,122 raw command bytes. The URLencoded commit envelope is 11,045 bytes with `wholeEntryAcknowledgement=accepted`, or 11,047 with the longer existing relationship field name; both remain below 16,384. The atom bound is `36 + 32 * (10 + 3 * 14) = 1700`. Maximum three-byte BMP identifiers use 300 UTF8 bytes per 100 UTF16 units, giving a conservative 101,906 framed bytes; the corresponding astral-width vector is 79,506. My earlier use of the astral width as the maximum was corrected before this review froze.

The actual two-job Node literal matches the recorded oracle. Independent framing of its 140 atoms gives 2,667 bytes and SHA256 `635a3b18099c8447b03840335eaef3ee3fae7f8aec84991950afab265d8e457a`. Only normal-form base SHA and atom 21 are designated native-verifier substitutions. This supplies no JavaScript/native serialization equivalence claim.

Reviewed author receipts in `/var/folders/6n/9cbj04mx647dtyxxmrlfywl40000gn/T/resumide-a02-regroup-command-rnmug8cz`: initial actual producer/Core cases, terminal `focused-terminal` PASS 39/1, and earlier `types-final` 4 roots/31 sources/0 diagnostics on unchanged production source. Their log hashes and source bindings match. Terminal test SHA256 is `377aa46c5df37fb270526a7df88a4848bdcf9e2c17e0f12d3f349ee90ecce01a`. The final added case supplies a schema-valid base with 120 carried bullets, verifies resource refusal and preserves the input. BMP/astral framing vectors are explicitly separate from the real 32-group source/Core case.

No reviewer tests, application changes, SQL parsing/execution, services, database, environment, provider, browser or Git operations were performed. The only reviewer deliverable is this file. Future owned reading, exact-result replay before fresh CAS, named whole-entry acknowledgement, bounded pending storage, atomic saving and native lifecycle proof remain separate work.
