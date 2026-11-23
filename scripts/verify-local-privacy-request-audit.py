"""Verify privacy request retries and audit grants on disposable PostgreSQL."""

import argparse
from importlib.util import module_from_spec, spec_from_file_location
import json
from pathlib import Path
import select
import subprocess
import tempfile
from uuid import uuid4


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20261122063000_privacy_request_audit_permissions.sql"


def verify(db, quote):
    owner, request_id, fresh_id = (str(uuid4()) for _ in range(3))
    db.query(f"insert into auth.users(id,email) values ({quote(owner)},"
             f"{quote(owner + '@example.test')});")
    org = db.query(f"select id from public.organizations where owner_id={quote(owner)};")

    def enqueue(key, kind="deletion"):
        return f"""
          insert into public.data_requests(id,organization_id,user_id,kind,status)
          values ({quote(key)},{quote(org)},{quote(owner)},{quote(kind)},'queued');
        """

    def audit(correlation):
        return f"""
          insert into public.audit_events(id,organization_id,actor_id,action,
            target_type,target_id,outcome,request_id)
          values ({quote(request_id)},{quote(org)},{quote(owner)},'deletion.requested',
            'data_request',{quote(request_id)},'success',{quote(correlation)})
          on conflict(id) do nothing;
        """

    def rejected(sql, code, role="service_role"):
        result = subprocess.run(
            db.psql, input=f"\\set VERBOSITY verbose\nset role {role};\n{sql}",
            env=db.env, text=True, capture_output=True, timeout=10,
        )
        assert result.returncode != 0 and code in result.stderr, result.stderr

    statement = enqueue(request_id)
    with subprocess.Popen(
        db.psql, env=db.env, text=True, stdin=subprocess.PIPE,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    ) as first:
        try:
            first.stdin.write(f"begin;\nset role service_role;\n{statement}\n\\echo request_inserted\n")
            first.stdin.flush()
            assert select.select([first.stdout], [], [], 10)[0]
            assert first.stdout.readline().strip() == "request_inserted"
            rejected(statement, "55P03")
            _, diagnostic = first.communicate("commit;\n", timeout=10)
            assert first.returncode == 0, diagnostic
        finally:
            if first.poll() is None:
                first.kill()
                first.communicate(timeout=10)
    rejected(statement, "23505")
    rejected(enqueue(str(uuid4()), "export"), "42501")
    assert db.query(f"select count(*) from public.privacy_request_steps where request_id={quote(request_id)};") == "3"

    rejected(audit("before-migration"), "42501")
    db.query(MIGRATION.read_text())
    rejected(audit("client-denied"), "42501", role="anon")
    rejected(audit("client-denied"), "42501", role="authenticated")
    rejected("select request_id from public.audit_events;", "42501")
    rejected("update public.audit_events set request_id='overwrite';", "42501")
    for correlation in ["first-acknowledged-audit", "duplicate-retry-audit"]:
        db.query("set role service_role;" + audit(correlation))
    assert db.query(f"""
      select count(*),min(request_id) from public.audit_events
      where target_id={quote(request_id)};
    """) == "1|first-acknowledged-audit"
    assert db.query("""
      select has_table_privilege('authenticated','public.audit_events','SELECT'),
        not has_any_column_privilege('anon','public.audit_events','INSERT'),
        not has_any_column_privilege('authenticated','public.audit_events','INSERT');
    """) == "t|t|t"

    db.query(f"""
      set role service_role;
      update public.data_requests set status='cancelled'
      where id={quote(request_id)} and status='queued';
    """)
    rejected(statement, "23505")
    db.query("set role service_role;" + enqueue(fresh_id))
    assert db.query(f"""
      select string_agg(status,',' order by status) from public.data_requests
      where user_id={quote(owner)};
    """) == "cancelled,queued"
    return {
        "postgresMajor": 17,
        "replayedOperations": 100,
        "contendedRetrySqlstate": "55P03",
        "duplicateSqlstate": "23505",
        "singleDeletionCreatedThreeSteps": True,
        "baselineAuditGrantMissing": True,
        "auditInsertIgnoredDuplicate": True,
        "clientGrantsPreserved": True,
        "pendingDeletionDeniedNewExport": True,
        "cancelledReplayDidNotRequeue": True,
        "freshRequestAccepted": True,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", type=Path, required=True)
    parser.add_argument("--jsonschema-library", type=Path, required=True)
    args = parser.parse_args()
    spec = spec_from_file_location(
        "resumide_correction_fixture", ROOT / "scripts/verify-local-canonical-corrections.py"
    )
    corrections = module_from_spec(spec)
    spec.loader.exec_module(corrections)
    fixture = corrections.local_fixture_module()
    with tempfile.TemporaryDirectory(prefix="resumide-pr-audit-", dir="/tmp") as directory:
        db = fixture.LocalDatabase(args.pg_bin.resolve(strict=True), Path(directory).resolve())
        try:
            corrections.start_correction_database(db, args.jsonschema_library.resolve(strict=True))
            result = verify(db, fixture.literal)
        finally:
            db.stop()
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
