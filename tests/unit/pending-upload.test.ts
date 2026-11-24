import { expect, it } from "vitest";
import {
  setPendingUpload,
  takePendingUpload,
} from "../../app/lib/pending-upload";

it("hands the file over once, then clears it", () => {
  expect(takePendingUpload()).toBeNull();
  const file = new File(["%PDF-1.7"], "document.pdf", {
    type: "application/pdf",
  });
  setPendingUpload(file);
  expect(takePendingUpload()).toBe(file);
  expect(takePendingUpload()).toBeNull();
});
