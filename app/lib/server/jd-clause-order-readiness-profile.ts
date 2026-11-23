// Trusted expected source-body pins. Actual catalogue and Native execution remain separate gates.
export const JD_CLAUSE_ORDER_READINESS_PROFILE = Object.freeze({
  schemaVersion: "jd-clause-order-readiness/2.0.0",
  profileVersion: "jd-clause-order-native/2.0.0",
  checkerSha256:
    "0f272ab488a62b85b944d5be68a099a3b126d18a6d2807252d1431edaf2845c4",
  writerSha256:
    "486f9b257010c2c26f5465d009b3d32f4549e5d94e6e30534d80b6f14169cf0e",
  metadataSha256:
    "85d5cd1e3cffed6a9b1ea3f2c2f337525af60253d4771145d03aff1c6f47af71",
} as const);

export const JD_CLAUSE_ORDER_REGROUP_READINESS_PROFILE = Object.freeze({
  ...JD_CLAUSE_ORDER_READINESS_PROFILE,
  checkerSha256:
    "c915c4c4b8353a1846aa83feed6ef9a1a3afa87ddb106b262980304fcecbc0d7",
} as const);
