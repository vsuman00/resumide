import { z } from "zod";

// Frozen SQL validators allow the ISO-8601 seconds field to be omitted. Zod
// 4.6 tightened `z.iso.datetime()` to require seconds, so DB-backed schemas
// pin the already-persisted pattern instead of drifting from the migrations.
const ISO_DATETIME_PATTERN =
  /^(?:(?:\d\d[2468][048]|\d\d[13579][26]|\d\d0[48]|[02468][048]00|[13579][26]00)-02-29|\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\d|30)|(?:02)-(?:0[1-9]|1\d|2[0-8])))T(?:(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z))$/u;

export const SqlCompatibleIsoDateTimeSchema = z
  .string()
  .regex(ISO_DATETIME_PATTERN)
  .meta({ format: "date-time" });
