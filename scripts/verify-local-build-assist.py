"""Exercise Build AI against a disposable Unix-socket database and fake provider."""

import argparse
import importlib.util
import json
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path


SCRIPTS = Path(__file__).resolve().parent
POLICY = "build-synthetic/1"
MODEL = "build-fixture-model"
RESERVE = "public.ai_budget_reserve_source_next(uuid,uuid,jsonb,jsonb)"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", required=True, type=Path)
    parser.add_argument("--jsonschema-library", required=True, type=Path)
    parser.add_argument("--node", required=True, type=Path)
    parser.add_argument("--recovery", action="store_true",
                        help="Check app-session recovery and simulated provider failures")
    args = parser.parse_args()
    node = args.node.resolve(strict=True)
    if not subprocess.check_output([node, "--version"], text=True).startswith("v22."):
        raise RuntimeError("Node.js 22 is required")
    sys.dont_write_bytecode = True
    spec = importlib.util.spec_from_file_location(
        "correction_fixture", SCRIPTS / "verify-local-canonical-corrections.py"
    )
    corrections = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(corrections)
    fixture = corrections.local_fixture_module()
    with tempfile.TemporaryDirectory(prefix="resumide-build-", dir="/tmp") as temp:
        db = fixture.LocalDatabase(args.pg_bin.resolve(strict=True), Path(temp).resolve())
        try:
            corrections.start_correction_database(
                db, args.jsonschema_library.resolve(strict=True)
            )
            readiness = json.loads(db.query(
                "set role service_role; select public.read_ai_budget_source_readiness();"
            ))
            fixture.check(readiness["schemaReady"] and not readiness["reserveExecutable"],
                          f"Unexpected default Build budget readiness: {readiness}")
            # Recovery allows one 25,000-token hold plus a known 60-token refusal.
            token_limit = 25060 if args.recovery else 100000
            db.query(f"""
                insert into private.ai_budget_policies(version,model,monthly_token_limit,
                  monthly_cost_limit_microusd,input_microusd_per_million,
                  output_microusd_per_million,max_attempts,enabled,approval_sha256)
                values ('{POLICY}','{MODEL}',{token_limit},10000000,1000000,1000000,1,true,repeat('a',64));
                grant select on public.memberships to service_role;
                grant insert,select,update on public.consents to service_role;
                grant insert on public.audit_events to service_role;
                grant execute on function {RESERVE} to service_role;
            """)
            outcomes = ("provider_auth", "provider_transient", "provider_refused") if args.recovery else ("advice", "replace")
            for proposed_outcome in outcomes:
                owner = str(uuid.uuid4())
                organization = db.query(f"""
                    insert into auth.users(id,email) values ('{owner}','build-{owner}@example.test');
                    select id from public.organizations where owner_id='{owner}';
                """)
                uuid.UUID(organization)
                db.query(f"""
                    insert into private.ai_budget_period_openings
                      (organization_id,period,pool_policy_version,opening_spent_tokens,
                       opening_spent_cost_microusd,unresolved_legacy_attempts,evidence_sha256)
                    values ('{organization}',date_trunc('month',now() at time zone 'UTC')::date,
                      '{POLICY}',0,0,0,repeat('b',64));
                """)
                env = {
                    **db.env,
                    "RESUMIDE_PRIVATE_VERIFY": "aa7-owned-synthetic",
                    "RESUMIDE_BUILD_SOCKET": str(db.directory),
                    "RESUMIDE_BUILD_PSQL": db.psql[0],
                    "NODE_ENV": "test",
                    "AI_ENABLED": "true",
                    "AI_BUDGET_ENABLED": "true",
                    "AI_BUDGET_POLICY_VERSION": POLICY,
                    "OPENAI_MODEL": MODEL,
                    "OPENAI_API_KEY": "build-ai-harness-no-live-key",
                    "OPENAI_BASE_URL": "https://api.openai.com/v1",
                    "BUILD_AI_TEST_HARNESS": "selected-context-synthetic-only",
                    "LATEX_CONVERTER_ENABLED": "true",
                    "BUILD_AI_ASSIST_ENABLED": "true",
                    "SUPABASE_URL": "https://local-build.invalid",
                    "SUPABASE_PUBLISHABLE_KEY": "synthetic-unused",
                    "SUPABASE_SECRET_KEY": "synthetic-unused",
                }
                reply = subprocess.run(
                    [node, "--import", "./scripts/build-ai-test-preload.mjs",
                     "node_modules/vite-node/vite-node.mjs", "--config", "vitest.config.ts",
                     "scripts/verify-local-build-assist-browser.ts"],
                    input=json.dumps({"ownerId": owner, "organizationId": organization,
                                      "outcome": proposed_outcome}),
                    text=True, capture_output=True, timeout=75, cwd=SCRIPTS.parent, env=env,
                )
                fixture.check(reply.returncode == 0, reply.stderr[:4500])
                fixture.check("Chromium verified Build consent" in reply.stdout,
                              "Missing Build browser completion receipt")
                print(reply.stdout.strip())
            db.query(f"revoke execute on function {RESERVE} from service_role;")
            fixture.check(db.query("set role service_role; select "
                                   "public.read_ai_budget_source_readiness()->>'reserveExecutable';")
                          == "false", "Build reserve grant was not closed")
        finally:
            db.stop()


if __name__ == "__main__":
    main()
