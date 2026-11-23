import { describe, expect, it } from "vitest";
import { parseContact } from "../../../app/lib/server/parsing/contact";
import { parsingFixtures } from "./fixtures";

describe("contact parser", () => {
  it.each(parsingFixtures)("matches labels for $id", (fixture) => {
    expect(parseContact(fixture.text.split(/\r?\n/u))).toEqual(
      fixture.expected.contact,
    );
  });

  it("does not mistake date ranges or technology lists for contact data", () => {
    const contact = parseContact([
      "Experience",
      "03/2020 - 08/2024",
      "React, TypeScript",
    ]);
    expect(contact.phone).toBeNull();
    expect(contact.location).toBeNull();
  });
});

describe("location separator whitespace compatibility", () => {
  it.each(["|", "•", "·"])(
    "keeps the exact location around %s separators",
    (separator) => {
      const parsed = parseContact([
        `Contact ${separator}\u00a0BaSeD In:\tBengaluru, India\uFEFF`,
      ]);
      expect(parsed.location).toBe("Bengaluru, India");
    },
  );
  it.each([
    ["\uFEFF\u00a0Address:\u3000München, Germany\u2003", "München, Germany"],
    ["\tLoCaTiOn: São  Paulo, Brasil\u00a0", "São  Paulo, Brasil"],
    ["|  • \u3000· | location: Remote |", "Remote"],
    ["location: Remote | Paris, France", "Remote"],
  ])(
    "preserves labels, case, empty segments and boundary trimming",
    (line, location) => {
      expect(parseContact([line]).location).toBe(location);
    },
  );
  it("keeps a valid location after a long no-delimiter whitespace prefix", () => {
    expect(parseContact([" ".repeat(100001) + "Remote"]).location).toBe(
      "Remote",
    );
  });
  it.each([
    "München,\tGermany",
    "München,\u2003Germany",
    "São\u00a0Paulo, Brasil",
  ])(
    "does not normalize internal whitespace into newly accepted location text",
    (line) => {
      expect(parseContact([line]).location).toBeNull();
    },
  );
  it("keeps the first fifteen raw lines as the location search window", () => {
    expect(
      parseContact([...Array<string>(15).fill(" "), "Location: Remote"])
        .location,
    ).toBeNull();
    expect(
      parseContact([...Array<string>(14).fill(" "), "Location: Remote"])
        .location,
    ).toBe("Remote");
  });
});
