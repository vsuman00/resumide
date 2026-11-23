import OpenAI from "openai";
import { getAnalysisConfig } from "../app/lib/server/config";

const config = getAnalysisConfig();
try {
  await new OpenAI({
    apiKey: config.OPENAI_API_KEY,
    baseURL: config.OPENAI_BASE_URL,
  }).models.retrieve(
    config.OPENAI_MODEL,
  );
  console.log(JSON.stringify({ status: "ok", model: config.OPENAI_MODEL }));
} catch (error) {
  const status =
    typeof error === "object" && error && "status" in error
      ? Number(error.status)
      : null;
  console.log(
    JSON.stringify({
      status: "failed",
      model: config.OPENAI_MODEL,
      httpStatus: status,
    }),
  );
  process.exitCode = 1;
}
