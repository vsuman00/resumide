import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CanonicalResumeDraftSchema } from "../../app/lib/server/canonical-resume-schema";
describe("canonical cross-language schema contract", () => {
  it("keeps the SQL payload validator identical to the versioned application shape", () => {
    const directory = "supabase/migrations";
    const migration = readdirSync(directory)
      .filter((file) => file.endsWith(".sql"))
      .sort()
      .reverse()
      .map((file) => readFileSync(`${directory}/${file}`, "utf8"))
      .find((sql) =>
        /create(?: or replace)? function private\.canonical_shape_valid\(/u.test(
          sql,
        ),
      )!;
    const schema = migration.match(/\$schema\$(.*?)\$schema\$/su)?.[1];
    expect(schema).toBeDefined();
    expect(JSON.parse(schema!)).toEqual(
      z.toJSONSchema(CanonicalResumeDraftSchema, { target: "draft-7" }),
    );
  });
});
