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
