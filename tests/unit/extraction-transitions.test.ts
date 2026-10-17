import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  status: "quarantined",
  rpc: vi.fn(),
  download: vi.fn(),
}));
vi.mock("../../app/lib/server/supabase", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: {
              status: mocks.status,
              owner_id: "owner",
              resume_versions: { storage_key: "synthetic.pdf" },
            },
            error: null,
          }),
        }),
      }),
    }),
    rpc: mocks.rpc,
  }),
}));
vi.mock("../../app/lib/server/storage", () => ({
  createResumeStorage: () => ({ download: mocks.download }),
}));
import { processExtractionStage } from "../../app/lib/server/extraction-stage";

beforeEach(() => {
  mocks.rpc.mockReset().mockResolvedValue({ data: true, error: null });
  mocks.download
    .mockReset()
    .mockRejectedValue(new Error("synthetic storage stop"));
});
describe("extraction entry transitions", () => {
  it.each([
    [
      "quarantined",
      [
        ["quarantined", "queued"],
        ["queued", "extracting"],
      ],
    ],
    ["queued", [["queued", "extracting"]]],
    ["extracting", []],
  ])("advances %s before reading the PDF", async (status, expected) => {
    mocks.status = status as string;
    await expect(processExtractionStage("analysis")).rejects.toThrow(
      "synthetic storage stop",
    );
    expect(
      mocks.rpc.mock.calls.map(([, args]) => [
        args.p_expected_status,
        args.p_next_status,
      ]),
    ).toEqual(expected);
    expect(mocks.download).toHaveBeenCalledTimes(1);
  });
  it("does not read a terminal analysis", async () => {
    mocks.status = "partial";
    await processExtractionStage("analysis");
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.download).not.toHaveBeenCalled();
  });
  it("does not read the source after a rejected transition", async () => {
    mocks.status = "quarantined";
    mocks.rpc.mockResolvedValueOnce({ data: false, error: null });
    await expect(processExtractionStage("analysis")).rejects.toThrow(
      "Analysis transition failed",
    );
    expect(mocks.download).not.toHaveBeenCalled();
  });
});
