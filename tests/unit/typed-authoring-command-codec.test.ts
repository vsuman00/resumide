import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  TYPED_AUTHORING_COMMAND_CODEC_VERSION,
  encodeTypedAuthoringCommandAtoms,
  hashTypedAuthoringCommandAtoms,
} from "../../app/lib/server/typed-authoring-command-codec";

describe("A11 ordered UTF8 atoms, without semantic command authority", () => {
  it.each([
    [[], "A11OP1\n"],
    [[null], "A11OP1\nN;"],
    [[""], "A11OP1\nT0:;"],
    [[null, "", "a:;N;"], "A11OP1\nN;T0:;T5:a:;N;;"],
    [["🧭", "e\u0301", "é", "a\nb"], "A11OP1\nT4:🧭;T3:e\u0301;T2:é;T3:a\nb;"],
  ] as const)("matches an independent byte vector %#", (atoms, expected) => {
    const expectedBytes = Buffer.from(expected, "utf8");
    expect(encodeTypedAuthoringCommandAtoms(atoms)).toEqual(expectedBytes);
    expect(hashTypedAuthoringCommandAtoms(atoms)).toBe(
      createHash("sha256").update(expectedBytes).digest("hex"),
    );
  });

  it("separates its domain from corrections and technical budgets", () => {
    const atoms = ["same", null];
    const actual = hashTypedAuthoringCommandAtoms(atoms);
    for (const domain of ["C02OP1\n", "AIBUDGET1\n"])
      expect(actual).not.toBe(
        createHash("sha256")
          .update(domain + "T4:same;N;")
          .digest("hex"),
      );
  });

  it("keeps null, empty, boundaries, case, order and Unicode normalization distinct", () => {
    const vectors = [
      [null],
      [""],
      ["a", "b"],
      ["a;b"],
      ["b", "a"],
      ["é"],
      ["e\u0301"],
      ["Created"],
      ["created"],
    ];
    expect(new Set(vectors.map(hashTypedAuthoringCommandAtoms)).size).toBe(
      vectors.length,
    );
  });

  it("requires an explicit atom array, not JSON property ordering", () => {
    const first = { kind: "accept", version: "1" };
    const reordered = { version: "1", kind: "accept" };
    const fields = ["kind", "version"] as const;
    expect(
      encodeTypedAuthoringCommandAtoms(fields.map((key) => first[key])),
    ).toEqual(
      encodeTypedAuthoringCommandAtoms(fields.map((key) => reordered[key])),
    );
    expect(() => encodeTypedAuthoringCommandAtoms(first as never)).toThrow();
  });

  it.each(["\ud800", "\udfff", "a\ud800b", "a\udfff", "x\0y"])(
    "rejects text PostgreSQL UTF8 cannot represent %#",
    (value) =>
      expect(() => encodeTypedAuthoringCommandAtoms([value])).toThrow(),
  );

  it.each([undefined, 1, true, {}, ["nested"]])(
    "rejects an invalid atom %#",
    (atom) => {
      expect(() => encodeTypedAuthoringCommandAtoms([atom] as never)).toThrow();
    },
  );

  it("rejects a sparse array instead of interpreting a hole as null", () => {
    expect(() => encodeTypedAuthoringCommandAtoms(Array(1))).toThrow();
  });

  it("accepts exactly 16KiB including framing and rejects the next byte", () => {
    expect(
      encodeTypedAuthoringCommandAtoms(["x".repeat(16_369)]).byteLength,
    ).toBe(16_384);
    expect(() =>
      encodeTypedAuthoringCommandAtoms(["x".repeat(16_370)]),
    ).toThrow();
    expect(
      encodeTypedAuthoringCommandAtoms(["🧭".repeat(4092) + "x"]).byteLength,
    ).toBe(16_384);
    expect(() =>
      encodeTypedAuthoringCommandAtoms(["🧭".repeat(4092) + "xx"]),
    ).toThrow();
  });

  it("bounds aggregate bytes across individually small atoms", () => {
    expect(() =>
      encodeTypedAuthoringCommandAtoms(Array(100).fill("x".repeat(165))),
    ).toThrow();
  });

  it("accepts 256 atoms and rejects 257 before reading their values", () => {
    expect(
      encodeTypedAuthoringCommandAtoms(Array(256).fill(null)).byteLength,
    ).toBe(519);
    const tooMany = Array(257).fill(null);
    Object.defineProperty(tooMany, 0, {
      get() {
        throw Error("ATOM_WAS_READ");
      },
    });
    expect(() => encodeTypedAuthoringCommandAtoms(tooMany)).toThrow(
      "TYPED_AUTHORING_CODEC_LIMIT",
    );
  });

  it("names only the portable byte codec", () => {
    expect(TYPED_AUTHORING_COMMAND_CODEC_VERSION).toBe(
      "a11-command-bytes/1.0.0",
    );
  });
});
