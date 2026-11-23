"""Verify candidate cancellation on disposable PostgreSQL, without a hosted target."""

import argparse
import json
import select
import subprocess
import tempfile
from pathlib import Path
from uuid import uuid4

from importlib.util import module_from_spec, spec_from_file_location


ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "supabase/migrations/20261122060000_owned_analysis_cancellation.sql"


def cancellation_check(db, quote, baseline_only):
    def workspace():
        owner = str(uuid4())
        db.query(f"insert into auth.users(id,email) values ({quote(owner)},"
                 f"{quote(owner + '@example.test')});")
        organization = db.query(f"select id from public.organizations where owner_id={quote(owner)};")
        return owner, organization

    def queued(owner, organization):
        resume, version, analysis = (str(uuid4()) for _ in range(3))
        key = f"organizations/{organization}/resumes/{resume}/versions/{version}.pdf"
        db.query(f"""
            insert into public.resumes(id,organization_id,owner_id,display_name)
            values({quote(resume)},{quote(organization)},{quote(owner)},'Synthetic resume');
            insert into public.resume_versions(id,resume_id,organization_id,owner_id,storage_key,checksum,bytes,media_type)
            values({quote(version)},{quote(resume)},{quote(organization)},{quote(owner)},
              {quote(key)},repeat('a',64),1,'application/pdf');
            insert into public.analyses(id,resume_version_id,organization_id,owner_id,status,idempotency_key)
            values({quote(analysis)},{quote(version)},{quote(organization)},{quote(owner)},'queued',gen_random_uuid());
            insert into public.analysis_jobs(analysis_id) values({quote(analysis)});
        """)
        return resume, analysis

    def request(analysis, owner, name="cancel_owned_analysis"):
        return f"set role service_role; select public.{name}({quote(analysis)},{quote(owner)},'owned-cancellation-test');"

    def unchanged(analysis):
        assert db.query(f"""
            select status='queued',
              exists(select 1 from public.analysis_jobs where analysis_id=a.id),
              not exists(select 1 from public.analysis_transitions where analysis_id=a.id and to_status='cancelled')
            from public.analyses a where id={quote(analysis)};
        """) == "t|t|t"

    revoked_owner, revoked_org = workspace()
    _, baseline = queued(revoked_owner, revoked_org)
    _, revoked = queued(revoked_owner, revoked_org)
    db.query(f"delete from public.memberships where organization_id={quote(revoked_org)} and user_id={quote(revoked_owner)};")
    assert db.query(request(baseline, revoked_owner, "cancel_analysis")) == "cancelled"
    if baseline_only:
        return {"previousRoutineCancelledAfterMembershipRevocation": True}

    db.query(MIGRATION.read_text())
    signature = "'public.cancel_owned_analysis(uuid,uuid,text)'"
    assert db.query(f"""
        select has_function_privilege('service_role',{signature},'EXECUTE'),
          not has_function_privilege('authenticated',{signature},'EXECUTE'),
          not has_function_privilege('anon',{signature},'EXECUTE');
    """) == "t|t|t"
    assert db.query(request(revoked, revoked_owner)) == "not_found"
    unchanged(revoked)

    owner, organization = workspace()
    _, owned = queued(owner, organization)
    assert db.query(request(owned, revoked_owner)) == "not_found"
    unchanged(owned)
    assert db.query(request(owned, owner)) == "cancelled"
    assert db.query(request(owned, owner)) == "already_cancelled"
    assert db.query(f"""
        select status='cancelled',
          not exists(select 1 from public.analysis_jobs where analysis_id=a.id),
          (select count(*) from public.analysis_transitions where analysis_id=a.id and to_status='cancelled')=1
        from public.analyses a where id={quote(owned)};
    """) == "t|t|t"

    retired, deleted = queued(owner, organization)
    db.query(f"update public.resumes set status='deleted' where id={quote(retired)};")
    assert db.query(request(deleted, owner)) == "not_found"
    unchanged(deleted)

    _, leased = queued(owner, organization)
    db.query(f"""
        update public.analysis_jobs set lease_owner='synthetic-worker',
          attempt_count=1, lease_fence=gen_random_uuid(), lease_expires_at=clock_timestamp()+interval '1 minute'
        where analysis_id={quote(leased)};
    """)
    assert db.query(request(leased, owner)) == "already_started"
    unchanged(leased)

    _, pending = queued(owner, organization)
    enqueue = f"""insert into public.data_requests(organization_id,user_id,kind)
        values({quote(organization)},{quote(owner)},'deletion');"""
    with subprocess.Popen(db.psql, env=db.env, text=True, stdin=subprocess.PIPE,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE) as deletion:
        try:
            deletion.stdin.write(f"begin;\n{enqueue}\n\\echo deletion_lock_held\n")
            deletion.stdin.flush()
            assert select.select([deletion.stdout], [], [], 10)[0]
            assert deletion.stdout.readline().strip() == "deletion_lock_held"
            contended = subprocess.run(
                db.psql, input="\\set VERBOSITY verbose\n" + request(pending, owner),
                env=db.env, text=True, capture_output=True, timeout=10,
            )
            assert contended.returncode != 0 and "55P03" in contended.stderr
            unchanged(pending)
            _, diagnostic = deletion.communicate("commit;\n", timeout=10)
            assert deletion.returncode == 0, diagnostic
        finally:
            if deletion.poll() is None:
                deletion.kill()
                deletion.communicate(timeout=10)
    assert db.query(request(pending, owner)) == "not_found"
    unchanged(pending)

    return {
        "previousRoutineCancelledAfterMembershipRevocation": True,
        "ownedCancellationAndReplay": True,
        "roleGrants": True,
        "foreignOwnerDenied": True,
        "revokedMembershipDenied": True,
        "deletedSourceDenied": True,
        "liveLeasePreserved": True,
        "deletionLockContentionRetried": True,
        "committedDeletionDenied": True,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", type=Path, required=True)
    parser.add_argument("--jsonschema-library", type=Path, required=True)
    parser.add_argument("--baseline-only", action="store_true")
    args = parser.parse_args()
    spec = spec_from_file_location(
        "local_correction_fixture", ROOT / "scripts/verify-local-canonical-corrections.py"
    )
    corrections = module_from_spec(spec)
    spec.loader.exec_module(corrections)
    fixture = corrections.local_fixture_module()
    with tempfile.TemporaryDirectory(prefix="resumide-oc-", dir="/tmp") as temp:
        db = fixture.LocalDatabase(args.pg_bin.resolve(strict=True), Path(temp).resolve())
        try:
            corrections.start_correction_database(db, args.jsonschema_library.resolve(strict=True))
            results = cancellation_check(db, fixture.literal, args.baseline_only)
        finally:
            db.stop()
    print(json.dumps(results, sort_keys=True))


if __name__ == "__main__":
    main()
