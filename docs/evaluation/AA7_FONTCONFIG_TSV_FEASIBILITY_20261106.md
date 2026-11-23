# AA7 Fontconfig and TSV feasibility

Read-only feasibility completed on exact paperfix8f7. No production source/configuration changed and no package/provider/database action occurred. The first setup stopped before compilation because Fontconfig CLI tools are absent; that failed receipt is preserved. The adjusted diagnostic used existing native libfontconfig via documented C API, without installation. Both owned hardened containers and the exact temporary directory were removed.

## Current Fontconfig input path

The launcher sets HOME=/scratch and grants scratch read/write. Current global fonts.conf includes50-user.conf, which includes XDG and tilde user XML paths; it also admits user font/cache paths. All immutable config paths/hashes/directives are recorded. The native Fontconfig API directly loaded **/scratch/.fonts.conf**, written with a harmless family alias. Its Roman match changed to reviewed Latin Modern Sans. This establishes native-library input reachability under the current HOME; source admission is not the security proof.

Actual confined two-page neutral engine/converter runs both passed and retained the same embedded Roman font and word geometry. This does **not** prove the engine never parsed XML: [upstream XeTeX initializes Fontconfig and enumerates fonts](https://raw.githubusercontent.com/TeX-Live/texlive-source/trunk/texk/web2c/xetexdir/XeTeXFontMgr_FC.cpp), rather than applying this alias-matching rule. That source is current upstream, not exact installed Debian-byte provenance; no engine file-open trace was measured. Current Expat non-applicability is not claimed.

A minimal LM-only config with no includes preserved three explicit LM face matches but changed generic serif/sans-serif/monospace to LMMono. **Reject it as a drop-in**. Preserving typography requires keeping the existing immutable ordered matching/alias rules, not replacing them with a minimal font list.

Proposed reviewed slice: create an immutable, hashed ordered clone of current system font rules, remove every HOME/XDG/tilde/user include and user font/cache entry, use explicit immutable includes plus reviewed font directories/cache, and set fixed FONTCONFIG_FILE/PATH in both the launcher and supervisor native-child environments. Add exact manifest/read closure inputs, no broad grant or fallback. Actual confined config-path, font-face, semantic/geometry and render parity across supported profiles must pass before this can support a specific untrusted-XML-path conclusion. No such image or production override was created here.

Primary behavior: [Fontconfig user documentation](https://fontconfig.pages.freedesktop.org/fontconfig/fontconfig-user.html), [versioned native API declarations](https://raw.githubusercontent.com/fontconfig/fontconfig/2.15.0/fontconfig/fontconfig.h).

## Native TSV comparison

The same native-produced PDF has **17 words across two A4 pages**. Bbox and TSV have identical ordered word text and page dimensions, and both pass current geometry predicates on this neutral fixture. Both outputs are below the existing2MiB cap; existing text/PDF/page limits remain unchanged.

| Word coordinate | Maximum observed bbox/TSV difference |
| --------------- | -----------------------------------: |
| xMin            |                           0.004613pt |
| yMin            |                           0.003956pt |
| xMax            |                           0.007511pt |
| yMax            |                           0.005744pt |

Installed native TSV writes word left/top/width/height with **two decimal places**, while bbox keeps six. Reconstructing right/bottom adds rounding error. **TSV is not an exact drop-in under the unchanged1pt boundary**; no tolerance relaxation is proposed. This neutral comparison is not a geometry-threshold-edge proof. [Native option contract](https://manpages.debian.org/trixie/poppler-utils/pdftotext.1.en.html).

Two reviewable paths preserve the product scope: repair native TSV precision with exact boundary regression evidence, or separately design a strict bounded pure-Python parser for the existing native bbox XHTML using its current precision/text/page structure without Expat. Neither is implemented or accepted. PDF structural/font/link/encryption/page checks remain before native text extraction. No exported format, analyzer integration or accessibility claim changes.

[Full native observations, paths, hashes, paired coordinates and proposals](AA7_FONTCONFIG_TSV_FEASIBILITY_20261106.json); [failed setup receipt](AA7_FONTCONFIG_TSV_FEASIBILITY_ATTEMPT1_20261106.json). Full security remains OPEN; no source-level finding was suppressed or waived.
