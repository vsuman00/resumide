import { it, expect, vi } from "vitest";
import { scoreFixture } from "../fixtures/scoring-v2";
import { buildScoreDiagnostics } from "../../app/lib/server/score-v2-engine";
import { proposeAuthoring } from "../../app/lib/server/authoring-proposals";
it("disabled proposals never call a transport or require provider credentials", async () => {
  const f = scoreFixture(),
    execute = vi.fn();
  const r = await proposeAuthoring(
    {
      enabled: false,
      document: f.canonical,
      diagnostics: buildScoreDiagnostics(f),
      targetFactId: f.canonical.facts[0].id,
    },
    { execute },
  );
  expect(r.state).toBe("disabled");
  expect(execute).not.toHaveBeenCalled();
});
it("provider failures and bounded timeout never produce an accepted patch", async () => {
  const f = scoreFixture(),
    fact = f.canonical.facts.find((v) => v.type === "contribution")!;
  const args = {
    enabled: true,
    document: f.canonical,
    diagnostics: buildScoreDiagnostics(f),
    targetFactId: fact.id,
    timeoutMs: 5,
  };
  expect(
    (
      await proposeAuthoring(args, {
        execute: async () => {
          throw Error("provider failure");
        },
      })
    ).patches,
  ).toEqual([]);
  const stalled = vi
    .fn()
    .mockImplementation(() => new Promise(() => undefined));
  expect((await proposeAuthoring(args, { execute: stalled })).state).toBe(
    "timeout",
  );
  expect(stalled.mock.calls[0][0].signal.aborted).toBe(true);
});

it("rejects oversize proposal collections before serialization or acceptance", async () => {
  const f = scoreFixture(),
    fact = f.canonical.facts.find((v) => v.type === "contribution")!;
  const r = await proposeAuthoring(
    {
      enabled: true,
      document: f.canonical,
      diagnostics: buildScoreDiagnostics(f),
      targetFactId: fact.id,
    },
    { execute: async () => Array(10000).fill({}) },
  );
  expect(r.patches).toEqual([]);
  expect(r.state).toBe("invalid_or_unavailable");
});
