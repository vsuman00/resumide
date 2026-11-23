import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readSync,
  writeFileSync,
} from "node:fs";

const maxBytes = 512 * 1024;

export function fixtureBundleKey(raw = "") {
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32 || key.toString("base64") !== raw)
    throw new Error("Managed fixture recovery key unavailable");
  return key;
}

export function writeFixtureBundle(
  file: string,
  prefix: Buffer,
  payload: unknown,
  key: Buffer,
) {
  const clear = Buffer.from(JSON.stringify(payload));
  if (prefix.length + 28 + clear.length > maxBytes)
    throw new Error("Managed fixture recovery bundle is too large");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(prefix);
  const encrypted = Buffer.concat([cipher.update(clear), cipher.final()]);
  writeFileSync(
    file,
    Buffer.concat([prefix, iv, cipher.getAuthTag(), encrypted]),
    { flag: "wx", mode: 0o600 },
  );
}

export function readFixtureBundle(file: string, prefix: Buffer, key: Buffer) {
  const descriptor = openSync(
    file,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  let raw: Buffer;
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size > maxBytes)
      throw new Error("Managed fixture recovery bundle is invalid");
    const bytes = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const length = readSync(
        descriptor,
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (length === 0) break;
      offset += length;
    }
    if (offset !== stat.size)
      throw new Error("Managed fixture recovery bundle changed");
    raw = bytes.subarray(0, offset);
  } finally {
    closeSync(descriptor);
  }
  const boundary = prefix.length;
  const iv = raw.subarray(boundary, boundary + 12);
  const tag = raw.subarray(boundary + 12, boundary + 28);
  if (!raw.subarray(0, boundary).equals(prefix) || tag.length !== 16)
    throw new Error("Managed fixture recovery bundle is invalid");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(prefix);
  decipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([
      decipher.update(raw.subarray(boundary + 28)),
      decipher.final(),
    ]).toString("utf8"),
  ) as unknown;
}
