import ts from "../../../node_modules/typescript/lib/typescript.js";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const output = dirname(fileURLToPath(import.meta.url));
const root = resolve(output, "../../..");
const original = readFileSync(resolve(output, "whitespace-preimages/app/lib/server/parsing/contact.ts.txt"), "utf8");
const current = readFileSync(resolve(root, "app/lib/server/parsing/contact.ts"), "utf8");
const oldSplitter = "line.split(/\\s*(?:\\||•|·)\\s*/u)";
const newSplitter = "line.split(/[|•·]/u)";
if (original.split(oldSplitter).length !== 2 || original.replace(oldSplitter, newSplitter) !== current) throw Error("Production change exceeds the allocated splitter");
const originalContactTests = readFileSync(resolve(output, "whitespace-preimages/tests/unit/parsing/contact.test.ts.txt"), "utf8");
const currentContactTests = readFileSync(resolve(root, "tests/unit/parsing/contact.test.ts"), "utf8");
if (!currentContactTests.startsWith(originalContactTests)) throw Error("Original contact assertions changed");
const printer = ts.createPrinter();
function assertions(text) {
  const source = ts.createSourceFile("preparation-whitespace.test.ts", text, ts.ScriptTarget.Latest, true);
  const result = [];
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      let receiver = node.expression.expression;
      while (ts.isPropertyAccessExpression(receiver)) receiver = receiver.expression;
      if (ts.isCallExpression(receiver) && ts.isIdentifier(receiver.expression) && receiver.expression.text === "expect") result.push(printer.printNode(ts.EmitHint.Unspecified, node, source));
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return result;
}
const diagnostic = readFileSync(resolve(output, "whitespace-diagnostic-test.ts.txt"), "utf8");
const regression = readFileSync(resolve(root, "tests/unit/preparation-whitespace.test.ts"), "utf8");
const before = assertions(diagnostic);
const after = assertions(regression);
if (before.length !== 5 || JSON.stringify(before) !== JSON.stringify(after.slice(0, before.length))) throw Error("Original preparation expectations changed");
if (!regression.includes('["normal", "bounded_lines", "single_long_line"] as const')) throw Error("Original three preparation variants changed");
if (/\b(?:console\.|spyOn\(|restoreAllMocks\()/u.test(regression)) throw Error("Temporary instrumentation remains");
const hash = text => createHash("sha256").update(text).digest("hex");
const proof = { status: "PASS", productionChange: "one exact splitter replacement", sourceBeforeSha256: hash(original), sourceAfterSha256: hash(current), originalContactTestPrefixByteIdentical: true, originalPreparationExpectationsPreserved: before.length, originalThreeVariantsPreserved: true, originalFiveSecondThresholdPreserved: true, temporaryInstrumentationRemoved: true };
writeFileSync(resolve(output, "whitespace-preservation.json"), JSON.stringify(proof, null, 2) + "\n");
process.stdout.write(JSON.stringify({ status: proof.status, originalPreparationExpectationsPreserved: before.length }) + "\n");
