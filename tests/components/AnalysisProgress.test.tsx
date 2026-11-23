/** @vitest-environment jsdom */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AnalysisProgress from "../../app/routes/analysis";

const fetched = vi.fn<typeof fetch>();
const timestamp = "2026-11-22T00:00:00.000Z";
const status = (value: string) =>
  Response.json({
    status: value,
    stage_updated_at: timestamp,
    completed_at: null,
  });
const cancelButton = () =>
  screen.getByRole("button", { name: "Cancel analysis" });

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function openProgress() {
  const router = createMemoryRouter(
    [{ path: "/analysis/:id", Component: AnalysisProgress }],
    { initialEntries: ["/analysis/first"] },
  );
  await act(async () => {
    render(<RouterProvider router={router} />);
  });
  return router;
}

beforeEach(() => {
  fetched.mockReset();
  vi.stubGlobal("fetch", fetched);
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("updates the waiting message when a worker checks the queue", async () => {
  fetched
    .mockResolvedValueOnce(
      Response.json({
        status: "quarantined",
        stage_updated_at: timestamp,
        completed_at: null,
        queueActivity: "no_recent_check",
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        status: "queued",
        stage_updated_at: timestamp,
        completed_at: null,
        queueActivity: "recent_check",
      }),
    )
    .mockResolvedValueOnce(status("extracting"));
  await openProgress();
  expect(screen.getByText("No recent worker check-in")).toBeTruthy();
  expect(cancelButton()).toBeTruthy();

  await act(async () => vi.advanceTimersByTimeAsync(2_000));
  expect(screen.getByText("A worker checked the queue recently")).toBeTruthy();
  expect(cancelButton()).toBeTruthy();

  await act(async () => vi.advanceTimersByTimeAsync(4_000));
  expect(screen.queryByText("A worker checked the queue recently")).toBeNull();
  expect(screen.getByText("Current status: extracting.")).toBeTruthy();
});

it.each([
  { code: 200, message: "Current status: cancelled." },
  { code: 404, message: "Analysis not found." },
])(
  "discards an older queued poll after cancellation returns $code",
  async ({ code, message }) => {
    const oldPoll = deferredResponse();
    fetched
      .mockResolvedValueOnce(status("queued"))
      .mockReturnValueOnce(oldPoll.promise);
    await openProgress();
    expect(screen.getByText("Current status: queued.")).toBeTruthy();
    await act(async () => vi.advanceTimersByTimeAsync(2_000));
    expect(fetched).toHaveBeenNthCalledWith(
      2,
      "/api/analysis/first",
      expect.anything(),
    );

    fetched.mockResolvedValueOnce(
      code === 200
        ? Response.json({ status: "cancelled", alreadyCancelled: false })
        : Response.json({ error: { message } }, { status: code }),
    );
    await act(async () => {
      fireEvent.click(cancelButton());
    });
    expect(screen.getByText(message)).toBeTruthy();

    await act(async () => {
      oldPoll.resolve(status("queued"));
    });
    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.queryByText("Current status: queued.")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Cancel analysis" }),
    ).toBeNull();
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    expect(fetched).toHaveBeenCalledTimes(3);
  },
);

it("clears the previous analysis state and ignores its late cancellation after navigation", async () => {
  const oldCancel = deferredResponse();
  const nextPoll = deferredResponse();
  fetched
    .mockResolvedValueOnce(status("queued"))
    .mockReturnValueOnce(oldCancel.promise)
    .mockReturnValueOnce(nextPoll.promise);
  const router = await openProgress();
  await act(async () => {
    fireEvent.click(cancelButton());
  });
  await act(async () => router.navigate("/analysis/second"));
  expect(screen.queryByText("Current status: queued.")).toBeNull();
  expect(
    screen.queryByRole("button", { name: /cancel(?:ling| analysis)/iu }),
  ).toBeNull();

  await act(async () => {
    nextPoll.resolve(status("extracting"));
  });
  expect(screen.getByText("Current status: extracting.")).toBeTruthy();
  await act(async () => {
    oldCancel.resolve(
      Response.json({ status: "cancelled", alreadyCancelled: false }),
    );
  });
  expect(screen.getByText("Current status: extracting.")).toBeTruthy();
  expect(screen.queryByText("Current status: cancelled.")).toBeNull();
});

it("ignores an older cancellation confirmation after a poll denies access", async () => {
  const oldCancel = deferredResponse();
  fetched
    .mockResolvedValueOnce(status("queued"))
    .mockReturnValueOnce(oldCancel.promise)
    .mockResolvedValueOnce(
      Response.json(
        { error: { message: "Analysis not found." } },
        { status: 404 },
      ),
    );
  await openProgress();
  await act(async () => {
    fireEvent.click(cancelButton());
  });
  await act(async () => vi.advanceTimersByTimeAsync(2_000));
  expect(screen.getByText("Analysis not found.")).toBeTruthy();
  await act(async () => {
    oldCancel.resolve(
      Response.json({ status: "cancelled", alreadyCancelled: false }),
    );
  });
  expect(screen.getByText("Analysis not found.")).toBeTruthy();
  expect(screen.queryByText("Analysis cancelled")).toBeNull();
});

it("does not mark cancellation complete without a confirmation", async () => {
  fetched
    .mockResolvedValueOnce(status("queued"))
    .mockResolvedValueOnce(Response.json({ status: "queued" }));
  await openProgress();
  await act(async () => {
    fireEvent.click(cancelButton());
  });
  expect(
    screen.getByText(
      "Unable to confirm cancellation. Check the latest status.",
    ),
  ).toBeTruthy();
  expect(cancelButton()).toBeTruthy();
  expect(screen.queryByText("Analysis cancelled")).toBeNull();
});
