"""Verify owned scoring context in a disposable PostgreSQL migration replay."""

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
ARCHIVE_SHA = "3d38d537d43b3638c55e21b19faeae3b47789650a04800de64300379f624e8af"


def local_operator(archive, ready_sha, check):
    sql = archive.decode()
    for before, after in [
        ("f88516e99f6ee34120dc66217eea3191486ff0083d9053615e14cd925cdec999", ready_sha),
        ("'rrv-source/'||source_id", "private.r17_storage_key(org_id,root_id,source_id)"),
        (
            "  insert into public.organizations(id,owner_id,name)",
            "  delete from public.organizations o where o.owner_id=fixture.owner_id;\n"
            "  insert into public.organizations(id,owner_id,name)",
        ),
    ]:
        check(sql.count(before) == 1, "Unexpected score fixture adaptation")
        sql = sql.replace(before, after)
    return sql


def node_fixture(db, node, payload, *flags):
    environment = {**db.env, "RESUMIDE_PRIVATE_VERIFY": "aa7-owned-synthetic"}
    browser = "--browser" in flags
    authoring = "--authoring" in flags
    rewrite = "--rewrite" in flags
    clause_order = "--clause-order" in flags
    clarification = "--clarification" in flags
    if browser:
        environment.update({
            "RESUMIDE_A10_BROWSER": "true",
            "RESUMIDE_A10_SOCKET": str(db.directory),
            "RESUMIDE_A10_PSQL": db.psql[0],
            "NODE_ENV": "test",
            "AI_ENABLED": "false",
            "OPENAI_API_KEY": "synthetic-unused",
            "SUPABASE_URL": "https://local-a10.invalid",
            "SUPABASE_PUBLISHABLE_KEY": "synthetic-unused",
            "SUPABASE_SECRET_KEY": "synthetic-unused",
            "NATIVE_EVIDENCE_ENABLED": "true",
            "EVIDENCE_REVIEW_ENABLED": "true",
            "CANONICAL_AUTHORING_ENABLED": "true",
            "JOB_INTELLIGENCE_ENABLED": "true",
            "JOB_RELATIONS_ENABLED": "true",
            "ARTIFACT_RENDERING_ENABLED": "true",
            "SCORING_V2_ENABLED": "true",
            "RESUMIDE_A10_BROWSER_ZOOM": "true" if "--browser-zoom" in flags else "false",
        })
        if authoring:
            environment.update({
                "RESUMIDE_A11_BROWSER": "true",
                "AUTHORING_ENABLED": "true",
                "TYPED_AUTHORING_ENABLED": "true",
            })
        if rewrite:
            environment.update({
                "RESUMIDE_A12_BROWSER": "true",
                "AUTHORING_ENABLED": "true",
                "CANONICAL_REWRITE_ENABLED": "true",
            })
        if clause_order:
            environment.update({
                "RESUMIDE_A14_BROWSER": "true",
                "AUTHORING_ENABLED": "true",
                "TYPED_AUTHORING_ENABLED": "true",
            })
        if clarification:
            environment.update({
                "RESUMIDE_U06_BROWSER": "true",
                "AUTHORING_ENABLED": "true",
            })
    with tempfile.TemporaryFile(mode="w+", encoding="utf-8", dir=db.directory) as input_file:
        json.dump(payload, input_file)
        input_file.seek(0)
        reply = subprocess.run(
            [str(node), "node_modules/vite-node/vite-node.mjs", "--config", "vitest.config.ts",
             "scripts/verify-local-typed-score-fixture.ts",
             *(["--", *flags] if not browser else [])],
            stdin=input_file, text=True, capture_output=True,
            cwd=SCRIPTS.parent, timeout=75 if browser else 25,
            env=environment,
        )
    if reply.returncode:
        raise RuntimeError(reply.stderr[:3500])
    if browser and not (clause_order or clarification) and "Chromium verified the pinned score review" not in reply.stdout:
        raise RuntimeError("The Chromium scoring check did not emit its completion receipt")
    if browser and clause_order and "Chromium verified clause-order preview, decision, replay and undo" not in reply.stdout:
        raise RuntimeError("The Chromium clause-order check did not emit its completion receipt")
    if browser and authoring and "Chromium verified the staged authoring journey" not in reply.stdout:
        raise RuntimeError("The Chromium authoring check did not emit its completion receipt")
    if browser and rewrite and "Chromium verified saved rewrite workspace reads" not in reply.stdout:
        raise RuntimeError("The Chromium rewrite check did not emit its completion receipt")
    if browser and clarification and "Chromium verified clarification review and undo" not in reply.stdout:
        raise RuntimeError("The Chromium clarification check did not emit its completion receipt")
    if browser and "--browser-zoom" in flags:
        for width in [390, 320]:
            if f"Chromium verified 200% browser zoom at {width} CSS pixels." not in reply.stdout:
                raise RuntimeError(f"Missing Chromium page zoom receipt for {width} CSS pixels")
    return reply.stdout


def verify_duration(db, fixture, node, browser, authoring, rewrite, clause_order, clarification,
                    browser_zoom):
    ids = {name: str(uuid.uuid4()) for name in
           ("ownerId", "analysisId", "sourceId", "resumeId", "attemptId", "jobId")}
    owner, analysis, source, resume, job = (
        fixture.literal(ids[key]) for key in
        ("ownerId", "analysisId", "sourceId", "resumeId", "jobId")
    )
    ids["organizationId"] = db.query(f"""
        insert into auth.users(id,email) values ({owner},'a10-'||{owner}||'@example.test');
        select id from public.organizations where owner_id={owner};
    """)
    org = fixture.literal(str(uuid.UUID(ids["organizationId"])))
    authoring_flags = ["--authoring"] if authoring else []
    rewrite_flags = ["--rewrite"] if rewrite else []
    clause_flags = ["--clause-order"] if clause_order else []
    oracle = json.loads(node_fixture(db, node, ids, "--prepare", *authoring_flags, *clause_flags))
    evidence = oracle["evidence"]
    first, second = oracle["first"], oracle["second"]
    if not clarification:
        db.query(f"""
            insert into public.jobs(id,organization_id,owner_id,title,description) values
              ({job},{org},{owner},'Synthetic A10 role',{fixture.literal(first['sourceText'])});
        """)
    analysis_job = "null" if clarification else job
    db.query(f"""
        insert into public.resumes(id,organization_id,owner_id,display_name)
          values ({resume},{org},{owner},'Synthetic A10 source');
        insert into public.resume_versions(id,resume_id,organization_id,owner_id,storage_key,
          checksum,bytes,media_type,page_count) values ({source},{resume},{org},{owner},
          private.r17_storage_key({org},{resume},{source}),{fixture.literal(evidence['inputSha256'])},
          1024,'application/pdf',1);
        insert into public.analyses(id,resume_version_id,job_id,organization_id,owner_id,
          status,idempotency_key) values ({analysis},{source},{analysis_job},{org},{owner},
          'extracting',gen_random_uuid());
        delete from public.analysis_jobs where analysis_id={analysis};
    """)
    fixture.check(db.query(f"""
        set role service_role;
        select public.persist_document_evidence({analysis},{fixture.jsonb(evidence)},'a10-local','a10-local',1);
    """) == "t", "The duration fixture evidence did not persist")
    if clause_order:
        command = {"operation": "import", "expectedVersionId": None,
                   "idempotencyKey": str(uuid.uuid4()), "factId": None,
                   "value": None, "targetVersionId": None}
        saved = json.loads(db.query(f"""
            set role service_role;
            select public.save_canonical_version({owner},{source},
              {fixture.jsonb(oracle['original'])},{fixture.jsonb(command)},'a14-local');
        """))
    else:
        saved = json.loads(db.query(f"""
            select public.import_canonical_grouped_original({owner},{analysis},
              {fixture.jsonb(oracle['command'])},{fixture.jsonb(oracle['original'])},'a10-local');
        """))
    fixture.check(saved.get("status") == "applied", "The duration fixture grouped import failed")
    browser_payload = {
        "ownerId": ids["ownerId"], "analysisId": ids["analysisId"],
        "canonicalVersionId": saved["versionId"],
    }
    if browser:
        db.query("""
            grant select on public.analyses,public.jobs,public.resumes,
              public.resume_versions,public.memberships to service_role;
            grant execute on function public.read_candidate_privacy_access(uuid)
              to service_role;
        """)
    zoom_flags = ["--browser-zoom"] if browser_zoom else []
    if clarification:
        print(node_fixture(db, node, browser_payload, "--browser", "--clarification", *zoom_flags).strip())
        return
    canonical = fixture.literal(str(uuid.UUID(saved["versionId"])))
    first_id = fixture.literal(str(uuid.UUID(first["id"])))
    for document in (first, second):
        payload = fixture.jsonb(document)
        valid = db.query(f"select private.job_requirement_relations_valid({payload});")
        if valid != "t":
            result = json.loads(db.query(f"""
                select jsonb_build_array(private.jd_relation_project({payload}),
                  private.jd_relation_project(private.jd_relation_expected_body({payload})));
            """))
            fields = [key for key in result[0] if result[0][key] != result[1][key]]
            raise RuntimeError(f"PostgreSQL did not admit the typed duration fixture: {fields}")
    jd_first, jd_second = db.query(f"""
        set role service_role;
        select public.save_job_requirement_relations({owner},{analysis},
          {fixture.jsonb(first)},null,gen_random_uuid(),'a10-local')->>'status';
        reset role;
        update public.jobs set description={fixture.literal(second['sourceText'])} where id={job};
        set role service_role;
        select public.save_job_requirement_relations({owner},{analysis},
          {fixture.jsonb(second)},{first_id},gen_random_uuid(),'a10-local')->>'status';
    """).splitlines()
    fixture.check((jd_first, jd_second) == ("applied", "applied"), "Both typed JD versions must save")
    contexts = db.query(f"""
        set role service_role;
        select jsonb_build_object(
          'historical',public.read_requirement_relationship_context({owner},{analysis},
            jsonb_build_object('canonicalVersionId',{canonical}::uuid,'requirementVersionId',{first_id}::uuid)),
          'current',public.read_requirement_relationship_context({owner},{analysis},
            '{{"canonicalVersionId":null,"requirementVersionId":null}}'::jsonb)
        );
    """)
    response = json.loads(contexts)
    for value, requirement in ((response["historical"], first), (response["current"], second)):
        fixture.check(value["status"] == "available"
                      and value["requirements"]["versionId"] == requirement["id"]
                      and value["heads"]["requirementHeadId"] == second["id"]
                      and value["canonical"]["versionId"] == saved["versionId"],
                      "Typed relationship context replaced the selected stored version")
    if not clause_order:
        print(node_fixture(db, node, response).strip())
    if browser:
        print(node_fixture(db, node, {
            **browser_payload,
            "historicalRequirementsId": first["id"], "latestRequirementsId": second["id"],
        }, "--browser", *authoring_flags, *rewrite_flags, *clause_flags, *zoom_flags).strip())
        if authoring:
            count = db.query("select count(*) from public.authoring_events;")
            fixture.check(count == "0", "Staged authoring left an event")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", required=True, type=Path)
    parser.add_argument("--jsonschema-library", required=True, type=Path)
    parser.add_argument("--node", required=True, type=Path)
    parser.add_argument("--browser", action="store_true")
    parser.add_argument("--authoring", action="store_true",
                        help="Extend the browser journey to staged typed authoring")
    parser.add_argument("--rewrite", action="store_true",
                        help="Extend the browser journey to staged rewrite workspace reads")
    parser.add_argument("--clause-order", action="store_true",
                        help="Use a clause-order fixture with temporary local writer access")
    parser.add_argument("--clarification", action="store_true",
                        help="Use a resume without a JD to verify manual clarification")
    parser.add_argument("--browser-zoom", action="store_true",
                        help="Verify the selected authoring flow at 200%% Chromium page zoom")
    args = parser.parse_args()
    if (args.authoring or args.rewrite or args.clause_order or args.clarification) and not args.browser:
        parser.error("--authoring, --rewrite, --clause-order and --clarification require --browser")
    if (args.clause_order and args.clarification
            or (args.clause_order or args.clarification) and (args.authoring or args.rewrite)):
        parser.error("--clause-order and --clarification each use a separate browser fixture")
    if args.browser_zoom and not (args.clarification or args.authoring or args.clause_order or args.rewrite):
        parser.error("--browser-zoom requires an authoring, clarification, clause-order or rewrite browser journey")
    node = args.node.resolve(strict=True)
    version = subprocess.check_output([str(node), "--version"], text=True).strip()
    if not version.startswith("v22."):
        raise RuntimeError("Node.js 22 is required")
    sys.dont_write_bytecode = True
    spec = spec_from_file_location(
        "local_correction_fixture", SCRIPTS / "verify-local-canonical-corrections.py"
    )
    corrections = module_from_spec(spec)
    spec.loader.exec_module(corrections)
    fixture = corrections.local_fixture_module()
    archive = (SCRIPTS / "verify-requirement-relationship-context.sql").read_bytes()
    fixture.check(sha256(archive).hexdigest() == ARCHIVE_SHA, "Score operator changed")
    with tempfile.TemporaryDirectory(prefix="resumide-a10-", dir="/tmp") as temp:
        db = fixture.LocalDatabase(args.pg_bin.resolve(strict=True), Path(temp).resolve())
        try:
            corrections.start_correction_database(
                db, args.jsonschema_library.resolve(strict=True)
            )
            db.query(local_operator(archive, corrections.READY_SHA, fixture.check), timeout=50)
            zero = db.query("""
                select (select count(*) from auth.users),
                  (select count(*) from public.job_requirement_versions),
                  (select count(*) from public.canonical_resume_versions);
            """)
            fixture.check(zero == "0|0|0", "Typed score rollback left fixture rows")
            verify_duration(db, fixture, node, args.browser, args.authoring, args.rewrite,
                            args.clause_order, args.clarification, args.browser_zoom)
        finally:
            db.stop()
    print("Native stored JD/canonical relationship context and rollback passed.")


if __name__ == "__main__":
    main()
