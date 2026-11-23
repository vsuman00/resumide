import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CORRECTION_COMMAND_CODEC_VERSION,
  encodeCorrectionCommandAtoms,
  hashCorrectionCommandAtoms,
} from "../../app/lib/server/correction-command-codec";

describe("C02OP1 low-level ordered atoms (not semantic command authority)", () => {
  it.each([
    [[], "C02OP1\n"],
    [[null], "C02OP1\nN;"],
    [[""], "C02OP1\nT0:;"],
    [[null, "", "a:;N;"], "C02OP1\nN;T0:;T5:a:;N;;"],
    [["🧭", "e\u0301", "é", "a\nb"], "C02OP1\nT4:🧭;T3:e\u0301;T2:é;T3:a\nb;"],
  ] as const)(
    "matches an independently stated UTF8 vector %#",
    (atoms, expected) => {
      const bytes = encodeCorrectionCommandAtoms(atoms);
      expect(bytes.equals(Buffer.from(expected, "utf8"))).toBe(true);
      expect(hashCorrectionCommandAtoms(atoms)).toBe(
        createHash("sha256")
          .update(Buffer.from(expected, "utf8"))
          .digest("hex"),
      );
    },
  );

  it("keeps null, empty, atom boundaries and Unicode normalization distinct", () => {
    const vectors = [[null], [""], ["a", "b"], ["a;b"], ["é"], ["e\u0301"]];
    expect(new Set(vectors.map(hashCorrectionCommandAtoms)).size).toBe(
      vectors.length,
    );
  });

  it("does not use object property order as technical atom order", () => {
    const first = {
      kind: "assign",
      owner: "00000000-0000-4000-8000-000000000001",
      revision: "0",
    };
    const reordered = { revision: "0", owner: first.owner, kind: "assign" };
    const fields = ["kind", "owner", "revision"] as const;
    expect(
      encodeCorrectionCommandAtoms(fields.map((field) => first[field])),
    ).toEqual(
      encodeCorrectionCommandAtoms(fields.map((field) => reordered[field])),
    );
    expect(() => encodeCorrectionCommandAtoms(first as never)).toThrow(
      "CORRECTION_CODEC_ATOMS",
    );
  });

  it.each(["\ud800", "\udfff", "a\ud800b", "a\udfff", "x\0y"])(
    "rejects values not representable as PostgreSQL UTF8 text %#",
    (value) => {
      expect(() => encodeCorrectionCommandAtoms([value])).toThrow(
        "CORRECTION_CODEC_TEXT",
      );
    },
  );

  it.each([undefined, 1, true, {}, ["nested"]])(
    "rejects an invalid atom %#",
    (atom) => {
      expect(() => encodeCorrectionCommandAtoms([atom] as never)).toThrow(
        "CORRECTION_CODEC_ATOM",
      );
    },
  );

  it("rejects sparse atoms rather than silently treating a hole as null", () => {
    expect(() => encodeCorrectionCommandAtoms(Array(1))).toThrow(
      "CORRECTION_CODEC_ATOM",
    );
  });

  it("accepts exactly 64KiB including framing and rejects the next byte", () => {
    expect(encodeCorrectionCommandAtoms(["x".repeat(65_521)]).byteLength).toBe(
      65_536,
    );
    expect(() => encodeCorrectionCommandAtoms(["x".repeat(65_522)])).toThrow(
      "CORRECTION_CODEC_LIMIT",
    );
    expect(() => encodeCorrectionCommandAtoms(["🧭".repeat(16_381)])).toThrow(
      "CORRECTION_CODEC_LIMIT",
    );
  });

  it("bounds aggregate bytes across individually short atoms", () => {
    expect(() =>
      encodeCorrectionCommandAtoms(Array(100).fill("x".repeat(655))),
    ).toThrow("CORRECTION_CODEC_LIMIT");
  });

  it("accepts 1024 atoms and rejects 1025 before expanding their text", () => {
    expect(
      encodeCorrectionCommandAtoms(Array(1024).fill(null)).byteLength,
    ).toBe(2055);
    expect(() => encodeCorrectionCommandAtoms(Array(1025).fill(null))).toThrow(
      "CORRECTION_CODEC_LIMIT",
    );
  });

  it("names the frozen byte codec without claiming semantic normalization", () => {
    expect(CORRECTION_COMMAND_CODEC_VERSION).toBe("c02-command-bytes/1.0.0");
    expect(
      encodeCorrectionCommandAtoms(["001", "true", "ABC"]).toString(),
    ).toBe("C02OP1\nT3:001;T4:true;T3:ABC;");
  });
});
