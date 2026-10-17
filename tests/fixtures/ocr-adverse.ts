import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";

// Original synthetic controls, separate from every existing corpus/lock.
function pdf(objects: Buffer[], trailer = "") {
  const parts: Buffer[] = [Buffer.from("%PDF-1.4\n")];
  let length = parts[0].length;
  const offsets = objects.map((object, index) => {
    const offset = length;
    const prefix = Buffer.from(`${index + 1} 0 obj\n`);
    const suffix = Buffer.from("\nendobj\n");
    parts.push(prefix, object, suffix);
    length += prefix.length + object.length + suffix.length;
    return offset;
  });
  parts.push(
    Buffer.from(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R ${trailer} >>\nstartxref\n${length}\n%%EOF`,
    ),
  );
  return new Uint8Array(Buffer.concat(parts));
}
const object = (value: string) => Buffer.from(value);
const padding = Buffer.from(
  "28bf4e5e4e758a4164004e56fffa01082e2e00b6d0683e802f0ca9fe6453697a",
  "hex",
);
function rc4(key: Buffer, input: Buffer) {
  const state = Array.from({ length: 256 }, (_, index) => index);
  let j = 0;
  for (let i = 0; i < 256; i++) {
    j = (j + state[i] + key[i % key.length]) % 256;
    [state[i], state[j]] = [state[j], state[i]];
  }
  let i = 0;
  j = 0;
  return Buffer.from(
    input.map((byte) => {
      i = (i + 1) % 256;
      j = (j + state[i]) % 256;
      [state[i], state[j]] = [state[j], state[i]];
      return byte ^ state[(state[i] + state[j]) % 256];
    }),
  );
}
const md5 = (bytes: Buffer) => createHash("md5").update(bytes).digest();

export function createEncryptedOcrControl() {
  // Standard security handler revision 2, empty user password. No encrypted
  // strings/streams are needed for a valid blank page. Poppler can authenticate
  // and inspect it, so rejection proves the explicit encrypted-input policy.
  const ownerPassword = Buffer.from("synthetic-control-owner");
  const ownerPadded = Buffer.concat([ownerPassword, padding]).subarray(0, 32);
  const owner = rc4(md5(ownerPadded).subarray(0, 5), padding);
  const permissions = Buffer.alloc(4);
  permissions.writeInt32LE(-4);
  const id = md5(Buffer.from("original-encrypted-control-v1"));
  const key = md5(Buffer.concat([padding, owner, permissions, id])).subarray(
    0,
    5,
  );
  const user = rc4(key, padding);
  const bytes = pdf(
    [
      object("<< /Type /Catalog /Pages 2 0 R >>"),
      object("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
      object(
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> >>",
      ),
      object(
        `<< /Filter /Standard /V 1 /R 2 /O <${owner.toString("hex")}> /U <${user.toString("hex")}> /P -4 >>`,
      ),
    ],
    `/Encrypt 4 0 R /ID [<${id.toString("hex")}> <${id.toString("hex")}>]`,
  );
  return control("encrypted-valid-blank-v1", bytes, {
    encryption: "standard_r2_empty_user_password",
  });
}

export function createOversizedRasterOcrControl() {
  const width = 4000,
    height = 4000;
  const compressed = deflateSync(Buffer.alloc(width * height, 255));
  const content = Buffer.from("q 612 0 0 792 0 0 cm /Im1 Do Q");
  const stream = (header: string, data: Buffer) =>
    Buffer.concat([
      object(`<< ${header} /Length ${data.length} >>\nstream\n`),
      data,
      object("\nendstream"),
    ]);
  const bytes = pdf([
    object("<< /Type /Catalog /Pages 2 0 R >>"),
    object("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    object(
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im1 5 0 R >> >> /Contents 4 0 R >>",
    ),
    stream("", content),
    stream(
      `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode`,
      compressed,
    ),
  ]);
  return control("oversized-embedded-raster-v1", bytes, {
    width,
    height,
    sourcePixels: width * height,
    decodedRasterBytes: width * height,
  });
}

function control(
  id: string,
  bytes: Uint8Array,
  properties: Record<string, string | number>,
) {
  return {
    id,
    bytes,
    properties,
    sourceSha256: createHash("sha256").update(bytes).digest("hex"),
    datasetType: "synthetic_engineering_only",
    partition: "development",
    annotatorType: "ai",
    humanValidation: "not_evaluated",
    representativeValidity: "not_evaluated",
    persistedRawAssets: false,
  };
}
