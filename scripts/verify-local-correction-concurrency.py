"""Observe correction replay, stale-state and deletion races on local PostgreSQL."""

import argparse
import importlib.util
import json
import sys
import tempfile
import uuid
from pathlib import Path


def load_correction_fixture():
    sys.dont_write_bytecode = True
    path = Path(__file__).resolve().with_name("verify-local-canonical-corrections.py")
    spec = importlib.util.spec_from_file_location("local_correction_fixture", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def seed(db, corrections, check):
    sql = corrections.verifier_sql(check)
    boundary = (
        "  result:=public.apply_candidate_corrections("
        "owner_id,analysis_id,apply_command,original,'c02-owned-native');"
    )
    check(sql.count(boundary) == 1, "Correction fixture save boundary changed")
    setup = sql.split(boundary, 1)[0] + """
  perform set_config('resumide.local_correction_fixture', jsonb_build_object(
    'ownerId',owner_id,'orgId',org_id,'resumeId',root_id,'analysisId',analysis_id,
    'attemptId',attempt_id,'command',apply_command,'original',original)::text,true);
end;
$verify$;
select current_setting('resumide.local_correction_fixture');
commit;
"""
    return json.loads(db.query(corrections.admission_settings() + setup))


def apply_sql(fixture, row, command):
    return f"""
        set role service_role;
        select public.apply_candidate_corrections(
          {fixture.literal(row['ownerId'])},{fixture.literal(row['analysisId'])},
          {fixture.jsonb(command)},{fixture.jsonb(row['original'])},'local-correction-race');
    """


def inventory(db, fixture, row):
    owner = fixture.literal(row["ownerId"])
    resume = fixture.literal(row["resumeId"])
    analysis = fixture.literal(row["analysisId"])
    return json.loads(db.query(f"""
        select jsonb_build_object(
          'applyOperations',(select count(*) from public.candidate_correction_operations
            where analysis_id={analysis} and kind='apply'),
          'versions',(select count(*) from public.canonical_resume_versions where resume_id={resume}),
          'applications',(select count(*) from public.candidate_correction_applications where analysis_id={analysis}),
          'snapshotFacts',(select count(*) from public.canonical_correction_snapshot_facts where owner_id={owner}),
          'reviewEvents',(select count(*) from public.evidence_corrections where analysis_id={analysis}),
          'deletions',(select count(*) from public.data_requests where user_id={owner} and kind='deletion' and status='queued'),
          'head',(select version_id from public.canonical_resume_heads where resume_id={resume})
        );
    """))


def check_saved_once(db, fixture, row, saved):
    fixture.check(saved["status"] == "applied" and saved["idempotent"] is False
                  and len(saved["childVersionIds"]) == 2, "First transaction did not save the import and correction once")
    fixture.check(inventory(db, fixture, row) == {
        "applyOperations": 1, "versions": 2, "applications": 1, "snapshotFacts": 1,
        "reviewEvents": 3, "deletions": 0, "head": saved["versionId"],
    }, "Correction race wrote duplicate or incomplete rows")


def verify_races(db, corrections, fixture):
    check = fixture.check
    row = seed(db, corrections, check)
    request = apply_sql(fixture, row, row["command"])
    saved, replay = fixture.run_race(db, request, request)
    saved = json.loads(saved)
    check(replay == {**saved, "idempotent": True}, "Identical waiting correction did not replay the saved result")
    check_saved_once(db, fixture, row, saved)
    print("Identical correction waited and returned the same saved receipt.", flush=True)

    row = seed(db, corrections, check)
    alternative = {**row["command"], "idempotencyKey": str(uuid.uuid4())}
    saved, losing = fixture.run_race(
        db, apply_sql(fixture, row, row["command"]), apply_sql(fixture, row, alternative),
    )
    check(losing["status"] == "conflict", "A competing correction used a stale head")
    check_saved_once(db, fixture, row, json.loads(saved))
    print("A different request captured at the same head waited and conflicted.", flush=True)

    row = seed(db, corrections, check)
    owner = fixture.literal(row["ownerId"])
    analysis = fixture.literal(row["analysisId"])
    attempt = fixture.literal(row["attemptId"])
    reviewed, stale = fixture.run_race(db, f"""
        set role service_role;
        select public.correct_document_evidence({analysis},{attempt},{owner},3,'name','correct',
          'Synthetic Replacement Candidate',null,gen_random_uuid(),'local-correction-review-race');
    """, apply_sql(fixture, row, row["command"]))
    check(json.loads(reviewed)["status"] == "applied" and stale["status"] == "conflict",
          "Waiting correction failed to recheck committed review revision")
    check(inventory(db, fixture, row) == {
        "applyOperations": 0, "versions": 0, "applications": 0, "snapshotFacts": 0,
        "reviewEvents": 4, "deletions": 0, "head": None,
    }, "Stale review left correction materialization rows")
    print("A waiting correction rechecked the newly committed review revision.", flush=True)

    row = seed(db, corrections, check)
    owner = fixture.literal(row["ownerId"])
    org = fixture.literal(row["orgId"])
    _, blocked = fixture.run_race(db, f"""
        select private.lock_candidate_owners(array[{owner}::uuid]);
        insert into public.data_requests(organization_id,user_id,kind)
          values ({org},{owner},'deletion');
    """, apply_sql(fixture, row, row["command"]))
    check(blocked["status"] == "not_found", "Waiting correction failed to recheck committed deletion")
    check(inventory(db, fixture, row) == {
        "applyOperations": 0, "versions": 0, "applications": 0, "snapshotFacts": 0,
        "reviewEvents": 3, "deletions": 1, "head": None,
    }, "Blocked correction left materialization rows")
    print("A waiting correction refused the newly committed deletion.", flush=True)


def verify_commit_guard(db, corrections, fixture):
    check = fixture.check
    access = db.query("""
        select routine.prosecdef,
          not exists (
            select 1 from (values ('anon'),('authenticated'),('service_role')) as role(name)
            where has_function_privilege(role.name,routine.oid,'EXECUTE')
          ),
          not exists (
            select 1 from (values ('anon'),('authenticated'),('service_role')) as role(name)
            cross join (values
              ('public.candidate_correction_operations'::regclass),
              ('public.candidate_correction_assignments'::regclass),
              ('public.candidate_correction_applications'::regclass),
              ('public.canonical_correction_snapshots'::regclass),
              ('public.canonical_correction_snapshot_facts'::regclass)
            ) as ledger(table_oid)
            where has_table_privilege(role.name,ledger.table_oid,
              'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
              or has_any_column_privilege(role.name,ledger.table_oid,
                'SELECT,INSERT,UPDATE,REFERENCES')
          )
        from pg_catalog.pg_proc routine
        where routine.oid='private.check_correction_ledger_integrity()'::regprocedure;
    """)
    check(access == "t|t|t", "Deferred trigger or ledger access differs")

    row = seed(db, corrections, check)
    analysis = fixture.literal(row["analysisId"])
    operations = f"select count(*) from public.candidate_correction_operations where analysis_id={analysis};"
    check(db.query(operations) == "1", "Correction fixture did not create its initial assignment")
    # Copy an owned test operation while retaining its existing assignment IDs.
    # The deferred validator should reject their mismatch with the new operation.
    try:
        db.query(f"""
            \\set VERBOSITY verbose
            begin;
            insert into public.candidate_correction_operations
            select (jsonb_populate_record(null::public.candidate_correction_operations,
              to_jsonb(op)||jsonb_build_object('id',gen_random_uuid(),'idempotency_key',gen_random_uuid()))).*
            from public.candidate_correction_operations as op
            where op.analysis_id={analysis} and op.kind='assign';
            set role service_role;
            commit;
        """)
    except RuntimeError as error:
        check("23514: CORRECTION_ASSIGN_ORDER" in str(error), str(error))
    else:
        raise RuntimeError("Commit accepted an operation with a mismatched assignment")
    check(db.query(operations) == "1", "Invalid deferred write left an operation")
    print("Deferred integrity still rejects invalid assignments and rolls back.", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", required=True, type=Path)
    parser.add_argument("--jsonschema-library", required=True, type=Path)
    args = parser.parse_args()
    corrections = load_correction_fixture()
    fixture = corrections.local_fixture_module()
    with tempfile.TemporaryDirectory(prefix="resumide-c02-races-", dir="/tmp") as temp:
        db = fixture.LocalDatabase(args.pg_bin.resolve(strict=True), Path(temp).resolve())
        try:
            corrections.start_correction_database(db, args.jsonschema_library.resolve(strict=True))
            verify_races(db, corrections, fixture)
            verify_commit_guard(db, corrections, fixture)
        finally:
            db.stop()
    print("Observed all four advisory lock waits and removed the disposable cluster.")


if __name__ == "__main__":
    main()
