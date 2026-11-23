"""Verify saved-entry regrouping against the local, socket-only schema successor."""

import argparse
import importlib.util
import sys
import tempfile
from hashlib import sha256
from pathlib import Path


SCRIPTS = Path(__file__).resolve().parent
VERIFIER_SHA = "4bca1dcc948b9cd26a21af8ed21404d00ffef04eb8b947bc147fe0da7540ca7d"
READY_SHA = "ebabc64c03321a6cc6c21fb19b2a0f3c7139fe9ff4c7dde11ea0dce1eff283c3"


def local_fixture_module():
    sys.dont_write_bytecode = True
    spec = importlib.util.spec_from_file_location(
        "local_grouped_fixture", SCRIPTS / "verify-local-grouped-import-concurrency.py"
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def verifier_sql(check):
    source = (SCRIPTS / "verify-entry-regroup-admission.sql").read_bytes()
    check(sha256(source).hexdigest() == VERIFIER_SHA, "Saved-entry regroup oracle changed")
    sql = source.decode()
    storage = "'era-source/'||source_id"
    binding = "(c02_read->'binding'-array['ownerId','organizationId','resumeId','analysisId'])"
    failure_fixture = (
        "    alter table public.candidate_entry_regroup_members "
        "add constraint era_abort_after_pending check(false) not valid;"
    )
    first_save = (
        "  result1:=public.apply_canonical_entry_regroup("
        "owner_id,analysis_id,command1,'era-native-fixture');"
    )
    for before, after, count in [
        ("de6e71fed03732a391e35226d20816acd207267eef5f09c27017cee1f054f3fd", READY_SHA, 1),
        (storage, "private.r17_storage_key(org_id,root_id,source_id)", 1),
        (binding, "((c02_read->'binding')-array['ownerId','organizationId','resumeId','analysisId'])", 2),
        (failure_fixture, "    set constraints all immediate;\n" + failure_fixture
         + "\n    set constraints all deferred;", 1),
        (first_save, """
  snap:=public.read_canonical_entry_regroup_workspace(owner_id,analysis_id,null);
  perform pg_temp.era_assert(snap->'current'->>'status'='available'
    and snap->'current'->'freshCanPreview'='true'::jsonb
    and snap->'current'->'freshCanCommit'='false'::jsonb
    and snap->'compatibilityReady'='true'::jsonb and snap->'canRetry'='false'::jsonb,
    'fresh_preview_available_while_writer_denied');
""" + first_save, 1),
    ]:
        check(sql.count(before) == count, "Saved-entry regroup fixture adaptation changed")
        sql = sql.replace(before, after)
    return sql


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", required=True, type=Path)
    parser.add_argument("--jsonschema-library", required=True, type=Path)
    args = parser.parse_args()
    fixture = local_fixture_module()
    check = fixture.check
    library = args.jsonschema_library.resolve(strict=True)
    with tempfile.TemporaryDirectory(prefix="resumide-entry-regroup-", dir="/tmp") as temp:
        db = fixture.LocalDatabase(args.pg_bin.resolve(strict=True), Path(temp).resolve())
        try:
            db.start(library, packet_flag="--entry-regroup-head-repair",
                     operation_count=99, ready_sha=READY_SHA)
            check(db.query("""
                select private.ai_budget_source_ready(), private.canonical_correction_write_ready(),
                  private.canonical_rewrite_ready(), private.canonical_rewrite_workspace_ready(),
                  private.initial_feedback_ready(), private.jd_clause_schema_ready(),
                  private.owned_ai_disposition_ready(), private.owned_ai_expiry_ready(),
                  private.owned_legacy_ai_usage_ready(), private.typed_authoring_write_ready(),
                  private.privacy_generation_ready();
            """) == "|".join(["t"] * 11), "A dependent readiness check failed")
            db.query("""
                alter table auth.users add column aud text, add column role text,
                  add column raw_app_meta_data jsonb, add column raw_user_meta_data jsonb;
            """)
            db.query(verifier_sql(check))
            counts = db.query("""
                select (select count(*) from auth.users),
                  (select count(*) from public.canonical_resume_versions),
                  (select count(*) from public.candidate_entry_regroup_batches),
                  (select count(*) from public.evidence_corrections);
            """)
            check(counts == "0|0|0|0", "Saved-entry regroup rollback left fixture rows")
        finally:
            db.stop()
    print("Saved-entry regroup preview, lifecycle, replay and rollback passed.")


if __name__ == "__main__":
    main()
