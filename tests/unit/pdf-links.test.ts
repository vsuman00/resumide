import { expect, it } from "vitest";
import { safePdfHref } from "../../app/lib/pdf-links";

it.each([
  ["javascript:alert(1)", null],
  [" JavaScript:alert(1)", null],
  ["file:///x", null],
  ["data:text/html,x", null],
  ["vbscript:x", null],
  ["relative/path", null],
  ["", null],
  ["HTTPS://a.b", "https://a.b/"],
  ["http://example.com/x?y=1", "http://example.com/x?y=1"],
  ["mailto:a@b.c", "mailto:a@b.c"],
  ["https://user:pw@example.com", null],
])("safePdfHref(%j) -> %j", (input, expected) => {
  expect(safePdfHref(input)).toBe(expected);
});
