import { randomUUID } from "node:crypto";

export function createRequestId(): string {
  return randomUUID();
}

export function getOrCreateRequestId(value: string | undefined): string {
  if (value && /^[A-Za-z0-9._:-]{8,128}$/.test(value)) return value;
  return createRequestId();
}

/** The server stamps the accepted request id onto inbound headers. */
export function requestIdFrom(request: Request): string {
  return getOrCreateRequestId(request.headers.get("X-Request-Id") ?? undefined);
}
