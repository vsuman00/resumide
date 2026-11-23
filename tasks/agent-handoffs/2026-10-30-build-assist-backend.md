# Build route rename: backend handoff

Updated: 2026-10-30. Status: IMPLEMENTED; focused source checks pass. Coordinator owns canonical context and integration. AI work remains on hold pending the required credential decision.

Authorization: [Build coordinator assignment](2026-10-30-build-assist-coordinator.md). Compared the integrated root service with this worktree before editing; they were identical. Preserve the existing uncommitted AA7 candidate and unrelated baseline.

Changed only `app/lib/server/latex-converter-service.ts`: unauthenticated loader redirects to `/auth?next=%2Fbuild` instead of the old LaTeX return path. The frontend owner registers `/build` and `/build/compile` and owns legacy compatibility redirects. Compiler, authentication checks, same-origin policy, rate buckets, bounded input, response headers and sandbox behavior are unchanged.

Verification: Node 22.23.4 focused ESLint and Prettier checks pass. Comparison against the integrated root baseline shows exactly one string replacement. No additional typecheck was needed for this literal-only change. Testing owner was notified to copy the exact service file and verify the new route/return URL while retaining existing security/privacy tests. No test files were edited here.

No AI design, API code, model call, dependency/environment/key change, database action, compiler-image change, commit or publication occurred. Key presence is not live credential verification. This task does not waive the AI hold or any release gate.

Next: coordinator integrates the service and this handoff; testing verifies the combined frontend/backend rename. Keep historical AA7 receipts unchanged. The self-contained prose check and Unicode pass apply to this handoff; the code literal is preserved as implementation.
