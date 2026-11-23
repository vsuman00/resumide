import { createHash } from "node:crypto";

export const CORRECTION_COMMAND_CODEC_VERSION = "c02-command-bytes/1.0.0";
const MAX_ATOMS = 1_024;
const MAX_BYTES = 65_536;
const HEADER = Buffer.from("C02OP1\n", "ascii");

function assertPostgresText(value: string): void {
  if (value.length > MAX_BYTES) throw Error("CORRECTION_CODEC_LIMIT");
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code === 0) throw Error("CORRECTION_CODEC_TEXT");
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff))
        throw Error("CORRECTION_CODEC_TEXT");
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw Error("CORRECTION_CODEC_TEXT");
    }
  }
}

/** Low-level framing only. Authority must rederive the fixed-order semantic atoms
 * from owned rows; this function neither sorts nor validates a correction action. */
export function encodeCorrectionCommandAtoms(
  atoms: readonly (string | null)[],
): Buffer {
  if (!Array.isArray(atoms)) throw Error("CORRECTION_CODEC_ATOMS");
  if (atoms.length > MAX_ATOMS) throw Error("CORRECTION_CODEC_LIMIT");
  const chunks: Buffer[] = [HEADER];
  let total = HEADER.byteLength;
  for (const atom of atoms) {
    if (atom === null) {
      total += 2;
      if (total > MAX_BYTES) throw Error("CORRECTION_CODEC_LIMIT");
      chunks.push(Buffer.from("N;", "ascii"));
      continue;
    }
    if (typeof atom !== "string") throw Error("CORRECTION_CODEC_ATOM");
    assertPostgresText(atom);
    const bytes = Buffer.byteLength(atom, "utf8");
    const prefix = `T${bytes}:`;
    total += prefix.length + bytes + 1;
    if (total > MAX_BYTES) throw Error("CORRECTION_CODEC_LIMIT");
    chunks.push(
      Buffer.from(prefix, "ascii"),
      Buffer.from(atom, "utf8"),
      Buffer.from(";", "ascii"),
    );
  }
  return Buffer.concat(chunks, total);
}

export function hashCorrectionCommandAtoms(
  atoms: readonly (string | null)[],
): string {
  return createHash("sha256")
    .update(encodeCorrectionCommandAtoms(atoms))
    .digest("hex");
}
