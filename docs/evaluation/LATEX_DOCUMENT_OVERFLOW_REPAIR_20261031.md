# Supplied LaTeX document overflow repair

Date: 2026-10-31, Asia/Kolkata. Tested on the dirty working tree based on `a0b239299d75b0bd64b588fe743ebe2975fb28b9`. Local document repair under the owner's request; no deployment or release acceptance.

The exact supplied 6,581-byte source reproduced `layout_overflow` in the pinned compiler and returned HTTP 422 in the browser. A transient diagnostic probe returned only the warning type, size and line numbers: an overfull horizontal box of 0.78194 points at lines 75-76. No candidate source or raw TeX logs were retained in project evidence.

Added `\setlength{\emergencystretch}{1em}` before `\begin{document}` in a new private copy. This gives TeX another paragraph line-breaking pass when ordinary spacing cannot fit. Removing this insertion reconstructs every byte of the supplied original. Wording, facts, font size, geometry and existing macros are unchanged. The compiler's overflow, glyph and PDF safety checks remain intact; no application or runtime policy change was needed.

The corrected source and the browser-downloaded PDF were saved as new files in the owner's private Resume directory. Existing files were not overwritten. Source, PDF, auth cookies and candidate screenshots were not committed to project evidence or sent to an AI provider.

## Sequential verification

- A headed Chromium session on the existing localhost:5173 server used a temporary synthetic owner authenticated against configured managed Supabase directly. Original source failed first, then corrected source returned HTTP 200.
- The corrected PDF has one A4 page and 35,495 bytes. The preview painted document ink, the download parsed successfully, all six section headings survived, and extracted text matched the independent local compilation. The editor retained the exact submitted source and cleared the error. No browser runtime errors occurred. Observed compile-through-preview/download time was 1,281 ms; this is one local observation, not a load benchmark.
- Four subsequent synthetic runtime controls passed sequentially: neutral document, Latin Unicode, missing-glyph rejection and intentional overflow rejection. The pinned image and rejection policy were unchanged.
- The first browser harness checked the canvas before painting finished. Its failed attempt receipt is preserved; polling for actual painted content passed without lowering the ink threshold. Both temporary owners, sessions, profiles, organizations, memberships and their rate buckets were checked as absent. The shared global bucket was preserved. No database reset, migration, Docker database or provider call occurred.

[Final metadata receipt](LATEX_DOCUMENT_OVERFLOW_RECEIPT_20261031.json); [first browser attempt](LATEX_DOCUMENT_OVERFLOW_BROWSER_ATTEMPT1_20261031.json).

The owner's existing in-app editor could not be replaced: its browser helper was unavailable, and native control of Codex was explicitly disallowed. That restriction was respected; validation used a separately launched local browser. The owner must load the corrected source or insert the one command in their existing editor. Private temporary source, PDF and fixture ledgers were removed after verified delivery copies were saved.

Only evidence and task context changed in the repository, so application CI was not repeated. Prior integrated application checks remain recorded in the [contrast repair](EDITOR_CONTRAST_REPAIR_20261031.md). This repair does not close formal AA7, accessibility, accuracy or release gates.
