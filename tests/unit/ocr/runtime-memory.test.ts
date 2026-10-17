import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// Load only the reader definition: never run the OCR entrypoint on the host.
const harness = `
import ast, io, json, sys
from unittest.mock import patch
with open("scripts/ocr-runtime/runner.py") as source:
    tree = ast.parse(source.read())
reader = next(node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "container_memory_peak")
namespace = {}
exec(compile(ast.Module(body=[reader], type_ignores=[]), "reader", "exec"), namespace)
files = json.loads(sys.argv[1])
def read(path, *args, **kwargs):
    if path not in files:
        raise OSError("unavailable")
    return io.StringIO(files[path])
with patch("builtins.open", read):
    print(json.dumps(namespace["container_memory_peak"]()))
`;
const files = {
  "/proc/self/cgroup": "0::/\n",
  "/sys/fs/cgroup/memory.max": "1073741824\n",
  "/sys/fs/cgroup/memory.peak": "67108864\n",
};
function observe(input: Record<string, string>) {
  return JSON.parse(
    execFileSync(
      "python3",
      ["-I", "-B", "-c", harness, JSON.stringify(input)],
      {
        encoding: "utf8",
        timeout: 3000,
      },
    ),
  );
}
describe("container memory high-water reader", () => {
  it("reads the bounded private cgroup peak rather than current memory or child RSS", () => {
    expect(observe(files)).toEqual({
      kind: "cgroup_v2_memory_peak",
      measuredThrough: "recognition_complete",
      valueBytes: 67108864,
      reason: null,
    });
  });
  it.each([
    { ...files, "/proc/self/cgroup": "0::/host/other\n" },
    { ...files, "/proc/self/cgroup": "1:memory:/\n" },
    { ...files, "/sys/fs/cgroup/memory.max": "max\n" },
    { ...files, "/sys/fs/cgroup/memory.max": "2147483648\n" },
  ])("does not report host or unverified cgroup measurements %#", (input) => {
    expect(observe(input)).toMatchObject({
      valueBytes: null,
      reason: "cgroup_scope_unverified",
    });
  });
  it.each(["0", "-1", "NaN", "1.5", "9007199254740992"])(
    "marks invalid peak %s unavailable",
    (peak) => {
      expect(
        observe({ ...files, "/sys/fs/cgroup/memory.peak": peak }),
      ).toMatchObject({
        valueBytes: null,
        reason: "cgroup_peak_invalid",
      });
    },
  );
  it("leaves unreadable observations unknown instead of substituting zero", () => {
    expect(observe({})).toMatchObject({
      valueBytes: null,
      reason: "cgroup_files_unavailable",
    });
  });
});
