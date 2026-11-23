import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { CanonicalResumeDraftSchema } from "../../app/lib/server/canonical-resume-schema";

type Migration = { name: string; sql: string };
const shapeSignature = "private.canonical_shape_valid(jsonb)";
const digest = (body: string) =>
  createHash("sha256").update(body).digest("hex");
const patchSchema = z.object({
  signature: z.literal(shapeSignature),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  newSha256: z.string().regex(/^[a-f0-9]{64}$/),
  patches: z
    .array(z.object({ old: z.string().min(1), new: z.string() }))
    .min(1),
});
type ShapePatch = z.infer<typeof patchSchema>;

function applyShapePatch(body: string, patch: ShapePatch): string {
  if (digest(body) !== patch.sha256)
    throw Error("CANONICAL_SQL_PREDECESSOR_DRIFT");
  let next = body;
  for (const change of patch.patches) {
    if (next.split(change.old).length !== 2)
      throw Error("CANONICAL_SQL_CONTEXT_DRIFT");
    next = next.replace(change.old, change.new);
  }
  if (digest(next) !== patch.newSha256)
    throw Error("CANONICAL_SQL_POSTIMAGE_DRIFT");
  return next;
}

// Read the finite source literals/guard data; this does not parse or execute SQL.
function resolveShapeBody(
  migrations: readonly Migration[],
): string | undefined {
  let body: string | undefined;
  for (const migration of [...migrations].sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  )) {
    const events: (
      | { offset: number; kind: "declaration"; body: string }
      | { offset: number; kind: "guard"; sha256: string }
      | { offset: number; kind: "patch"; patch: ShapePatch }
    )[] = [];
    for (const match of migration.sql.matchAll(
      /^create(?: or replace)? function private\.canonical_shape_valid\([^;]*?\bas\s+(\$[a-z0-9_]*\$)([\s\S]*?)\1;/gimu,
    ))
      events.push({ offset: match.index, kind: "declaration", body: match[2] });
    for (const match of migration.sql.matchAll(
      /do \$shape_guard\$([\s\S]*?)\$shape_guard\$;/gu,
    )) {
      if (!match[1].includes(`to_regprocedure('${shapeSignature}')`)) continue;
      const sha256 = match[1].match(/='([a-f0-9]{64})'/u)?.[1];
      if (!sha256) throw Error("CANONICAL_SQL_GUARD_DRIFT");
      events.push({ offset: match.index, kind: "guard", sha256 });
    }
    for (const match of migration.sql.matchAll(
      /\$patch_manifest\$([\s\S]*?)\$patch_manifest\$::jsonb;/gu,
    )) {
      const entries = z
        .array(z.record(z.string(), z.unknown()))
        .parse(JSON.parse(match[1]));
      for (const entry of entries)
        if (entry.signature === shapeSignature)
          events.push({
            offset: match.index,
            kind: "patch",
            patch: patchSchema.parse(entry),
          });
    }
    for (const event of events.sort((a, b) => a.offset - b.offset)) {
      if (event.kind === "declaration") body = event.body;
      else {
        if (body === undefined)
          throw Error("CANONICAL_SQL_MISSING_PREDECESSOR");
        if (event.kind === "guard") {
          if (digest(body) !== event.sha256)
            throw Error("CANONICAL_SQL_PREDECESSOR_DRIFT");
        } else body = applyShapePatch(body, event.patch);
      }
    }
  }
  return body;
}
const directory = "supabase/migrations";
const migrations = readdirSync(directory)
  .filter((file) => file.endsWith(".sql"))
  .map((name) => ({ name, sql: readFileSync(`${directory}/${name}`, "utf8") }));
const admissionName = "20261113131538_grouped_original_admission.sql";
const admission = migrations.find(
  (migration) => migration.name === admissionName,
)!;
const actualPatch = patchSchema.parse(
  z
    .array(z.record(z.string(), z.unknown()))
    .parse(
      JSON.parse(
        admission.sql.match(
          /\$patch_manifest\$([\s\S]*?)\$patch_manifest\$::jsonb;/u,
        )![1],
      ),
    )
    .find((entry) => entry.signature === shapeSignature),
);
const firstSuccessor = migrations.filter(
  (migration) => migration.name <= admissionName,
);
const historical = migrations.filter(
  (migration) => migration.name < admissionName,
);

describe("canonical cross-language schema contract", () => {
  it("keeps the SQL payload validator identical to the versioned application shape", () => {
    const schema = resolveShapeBody(migrations)?.match(
      /\$schema\$(.*?)\$schema\$/su,
    )?.[1];
    expect(schema).toBeDefined();
    expect(JSON.parse(schema!)).toEqual(
      z.toJSONSchema(CanonicalResumeDraftSchema, { target: "draft-7" }),
    );
  });

  it("preserves the literal historical body and applies the actual forward successor", () => {
    const before = resolveShapeBody(historical)!;
    const beforeBytes = before;
    expect(digest(before)).toBe(
      "c90713766245857144ee9ee291684f625eeb297deb5fa317cc92b207ea54794f",
    );
    expect(before).not.toContain('"canonical-engine/1.0.3"');
    const after = resolveShapeBody(firstSuccessor)!;
    expect(after).toBe(applyShapePatch(before, actualPatch));
    expect(digest(after)).toBe(actualPatch.newSha256);
    expect(before).toBe(beforeBytes);
    expect(resolveShapeBody([...firstSuccessor].reverse())).toBe(after);
  });
  it("rejects predecessor drift before applying any declared context", () => {
    const before = resolveShapeBody(historical)!;
    expect(() =>
      applyShapePatch(before, { ...actualPatch, sha256: "0".repeat(64) }),
    ).toThrow("CANONICAL_SQL_PREDECESSOR_DRIFT");
  });
  it("rejects missing and repeated contexts even with a matching predecessor hash", () => {
    const before = resolveShapeBody(historical)!;
    expect(() =>
      applyShapePatch(before, {
        ...actualPatch,
        patches: [{ old: "missing-source-context", new: "changed" }],
      }),
    ).toThrow("CANONICAL_SQL_CONTEXT_DRIFT");
    const repeated = before + actualPatch.patches[0].old;
    expect(() =>
      applyShapePatch(repeated, { ...actualPatch, sha256: digest(repeated) }),
    ).toThrow("CANONICAL_SQL_CONTEXT_DRIFT");
  });
  it("rejects an incorrect successor hash after the real context replacement", () => {
    expect(() =>
      applyShapePatch(resolveShapeBody(historical)!, {
        ...actualPatch,
        newSha256: "0".repeat(64),
      }),
    ).toThrow("CANONICAL_SQL_POSTIMAGE_DRIFT");
  });
  it("checks the historical full-replacement guard instead of skipping its predecessor", () => {
    const changed = historical.map((migration) =>
      migration.name ===
      "20261110113245_canonical_correction_materialization.sql"
        ? {
            ...migration,
            sql: migration.sql.replace(
              "fffef6a7a030d0f7370c0c64de126cb5de4e5f1a55d8290b3a864a28bd7b078c",
              "0".repeat(64),
            ),
          }
        : migration,
    );
    expect(() => resolveShapeBody(changed)).toThrow(
      "CANONICAL_SQL_PREDECESSOR_DRIFT",
    );
  });
  it("requires an existing declaration before the actual guarded successor", () => {
    expect(() => resolveShapeBody([admission])).toThrow(
      "CANONICAL_SQL_MISSING_PREDECESSOR",
    );
  });
});

describe("guarded saved regroup schema successor", () => {
  function successor() {
    const migration = migrations.find(
      (item) =>
        item.name === "20261113180050_entry_regroup_atomic_admission.sql",
    );
    expect(migration).toBeDefined();
    const entries = [
      ...migration!.sql.matchAll(
        /\$patch_manifest\$([\s\S]*?)\$patch_manifest\$::jsonb;/gu,
      ),
    ]
      .flatMap((match) =>
        z.array(z.record(z.string(), z.unknown())).parse(JSON.parse(match[1])),
      )
      .filter((entry) => entry.signature === shapeSignature);
    expect(entries).toHaveLength(1);
    return patchSchema.parse(entries[0]);
  }
  it("applies the actual guarded .4 postimage after the preserved .3 checkpoint", () => {
    const before = resolveShapeBody(firstSuccessor)!;
    const patch = successor();
    const after = resolveShapeBody(migrations)!;
    expect(patch.sha256).toBe(actualPatch.newSha256);
    expect(after).toBe(applyShapePatch(before, patch));
    expect(digest(after)).toBe(patch.newSha256);
    expect(resolveShapeBody([...migrations].reverse())).toBe(after);
    expect(resolveShapeBody(firstSuccessor)).toBe(before);
  });
  it("widens only the producer reader enum while retaining the full prior schema", () => {
    const before = JSON.parse(
      resolveShapeBody(firstSuccessor)!.match(
        /\$schema\$(.*?)\$schema\$/su,
      )![1],
    );
    const after = JSON.parse(
      resolveShapeBody(migrations)!.match(/\$schema\$(.*?)\$schema\$/su)![1],
    );
    expect(before.properties.producerVersion.enum).not.toContain(
      "canonical-engine/1.0.4",
    );
    expect(after.properties.producerVersion.enum).toEqual([
      ...before.properties.producerVersion.enum,
      "canonical-engine/1.0.4",
    ]);
    after.properties.producerVersion.enum =
      before.properties.producerVersion.enum;
    expect(after).toEqual(before);
  });
  it("rejects actual .4 predecessor, context and postimage drift", () => {
    const before = resolveShapeBody(firstSuccessor)!,
      patch = successor();
    expect(() =>
      applyShapePatch(before, { ...patch, sha256: "0".repeat(64) }),
    ).toThrow("CANONICAL_SQL_PREDECESSOR_DRIFT");
    expect(() =>
      applyShapePatch(before, {
        ...patch,
        patches: [{ old: "missing-regroup-context", new: "changed" }],
      }),
    ).toThrow("CANONICAL_SQL_CONTEXT_DRIFT");
    expect(() =>
      applyShapePatch(before, { ...patch, newSha256: "0".repeat(64) }),
    ).toThrow("CANONICAL_SQL_POSTIMAGE_DRIFT");
  });
});
