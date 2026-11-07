import { z } from "zod";

export const PADDLEOCR_MODEL = "PP-OCRv6" as const;
export const PADDLEOCR_JOBS_URL =
  "https://paddleocr.aistudio-app.com/api/v2/ocr/jobs";
export const PADDLEOCR_CONSENT_VERSION = "paddle-document-ocr-v1";

// Result links are BOS short links. Each deployment must approve exact hosts;
// neither arbitrary URLs nor suffix/wildcard configuration are accepted.
const resultHost = z
  .string()
  .regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+bcebos\.com$/u)
  .max(253);
const schema = z
  .object({
    PADDLEOCR_ENABLED: z
      .enum(["false", "true"])
      .default("false")
      .transform((value) => value === "true"),
    PADDLEOCR_ACCESS_TOKEN: z
      .string()
      .trim()
      .refine((value) => !/[\r\n]/u.test(value))
      .default(""),
    PADDLEOCR_RESULT_HOSTS: z
      .string()
      .default("")
      .transform((value) =>
        value
          .split(",")
          .map((host) => host.trim())
          .filter(Boolean),
      )
      .pipe(z.array(resultHost).max(10)),
    PADDLEOCR_DISCLOSURE_POLICY_ID: z.string().trim().max(100).default(""),
    PADDLEOCR_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(60_000)
      .default(15_000),
    PADDLEOCR_MAX_PAGES: z.coerce.number().int().min(1).max(10).default(3),
    PADDLEOCR_MAX_UPLOAD_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(10_485_760)
      .default(10_485_760),
    PADDLEOCR_MAX_RESULT_BYTES: z.coerce
      .number()
      .int()
      .min(1)
      .max(2_000_000)
      .default(1_000_000),
    PADDLEOCR_MAX_CHARACTERS: z.coerce
      .number()
      .int()
      .min(1)
      .max(200_000)
      .default(100_000),
    PADDLEOCR_MAX_POLLS: z.coerce.number().int().min(1).max(60).default(20),
    PADDLEOCR_POLL_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(5_000)
      .default(500),
  })
  .superRefine((value, context) => {
    if (value.PADDLEOCR_ENABLED) {
      for (const key of [
        "PADDLEOCR_ACCESS_TOKEN",
        "PADDLEOCR_RESULT_HOSTS",
        "PADDLEOCR_DISCLOSURE_POLICY_ID",
      ] as const)
        if (!value[key].length)
          context.addIssue({
            code: "custom",
            path: [key],
            message: "Required for hosted OCR",
          });
    }
  });
export type PaddleOcrConfig = z.infer<typeof schema>;

export function parsePaddleOcrConfig(
  environment: NodeJS.ProcessEnv = process.env,
): PaddleOcrConfig {
  const parsed = schema.safeParse(environment);
  if (!parsed.success)
    throw new Error(
      `Invalid PaddleOCR configuration: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`,
    );
  return parsed.data;
}
