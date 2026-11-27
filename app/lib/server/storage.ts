import { createHash } from "node:crypto";
import { StorageApiError } from "@supabase/supabase-js";
import { getServerConfig } from "./config";
import { runProviderAttempt } from "./provider-attempt";
import { createSupabaseAdminClient } from "./supabase";

const MAX_SIGNED_URL_SECONDS = 300;

export class StorageError extends Error {
  readonly code: string;

  constructor(code: string, options?: ErrorOptions) {
    super("The resume file operation failed.", options);
    this.name = "StorageError";
    this.code = code;
  }
}

export interface PrivateStorageBucket {
  upload: (
    path: string,
    body: Uint8Array,
    options: { contentType: string; upsert: boolean },
  ) => Promise<{ error: unknown }>;
  remove: (paths: string[]) => Promise<{ error: unknown }>;
  download: (path: string) => Promise<{ data: Blob | null; error: unknown }>;
  createSignedUrl: (
    path: string,
    expiresIn: number,
  ) => Promise<{ data: { signedUrl: string } | null; error: unknown }>;
}

export function createResumeStorageKey(args: {
  organizationId: string;
  resumeId: string;
  versionId: string;
}): string {
  return `organizations/${args.organizationId}/resumes/${args.resumeId}/versions/${args.versionId}.pdf`;
}

export class ResumeStorage {
  constructor(private readonly bucket: PrivateStorageBucket) {}

  async upload(args: {
    organizationId: string;
    resumeId: string;
    versionId: string;
    bytes: Uint8Array;
    /** PDF unless a Word file is stored; the ".pdf" key suffix is an opaque identity either way. */
    mediaType?: string;
  }) {
    const storageKey = createResumeStorageKey(args);
    const checksum = createHash("sha256").update(args.bytes).digest("hex");
    const { error } = await this.bucket.upload(storageKey, args.bytes, {
      contentType: args.mediaType ?? "application/pdf",
      upsert: false,
    });

    if (error) {
      await this.bucket.remove([storageKey]).catch(() => undefined);
      throw new StorageError("STORAGE_UPLOAD_FAILED", { cause: error });
    }

    return { storageKey, checksum, bytes: args.bytes.byteLength };
  }

  async download(storageKey: string): Promise<Uint8Array> {
    const { data, error } = await this.bucket.download(storageKey);
    if (error || !data) {
      throw new StorageError("STORAGE_OBJECT_NOT_FOUND", { cause: error });
    }
    return new Uint8Array(await data.arrayBuffer());
  }

  async createSignedUrl(args: {
    organizationId: string;
    storageKey: string;
    expiresInSeconds?: number;
  }): Promise<string> {
    const prefix = `organizations/${args.organizationId}/`;
    if (!args.storageKey.startsWith(prefix)) {
      throw new StorageError("STORAGE_OBJECT_NOT_FOUND");
    }

    const expiresIn = args.expiresInSeconds ?? 60;
    if (expiresIn < 1 || expiresIn > MAX_SIGNED_URL_SECONDS) {
      throw new StorageError("SIGNED_URL_EXPIRY_INVALID");
    }

    const { data, error } = await this.bucket.createSignedUrl(
      args.storageKey,
      expiresIn,
    );
    if (error || !data) {
      throw new StorageError("STORAGE_OBJECT_NOT_FOUND", { cause: error });
    }
    return data.signedUrl;
  }

  async remove(storageKey: string): Promise<void> {
    const { error } = await this.bucket.remove([storageKey]);
    if (error) {
      throw new StorageError("STORAGE_DELETE_FAILED", { cause: error });
    }
  }
}

function resumeStorageBucket(fetch?: typeof globalThis.fetch) {
  const config = getServerConfig();
  return createSupabaseAdminClient(fetch).storage.from(
    config.SUPABASE_RESUME_BUCKET,
  );
}

export function createResumeStorage() {
  return new ResumeStorage(resumeStorageBucket());
}

function isMissingStorageKey(error: unknown): boolean {
  return (
    error instanceof StorageApiError &&
    error.status === 404 &&
    error.code === "NoSuchKey"
  );
}

/** Confirm absence of an exact key through Storage. */
export async function removeVerifiedResumeStorageObject(
  storageKey: string,
  expected?: { bucket: string; objectId: string },
  cancellation?: AbortSignal,
) {
  const failure = () => new StorageError("STORAGE_DELETE_UNVERIFIED");
  try {
    await runProviderAttempt({
      timeoutMs: 5_000,
      signal: cancellation,
      failure,
      execute: async (signal) => {
        if (
          expected &&
          expected.bucket !== getServerConfig().SUPABASE_RESUME_BUCKET
        )
          throw failure();
        const bucket = resumeStorageBucket((input, init) =>
          globalThis.fetch(input, {
            ...init,
            signal,
            cache: "no-store",
            redirect: "error",
          }),
        );
        if (expected) {
          const before = await bucket.info(storageKey);
          signal.throwIfAborted();
          if (before.data === null && isMissingStorageKey(before.error)) return;
          if (before.error || before.data?.id !== expected.objectId)
            throw failure();
        }
        const removal = await bucket.remove([storageKey]);
        signal.throwIfAborted();
        if (removal.error && !isMissingStorageKey(removal.error))
          throw failure();

        const observation = await bucket.info(storageKey);
        if (
          observation.data !== null ||
          !isMissingStorageKey(observation.error)
        )
          throw failure();
      },
    });
  } catch {
    throw failure();
  }
}
