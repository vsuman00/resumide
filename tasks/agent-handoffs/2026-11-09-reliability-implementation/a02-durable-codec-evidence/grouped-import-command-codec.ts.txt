import { createHash } from "node:crypto";

export const GROUPED_IMPORT_CODEC_VERSION = "a02-command-bytes/1.0.0";
const MAX_ATOMS = 2_048;
const MAX_BYTES = 131_072;
const HEADER = Buffer.from("A02OP1\n", "ascii");

function assertText(value: string): void {
  if (value.length > MAX_BYTES) throw Error("GROUPED_IMPORT_CODEC_LIMIT");
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code === 0) throw Error("GROUPED_IMPORT_CODEC_TEXT");
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff))
        throw Error("GROUPED_IMPORT_CODEC_TEXT");
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw Error("GROUPED_IMPORT_CODEC_TEXT");
    }
  }
}

/** Framing only. These bytes do not authenticate or authorize an import. */
export function encodeGroupedImportCommandAtoms(
  atoms: readonly (string | null)[],
): Buffer {
  if (!Array.isArray(atoms)) throw Error("GROUPED_IMPORT_CODEC_ATOMS");
  if (atoms.length > MAX_ATOMS) throw Error("GROUPED_IMPORT_CODEC_LIMIT");
  const chunks: Buffer[] = [HEADER];
  let total = HEADER.byteLength;
  for (let index = 0; index < atoms.length; index++) {
    if (!Object.hasOwn(atoms, index)) throw Error("GROUPED_IMPORT_CODEC_ATOM");
    const atom = atoms[index];
    if (atom === null) {
      total += 2;
      if (total > MAX_BYTES) throw Error("GROUPED_IMPORT_CODEC_LIMIT");
      chunks.push(Buffer.from("N;", "ascii"));
      continue;
    }
    if (typeof atom !== "string") throw Error("GROUPED_IMPORT_CODEC_ATOM");
    assertText(atom);
    const length = Buffer.byteLength(atom, "utf8");
    const prefix = `T${length}:`;
    total += prefix.length + length + 1;
    if (total > MAX_BYTES) throw Error("GROUPED_IMPORT_CODEC_LIMIT");
    chunks.push(
      Buffer.from(prefix, "ascii"),
      Buffer.from(atom, "utf8"),
      Buffer.from(";", "ascii"),
    );
  }
  return Buffer.concat(chunks, total);
}

export function hashGroupedImportCommandAtoms(
  atoms: readonly (string | null)[],
): string {
  return createHash("sha256")
    .update(encodeGroupedImportCommandAtoms(atoms))
    .digest("hex");
}
