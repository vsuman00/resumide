"""Verify typed JD persistence with an isolated PostgreSQL migration replay."""

import argparse
import json
import subprocess
import sys
import tempfile
import uuid
from hashlib import sha256
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


SCRIPTS = Path(__file__).resolve().parent
VERIFIER_SHA = "b5c57a891cc72768cbecb0e835623034a8a38dc5ac1657ed7fd4cb3f6936bc97"
ADMISSION = "disposable-native-a09-relations/1"


def seed(db, fixture, node):
    owner_id, resume_id, source_id, analysis_id, job_id = (
        str(uuid.uuid4()) for _ in range(5)
    )
    owner, resume, source, analysis, job = map(
        fixture.literal, (owner_id, resume_id, source_id, analysis_id, job_id)
    )
    organization_id = db.query(f"""
        insert into auth.users(id,email) values ({owner},'a09-'||{owner}||'@example.test');
        select id from public.organizations where owner_id={owner};
    """)
    org = fixture.literal(str(uuid.UUID(organization_id)))
    scope = {
        "ownerId": owner_id, "organizationId": organization_id,
        "analysisId": analysis_id, "jobId": job_id,
    }
    output = subprocess.run(
        [str(node), "node_modules/vite-node/vite-node.mjs", "--config", "vitest.config.ts",
         "scripts/verify-local-job-relations-fixture.ts"],
        input=json.dumps(scope), text=True, capture_output=True, check=True,
        cwd=SCRIPTS.parent, timeout=20,
        env={**db.env, "RESUMIDE_PRIVATE_VERIFY": "aa7-owned-synthetic"},
    )
    oracle = json.loads(output.stdout)
    document = oracle["document"]
    description = fixture.literal(document["sourceText"])
    db.query(f"""
        insert into public.resumes(id,organization_id,owner_id,display_name)
          values ({resume},{org},{owner},'Synthetic JD relation fixture');
        insert into public.resume_versions(id,resume_id,organization_id,owner_id,
          storage_key,checksum,bytes,media_type)
          values ({source},{resume},{org},{owner},private.r17_storage_key({org},{resume},{source}),
            repeat('a',64),1024,'application/pdf');
        insert into public.jobs(id,organization_id,owner_id,title,description)
          values ({job},{org},{owner},'Synthetic JD role',{description});
        insert into public.analyses(id,resume_version_id,job_id,organization_id,
          owner_id,status,idempotency_key)
          values ({analysis},{source},{job},{org},{owner},'needs_ocr',gen_random_uuid());
        delete from public.analysis_jobs where analysis_id={analysis};
    """)
    return scope, oracle


def request(fixture, scope, document, key):
    return f"""
        set role service_role;
        select public.save_job_requirement_relations(
          {fixture.literal(scope['ownerId'])},{fixture.literal(scope['analysisId'])},
          {fixture.jsonb(document)},null,{fixture.literal(key)},'local-a09-service-save');
    """


def verify_saved(db, fixture, scope, oracle, receipt):
    document = oracle["document"]
    analysis, version = map(fixture.literal, (scope["analysisId"], document["id"]))
    fixture.check(receipt == {
        "status": "applied", "versionId": document["id"], "revision": 1, "idempotent": False,
    }, "Typed JD commit did not return the first version")
    saved = json.loads(db.query(f"""
        select jsonb_build_object(
          'content',(select content from public.job_requirement_versions where id={version}),
          'semanticHash',(select command->>'semanticSha256'
                          from public.job_requirement_versions where id={version}),
          'versions',(select count(*) from public.job_requirement_versions where analysis_id={analysis}),
          'items',(select count(*) from public.job_requirements where version_id={version}),
          'audit',(select count(*) from public.audit_events
                    where target_id={version} and action='requirements.relations.import'));
    """))
    fixture.check(saved == {
        "content": document, "semanticHash": oracle["semanticHash"], "versions": 1,
        "items": len(document["requirements"]), "audit": 1,
    }, "Stored literal JD, semantic digest or atomic write inventory differed")
    expected_aliases = {"JS": "JavaScript", "Postgres": "PostgreSQL"}
    aliases = {
        item["value"]: item["mapping"]["canonicalValue"]
        for item in saved["content"]["requirements"]
        if item.get("mapping") and item["mapping"]["kind"] == "alias"
    }
    fixture.check(aliases == expected_aliases, "Stored JD alias literals differed")
    for item in saved["content"]["requirements"]:
        if item["value"] in expected_aliases:
            token = item["tokenEvidence"][0]
            fixture.check(document["sourceText"][token["start"]:token["end"]] == item["value"],
                          "Stored alias code-point range did not select the original text")
    clauses = saved["content"]["relations"]["clauses"]
    for phrase, kind in [("FastAPI or Flask", "any_of"), ("Python and SQL", "all_of"),
                         ("ZephyrCircuit", "unknown")]:
        fixture.check(any(
            phrase in clause["evidence"]["quote"] and clause["skillExpression"]["kind"] == kind
            for clause in clauses
        ), "Stored association or unknown evidence differed")
    ranges = [clause["duration"] for clause in clauses if clause["duration"]["kind"] == "range"]
    fixture.check(len(ranges) == 1, "Expected one stored experience range")
    bounds = ranges[0]
    fixture.check(bounds["lower"]["value"] == 1 and bounds["lower"]["inclusive"] is True
                  and bounds["upper"]["value"] == 4 and bounds["upper"]["inclusive"] is True,
                  "Stored JD experience range differed")


def verify_service_races(db, fixture, node):
    scope, oracle = seed(db, fixture, node)
    original = request(fixture, scope, oracle["document"], str(uuid.uuid4()))
    holder, replay = fixture.run_race(db, original, original)
    receipt = json.loads(holder)
    fixture.check(replay == {**receipt, "idempotent": True}, "Waiting JD save did not replay")
    verify_saved(db, fixture, scope, oracle, receipt)
    print("Identical JD saves waited and committed one literal version.", flush=True)

    scope, oracle = seed(db, fixture, node)
    original = request(fixture, scope, oracle["document"], str(uuid.uuid4()))
    competing_body = {**oracle["document"], "id": str(uuid.uuid4())}
    competing = request(fixture, scope, competing_body, str(uuid.uuid4()))
    holder, rejected = fixture.run_race(db, original, competing)
    fixture.check(rejected == {"status": "conflict"}, "Waiting JD save accepted a stale head")
    verify_saved(db, fixture, scope, oracle, json.loads(holder))
    print("Competing JD save waited and refused the stale head.", flush=True)

    scope, oracle = seed(db, fixture, node)
    owner, org, analysis = map(fixture.literal, (
        scope["ownerId"], scope["organizationId"], scope["analysisId"],
    ))
    _, rejected = fixture.run_race(db, f"""
        select private.lock_candidate_owners(array[{owner}::uuid]);
        insert into public.data_requests(organization_id,user_id,kind)
          values ({org},{owner},'deletion');
    """, request(fixture, scope, oracle["document"], str(uuid.uuid4())))
    fixture.check(rejected == {"status": "not_found"}, "Waiting JD save ignored deletion")
    fixture.check(db.query(f"""
        select (select count(*) from public.job_requirement_versions where analysis_id={analysis}),
          (select count(*) from public.job_requirements where owner_id={owner}),
          (select count(*) from public.audit_events
            where actor_id={owner} and action='requirements.relations.import');
    """) == "0|0|0", "Refused JD save left partial writes")
    print("A waiting JD save refused deletion without writing a version, items or audit.", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", required=True, type=Path)
    parser.add_argument("--jsonschema-library", required=True, type=Path)
    parser.add_argument("--node", required=True, type=Path)
    args = parser.parse_args()
    node = args.node.resolve(strict=True)
    sys.dont_write_bytecode = True
    spec = spec_from_file_location(
        "local_correction_fixture", SCRIPTS / "verify-local-canonical-corrections.py"
    )
    corrections = module_from_spec(spec)
    spec.loader.exec_module(corrections)
    fixture = corrections.local_fixture_module()
    archive = (SCRIPTS / "verify-job-requirement-relations.sql").read_bytes()
    fixture.check(sha256(archive).hexdigest() == VERIFIER_SHA, "JD operator changed")
    verifier = archive.decode()
    for old, new in [
        ("isolated-managed-a09-relations/1", ADMISSION),
        ("'a09-synthetic/'||source_id", "private.r17_storage_key(org_id,root_id,source_id)"),
    ]:
        fixture.check(verifier.count(old) == 1, "Unexpected JD fixture adaptation")
        verifier = verifier.replace(old, new)
    with tempfile.TemporaryDirectory(prefix="resumide-a09-", dir="/tmp") as temp:
        db = fixture.LocalDatabase(args.pg_bin.resolve(strict=True), Path(temp).resolve())
        try:
            corrections.start_correction_database(
                db, args.jsonschema_library.resolve(strict=True)
            )
            db.query(f"""
                set resumide.a09_test_admission = '{ADMISSION}';
                set resumide.a09_test_owner_id = '{uuid.uuid4()}';
                set resumide.a09_test_run_id = '{uuid.uuid4()}';
            """ + verifier)
            counts = db.query("""
                select (select count(*) from auth.users),
                  (select count(*) from public.job_requirement_versions),
                  (select count(*) from public.job_requirements),
                  (select count(*) from public.analysis_jobs),
                  (select count(*) from public.audit_events);
            """)
            fixture.check(counts == "0|0|0|0|0", "JD fixture rollback left rows")
            verify_service_races(db, fixture, node)
        finally:
            db.stop()
    print("Native typed JD evidence, storage, replay, version guards and rollback passed.")


if __name__ == "__main__":
    main()
