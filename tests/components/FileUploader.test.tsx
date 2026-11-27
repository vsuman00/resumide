/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import FileUploader from "../../app/components/FileUploader";
import { setPendingUpload } from "../../app/lib/pending-upload";

afterEach(cleanup);

describe("FileUploader", () => {
  it("renders the evidence-desk tray artwork before a file is selected", () => {
    const { container } = render(
      <FileUploader maxUploadBytes={10 * 1024 * 1024} onFileSelect={vi.fn()} />,
    );

    expect(
      container.querySelector('img[src="/images/resume-upload-tray-3d.png"]'),
    ).toBeTruthy();
  });

  it("selects and fully removes a PDF without submitting", async () => {
    const user = userEvent.setup();
    const onFileSelect = vi.fn();
    const file = new File(["%PDF-1.4"], "resume.pdf", {
      type: "application/pdf",
    });

    render(
      <FileUploader
        maxUploadBytes={10 * 1024 * 1024}
        onFileSelect={onFileSelect}
      />,
    );
    const input = screen.getByLabelText<HTMLInputElement>(
      "Upload resume file (PDF or Word)",
    );

    await user.upload(input, file);
    expect(onFileSelect).toHaveBeenLastCalledWith(file);
    expect(screen.getByText("resume.pdf")).toBeTruthy();

    const removeButton = screen.getByRole("button", {
      name: "Remove selected resume",
    });
    expect(removeButton.getAttribute("type")).toBe("button");
    await user.click(removeButton);

    expect(onFileSelect).toHaveBeenLastCalledWith(null);
    expect(input.files).toHaveLength(0);
    expect(screen.queryByText("resume.pdf")).toBeNull();
  });

  it("rejects a PDF over the configured limit", async () => {
    const user = userEvent.setup();
    const onFileSelect = vi.fn();
    const onValidationError = vi.fn();

    render(
      <FileUploader
        maxUploadBytes={4}
        onFileSelect={onFileSelect}
        onValidationError={onValidationError}
      />,
    );

    await user.upload(
      screen.getByLabelText("Upload resume file (PDF or Word)"),
      new File(["%PDF-1.4"], "oversized.pdf", {
        type: "application/pdf",
      }),
    );

    expect(onFileSelect).toHaveBeenLastCalledWith(null);
    expect(onValidationError).toHaveBeenCalledWith(expect.any(String));
    expect(screen.queryByText("oversized.pdf")).toBeNull();
  });
});

it("preselects a PDF handed over from Build, once", () => {
  const file = new File(["%PDF-1.7"], "document.pdf", {
    type: "application/pdf",
  });
  setPendingUpload(file);
  const onFileSelect = vi.fn();
  render(
    <FileUploader maxUploadBytes={5_000_000} onFileSelect={onFileSelect} />,
  );
  expect(onFileSelect).toHaveBeenCalledExactlyOnceWith(file);
  expect(screen.getByText("document.pdf")).toBeTruthy();
  expect(screen.getByText(/From Build/)).toBeTruthy();
  cleanup();
  const again = vi.fn();
  render(<FileUploader maxUploadBytes={5_000_000} onFileSelect={again} />);
  expect(again).not.toHaveBeenCalled();
});
