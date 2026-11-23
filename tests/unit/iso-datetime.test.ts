import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SqlCompatibleIsoDateTimeSchema } from "~/lib/server/iso-datetime";

describe("SQL-compatible ISO datetimes", () => {
  it("accepts the frozen SQL format, with and without seconds", () => {
    expect(
      SqlCompatibleIsoDateTimeSchema.safeParse("2026-10-29T12:00Z").success,
    ).toBe(true);
    expect(
      SqlCompatibleIsoDateTimeSchema.safeParse("2026-10-29T12:00:01Z").success,
    ).toBe(true);
    expect(
      SqlCompatibleIsoDateTimeSchema.safeParse("2026-10-29T12:00:01.123Z")
        .success,
    ).toBe(true);
  });

  it("rejects offsets, invalid dates, and missing timezones", () => {
    for (const value of [
      "2026-10-29T12:00:01+01:00",
      "2026-02-30T12:00:01Z",
      "2026-10-29T12:00:01",
    ]) {
      expect(SqlCompatibleIsoDateTimeSchema.safeParse(value).success).toBe(
        false,
      );
    }
  });

  it("emits the draft-7 format and pattern used by the SQL validators", () => {
    expect(
      z.toJSONSchema(SqlCompatibleIsoDateTimeSchema, { target: "draft-7" }),
    ).toMatchObject({ type: "string", format: "date-time" });
  });
});
