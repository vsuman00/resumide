import { readFile } from "node:fs/promises";
import { runExtractionBenchmark } from "../app/lib/server/extraction-benchmark";

// JSON input evaluates frozen labels against observations without recognition.
// Without a file, the development-only engineering harness freezes its receipt
// before native parsing/local OCR. Locked synthetic execution requires a prior
// receipt; calibration recognition remains unsupported.
const args = process.argv.slice(2);
const mode = args.includes("--engineering") ? "engineering" : "release";
const file = args.find((arg) => !arg.startsWith("--"));
try {
  if (
    args.some(
      (arg) =>
        arg.startsWith("--") &&
        arg !== "--engineering" &&
        arg !== "--manifest-only" &&
        arg !== "--corpus=repair-20261017" &&
        arg !== "--corpus=confirmation-20261017" &&
        arg !== "--corpus=validation-20261017" &&
        arg !== "--corpus=verification-20261017" &&
        arg !== "--corpus=assessment-20261017" &&
        arg !== "--corpus=acceptance-20261017" &&
        arg !== "--corpus=runtime-check-20261017" &&
        !/^--image=sha256:[a-f0-9]{64}$/u.test(arg) &&
        !/^--partition=(development|locked)$/u.test(arg) &&
        !/^--lock-receipt=[a-f0-9]{64}$/u.test(arg),
    )
  )
    throw new Error("invalid_arguments");
  const report = file
    ? runExtractionBenchmark({
        ...JSON.parse(await readFile(file, "utf8")),
        mode,
      })
    : await (
        await import("./extraction-benchmark-engineering")
      ).runEngineeringExtractionHarness({
        mode,
        corpusSet: args.includes("--corpus=runtime-check-20261017")
          ? "runtime-check-20261017"
          : args.includes("--corpus=acceptance-20261017")
            ? "acceptance-20261017"
            : args.includes("--corpus=assessment-20261017")
              ? "assessment-20261017"
              : args.includes("--corpus=verification-20261017")
                ? "verification-20261017"
                : args.includes("--corpus=validation-20261017")
                  ? "validation-20261017"
                  : args.includes("--corpus=confirmation-20261017")
                    ? "confirmation-20261017"
                    : args.includes("--corpus=repair-20261017")
                      ? "repair-20261017"
                      : "original",
        manifestOnly: args.includes("--manifest-only"),
        expectedLock: args
          .find((arg) => arg.startsWith("--lock-receipt="))
          ?.split("=")[1],
        imageId: args.find((arg) => arg.startsWith("--image="))?.split("=")[1],
        partition: args.includes("--partition=locked")
          ? "locked"
          : "development",
        emit: (receipt) => process.stdout.write(`${JSON.stringify(receipt)}\n`),
      });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.exitCode;
} catch {
  // Validation details may contain source text; emit only a fixed safe code.
  process.stderr.write("extraction_benchmark_invalid_input\n");
  process.exitCode = 1;
}
