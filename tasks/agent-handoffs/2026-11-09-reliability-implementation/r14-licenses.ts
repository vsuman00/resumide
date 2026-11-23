import { readFile } from "node:fs/promises";
import {
  rawLatexAttempt,
  assertNoOwnedContainers,
} from "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats/scripts/latex-test-fixtures.ts";

const image =
  "sha256:5e5c2436bcac0a97c4616d7392d1089ecf7ef7d6d5df9063c02e4498d1e0d431";
await assertNoOwnedContainers();
const script = await readFile(
  "/Users/vaibhavsuman/Development/Presonal Project/ResumeATS/resume_ats/scripts/audit-latex-licenses.py",
  "utf8",
);
const result = await rawLatexAttempt(image, "", {
  entrypoint: "/usr/bin/python3",
  args: ["-I", "-B", "-", "--image-id", image],
  input: script,
});
await assertNoOwnedContainers();
process.stdout.write(
  JSON.stringify({
    image,
    declarations: result.value,
    ownedContainersRemaining: 0,
  }) + "\n",
);
