// Exact source bodies only; SQL unparsed/unexecuted, data/access grants denied.
export const OWNED_AI_DISPOSITION_PROFILE = Object.freeze({
  schemaVersion: "owned-ai-disposition-readiness/1.0.0",
  profileVersion: "owned-ai-disposition-profile/1.0.0",
  checkerSha256:
    "f0f427402122885a720b951d55dddfe856d6213afe190286c6bcf3ef921323f8",
  exportSha256:
    "9e024843ba62807efc21000971e6074579ca595a69d293ba7a84500a500b01b0",
  accessSha256:
    "0846149a1f25edf14ea3c907219634cda85358065b3e4d5a06c79da2522f87db",
  metadataSha256:
    "f42f6f60454023ad2b6ef998e2fd9098585768c0cfe35cd5307affdd5f349a6a",
});

// The entry-regroup repair updates the checker without changing the access RPC.
// Keep the predecessor pin for callers whose other accounting contracts differ.
export const OWNED_AI_DISPOSITION_REGROUP_PROFILE = Object.freeze({
  ...OWNED_AI_DISPOSITION_PROFILE,
  checkerSha256:
    "e796d58b1dcd07d7c9f97bbebe06b4a20210ead7fb249b3032bf07a5a10197fe",
});
