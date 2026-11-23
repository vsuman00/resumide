import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import { submitManagedDocumentDeletion } from "../../scripts/verify-managed-document-deletion";

function fixture() {
  const scope = {
    ownerId: randomUUID(),
    organizationId: randomUUID(),
    requestKey: randomUUID(),
  };
  const deletionId = randomUUID();
  const query = vi.fn<typeof fetch>();
  query.mockResolvedValueOnce(Response.json([{ target_id: deletionId }]));
  query.mockResolvedValueOnce(Response.json([{ id: deletionId }]));
  const client = createClient(
    "https://fixture.supabase.co",
    "synthetic-admin-fixture",
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: query },
    },
  );
  const origin = new URL("http://127.0.0.1:3110");
  const headers = {
    "Content-Type": "text/html; charset=utf-8",
    "X-Request-Id": scope.requestKey,
    "Cache-Control": "private, no-store",
  };
  const cookie = "synthetic-session=owner";
  const post = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      new Response("<p>deletion request queued.</p>", { headers }),
    );
  return {
    scope,
    deletionId,
    query,
    origin,
    headers,
    cookie,
    post,
    submit: () =>
      submitManagedDocumentDeletion(client, origin, cookie, scope, post),
  };
}

it("submits the owner form and resolves only the audited queued deletion", async () => {
  const f = fixture();
  await expect(f.submit()).resolves.toBe(f.deletionId);
  expect(f.post).toHaveBeenCalledExactlyOnceWith(
    new URL("/privacy", f.origin),
    {
      method: "POST",
      redirect: "error",
      headers: {
        Origin: f.origin.origin,
        Cookie: f.cookie,
        "X-Request-Id": f.scope.requestKey,
      },
      body: new URLSearchParams({ kind: "deletion" }),
    },
  );
  const [audit, deletion] = f.query.mock.calls.map(
    ([url]) => new URL(String(url)),
  );
  expect(audit.pathname).toBe("/rest/v1/audit_events");
  expect(Object.fromEntries(audit.searchParams)).toEqual({
    select: "target_id",
    request_id: `eq.${f.scope.requestKey}`,
    actor_id: `eq.${f.scope.ownerId}`,
    organization_id: `eq.${f.scope.organizationId}`,
    action: "eq.deletion.requested",
    target_type: "eq.data_request",
    outcome: "eq.success",
  });
  expect(deletion.pathname).toBe("/rest/v1/data_requests");
  expect(Object.fromEntries(deletion.searchParams)).toEqual({
    select: "id",
    id: `eq.${f.deletionId}`,
    user_id: `eq.${f.scope.ownerId}`,
    organization_id: `eq.${f.scope.organizationId}`,
    kind: "eq.deletion",
    status: "eq.queued",
  });
  expect(f.query).toHaveBeenCalledTimes(2);
});

it.each(["wrong-key", "cacheable", "missing-success", "redirect"])(
  "refuses a %s submission without reading or claiming a queue entry",
  async (reason) => {
    const f = fixture();
    const headers = new Headers(f.headers);
    if (reason === "wrong-key") headers.set("X-Request-Id", randomUUID());
    if (reason === "cacheable")
      headers.set("Cache-Control", "public, max-age=60");
    f.post.mockResolvedValue(
      new Response(
        reason === "missing-success"
          ? "<p>Privacy</p>"
          : "deletion request queued.",
        {
          status: reason === "redirect" ? 302 : 200,
          headers,
        },
      ),
    );
    await expect(f.submit()).rejects.toThrow("PRIVACY_ROUTE_UNVERIFIED");
    expect(f.query).not.toHaveBeenCalled();
  },
);

it.each([
  [],
  [{ target_id: "bad-id" }],
  [{ target_id: randomUUID() }, { target_id: randomUUID() }],
])(
  "refuses a missing, invalid, or ambiguous audit record %#",
  async (...entries) => {
    const f = fixture();
    f.query.mockReset().mockResolvedValueOnce(Response.json(entries));
    await expect(f.submit()).rejects.toThrow("PRIVACY_ROUTE_AUDIT_UNVERIFIED");
    expect(f.query).toHaveBeenCalledTimes(1);
  },
);

it("refuses an unexpected request even after the exact audit event", async () => {
  const f = fixture();
  f.query
    .mockReset()
    .mockResolvedValueOnce(Response.json([{ target_id: f.deletionId }]))
    .mockResolvedValueOnce(Response.json([{ id: randomUUID() }]));
  await expect(f.submit()).rejects.toThrow("PRIVACY_ROUTE_QUEUE_UNVERIFIED");
});
