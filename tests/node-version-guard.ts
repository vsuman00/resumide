// Vitest global setup (R-13). Several suites pin behaviour to this exact Node build (JD Unicode
// tables, SQL contract hashes). On any other version they fail in large numbers with no hint,
// so stop first and say why.
export const REQUIRED_NODE = "v22.23.4";

export default function setup() {
  if (process.version === REQUIRED_NODE || process.env.ALLOW_OTHER_NODE === "1")
    return;
  throw new Error(
    `These tests need Node ${REQUIRED_NODE} (found ${process.version}). Run \`nvm use\` (see .nvmrc) or set ALLOW_OTHER_NODE=1 to run a subset knowingly.`,
  );
}
