# ADR-0021 Consumer local OCR review

**Status** Proposed for CR-R15. The synthetic preflight is implemented. Consumer activation requires approval and verification of the actual owned upload path.

## Admission

Use a separate self-hosted review purpose, `local_document_evidence_review`. The current preflight accepts an active original synthetic fixture and an explicit synthetic engineering grant. It defaults to disabled. It compares the same owner, analysis, source and SHA-256 across the requested selection, worker-loaded source and grant. It compares the grant with the worker's exact image, declared region, engine, renderer and language-data identity. The retention policy must match and the grant must still be valid.

The preflight derives selected pages from native extraction and caps work at the grant's byte, page, character and deadline limits. The resulting scope carries no text or authority to dispatch or persist. A browser may select an existing owned source through the application. The worker must load the authoritative records, derive the allocation and verify the live lease and deletion fence. A request body supplies none of those records.

The source PDF goes to an isolated local worker. Recognition runs only for deficient pages. Native pages stay intact, evidence remains uncalibrated and every OCR proposal requires candidate review. Scoring stays withheld throughout this path. The legacy synthetic verifier remains a separate execution contract, and external OCR requires its own authorization.

## Required before consumer use

- Close the applicable CR-A05 quality gates for the declared upload layouts. Record a reviewed immutable image and declare the supported profile and inputs.
- Bind the worker host and verified physical region to the policy. Record network, filesystem, process and resource confinement. Bind the actual owner acknowledgement to the processing purpose, location and applicable retention terms.
- Verify the owned upload and worker lease end to end. Compare the bytes with the stored source checksum. Deny lost leases, cancelled/deleted owners or sources, expired grants, unsafe output and ambiguous cleanup. Bind evidence to the exact attempt and source before persistence.
- Verify exact removal of isolated scratch on success, failure, cancellation and reconciliation. Prove candidate access, export, retention and deletion for saved OCR evidence under the existing data map.
- Obtain the owner decision for the exact target and scope before enabling consumer use. Until then the application uses its existing unsupported or review states for deficient PDF text.

Disable new OCR admissions first during rollback. Reconcile in-flight work by exact owned identity and retain prior review evidence with its original producer and retention semantics. [Worker runbook](../operations/OCR_WORKER.md) · [Quality protocol](../evaluation/OCR_RELIABILITY_PROTOCOL.md) · [Privacy map](../security/PRIVACY_DATA_MAP.md)
