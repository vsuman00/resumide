# A05 round-two calibration fixture handoff

The coordinator assigned three independently authored synthetic calibration families at detached base `a0b2392`. The assignment covered fixture source and this handoff. The three families each support the existing clean, challenging and mixed variants. All 24 critical-field annotations were authored by AI. Human validation and representative validity have not been evaluated.

| Family                         | Template lineage                                                                                                                                                       | Authored lines | Family JSON SHA-256                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------: | ------------------------------------------------------------------ |
| `calibration-r2-coral-build`   | Summary and tools first. The mixed split precedes work experience, where a single delimited line carries the role, employer and dates. Location appears near the name. |             18 | `7708047ec2707978b7487542def4b37b0ab007c7e8f566f68a0e46e503f46997` |
| `calibration-r2-prairie-stack` | Employment first, with role, employer and dates on separate lines. The mixed split falls between job bullets.                                                          |             16 | `6ea91efed88c2f06a863fb85f9c492bb93cf26a9a2fac86b82b4fcd117b4d227` |
| `calibration-r2-juniper-relay` | Education and certifications first, with the mixed split after the credential. Work history opens with employer and location, followed by a role and date line.        |             18 | `ef0cae1f667507d8bca727a3628335efd21bba358f699637074fdb5d9a93c281` |

Each template started from a blank source file. Authoring used the generator's family type, pagination and manifest interface. Other family content, parser source, calibration results and locked content were outside the authoring inputs.

The source [fixture module](../../tests/fixtures/ocr-reliability-calibration-round2.ts) has SHA-256 `fa94e0d292b6b9400b65ef889a8d30fcfa5095711effeaac6c4ff152c8f7a15e`. Family hashes cover each object's `JSON.stringify` output.

A local Node.js v26.5.0 assertion pass checked three unique IDs, the calibration partition, eight fields per family, a single source span per field across the mixed pages, reserved contact values and conservative bounds on a letter page. Prettier and Git whitespace checks passed for both files. This is source-only evidence. Rendering, OCR, provider calls and full project verification were outside the worker assignment. The coordinator owns integration and the generated manifest.
