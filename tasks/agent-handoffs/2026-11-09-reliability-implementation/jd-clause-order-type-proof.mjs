import ts from "../../../node_modules/typescript/lib/typescript.js";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const output = dirname(fileURLToPath(import.meta.url));
const root = resolve(output, "../../..");
const allocation = JSON.parse(readFileSync(resolve(output, "jd-clause-order-type-allocation.json"), "utf8"));
const hash = value => createHash("sha256").update(value).digest("hex");
const config = ts.readConfigFile(resolve(root, "tsconfig.json"), ts.sys.readFile);
if (config.error) throw Error("Cannot read actual compiler configuration");
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
if (parsed.errors.length) throw Error("Cannot parse actual compiler configuration");
const options = { ...parsed.options, noEmit: false, sourceMap: false, inlineSourceMap: false, noEmitOnError: false };
function emit(relative, source) {
  const filename = resolve(root, relative);
  const host = ts.createCompilerHost(options);
  const read = host.readFile.bind(host);
  host.readFile = path => resolve(path) === filename ? source : read(path);
  const program = ts.createProgram([filename], options, host);
  const target = program.getSourceFile(filename);
  if (!target) throw Error("Missing actual target source");
  const javascript = [];
  const result = program.emit(target, (name, text) => {
    if (name.endsWith(".js")) javascript.push(text);
  });
  if (result.emitSkipped || javascript.length !== 1) throw Error("Compiler did not emit one target");
  return javascript[0];
}
const results = {};
for (const relative of allocation.files) {
  const original = readFileSync(resolve(output, "jd-clause-order-backend-evidence/snapshots", relative + ".txt"), "utf8");
  const current = readFileSync(resolve(root, relative), "utf8");
  if (hash(original) !== allocation.preimages[relative]) throw Error("Original source binding drift");
  const before = emit(relative, original);
  const after = emit(relative, current);
  if (before !== after) throw Error("Type successor changed emitted runtime code");
  results[relative] = { beforeSha256: hash(original), afterSha256: hash(current), javascriptIdentical: true, emittedSha256: hash(after) };
}
const report = { status: "PASS", actualTsConfig: true, emitOnlyOverrides: ["noEmit=false", "sourceMap=false", "inlineSourceMap=false", "noEmitOnError=false"], typecheckSuppliedBySeparateGate: true, files: results };
writeFileSync(resolve(output, "jd-clause-order-type-preservation.json"), JSON.stringify(report, null, 2) + "\n");
process.stdout.write(JSON.stringify({ status: report.status, files: Object.keys(results).length }) + "\n");
