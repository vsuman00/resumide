// Current combined readiness for BOTH command1.0 and1.1; actual source pins.
// No migration, privilege, activation or native behavioral acceptance implied.
export const TYPED_AUTHORING_READINESS_PROFILE = Object.freeze({
  schemaVersion: "typed-authoring-readiness/1.0.0",
  profileVersion: "typed-authoring-readiness-profile/1.1.0",
  canonicalReadinessSha256:
    "04ca51c95e50a05af227197b25e455a001428a1d360b3f3a1add793f84339d53",
  typedReadinessSha256:
    "322683b240b609bdedb204e4a27ea43a3c0544912760f19e2eda6b48f822206f",
  writerSha256:
    "c8eaf0ceaaada7ca3407cd0ca2bdb4f0dc4690ef8f42baf8f6136dfa57989558",
  readerSha256:
    "55dbfb182f5bbe836df72eb03699b851c22ea542725bb2681b8c5de1e9e70f48",
} as const);

// The regroup successor replaces these two checkers as a single catalog change.
export const TYPED_AUTHORING_REGROUP_READINESS_PROFILE = Object.freeze({
  ...TYPED_AUTHORING_READINESS_PROFILE,
  canonicalReadinessSha256:
    "ebabc64c03321a6cc6c21fb19b2a0f3c7139fe9ff4c7dde11ea0dce1eff283c3",
  typedReadinessSha256:
    "4f4b013a9e205a44253a6eb607b840e9d792ef9b2c5d1bba53a249f2720da10b",
} as const);
