# Review metadata readiness at startup

Both actual worker entrypoints now forward `evidenceReviewEnabled: config.EVIDENCE_REVIEW_ENABLED` into pre-claim readiness. The selection is explicit in fenced and unfenced modes; there is no ambient configuration read or fallback in this leaf.

The predecessor run failed six new assertions because the actual entrypoints omitted that field; all three original tests passed. The successor passes all nine cases. Tests import both real entrypoints with controlled configuration and mocked readiness, require no queue construction or claim after metadata refusal, and check explicit false forwarding. The original test cases and assertions remain unchanged. This is selection/order evidence, not proof that a database capability exists.

The paired readiness implementation and its trusted actual source profile belong to the runtime/Root allocation. Integrated verification must combine those dependencies with these entrypoints. No actual worker process, database, SQL parser/execution, PDF parser, provider, browser, service, credential read, Git operation or deployment ran. Native validation and the future browser fixture remain separate.
