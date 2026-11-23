"""Exercise grouped import races on a fresh PostgreSQL cluster with no TCP listener."""

import argparse
import json
import re
import subprocess
import sys
import tempfile
import time
import uuid
from hashlib import sha256
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VERIFIER = ROOT / "scripts/verify-grouped-original-admission.sql"
VERIFIER_SHA = "d3b3e9f2b62939f7420db7aa8bac86a07deeaf36b69845b34d3dc347d79c5201"
READY_SHA = "21abbe38e5533a9dfc220d85cf67632741b17771b04257278e9dced3ad7a59c7"


def check(condition, message):
    if not condition:
        raise RuntimeError(message)


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def jsonb(value):
    return literal(json.dumps(value, separators=(",", ":"))) + "::jsonb"


def load_oracle():
    data = VERIFIER.read_bytes()
    check(sha256(data).hexdigest() == VERIFIER_SHA, "Grouped import oracle changed")
    match = re.search(r"\$oracle\$\n(.*?)\n\$oracle\$::jsonb;", data.decode(), re.S)
    check(match is not None, "Grouped import oracle missing")
    return json.loads(match[1])


class LocalDatabase:
    def __init__(self, pg_bin, directory):
        self.pg_bin = pg_bin
        self.directory = directory
        self.data = directory / "data"
        self.env = {"PATH": "/usr/bin:/bin", "LC_ALL": "C"}
        self.psql = [
            str(pg_bin / "psql"), "-X", "-Atq", "-v", "ON_ERROR_STOP=1",
            "-h", str(directory), "-U", "postgres", "-d", "postgres",
        ]

    def tool(self, name, *args):
        subprocess.run(
            [str(self.pg_bin / name), *map(str, args)],
            env=self.env,
            check=True,
            stdout=subprocess.DEVNULL,
            timeout=35,
        )

    def query(self, query, *, timeout=20):
        result = subprocess.run(
            self.psql, input=query, env=self.env, text=True, capture_output=True,
            timeout=timeout,
        )
        check(result.returncode == 0, result.stderr.strip()[-1000:])
        return result.stdout.strip()

    def start(self, library, *, packet_flag="--entry-association-alias-repair",
              operation_count=98, ready_sha=READY_SHA):
        self.tool("initdb", "-D", self.data, "--no-sync", "--encoding=UTF8",
                  "--auth=trust", "-U", "postgres")
        options = (
            f"-c listen_addresses='' -c unix_socket_directories={self.directory} "
            "-c unix_socket_permissions=0700 -c statement_timeout=15000"
        )
        self.tool("pg_ctl", "-w", "-D", self.data, "-l", self.directory / "server.log",
                  "-o", options, "start")
        version = self.query(f"""
            select current_setting('server_version_num')
             where inet_server_addr() is null and current_setting('listen_addresses')=''
               and current_setting('data_directory')={literal(self.data)};
        """)
        check(version.isdecimal() and 170000 <= int(version) < 180000,
              "Socket-only PostgreSQL 17 fixture required")
        self.query(f"""
            create role anon;
            create role authenticated;
            create role service_role bypassrls;
            create schema auth;
            create schema storage;
            create schema extensions;
            create extension pgcrypto with schema extensions;
            alter database postgres set search_path to public, extensions;
            create table auth.users(id uuid primary key, email text);
            create function auth.uid() returns uuid language sql stable
              as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
            create table storage.buckets(id text primary key,name text not null,
              public boolean,file_size_limit bigint,allowed_mime_types text[]);
            create table storage.objects(id uuid primary key);
            create function extensions.jsonb_matches_schema(json,jsonb) returns boolean
              as {literal(library)}, 'jsonb_matches_schema_wrapper'
              language c immutable strict parallel safe;
        """)
        check(self.query("""
            select extensions.jsonb_matches_schema('{"type":"integer"}','2'),
              not extensions.jsonb_matches_schema('{"type":"integer"}','true');
        """) == "t|t", "Native JSON Schema library did not validate inputs")
        self.query((ROOT / "scripts/verify-empty-supabase-target.sql").read_text())
        migrations = self.directory / "successor"
        subprocess.run(
            [sys.executable, str(ROOT / "scripts/materialize-managed-schema-successor.py"),
             packet_flag, str(migrations)],
            check=True, env=self.env, timeout=20,
        )
        operations = sorted(migrations.glob("*.sql"))
        check(len(operations) == operation_count, "Unexpected grouped import schema inventory")
        for path in operations:
            source = path.read_text()
            if path.name.startswith("20261012054243_"):
                require_extension = "create extension if not exists pg_jsonschema with schema extensions;"
                check(source.count(require_extension) == 1, "JSON Schema migration changed")
                source = source.replace(require_extension, "-- Native function registered in this cluster.")
            self.query(source)
        readiness = self.query("""
            select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'),
              private.canonical_correction_write_ready(),
              not has_function_privilege('service_role', writer.oid, 'EXECUTE'),
              not has_function_privilege('authenticated', writer.oid, 'EXECUTE'),
              not has_function_privilege('anon', writer.oid, 'EXECUTE')
            from pg_catalog.pg_proc p, pg_catalog.pg_proc writer
            where p.oid='private.canonical_correction_write_ready()'::regprocedure
              and writer.oid='public.import_canonical_grouped_original(uuid,uuid,jsonb,jsonb,text)'::regprocedure;
        """)
        check(readiness == f"{ready_sha}|t|t|t|t", "Grouped writer readiness or grants differ")

    def stop(self):
        if (self.data / "postmaster.pid").exists():
            self.tool("pg_ctl", "-w", "-D", self.data, "-m", "immediate", "stop")

    def wait_for(self, query):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            if self.query(query, timeout=2) == "t":
                return
            time.sleep(0.04)
        raise RuntimeError("Expected transaction state was never observed")


def seed(db, oracle):
    scope = oracle["scope"]
    binding_ids = ("ownerId", "resumeId", "analysisId", "sourceId", "attemptId")
    serialized = json.dumps(oracle)
    for key in binding_ids:
        original = str(uuid.UUID(scope[key]))
        serialized = serialized.replace(json.dumps(original), json.dumps(str(uuid.uuid4())))
    fixture = json.loads(serialized)
    owner, resume, analysis, source, attempt = (
        literal(str(uuid.UUID(fixture["scope"][key]))) for key in binding_ids
    )
    org_value = db.query(f"""
        insert into auth.users(id,email) values ({owner},'grouped-race-'||{owner}||'@example.test');
        select id from public.organizations where owner_id={owner};
    """)
    org_id = str(uuid.UUID(org_value))
    org = literal(org_id)
    command = fixture["command"]
    command["normalForm"]["binding"]["organizationId"] = org_id
    fixture["original"]["organizationId"] = org_id
    input_hash = literal(fixture["scope"]["inputSha256"])
    db.query(f"""
        begin;
        insert into public.resumes(id,organization_id,owner_id,display_name)
          values ({resume},{org},{owner},'Synthetic grouped race');
        insert into public.resume_versions(id,resume_id,organization_id,owner_id,storage_key,checksum,bytes,media_type)
          values ({source},{resume},{org},{owner},private.r17_storage_key({org},{resume},{source}),
                  {input_hash},1024,'application/pdf');
        insert into public.analyses(id,resume_version_id,organization_id,owner_id,status,idempotency_key)
          values ({analysis},{source},{org},{owner},'needs_ocr',gen_random_uuid());
        delete from public.analysis_jobs where analysis_id={analysis};
        insert into public.document_evidence_attempts(id,analysis_id,organization_id,owner_id,resume_version_id,input_sha256,attempt_number,envelope)
          values ({attempt},{analysis},{org},{owner},{source},{input_hash},1,{jsonb(fixture["envelope"])});
        commit;
    """)
    command["previewHash"] = db.query(f"""
        select private.grouped_import_command_sha256(
          private.grouped_original_atoms({jsonb(command["normalForm"])}));
    """)
    request = f"""
        select public.import_canonical_grouped_original(
          {owner},{analysis},{jsonb(command)},{jsonb(fixture["original"])},'local-grouped-race');
    """
    inventory = f"""
        select
          (select count(*) from public.candidate_entry_association_batches where owner_id={owner}),
          (select count(*) from public.canonical_resume_versions where owner_id={owner}),
          (select count(*) from public.candidate_entry_association_groups where owner_id={owner}),
          (select count(*) from public.candidate_entry_association_members where owner_id={owner}),
          (select count(*) from public.resume_facts where owner_id={owner}),
          (select count(*) from public.canonical_entry_association_links where owner_id={owner}),
          (select count(*) from public.audit_events where actor_id={owner} and action='canonical.grouped_import'),
          (select count(*) from public.data_requests where user_id={owner} and kind='deletion' and status='queued'),
          (select version_id from public.canonical_resume_heads where owner_id={owner});
    """
    return request, inventory, owner, org


def start_session(db, name, query):
    child = subprocess.Popen(
        db.psql, env={**db.env, "PGAPPNAME": name}, text=True,
        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    child.stdin.write("set default_transaction_isolation='read committed'; "
                      "set lock_timeout='10s'; set idle_in_transaction_session_timeout='15s';\n" + query)
    child.stdin.flush()
    return child


def finish_session(child):
    child.stdin.close()
    child.stdin = None
    stdout, stderr = child.communicate(timeout=15)
    check(child.returncode == 0, stderr.strip()[-1000:])
    return stdout.strip()


def run_race(db, holding_sql, waiting_sql):
    holder_name, waiter_name = "grouped-race-holder", "grouped-race-waiter"
    holder = start_session(db, holder_name, "begin isolation level read committed;\n" + holding_sql)
    waiter = None
    try:
        db.wait_for(f"""
            select exists(select 1 from pg_stat_activity
              where application_name={literal(holder_name)} and state='idle in transaction');
        """)
        waiter = start_session(db, waiter_name, waiting_sql)
        db.wait_for(f"""
            select exists(select 1 from pg_stat_activity w
              join pg_stat_activity h on h.pid=any(pg_blocking_pids(w.pid))
              where w.application_name={literal(waiter_name)} and h.application_name={literal(holder_name)}
                and w.wait_event_type='Lock' and w.wait_event='advisory');
        """)
        holder.stdin.write("commit;\n")
        return finish_session(holder), json.loads(finish_session(waiter))
    finally:
        for session in (waiter, holder):
            if session and session.poll() is None:
                session.kill()
                session.wait(timeout=3)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", required=True, type=Path)
    parser.add_argument("--jsonschema-library", required=True, type=Path)
    args = parser.parse_args()
    oracle = load_oracle()
    library = args.jsonschema_library.resolve(strict=True)
    with tempfile.TemporaryDirectory(prefix="resumide-grouped-", dir="/tmp") as temp:
        db = LocalDatabase(args.pg_bin.resolve(strict=True), Path(temp).resolve())
        try:
            db.start(library)
            request, inventory, _, _ = seed(db, oracle)
            saved, replay = run_race(db, request, request)
            saved = json.loads(saved)
            check(saved["status"] == "applied" and saved["idempotent"] is False
                  and saved["scoringEligible"] is False, "Holder did not save the original once")
            expected = {**saved, "idempotent": True}
            check(replay == expected, "Waiting identical command did not return the original receipt")
            check(db.query(inventory) == f"1|1|2|6|6|2|1|0|{saved['versionId']}",
                  "Concurrent replay wrote duplicate or incomplete data")

            request, inventory, owner, org = seed(db, oracle)
            _, blocked = run_race(db, f"""
                select private.lock_candidate_owners(array[{owner}::uuid]);
                insert into public.data_requests(organization_id,user_id,kind)
                  values ({org},{owner},'deletion');
            """, request)
            check(blocked["status"] == "not_found" and blocked["scoringEligible"] is False, "Waiting import did not recheck committed deletion")
            check(db.query(inventory) == "0|0|0|0|0|0|0|1|", "Privacy-blocked import left rows")
        finally:
            db.stop()
    print("Observed both advisory lock waits. Exact replay and committed deletion checks passed.")


if __name__ == "__main__":
    main()
