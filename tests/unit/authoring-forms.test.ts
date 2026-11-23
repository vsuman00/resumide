import { createHash, randomUUID } from "node:crypto";
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

const clarificationFields = (action = "preview_clarification") =>
  new URLSearchParams({
    action,
    expectedVersionId: randomUUID(),
    idempotencyKey: randomUUID(),
    targetFactId: randomUUID(),
    questionKind: "result",
    value: "A synthetic result",
  });

it("accepts the native preview form without inventing mutation consent", async () => {
  const parsed = await readAuthoringForm(request(clarificationFields()));
  expect(parsed).toMatchObject({
    action: "preview_clarification",
    value: "A synthetic result",
  });
  expect(parsed).not.toHaveProperty("confirmation");
  expect(parsed).not.toHaveProperty("reviewedValueHash");
});

it.each(["confirmation", "reviewedValueHash", "ownerId"])(
  "rejects preview injection of %s",
  async (field) => {
    const input = clarificationFields();
    input.set(field, field === "confirmation" ? "true" : "a".repeat(64));
    await expect(readAuthoringForm(request(input))).rejects.toMatchObject({
      status: 422,
    });
  },
);

it("retains an exact full-value digest and explicit confirmation in the final native form", async () => {
  const input = clarificationFields("clarify");
  input.set("confirmation", "true");
  input.set("reviewedValueHash", "a".repeat(64));
  expect(await readAuthoringForm(request(input))).toMatchObject({
    action: "clarify",
    confirmation: true,
    reviewedValueHash: "a".repeat(64),
  });
  input.delete("reviewedValueHash");
  expect(await readAuthoringForm(request(input))).toMatchObject({
    action: "clarify",
    confirmation: true,
  });
  input.delete("confirmation");
  await expect(readAuthoringForm(request(input))).rejects.toMatchObject({
    status: 422,
  });
});

it.each(["A".repeat(64), "0".repeat(63), "z".repeat(64)])(
  "rejects malformed reviewed-value proof %j",
  async (proof) => {
    const input = clarificationFields("clarify");
    input.set("confirmation", "true");
    input.set("reviewedValueHash", proof);
    await expect(readAuthoringForm(request(input))).rejects.toMatchObject({
      status: 422,
    });
  },
);

it("preserves a valid Unicode native round trip within the unchanged 16KiB envelope", async () => {
  const answer = "界".repeat(100);
  const fullValue = `${"界".repeat(1800)}\nResult: ${answer}`;
  const input = clarificationFields("clarify");
  input.set("value", answer);
  input.set("confirmation", "true");
  input.set(
    "reviewedValueHash",
    createHash("sha256").update(fullValue, "utf8").digest("hex"),
  );
  expect(fullValue.length).toBeLessThanOrEqual(2000);
  expect(Buffer.byteLength(input.toString(), "utf8")).toBeLessThan(16384);
  expect(await readAuthoringForm(request(input))).toMatchObject({
    value: answer,
    reviewedValueHash: input.get("reviewedValueHash"),
  });
  const fullTextForm = new URLSearchParams(input);
  fullTextForm.set("reviewedValue", fullValue);
  expect(Buffer.byteLength(fullTextForm.toString(), "utf8")).toBeGreaterThan(
    16384,
  );
});

it("keeps review metadata exclusive, duplicate-safe and UTF8-bounded", async () => {
  const duplicate = clarificationFields("clarify");
  duplicate.set("confirmation", "true");
  duplicate.set("reviewedValueHash", "a".repeat(64));
  duplicate.append("reviewedValueHash", "b".repeat(64));
  await expect(readAuthoringForm(request(duplicate))).rejects.toMatchObject({
    status: 422,
  });
  const edit = fields();
  edit.set("reviewedValueHash", "a".repeat(64));
  await expect(readAuthoringForm(request(edit))).rejects.toMatchObject({
    status: 422,
  });
  await expect(
    readAuthoringForm(
      new Request("https://example.test/author", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new Uint8Array([0xff]),
      }),
    ),
  ).rejects.toMatchObject({ status: 422 });
});
