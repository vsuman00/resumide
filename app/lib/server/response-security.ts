import type { RouterContextProvider } from "react-router";
import { getServerConfig } from "./config";
import { createSecurityHeaders } from "./security-headers";

/** Framework response boundary: runs with any deployment adapter, including
 * adapters that never invoke our standalone Express server. */
export async function responseSecurity(
  _args: { request: Request; context: Readonly<RouterContextProvider> },
  next: () => Promise<Response>,
): Promise<Response> {
  const response = await next();
  const config = getServerConfig();
  for (const [name, value] of createSecurityHeaders({
    appOrigin: config.APP_ORIGIN,
    environment: config.NODE_ENV,
    cspMode: config.CSP_MODE,
    cspReportUri: config.CSP_REPORT_URI || undefined,
  }))
    response.headers.set(name, value);
  return response;
}
