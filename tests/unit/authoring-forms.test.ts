import { randomUUID } from "node:crypto";
import { it, expect } from "vitest";
import { readAuthoringForm } from "../../app/lib/server/authoring-repository";
const fields = () =>
  new URLSearchParams({
    action: "edit",
    expectedVersionId: randomUUID(),
    idempotencyKey: randomUUID(),
    targetFactId: randomUUID(),
    value: "Corrected contribution",
  });
const request = (body: URLSearchParams) =>
  new Request("https://example.test/author", { method: "POST", body });
it("accepts bounded native forms without client JavaScript", async () => {
  expect((await readAuthoringForm(request(fields()))).action).toBe("edit");
});
it.each(["ownerId", "__proto__", "weights", "confirmation"])(
  "rejects unsupported edit field %s",
  async (key) => {
    const input = fields();
    input.append(key, "untrusted");
    await expect(readAuthoringForm(request(input))).rejects.toMatchObject({
      status: 422,
    });
  },
);
it("rejects duplicate fields and oversize/invalid patch documents", async () => {
  const input = fields();
  input.append("value", "Duplicate");
  await expect(readAuthoringForm(request(input))).rejects.toMatchObject({
    status: 422,
  });
  const large = fields();
  large.set("value", "x".repeat(17000));
  await expect(readAuthoringForm(request(large))).rejects.toMatchObject({
    status: 422,
  });
  const malformed = new URLSearchParams({
    action: "accept",
    patch: "not json",
  });
  await expect(readAuthoringForm(request(malformed))).rejects.toMatchObject({
    status: 422,
  });
});
