import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";

const script = fileURLToPath(
  new URL("../../scripts/admit-latex-ci-image.sh", import.meta.url),
);
const directories: string[] = [];
afterEach(() => {
  for (const root of directories.splice(0))
    rmSync(root, { recursive: true, force: true });
});

const manifest = `sha256:${"a".repeat(64)}`;
const image = `sha256:${"b".repeat(64)}`;
const ref = `ghcr.io/example/resumide-latex-worker@${manifest}`;

function admit(overrides: NodeJS.ProcessEnv = {}) {
  const root = mkdtempSync(join(tmpdir(), "latex-ci-admission-"));
  directories.push(root);
  const envFile = join(root, "github-env");
  const callsFile = join(root, "calls");
  writeFileSync(envFile, "");
  writeFileSync(callsFile, "");
  writeFileSync(
    join(root, "docker"),
    `#!/bin/bash
set -euo pipefail
[[ "$1" == --config && -d "$2" ]]
shift 2
printf '%s\\n' "$*" >> "$CALLS_FILE"
case "$1 $2" in
  "login ghcr.io") read -r supplied; [[ "$supplied" == "unit-read-token" ]] ;;
  "image pull") [[ "$SYNTHETIC_PULL_FAILURE" != yes ]] ;;
  "image inspect") printf '%s\\n' "$SYNTHETIC_INSPECT" ;;
  "logout ghcr.io") ;;
  *) exit 78 ;;
esac
`,
    { mode: 0o700 },
  );
  const command = spawnSync("/bin/bash", [script], {
    env: {
      PATH: `${root}:/usr/bin:/bin`,
      RUNNER_TEMP: root,
      GITHUB_REPOSITORY: "Example/Resumide",
      GITHUB_ACTOR: "unit-runner",
      GITHUB_ENV: envFile,
      CALLS_FILE: callsFile,
      LATEX_CI_ARTIFACT_AUTHORIZATION: "reviewed-compiler-runtime",
      LATEX_CI_IMAGE_REF: ref,
      LATEX_CI_IMAGE_ID: image,
      LATEX_CI_READ_TOKEN: "unit-read-token",
      SYNTHETIC_INSPECT: `${image} linux/arm64`,
      SYNTHETIC_PULL_FAILURE: "no",
      ...overrides,
    },
    encoding: "utf8",
    timeout: 5_000,
  });
  return {
    status: command.status,
    output: command.stdout + command.stderr,
    variables: readFileSync(envFile, "utf8"),
    calls: readFileSync(callsFile, "utf8"),
  };
}

it("uses the reviewed digest, verifies the ARM64 image ID, and removes registry authentication", () => {
  const result = admit();
  expect(result.status).toBe(0);
  expect(result.calls.split("\n").filter(Boolean)).toEqual([
    "login ghcr.io --username unit-runner --password-stdin",
    `image pull --quiet --platform linux/arm64 ${ref}`,
    `image inspect --format {{.Id}} {{.Os}}/{{.Architecture}} ${ref}`,
    "logout ghcr.io",
  ]);
  expect(result.variables).toBe(`LATEX_TEST_IMAGE=${image}\n`);
  expect(result.output).not.toContain("unit-read-token");
});

it.each([
  { LATEX_CI_ARTIFACT_AUTHORIZATION: "" },
  { LATEX_CI_IMAGE_REF: "ghcr.io/example/resumide-latex-worker:latest" },
  { LATEX_CI_IMAGE_REF: `ghcr.io/other/resumide-latex-worker@${manifest}` },
  {
    LATEX_CI_IMAGE_REF: `https://ghcr.io/example/resumide-latex-worker@${manifest}`,
  },
  { LATEX_CI_IMAGE_ID: "resumide-latex:latest" },
  { LATEX_CI_READ_TOKEN: "" },
])(
  "rejects unreviewed or incomplete inputs before invoking Docker %#",
  (overrides) => {
    expect(admit(overrides)).toMatchObject({
      status: 2,
      calls: "",
      variables: "",
    });
  },
);

it.each([
  { SYNTHETIC_INSPECT: `${manifest} linux/arm64` },
  { SYNTHETIC_INSPECT: `${image} linux/amd64` },
  { SYNTHETIC_PULL_FAILURE: "yes" },
])(
  "leaves the runtime unconfigured after an artifact failure %#",
  (overrides) => {
    const result = admit(overrides);
    expect(result.status).toBe(1);
    expect(result.variables).toBe("");
    expect(result.calls).toContain("logout ghcr.io");
  },
);
