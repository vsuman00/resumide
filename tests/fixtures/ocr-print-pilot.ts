import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import { createOcrDiagnosticPilot } from "./ocr-pilot";

const FONT_HASH =
  "f8ace1f892b2bd9dc1792ba7f097fa7588f84fed48321480e04de5390828221f";
const FONT_ALIAS = "AA012PinnedLiberationSans";
const font = readFileSync(
  new URL(
    "../../node_modules/pdfjs-dist/standard_fonts/LiberationSans-Regular.ttf",
    import.meta.url,
  ),
);
if (
  createHash("sha256").update(font).digest("hex") !== FONT_HASH ||
  !GlobalFonts.register(font, FONT_ALIAS)
)
  throw new Error("Pinned synthetic font unavailable");
const canvasPackage = JSON.parse(
  readFileSync(
    new URL("../../node_modules/@napi-rs/canvas/package.json", import.meta.url),
    "utf8",
  ),
);
if (canvasPackage.version !== "0.1.77")
  throw new Error("Unreviewed canvas generator version");

type Partition = "development" | "calibration" | "locked";
type Segment = "clean" | "challenging" | "mixed";
type Fields = Record<
  | "name"
  | "email"
  | "phone"
  | "employer"
  | "role"
  | "dates"
  | "education"
  | "certification",
  string
>;
export type Family = {
  id: string;
  partition: Partition;
  left: number;
  top: number;
  gap: number;
  lines: readonly string[];
  fields: Fields;
};
// Six distinct authored resumes/section sequences. Rendered scan variants of a
// family NEVER cross partitions. Not representative or independently human-labelled.
export const PRINT_FAMILIES: Family[] = [
  {
    id: "alpha-backend",
    partition: "development",
    left: 48,
    top: 62,
    gap: 27,
    fields: {
      name: "Demo Candidate Alpha",
      email: "alpha@example.test",
      phone: "0000000000",
      employer: "Fictional Alpha Systems",
      role: "Backend Software Engineer",
      dates: "2021 - 2024",
      education: "BSc Computer Science",
      certification: "Demo Cloud Certificate",
    },
    lines: [
      "Demo Candidate Alpha",
      "alpha@example.test",
      "Phone: 0000000000",
      "India - Backend Engineering",
      "Experience",
      "Backend Software Engineer",
      "Fictional Alpha Systems",
      "2021 - 2024",
      "Built Java services and SQL data pipelines.",
      "Education: BSc Computer Science",
      "Certification: Demo Cloud Certificate",
      "Fictional engineering test - not a real candidate",
    ],
  },
  {
    id: "beta-accessibility",
    partition: "development",
    left: 60,
    top: 74,
    gap: 29,
    fields: {
      name: "Demo Candidate Beta",
      email: "beta@example.test",
      phone: "0000000000",
      employer: "Fictional Beta Studio",
      role: "Frontend Software Engineer",
      dates: "2020 - 2023",
      education: "BTech Information Technology",
      certification: "Demo Accessibility Certificate",
    },
    lines: [
      "Frontend Engineering Profile",
      "Demo Candidate Beta",
      "Contact: beta@example.test",
      "Phone: 0000000000",
      "Education",
      "BTech Information Technology",
      "Demo Accessibility Certificate",
      "Work History",
      "Frontend Software Engineer",
      "Fictional Beta Studio",
      "2020 - 2023",
      "Designed accessible React interfaces in India.",
      "Fictional engineering test - not a real candidate",
    ],
  },
  {
    id: "gamma-platform",
    partition: "development",
    left: 42,
    top: 58,
    gap: 30,
    fields: {
      name: "Demo Candidate Gamma",
      email: "gamma@example.test",
      phone: "0000000000",
      employer: "Fictional Gamma Infrastructure",
      role: "Platform Software Engineer",
      dates: "2019 - 2022",
      education: "MSc Software Engineering",
      certification: "Demo Linux Certificate",
    },
    lines: [
      "Demo Candidate Gamma",
      "Platform Engineering - India",
      "gamma@example.test | Phone: 0000000000",
      "Qualifications",
      "MSc Software Engineering",
      "Demo Linux Certificate",
      "Projects and Employment",
      "Fictional Gamma Infrastructure",
      "Platform Software Engineer",
      "2019 - 2022",
      "Automated Linux deployments and service monitoring.",
      "Skills: Python, containers, PostgreSQL",
      "Fictional engineering test - not a real candidate",
    ],
  },
  {
    id: "delta-mobile",
    partition: "calibration",
    left: 54,
    top: 68,
    gap: 26,
    fields: {
      name: "Demo Candidate Delta",
      email: "delta@example.test",
      phone: "0000000000",
      employer: "Fictional Delta Mobile",
      role: "Mobile Software Engineer",
      dates: "2022 - 2025",
      education: "BEng Computer Engineering",
      certification: "Demo Android Certificate",
    },
    lines: [
      "Mobile Development Resume",
      "Demo Candidate Delta",
      "India | delta@example.test",
      "Phone: 0000000000",
      "Professional Experience",
      "Fictional Delta Mobile",
      "2022 - 2025",
      "Mobile Software Engineer",
      "Built Kotlin applications and offline sync tools.",
      "Academic Background",
      "BEng Computer Engineering",
      "Demo Android Certificate",
      "Fictional engineering test - not a real candidate",
    ],
  },
  {
    id: "epsilon-quality",
    partition: "locked",
    left: 64,
    top: 60,
    gap: 28,
    fields: {
      name: "Demo Candidate Epsilon",
      email: "epsilon@example.test",
      phone: "0000000000",
      employer: "Fictional Epsilon Testing",
      role: "Quality Software Engineer",
      dates: "2018 - 2021",
      education: "BSc Applied Computing",
      certification: "Demo Testing Certificate",
    },
    lines: [
      "Engineering Quality Portfolio",
      "Demo Candidate Epsilon",
      "epsilon@example.test",
      "Phone: 0000000000 | India",
      "Certification: Demo Testing Certificate",
      "Education: BSc Applied Computing",
      "Employment",
      "Quality Software Engineer",
      "2018 - 2021",
      "Fictional Epsilon Testing",
      "Developed test automation and API regression suites.",
      "Tools: TypeScript, Playwright, Git",
      "Fictional engineering test - not a real candidate",
    ],
  },
  {
    id: "zeta-data",
    partition: "locked",
    left: 46,
    top: 80,
    gap: 25,
    fields: {
      name: "Demo Candidate Zeta",
      email: "zeta@example.test",
      phone: "0000000000",
      employer: "Fictional Zeta Analytics",
      role: "Data Software Engineer",
      dates: "2023 - 2026",
      education: "MTech Data Engineering",
      certification: "Demo Database Certificate",
    },
    lines: [
      "Demo Candidate Zeta",
      "Data Software Engineer",
      "India - zeta@example.test - Phone: 0000000000",
      "Technical Focus",
      "SQL modelling and batch processing",
      "Education and Certificates",
      "MTech Data Engineering",
      "Demo Database Certificate",
      "Recent Work",
      "Fictional Zeta Analytics",
      "2023 - 2026",
      "Maintained Python ingestion and warehouse jobs.",
      "Fictional engineering test - not a real candidate",
    ],
  },
];

const sha256 = (value: Uint8Array | string) =>
  createHash("sha256").update(value).digest("hex");
function pdf(objects: Buffer[]) {
  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n")];
  const offsets: number[] = [];
  let size = parts[0].length;
  objects.forEach((object, index) => {
    offsets.push(size);
    const prefix = Buffer.from(`${index + 1} 0 obj\n`),
      suffix = Buffer.from("\nendobj\n");
    parts.push(prefix, object, suffix);
    size += prefix.length + object.length + suffix.length;
  });
  parts.push(
    Buffer.from(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${size}\n%%EOF`,
    ),
  );
  const result = Buffer.concat(parts);
  if (result.length > 10 * 1024 * 1024)
    throw new Error("Synthetic PDF exceeds approved byte cap");
  return new Uint8Array(result);
}
function stream(header: string, bytes: Uint8Array) {
  return Buffer.concat([
    Buffer.from(`<< ${header} /Length ${bytes.length} >>\nstream\n`),
    bytes,
    Buffer.from("\nendstream"),
  ]);
}

export async function createOcrPrintFixture(
  familyIndex: number,
  segment: Segment,
  providedFamily?: Family,
) {
  const family = providedFamily ?? PRINT_FAMILIES[familyIndex];
  if (!family) throw new Error("Unknown authored family");
  const dpi = segment === "challenging" ? 150 : 300;
  const scale = dpi / 72,
    width = Math.round(612 * scale),
    height = Math.round(792 * scale);
  if (width * height > 10_000_000)
    throw new Error("Synthetic raster exceeds approved pixel cap");
  const middle = [
    "Skills and Projects",
    "Verified fictional content only",
    "Synthetic engineering tests in India",
  ];
  const half = Math.ceil(family.lines.length / 2);
  const pageLines =
    segment === "mixed"
      ? [family.lines.slice(0, half), middle, family.lines.slice(half)]
      : [family.lines];
  const expectedPageTexts = pageLines.map((lines) => lines.join("\n"));
  const expectedLineOrder = pageLines.map((lines, page) => {
    let cursor = 0;
    return lines.map((text, line) => {
      const start = cursor,
        end = start + Array.from(text).length;
      cursor = end + 1;
      return {
        id: `page-${page + 1}-line-${line + 1}`,
        pageId: `page-${page + 1}`,
        pageNumber: page + 1,
        lineNumber: line + 1,
        text,
        start,
        end,
        offsetUnit: "unicode_code_point",
      };
    });
  });
  const labels = Object.entries(family.fields).map(([field, value]) => {
    const page = expectedPageTexts.findIndex((text) => text.includes(value));
    if (page < 0) throw new Error("Missing authored critical label");
    const start = Array.from(
      expectedPageTexts[page].slice(0, expectedPageTexts[page].indexOf(value)),
    ).length;
    return {
      field,
      value,
      pageNumber: page + 1,
      pageId: `page-${page + 1}`,
      start,
      end: start + Array.from(value).length,
      sourceReference: `${family.id}/authored-page-${page + 1}`,
      offsetUnit: "unicode_code_point",
    };
  });
  const rasterDiagnostics: Array<{
    pageNumber: number;
    widthPixels: number;
    heightPixels: number;
    darkPixelCount: number;
    inkBounds: { left: number; top: number; right: number; bottom: number };
  }> = [];
  const objects = [
    Buffer.from("<< /Type /Catalog /Pages 2 0 R >>"),
    Buffer.from(
      `<< /Type /Pages /Kids [${pageLines.map((_, index) => `${4 + index * 3} 0 R`).join(" ")}] /Count ${pageLines.length} >>`,
    ),
    Buffer.from("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"),
  ];
  for (const [page, lines] of pageLines.entries()) {
    const native = segment === "mixed" && page === 1,
      id = 4 + page * 3;
    objects.push(
      Buffer.from(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> /XObject << /Im1 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`,
      ),
    );
    const commands = native
      ? `BT /F1 12 Tf 48 720 Td ${lines.map((line, index) => `${index ? "0 -24 Td " : ""}(${line}) Tj`).join(" ")} ET`
      : "q 612 0 0 792 0 0 cm /Im1 Do Q";
    objects.push(stream("", Buffer.from(commands)));
    if (native) {
      objects.push(Buffer.from("null"));
      continue;
    }
    const canvas = createCanvas(width, height),
      context = canvas.getContext("2d");
    context.fillStyle = "white";
    context.fillRect(0, 0, width, height);
    context.scale(scale, scale);
    context.translate(306, 396);
    if (segment === "challenging")
      context.rotate(((familyIndex % 2 ? -0.35 : 0.35) * Math.PI) / 180);
    context.translate(-306, -396);
    context.fillStyle = "black";
    context.font = `12px ${FONT_ALIAS}`;
    lines.forEach((line, index) => {
      const metrics = context.measureText(line);
      const baseline = family.top + index * family.gap;
      if (
        metrics.width > 510 ||
        family.left - metrics.actualBoundingBoxLeft < 20 ||
        family.left + metrics.actualBoundingBoxRight > 592 ||
        baseline - metrics.actualBoundingBoxAscent < 20 ||
        baseline + metrics.actualBoundingBoxDescent > 772
      )
        throw new Error("Authored line exceeds approved layout");
      context.fillText(line, family.left, baseline);
    });
    let pixels = context.getImageData(0, 0, width, height).data;
    if (segment === "challenging") {
      const blurred = createCanvas(width, height),
        blurContext = blurred.getContext("2d");
      blurContext.filter = "blur(0.3px)";
      blurContext.drawImage(canvas, 0, 0);
      const compressed = await loadImage(blurred.encodeSync("jpeg", 85));
      const decoded = createCanvas(width, height),
        decodedContext = decoded.getContext("2d");
      decodedContext.drawImage(compressed, 0, 0);
      pixels = decodedContext.getImageData(0, 0, width, height).data;
    }
    const grayscale = new Uint8Array(width * height);
    const inkBounds = { left: width, top: height, right: -1, bottom: -1 };
    let darkPixelCount = 0;
    for (let i = 0; i < grayscale.length; i++) {
      grayscale[i] = Math.round(
        0.299 * pixels[i * 4] +
          0.587 * pixels[i * 4 + 1] +
          0.114 * pixels[i * 4 + 2],
      );
      if (grayscale[i] < 128) {
        const x = i % width,
          y = Math.floor(i / width);
        inkBounds.left = Math.min(inkBounds.left, x);
        inkBounds.top = Math.min(inkBounds.top, y);
        inkBounds.right = Math.max(inkBounds.right, x);
        inkBounds.bottom = Math.max(inkBounds.bottom, y);
        darkPixelCount++;
      }
    }
    if (
      !darkPixelCount ||
      inkBounds.left < 10 ||
      inkBounds.top < 10 ||
      inkBounds.right >= width - 10 ||
      inkBounds.bottom >= height - 10
    )
      throw new Error("Blank or cropped authored raster");
    rasterDiagnostics.push({
      pageNumber: page + 1,
      widthPixels: width,
      heightPixels: height,
      darkPixelCount,
      inkBounds,
    });
    objects.push(
      stream(
        `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`,
        deflateSync(grayscale),
      ),
    );
  }
  const bytes = pdf(objects),
    id = `print-${family.id}-${segment}-v1`;
  return {
    id,
    bytes,
    segment,
    transform:
      segment === "challenging" ? "150dpi_skew_blur_jpeg" : "normal_font",
    expectedPageTexts,
    expectedLineOrder,
    rasterDiagnostics,
    labels,
    expectedOutcome: "review_required",
    providerPageInjection: null,
    sourceImageDpi: dpi,
    declaredSkewDegrees:
      segment === "challenging" ? (familyIndex % 2 ? -0.35 : 0.35) : 0,
    declaredRotationDegrees: 0,
    challenge:
      segment === "challenging" ? { blurPixels: 0.3, jpegQuality: 85 } : null,
    executionEvidence: "source_fixture_only",
    manifest: {
      id,
      sourceSha256: sha256(bytes),
      sourceFamily: family.id,
      nearDuplicateGroup: family.id,
      partition: family.partition,
      fontSha256: FONT_HASH,
      fontLicense: "SIL-OFL-1.1",
      fontLicensePath: "pdfjs-dist/standard_fonts/LICENSE_LIBERATION",
      generatorVersion: "normal-font-pdf-v1",
      canvasVersion: "0.1.77",
      rasterPlatform: `${process.platform}/${process.arch}`,
      zlibVersion: process.versions.zlib,
      byteHashPortability: "platform_bound_runtime_lock_required",
      authoredSourceSha256: sha256(
        JSON.stringify({ family, pageLines, labels, expectedLineOrder }),
      ),
      datasetType: "synthetic_engineering_only",
      domain: "software_engineering",
      locale: "en-IN",
      annotatorType: "ai",
      modelIdentifier: "unknown",
      humanValidation: "not_evaluated",
      adjudication: "ai_review_only",
      humanAgreement: null,
      humanAgreementReason: "independent_human_labels_unavailable",
      representativeValidity: "not_evaluated",
      purpose: "local_aa012_normal_font_comparison",
      rawRetention: "30_days_after_evaluation",
      sourcePermission: "original_synthetic_content_with_unmodified_OFL_font",
    },
  };
}
export async function createOcrPrintPilot() {
  const fixtures = [];
  for (let family = 0; family < PRINT_FAMILIES.length; family++)
    for (const segment of ["clean", "challenging", "mixed"] as const)
      fixtures.push(await createOcrPrintFixture(family, segment));
  const controls = createOcrDiagnosticPilot().filter(
    (fixture) => fixture.segment === "controls",
  );
  return [...fixtures, ...controls];
}
