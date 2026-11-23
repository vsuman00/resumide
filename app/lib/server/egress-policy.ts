const OPENAI_HOSTNAME = "api.openai.com";
const OPENAI_PATHNAME = "/v1";

export const DEFAULT_OPENAI_BASE_URL = `https://${OPENAI_HOSTNAME}${OPENAI_PATHNAME}`;

/**
 * Keep provider egress deliberately narrow. A proxy or alternate provider is
 * a separate security/privacy review and must not be enabled by accident.
 */
export function isAllowedOpenAiBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.port === "" &&
      url.hostname === OPENAI_HOSTNAME &&
      url.pathname.replace(/\/$/, "") === OPENAI_PATHNAME &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export function assertAllowedOpenAiBaseUrl(value: string): string {
  if (!isAllowedOpenAiBaseUrl(value)) {
    throw new Error(
      `OPENAI_BASE_URL must use HTTPS ${DEFAULT_OPENAI_BASE_URL} on the default port with no credentials, query or fragment.`,
    );
  }
  return value.replace(/\/$/, "");
}
