import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  clearCaches,
  parseAndGenerateServices,
} from "@typescript-eslint/typescript-estree";
import { expect, it } from "vitest";

it("resolves the reviewed patched minimatch through estree's CommonJS dependency", () => {
  const require = createRequire(import.meta.url);
  const estreeRequire = createRequire(
    require.resolve("@typescript-eslint/typescript-estree"),
  );
  const { minimatch } = estreeRequire("minimatch");
  expect(estreeRequire("minimatch/package.json").version).toBe("11.0.5");
  expect(typeof minimatch).toBe("function");
  expect(minimatch(".hidden.allowed.ts", "*.allowed.ts", { dot: true })).toBe(
    true,
  );
  expect(minimatch(".hidden.denied.ts", "*.allowed.ts", { dot: true })).toBe(
    false,
  );
});

it("allows only the declared hidden-file glob through real project services", () => {
  const directory = mkdtempSync(join(tmpdir(), "resumide-eslint-glob-"));
  const source = "const value: number = 3;";
  const allowed = join(directory, ".hidden.allowed.ts");
  const denied = join(directory, ".hidden.denied.ts");
  try {
    writeFileSync(join(directory, "config-anchor.ts"), "export {};\n");
    writeFileSync(
      join(directory, "tsconfig.default.json"),
      JSON.stringify({
        compilerOptions: { strict: true, target: "ES2022" },
        files: ["config-anchor.ts"],
      }),
    );
    writeFileSync(allowed, source);
    writeFileSync(denied, source);
    const options = {
      tsconfigRootDir: directory,
      projectService: {
        allowDefaultProject: ["*.allowed.ts"],
        defaultProject: "tsconfig.default.json",
      },
      loggerFn: false as const,
    };
    clearCaches();
    const result = parseAndGenerateServices(source, {
      ...options,
      filePath: allowed,
    });
    expect(result.services.program?.getSourceFile(allowed)).toBeDefined();
    const declaration = result.ast.body[0];
    expect(declaration.type).toBe("VariableDeclaration");
    if (declaration.type !== "VariableDeclaration")
      throw Error("Expected the parsed synthetic declaration");
    const node = result.services.esTreeNodeToTSNodeMap.get(
      declaration.declarations[0].id,
    );
    const checker = result.services.program!.getTypeChecker();
    expect(checker.typeToString(checker.getTypeAtLocation(node))).toBe(
      "number",
    );
    expect(() =>
      parseAndGenerateServices(source, { ...options, filePath: denied }),
    ).toThrow(/allowDefaultProject.*does not match/s);
  } finally {
    clearCaches();
    rmSync(directory, { recursive: true, force: true });
  }
});
