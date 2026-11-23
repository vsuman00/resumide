import { describe, expect, it } from "vitest";
import {
  assertAllowedOpenAiBaseUrl,
  isAllowedOpenAiBaseUrl,
} from "../../app/lib/server/egress-policy";

describe("official OpenAI origin admission", () => {
  it.each([
    "https://api.openai.com/v1",
    "https://api.openai.com/v1/",
    "https://api.openai.com:443/v1",
    "https://api.openai.com:443/v1/",
    "HTTPS://API.OPENAI.COM:443/v1",
  ])("accepts only the normal HTTPS origin: %s", (value) => {
    expect(isAllowedOpenAiBaseUrl(value)).toBe(true);
    expect(() => assertAllowedOpenAiBaseUrl(value)).not.toThrow();
  });
  it.each([
    "https://api.openai.com:8443/v1",
    "https://api.openai.com:444/v1",
    "https://api.openai.com:80/v1",
    "https://api.openai.com:0/v1",
    "http://api.openai.com/v1",
    "https://api.openai.com.other.example.test/v1",
    "https://other.example.test/v1",
    "https://api.openai.com/v2",
    "https://api.openai.com/v1/chat/completions",
    "https://api.openai.com/v1?test=neutral",
    "https://api.openai.com/v1#fragment",
    "https://PRIVATE_UNIT_CANARY@api.openai.com/v1",
    "https://api.openai.com/v1//",
    "/v1",
    "not a URL",
  ])(
    "rejects alternate ports and other prohibited origin components: %s",
    (value) => {
      expect(isAllowedOpenAiBaseUrl(value)).toBe(false);
      expect(() => assertAllowedOpenAiBaseUrl(value)).toThrow();
      try {
        assertAllowedOpenAiBaseUrl(value);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe(
          "OPENAI_BASE_URL must use HTTPS https://api.openai.com/v1 on the default port with no credentials, query or fragment.",
        );
      }
    },
  );
});
