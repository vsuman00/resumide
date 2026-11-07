import { expect, it, vi } from "vitest";
import { loadScoreDiagnostics } from "../../app/lib/server/score-v2-repository";

const owner = "10000000-0000-4000-8000-000000000001";
const analysisId = "20000000-0000-4000-8000-000000000001";
const version = "30000000-0000-4000-8000-000000000001";
const other = "40000000-0000-4000-8000-000000000001";

it.each(["owner", "analysis", "version"])(
  "rejects a mismatched %s in an internal scoring snapshot",
  async (binding) => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi
        .fn()
        .mockResolvedValue({ data: { job_id: null }, error: null }),
    };
    const client = { from: vi.fn(() => query) };
    const snapshot = {
      analysisId: binding === "analysis" ? other : analysisId,
      current: {
        document: {
          ownerId: binding === "owner" ? other : owner,
          versionId: version,
        },
      },
    };
    await expect(
      loadScoreDiagnostics(
        client as unknown as Parameters<typeof loadScoreDiagnostics>[0],
        analysisId,
        owner,
        { canonical: binding === "version" ? other : version },
        snapshot as unknown as Parameters<typeof loadScoreDiagnostics>[4],
      ),
    ).rejects.toThrow("Scoring input binding failed.");
    expect(client.from).toHaveBeenCalledTimes(1);
    expect(client.from).toHaveBeenCalledWith("analyses");
  },
);
