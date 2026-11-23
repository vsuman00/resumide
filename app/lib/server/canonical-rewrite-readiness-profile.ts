// Forward compatibility profile; exact source postimages, not installed proof.
// Canonical run metadata is private; all mutation grants remain denied.
export const CANONICAL_REWRITE_READINESS_PROFILE = Object.freeze({
  schemaVersion: "canonical-rewrite-readiness/1.0.0",
  profileVersion: "canonical-rewrite-readiness-profile/1.0.1",
  checkerSha256:
    "1ab0bc59f97980b09a8b2cb190c0bb9f111e419981096bdb9c2990cf7c69e5cc",
  readerSha256:
    "fbe6a2167174a33a8fe9541a781623e595444206d0fe121971b87f1b14089707",
  prepareSha256:
    "3ba48ee775c9ce62aa3df976d2011b6cc202acd16c62dd60abe4e36c9f65aef9",
  claimSha256:
    "08c3eedd3979e2a3287d5ab8dac9da876daa7c18ad5fdd848661c54949f1aa66",
  finishSha256:
    "caaf249b2ac067d18d91d1f3cc9f26d2a6fd8a9b6b7463547fc0cf1ac27a2d24",
  settleSha256:
    "fc504546e9370f05eccace9113c6364e810557ff509442cadfbd5b28ca51fcab",
  usageSha256:
    "e58366ed4afd20b587a6d133fd3ad397c139d327fc060fbc0b040b857069f7ca",
} as const);

export const CANONICAL_REWRITE_REGROUP_READINESS_PROFILE = Object.freeze({
  ...CANONICAL_REWRITE_READINESS_PROFILE,
  checkerSha256:
    "f7d09f593cb5ac544e3681b253d5946756e217d90df592a589de0baa53a2d561",
} as const);

export const CANONICAL_REWRITE_READINESS_PROFILES = Object.freeze([
  CANONICAL_REWRITE_READINESS_PROFILE,
  CANONICAL_REWRITE_REGROUP_READINESS_PROFILE,
]);
