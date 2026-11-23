import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createResumeStorageKey,
  removeVerifiedResumeStorageObject,
  ResumeStorage,
  type PrivateStorageBucket,
} from "../../app/lib/server/storage";

vi.mock("../../app/lib/server/config", () => ({
  getServerConfig: () => ({
    SUPABASE_URL: "http://127.0.0.1:1",
    SUPABASE_SECRET_KEY: "storage-test-sentinel",
    SUPABASE_RESUME_BUCKET: "resumes",
  }),
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function createBucket(): PrivateStorageBucket {
  return {
    upload: vi.fn().mockResolvedValue({ error: null }),
    remove: vi.fn().mockResolvedValue({ error: null }),
    download: vi.fn().mockResolvedValue({
      data: new Blob([new Uint8Array([37, 80, 68, 70])]),
      error: null,
    }),
    createSignedUrl: vi.fn().mockResolvedValue({
      data: { signedUrl: "https://storage.example/signed" },
      error: null,
    }),
  };
}

describe("private resume storage", () => {
  const expected = { bucket: "resumes", objectId: "synthetic-storage-id" };

  it("checks the acknowledged object identity before deleting a tracked upload", async () => {
    const absent = Response.json({ code: "NoSuchKey" }, { status: 404 });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ id: expected.objectId }))
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(absent);
    vi.stubGlobal("fetch", fetch);
    await expect(
      removeVerifiedResumeStorageObject("fixture.pdf", expected),
    ).resolves.toBeUndefined();
    expect(fetch.mock.calls.map(([, init]) => init?.method)).toEqual([
      "GET",
      "DELETE",
      "GET",
    ]);
  });

  it("refuses a replacement object even at the same tracked key", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json({ id: "a-different-object" }));
    vi.stubGlobal("fetch", fetch);
    await expect(
      removeVerifiedResumeStorageObject("fixture.pdf", expected),
    ).rejects.toMatchObject({ code: "STORAGE_DELETE_UNVERIFIED" });
    expect(fetch).toHaveBeenCalledExactlyOnceWith(
      "http://127.0.0.1:1/storage/v1/object/info/resumes/fixture.pdf",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("accepts a tracked retry only with an explicit object-missing response", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        Response.json({ code: "NoSuchKey" }, { status: 404 }),
      );
    vi.stubGlobal("fetch", fetch);
    await expect(
      removeVerifiedResumeStorageObject("fixture.pdf", expected),
    ).resolves.toBeUndefined();
    expect(fetch.mock.calls.map(([, init]) => init?.method)).toEqual(["GET"]);
  });

  it("refuses a receipt recorded for another bucket", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("fetch", fetch);
    await expect(
      removeVerifiedResumeStorageObject("fixture.pdf", {
        ...expected,
        bucket: "other-bucket",
      }),
    ).rejects.toMatchObject({ code: "STORAGE_DELETE_UNVERIFIED" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("confirms absence through an uncached SDK info request on the exact removed key", async () => {
    const path = createResumeStorageKey({
      organizationId: "organization-1",
      resumeId: "resume-1",
      versionId: "version-1",
    });
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(
        Response.json({ code: "NoSuchKey" }, { status: 404 }),
      );
    vi.stubGlobal("fetch", fetch);

    await expect(
      removeVerifiedResumeStorageObject(path),
    ).resolves.toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:1/storage/v1/object/resumes",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ prefixes: [path] }),
        redirect: "error",
        signal: expect.any(AbortSignal),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "http://127.0.0.1:1/storage/v1/object/info/resumes/" + path,
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        redirect: "error",
        signal: fetch.mock.calls[0][1]?.signal,
      }),
    );
  });

  it("aborts a stalled removal and never issues the follow-up read", async () => {
    vi.useFakeTimers();
    let resolveRemoval!: (response: Response) => void;
    const response = new Promise<Response>((resolve) => {
      resolveRemoval = resolve;
    });
    const fetch = vi.fn<typeof globalThis.fetch>().mockReturnValue(response);
    vi.stubGlobal("fetch", fetch);
    const result = expect(
      removeVerifiedResumeStorageObject("fixture.pdf"),
    ).rejects.toMatchObject({ code: "STORAGE_DELETE_UNVERIFIED" });
    await vi.advanceTimersByTimeAsync(5000);
    await result;
    resolveRemoval(Response.json([]));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it("honors the caller deadline before an identity lookup can lead to a delete", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let resolveLookup!: (response: Response) => void;
    const lookup = new Promise<Response>((resolve) => {
      resolveLookup = resolve;
    });
    const fetch = vi.fn<typeof globalThis.fetch>().mockReturnValue(lookup);
    vi.stubGlobal("fetch", fetch);
    const result = expect(
      removeVerifiedResumeStorageObject(
        "fixture.pdf",
        expected,
        controller.signal,
      ),
    ).rejects.toMatchObject({ code: "STORAGE_DELETE_UNVERIFIED" });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort();
    await result;
    resolveLookup(Response.json({ id: expected.objectId }));
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch.mock.calls.map(([, init]) => init?.method)).toEqual(["GET"]);
    expect(fetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it("generates tenant-scoped keys and a checksum", async () => {
    const bucket = createBucket();
    const storage = new ResumeStorage(bucket);
    const result = await storage.upload({
      organizationId: "organization-1",
      resumeId: "resume-1",
      versionId: "version-1",
      bytes: new TextEncoder().encode("%PDF-1.4"),
    });

    expect(result.storageKey).toBe(
      createResumeStorageKey({
        organizationId: "organization-1",
        resumeId: "resume-1",
        versionId: "version-1",
      }),
    );
    expect(result.checksum).toHaveLength(64);
  });

  it("cleans a possibly partial object after upload failure", async () => {
    const bucket = createBucket();
    vi.mocked(bucket.upload).mockResolvedValue({ error: new Error("failed") });
    const storage = new ResumeStorage(bucket);

    await expect(
      storage.upload({
        organizationId: "organization-1",
        resumeId: "resume-1",
        versionId: "version-1",
        bytes: new Uint8Array([1]),
      }),
    ).rejects.toMatchObject({ code: "STORAGE_UPLOAD_FAILED" });
    expect(bucket.remove).toHaveBeenCalledOnce();
  });

  it("downloads private object bytes", async () => {
    const storage = new ResumeStorage(createBucket());
    await expect(storage.download("private.pdf")).resolves.toEqual(
      new Uint8Array([37, 80, 68, 70]),
    );
  });

  it("denies guessed cross-tenant keys and excessive expiry", async () => {
    const bucket = createBucket();
    const storage = new ResumeStorage(bucket);

    await expect(
      storage.createSignedUrl({
        organizationId: "organization-1",
        storageKey: "organizations/organization-2/resumes/resume.pdf",
      }),
    ).rejects.toMatchObject({ code: "STORAGE_OBJECT_NOT_FOUND" });
    await expect(
      storage.createSignedUrl({
        organizationId: "organization-1",
        storageKey: "organizations/organization-1/resumes/resume.pdf",
        expiresInSeconds: 301,
      }),
    ).rejects.toMatchObject({ code: "SIGNED_URL_EXPIRY_INVALID" });
    expect(bucket.createSignedUrl).not.toHaveBeenCalled();
  });
});
