/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import BuildOnboarding, { BuildTips } from "~/components/BuildOnboarding";
import { isBuildOnboarded, setBuildOnboarded } from "~/lib/build-drafts";

beforeAll(() => {
  // jsdom lacks modal dialogs; emulate open/close so the component logic is exercised.
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});
afterEach(cleanup);

it("shows on first visit only via the stored flag", () => {
  const store = new Map<string, string>();
  const storage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  } as unknown as Storage;
  expect(isBuildOnboarded(storage)).toBe(false);
  setBuildOnboarded(storage, true);
  expect(isBuildOnboarded(storage)).toBe(true);
  setBuildOnboarded(storage, false);
  expect(isBuildOnboarded(storage)).toBe(false);
  expect(
    isBuildOnboarded({
      getItem() {
        throw Error("blocked");
      },
    } as unknown as Storage),
  ).toBe(true);
});

it("hides Restore without a draft and offers it first with one", () => {
  const props = { onChoose: vi.fn(), onDismiss: vi.fn() };
  const { rerender } = render(<BuildOnboarding hasDraft={false} {...props} />);
  expect(
    screen.queryByRole("button", { name: "Restore your draft" }),
  ).toBeNull();
  rerender(<BuildOnboarding hasDraft {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Restore your draft" }));
  expect(props.onChoose).toHaveBeenCalledWith({ kind: "restore" });
});

it("loads a chosen template and offers paste", () => {
  const onChoose = vi.fn();
  render(
    <BuildOnboarding
      hasDraft={false}
      onChoose={onChoose}
      onDismiss={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /Classic one-page/ }));
  expect(onChoose).toHaveBeenCalledWith({ kind: "template", id: "classic" });
  fireEvent.click(screen.getByRole("button", { name: "Paste your LaTeX" }));
  expect(onChoose).toHaveBeenLastCalledWith({ kind: "paste" });
});

it("opens as a modal dialog and returns focus on close", () => {
  const opener = document.createElement("button");
  document.body.append(opener);
  opener.focus();
  const { container, unmount } = render(
    <BuildOnboarding hasDraft={false} onChoose={vi.fn()} onDismiss={vi.fn()} />,
  );
  const dialog = container.querySelector("dialog")!;
  expect(dialog.open).toBe(true);
  expect(
    screen.getByRole("dialog", { name: "Start your resume" }),
  ).toBeTruthy();
  unmount();
  expect(document.activeElement).toBe(opener);
  opener.remove();
});

it("dismisses on Escape (dialog cancel)", () => {
  const onDismiss = vi.fn();
  const { container } = render(
    <BuildOnboarding
      hasDraft={false}
      onChoose={vi.fn()}
      onDismiss={onDismiss}
    />,
  );
  fireEvent(
    container.querySelector("dialog")!,
    new Event("cancel", { cancelable: true }),
  );
  expect(onDismiss).toHaveBeenCalled();
});

it("walks through three tips", () => {
  const onDone = vi.fn();
  render(<BuildTips onDone={onDone} />);
  expect(screen.getByText("1 of 3")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Next tip" }));
  fireEvent.click(screen.getByRole("button", { name: "Next tip" }));
  expect(screen.getByText("3 of 3")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(onDone).toHaveBeenCalled();
});

it("lists the shortcuts and closes on cancel", async () => {
  const { ShortcutSheet } = await import("~/components/BuildOnboarding");
  const onClose = vi.fn();
  const { container } = render(<ShortcutSheet onClose={onClose} />);
  expect(
    screen.getByRole("dialog", { name: "Keyboard shortcuts" }),
  ).toBeTruthy();
  expect(screen.getByText("⌘/Ctrl + Enter")).toBeTruthy();
  expect(screen.getByText("Ask AI about the selected lines")).toBeTruthy();
  fireEvent(
    container.querySelector("dialog")!,
    new Event("cancel", { cancelable: true }),
  );
  expect(onClose).toHaveBeenCalled();
});
