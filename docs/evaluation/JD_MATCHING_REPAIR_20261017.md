# JD parsing and matching repair

Status: IMPLEMENTED; local unit regressions verified. Hosted migration and release remain deferred.

The forward migration `20261017000000_job_requirement_parser_compatibility.sql` replaces only the private JSON shape validator. It accepts historical parser producers 1.0.0 and 1.0.1 and the corrected producer 1.0.2. Existing immutable documents, ownership checks, provenance checks, grants and numeric score guards remain intact. Apply the full migration chain to an isolated local database before exercising JD save and read-back. Do not edit or replay the historical migration against a populated deployment.

Recovery is additive. Disable JD review if the updated application and schema are incompatible, preserve all versions, and repair the validator with another forward migration. Do not narrow its accepted producer versions while documents with those versions remain stored. Schema parity is checked against the new effective function definition; historical migration content is retained.

The parser now scopes semicolon-separated clauses, explicitly negated clauses and separately numbered experience requirements independently. `Required Skills and Experience` resumes requirement discovery after company or benefits sections. Exact source offsets remain code-point based. The producer version records this behavior change; it does not establish domain validity.

Legacy matching prioritizes recognized technical phrases before the term cap, masks company sections while retaining source offsets, includes the existing AI/backend discovery vocabulary and excludes negated mentions from positive lexical evidence. Unknown lexical matches remain uncertain and cannot earn legacy keyword-rule score credit. Existing weights and the binary legacy threshold are unchanged; this heuristic is not a calibrated job-fit percentage. All experience sections contribute to date and bullet checks.

V2 diagnostics require an explicit matching degree subject when one is stated, refuse to infer skill-specific tenure from general role dates, and ignore terminal punctuation on certification requirements. Numeric dimensions remain withheld. General tenure, candidate confirmation and exact word occurrence do not establish proficiency or independently verified qualifications.

These regression fixtures are synthetic. They do not replace representative corpus, annotation, taxonomy, calibration or domain-review gates. Full application/browser and local database results are recorded separately by the integration audit.
