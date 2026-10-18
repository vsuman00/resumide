import { createHash } from "node:crypto";

export const BEST_LANGUAGE_DATA =
  "sha256:8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba";
export const TEXT_FUSION_MANIFEST = Object.freeze({
  schemaVersion: "ocr-text-fusion/4.0.0",
  models: [
    {
      id: "fast",
      sha256:
        "7d4322bd2a7749724879683fc3912cb542f19906c83bcc1a52132556427170b2",
      oem: 3,
    },
    { id: "best", sha256: BEST_LANGUAGE_DATA.slice(7), oem: 1 },
  ],
  psm: 3,
  maxDpi: 150,
  thresholdingMethod: 0,
  selector: {
    version: "aligned-text/4.0.0",
    preserveAlphabeticBaseline: true,
    preserveUppercaseWhenAlternateIntroducesLowercase: true,
    reciprocal: true,
    minimumIou: 0.8,
    maximumWordsPerLine: 128,
    preserveTokensContaining: ["digits", "@", "://", "whitespace"],
    policy: "prefer-best-for-unique-aligned-punctuation-text-otherwise-fast",
    confidenceCalibration: "none",
  },
});
export const TEXT_FUSION_VERSIONS = Object.freeze({
  engine: "tesseract-5.3.0-2/text-fusion-v4",
  renderer: "poppler-22.12.0-2+deb12u3/dpi-150",
  languageData:
    "model-bundle-sha256:" +
    createHash("sha256")
      .update(JSON.stringify(TEXT_FUSION_MANIFEST))
      .digest("hex"),
});
