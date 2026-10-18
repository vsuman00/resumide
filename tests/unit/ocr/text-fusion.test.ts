import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
const harness = `
import ast, json, sys
with open("scripts/ocr-runtime/runner.py") as source:
    tree = ast.parse(source.read())
nodes = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in ["word_iou", "fuse_text_words"]]
namespace = {}
exec(compile(ast.Module(body=nodes, type_ignores=[]), "fusion", "exec"), namespace)
print(json.dumps(namespace["fuse_text_words"](*json.loads(sys.argv[1]))))
`;
const token = (text: string, extra = {}) => ({
  text,
  confidence: 90,
  line: [1, 1, 1],
  left: 10,
  top: 10,
  width: 100,
  height: 20,
  ...extra,
});
function fuse(
  first: ReturnType<typeof token>[],
  second: ReturnType<typeof token>[],
) {
  return JSON.parse(
    execFileSync(
      "python3",
      ["-I", "-B", "-c", harness, JSON.stringify([first, second])],
      { encoding: "utf8", timeout: 3000 },
    ),
  );
}
it("uses the aligned text decoder without treating raw confidence as correctness", () => {
  const best = token("different", { confidence: 40, left: 11 });
  expect(fuse([token("differe'nt")], [best])).toEqual([best]);
});
it.each([
  ["API", "Api"],
  ["XY", "Xl"],
])(
  "preserves uppercase abbreviation %s when the alternate introduces lowercase",
  (original, alternate) => {
    const first = token(original, { confidence: 60 });
    expect(fuse([first], [token(alternate, { confidence: 99 })])).toEqual([
      first,
    ]);
  },
);
it("allows uppercase alternatives and does not use confidence as a veto", () => {
  const best = token("API/SDK", { confidence: 40 });
  expect(fuse([token("AP!SDK", { confidence: 99 })], [best])).toEqual([best]);
});
it.each(["Plainword", "lowercase", "CamelCase", "API"])(
  "preserves intact alphabetic baseline %s",
  (text) => {
    const first = token(text, { confidence: 0 });
    expect(fuse([first], [token("Different", { confidence: 99 })])).toEqual([
      first,
    ]);
  },
);
it.each([
  "2025",
  "+12025550111",
  "Cloud2",
  "person@example.test",
  "https://example.test",
])("retains baseline token %s", (text) => {
  const first = token(text);
  expect(fuse([first], [token("Replacement")])).toEqual([first]);
});
it("retains baseline when the alternate introduces digits or spaces", () => {
  const first = token("Cloud");
  expect(fuse([first], [token("C1oud")])).toEqual([first]);
  expect(fuse([first], [token("Cloud Platform")])).toEqual([first]);
});
it("does not add missing words, change lines or resolve ambiguous matches", () => {
  const first = token("Alpha");
  expect(fuse([first], [token("Beta", { line: [2, 1, 1] })])).toEqual([first]);
  expect(fuse([first], [token("Beta"), token("Gamma")])).toEqual([first]);
  expect(fuse([first, first], [token("Beta")])).toEqual([first, first]);
  expect(fuse([], [token("Beta")])).toEqual([]);
});
it("retains baseline for split words and oversized lines", () => {
  const first = token("Alpha");
  expect(
    fuse(
      [first],
      [token("Be", { width: 40 }), token("ta", { left: 60, width: 40 })],
    ),
  ).toEqual([first]);
  const dense = Array.from({ length: 129 }, () => first);
  expect(fuse(dense, [token("Beta")])).toEqual(dense);
});
it("preserves agreement and baseline reading order", () => {
  const first = token("Al'pha");
  expect(fuse([first], [token("Al'pha", { confidence: 99 })])).toEqual([first]);
  expect(
    fuse(
      [first, token("Ne'xt", { left: 200 })],
      [token("Second", { left: 200 }), token("Beta")],
    ).map((w: { text: string }) => w.text),
  ).toEqual(["Beta", "Second"]);
});
