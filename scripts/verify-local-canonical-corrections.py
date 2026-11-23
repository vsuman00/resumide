"""Verify correction provenance and replay on disposable PostgreSQL."""

import argparse
import importlib.util
import sys
import tempfile
import uuid
from hashlib import sha256
from pathlib import Path


SCRIPTS = Path(__file__).resolve().parent
VERIFIER_SHA = "ed1b12be6479117356dc4945aba0ad8902c7e7578d2b7c1b9e95076038dceb88"
READY_SHA = "ebabc64c03321a6cc6c21fb19b2a0f3c7139fe9ff4c7dde11ea0dce1eff283c3"
ADMISSION = "disposable-native-c02-materialization/1"

PROVENANCE_ASSERTIONS = """
  perform pg_temp.c02_assert(
    (select count(*) from public.resume_facts as saved_fact
      where saved_fact.canonical_version_id=head2 and saved_fact.type='name')=1
    and exists(select 1 from public.resume_facts as saved_fact
      where saved_fact.canonical_version_id=head2 and saved_fact.id=name_fact
        and saved_fact.value='Demo Candidate Reviewed Slate'
        and saved_fact.state='unconfirmed' and saved_fact.sources='[]'::jsonb
        and saved_fact.confirmation is null),
    'corrected_name_once_without_old_citations');
  perform pg_temp.c02_assert(
    exists(select 1 from public.canonical_resume_versions as original_version
      where original_version.id=raw_id and original_version.content=original),
    'correction_preserves_original_version_and_citations');
  perform pg_temp.c02_assert(
    exists(select 1 from public.canonical_correction_snapshot_facts as link
      join public.candidate_correction_applications as applied on applied.id=link.application_id
      join public.candidate_correction_assignments as selected on selected.id=applied.assignment_id
      join public.evidence_corrections as decision on decision.id=selected.correction_event_id
      where link.canonical_version_id=head2 and link.fact_id=name_fact
        and applied.result_version_id=head2 and applied.result_fact_id=name_fact
        and applied.owner_id=owner_id and applied.actor_id=owner_id
        and applied.source_resume_version_id=source_id and applied.attempt_id=attempt_id
        and selected.id=name_choice and selected.actor_id=owner_id
        and selected.correction_revision=1 and decision.id=name_event
        and decision.actor_id=owner_id and decision.revision=1
        and decision.attempt_id=attempt_id and decision.operation='correct'),
    'correction_links_exact_actor_event_revision_and_source');
"""

STALE_ATTEMPT_ASSERTIONS = """
  declare v_latest uuid:=gen_random_uuid();
  begin
    insert into public.document_evidence_attempts
      (id,analysis_id,organization_id,owner_id,resume_version_id,input_sha256,attempt_number,envelope)
    select v_latest, prior.analysis_id, prior.organization_id, prior.owner_id,
      prior.resume_version_id, prior.input_sha256, 2,
      jsonb_set(prior.envelope,'{id}',to_jsonb(v_latest))
    from public.document_evidence_attempts as prior where prior.id=v_attempt;
    result:=public.import_canonical_original(v_owner,v_analysis,binding,retry_body,command,
      'c02-original-live-replacement');
    perform pg_temp.c02_assert(result->>'status'='conflict'
      and (select version_id=v_manual from public.canonical_resume_heads where resume_id=v_resume)
      and not exists(select 1 from public.canonical_resume_versions where id=v_retry),
      'actual_new_attempt_refuses_old_replay_without_writes');
  end;
"""


def verifier_sql(check):
    base = (SCRIPTS / "verify-canonical-correction-materialization.sql").read_bytes()
    check(sha256(base).hexdigest() == VERIFIER_SHA, "Correction materialization fixture changed")
    sql = base.decode()
    binding = "(p_read->'binding'-array['ownerId','organizationId','resumeId','analysisId'])"
    after_apply = "  -- Forging one real member location still cannot edit a globally shared fact."
    after_original = "end;\n$original_import$;"
    for before, after in [
        ("isolated-managed-c02-materialization/1", ADMISSION),
        ("'c02-synthetic/'||source_id", "private.r17_storage_key(org_id,root_id,source_id)"),
        ("'c02-original-synthetic/'||v_source", "private.r17_storage_key(v_org,v_resume,v_source)"),
        (binding, "((p_read->'binding')-array['ownerId','organizationId','resumeId','analysisId'])"),
        (after_apply, PROVENANCE_ASSERTIONS + after_apply),
        (after_original, STALE_ATTEMPT_ASSERTIONS + after_original),
    ]:
        check(sql.count(before) == 1, "Correction materialization fixture adaptation changed")
        sql = sql.replace(before, after)
    return sql


def local_fixture_module():
    sys.dont_write_bytecode = True
    spec = importlib.util.spec_from_file_location(
        "local_grouped_fixture", SCRIPTS / "verify-local-grouped-import-concurrency.py"
    )
    fixture = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fixture)
    return fixture


def start_correction_database(db, library):
    db.start(library, packet_flag="--correction-commit-repair",
             operation_count=100, ready_sha=READY_SHA)
    db.query("""
        alter table auth.users add column aud text, add column role text,
          add column raw_app_meta_data jsonb, add column raw_user_meta_data jsonb;
    """)


def admission_settings():
    return f"""
        set resumide.c02_test_admission = '{ADMISSION}';
        set resumide.c02_test_owner_id = '{uuid.uuid4()}';
        set resumide.c02_test_run_id = '{uuid.uuid4()}';
    """


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", required=True, type=Path)
    parser.add_argument("--jsonschema-library", required=True, type=Path)
    args = parser.parse_args()
    fixture = local_fixture_module()
    check = fixture.check
    with tempfile.TemporaryDirectory(prefix="resumide-c02-", dir="/tmp") as temp:
        db = fixture.LocalDatabase(args.pg_bin.resolve(strict=True), Path(temp).resolve())
        try:
            start_correction_database(db, args.jsonschema_library.resolve(strict=True))
            db.query(admission_settings() + verifier_sql(check))
            counts = db.query("""
                select (select count(*) from auth.users),
                  (select count(*) from public.canonical_resume_versions),
                  (select count(*) from public.candidate_correction_operations),
                  (select count(*) from public.evidence_corrections);
            """)
            check(counts == "0|0|0|0", "Correction fixture rollback left rows")
        finally:
            db.stop()
    print("Correction provenance, replacement attempt, access controls and rollback passed.")


if __name__ == "__main__":
    main()
