import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertJobRelationUnicodeRuntime,
  JOB_RELATION_UNICODE_PROFILE as profile,
  JOB_RELATION_UNICODE_SHA256,
} from "../../app/lib/server/job-relation-unicode";

type Ranges = readonly (readonly [number, number])[];
const contains = (ranges: Ranges, codepoint: number) => {
  let first = 0,
    last = ranges.length - 1;
  while (first <= last) {
    const index = (first + last) >>> 1;
    const [start, end] = ranges[index];
    if (codepoint < start) last = index - 1;
    else if (codepoint > end) first = index + 1;
    else return true;
  }
  return false;
};
const digest = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const lowercase = new Map(profile.data.defaultLowerMappings);
const folds = new Map(profile.data.regexAsciiFoldMappings);

function lowerFromProfile(value: string) {
  const scalars = Array.from(value, (scalar) => scalar.codePointAt(0)!);
  return scalars
    .flatMap((codepoint, index) => {
      if (codepoint === profile.data.finalSigma.codePoint) {
        const cased = (step: number) => {
          for (
            let cursor = index + step;
            cursor >= 0 && cursor < scalars.length;
            cursor += step
          ) {
            const other = scalars[cursor];
            if (contains(profile.data.caseIgnorableRanges, other)) continue;
            return contains(profile.data.casedRanges, other);
          }
          return false;
        };
        if (cased(-1) && !cased(1)) return [profile.data.finalSigma.finalLower];
      }
      return lowercase.get(codepoint) ?? [codepoint];
    })
    .map((codepoint) => String.fromCodePoint(codepoint))
    .join("");
}

describe("pinned JD Unicode data, without SQL execution", () => {
  it("binds the runtime, rule identity and every generated data byte", () => {
    expect(profile.schemaVersion).toBe("jd-unicode-profile/1.0.0");
    expect(profile.runtime).toEqual({
      node: "v22.23.4",
      unicode: "17.0",
      icu: "78.3",
      v8: "12.4.254.21-node.57",
    });
    expect(profile.scalarCount).toBe(1_112_064);
    expect(digest(profile.rules)).toBe(profile.ruleSha256);
    expect(digest(profile.data)).toBe(profile.dataSha256);
    expect(digest(profile)).toBe(JOB_RELATION_UNICODE_SHA256);
    expect(() => assertJobRelationUnicodeRuntime()).not.toThrow();
  });

  it.each(["node", "unicode", "icu", "v8"] as const)(
    "rejects %s runtime drift before a write can use the data",
    (key) => {
      expect(() =>
        assertJobRelationUnicodeRuntime({
          ...profile.runtime,
          [key]: "unregistered-runtime",
        }),
      ).toThrow("JD_UNICODE_RUNTIME_UNSUPPORTED");
    },
  );

  it("rejects malformed runtime tuples without accepting an extra capability", () => {
    for (const actual of [null, {}, { ...profile.runtime, allowed: true }])
      expect(() => assertJobRelationUnicodeRuntime(actual as never)).toThrow(
        "JD_UNICODE_RUNTIME_UNSUPPORTED",
      );
  });

  it("freezes the complete profile, nested ranges and mapping values", () => {
    const inspect = (value: unknown) => {
      if (value !== null && typeof value === "object") {
        expect(Object.isFrozen(value)).toBe(true);
        for (const child of Object.values(value)) inspect(child);
      }
    };
    inspect(profile);
    expect(Reflect.set(profile.runtime, "node", "unregistered")).toBe(false);
    expect(Reflect.set(profile.data.identifierRanges[0], "0", 0)).toBe(false);
    expect(digest(profile)).toBe(JOB_RELATION_UNICODE_SHA256);
  });

  it("stores sorted, coalesced, scalar-only ranges and unique mappings", () => {
    for (const ranges of [
      profile.data.identifierRanges,
      profile.data.casedRanges,
      profile.data.caseIgnorableRanges,
      profile.data.regexWordIuRanges,
      profile.data.whitespaceRanges,
    ]) {
      let previous = -2;
      for (const [start, end] of ranges) {
        expect(Number.isInteger(start) && Number.isInteger(end)).toBe(true);
        expect(start).toBeGreaterThan(previous + 1);
        expect(end).toBeGreaterThanOrEqual(start);
        expect(end).toBeLessThanOrEqual(0x10ffff);
        expect(start <= 0xdfff && end >= 0xd800).toBe(false);
        previous = end;
      }
    }
    expect(lowercase.size).toBe(profile.data.defaultLowerMappings.length);
    expect(folds.size).toBe(profile.data.regexAsciiFoldMappings.length);
  });

  it("agrees with an independent native-JS oracle for every Unicode scalar", () => {
    const classes = [
      [profile.data.identifierRanges, /^[\p{L}\p{N}\p{M}]$/u],
      [profile.data.casedRanges, /^\p{Cased}$/u],
      [profile.data.caseIgnorableRanges, /^\p{Case_Ignorable}$/u],
      [profile.data.regexWordIuRanges, /^\w$/iu],
      [profile.data.whitespaceRanges, /^\s$/u],
    ] as const;
    let count = 0;
    for (let codepoint = 0; codepoint <= 0x10ffff; codepoint++) {
      if (codepoint >= 0xd800 && codepoint <= 0xdfff) continue;
      count++;
      const scalar = String.fromCodePoint(codepoint);
      for (const [ranges, oracle] of classes)
        if (contains(ranges, codepoint) !== oracle.test(scalar))
          throw Error(`Unicode class disagreement at ${codepoint}`);
      const recorded = String.fromCodePoint(
        ...(lowercase.get(codepoint) ?? [codepoint]),
      );
      if (recorded !== scalar.toLowerCase())
        throw Error(`Unicode lowercase disagreement at ${codepoint}`);
      const fold = folds.get(codepoint);
      if ((fold !== undefined) !== /^[a-z]$/iu.test(scalar))
        throw Error(`Unicode fold membership disagreement at ${codepoint}`);
      if (
        fold !== undefined &&
        !new RegExp(`^${String.fromCodePoint(fold)}$`, "iu").test(scalar)
      )
        throw Error(`Unicode fold value disagreement at ${codepoint}`);
      if (
        contains(profile.data.whitespaceRanges, codepoint) !==
        (scalar.trim() === "")
      )
        throw Error(`Unicode trim disagreement at ${codepoint}`);
    }
    expect(count).toBe(profile.scalarCount);
  }, 20_000);

  it.each([
    "ΟΣ",
    "ΟΣΑ",
    "Ο\u0301Σ",
    "Ο'Σ",
    "ΟΣ\u0301Α",
    "ΟΣ1",
    "Σ",
    "İ K K S ſ",
    "É E\u0301 🧭",
  ])("reconstructs default lowercase and FinalSigma context %#", (value) => {
    expect(lowerFromProfile(value)).toBe(value.toLowerCase());
  });

  it("keeps whitespace, regex-word, identifier and dot rules distinct", () => {
    expect(contains(profile.data.whitespaceRanges, 0xfeff)).toBe(true);
    expect(contains(profile.data.whitespaceRanges, 0x85)).toBe(false);
    expect(contains(profile.data.whitespaceRanges, 0x200b)).toBe(false);
    expect(contains(profile.data.identifierRanges, 0x301)).toBe(true);
    expect(contains(profile.data.regexWordIuRanges, 0x301)).toBe(false);
    expect(contains(profile.data.regexWordIuRanges, 0x212a)).toBe(true);
    expect(contains(profile.data.identifierRanges, 36)).toBe(false);
    expect(profile.rules.aliasExtras).toEqual([36, 95]);
    expect(profile.rules.durationLeftExtras).toEqual([44, 46, 95]);
    expect(profile.rules.durationRightExtras).toEqual([95]);
    expect(profile.rules.aliasDot).toBe(
      "leading denied; trailing denied only before an identifier or _$",
    );
    expect(lowerFromProfile("e\u0301")).not.toBe(lowerFromProfile("é"));
    expect(lowercase.get(0x130)).toEqual([0x69, 0x307]);
    expect(folds.get(0x17f)).toBe(0x73);
    expect(folds.get(0x212a)).toBe(0x6b);
  });
});
