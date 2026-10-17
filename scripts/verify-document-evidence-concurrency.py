#!/usr/bin/env python3
"""Local two-session AA014 CAS check; committed synthetic fixtures always clean up.

Requires psql and local migrations. Reuses the SQL verifier's fixture setup.
No candidate files, hosted database or provider calls are used.
"""

import os
from pathlib import Path
import subprocess
import tempfile
import time
from urllib.parse import urlparse
import uuid


def main():
    database_url = os.environ.get("DOCUMENT_EVIDENCE_TEST_DB_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")
    if urlparse(database_url).hostname not in ("127.0.0.1", "localhost", "::1"):
        raise RuntimeError("Concurrency fixtures require an isolated local database")
    ids = {name: str(uuid.uuid4()) for name in ["owner_id", "other_id", "analysis_id", "attempt_id"]}
    command = ["psql", database_url, "-X", "-At", "-v", "ON_ERROR_STOP=1"]

    def execute(sql):
        result = subprocess.run(command + ["-c", sql], capture_output=True, text=True)
        if result.returncode:
            raise RuntimeError(result.stderr)
        return result.stdout.strip()

    source = Path(__file__).with_name("verify-document-evidence.sql").read_text()
    prefix = source[:source.index("    for test_case in 1..10 loop")]
    for name, value in ids.items():
        prefix = prefix.replace(name + " uuid := gen_random_uuid()", name + " uuid := '" + value + "'")
    setup = prefix + "    perform public.persist_document_evidence(analysis_id,envelope,'concurrency-test','concurrency-test');\n  end;\nend;\n$$;\n"
    sessions = []
    try:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".sql") as fixture:
            fixture.write(setup)
            fixture.flush()
            result = subprocess.run(command + ["-f", fixture.name], capture_output=True, text=True)
            if result.returncode:
                raise RuntimeError(result.stderr)

        def rpc(key):
            return "select public.correct_document_evidence('%s','%s','%s',0,'email','confirm','alex@example.test','email-1','%s','concurrent-test');" % (ids["analysis_id"], ids["attempt_id"], ids["owner_id"], key)

        session_name = "aa014-cas-" + str(uuid.uuid4())
        first_sql = "begin; set local application_name='%s'; select id from public.analyses where id='%s' for update; select pg_sleep(2); %s commit;" % (session_name, ids["analysis_id"], rpc(uuid.uuid4()))
        first = subprocess.Popen(command + ["-c", first_sql], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        sessions.append(first)
        deadline = time.monotonic() + 5
        while execute("select count(*) from pg_stat_activity where application_name='%s' and wait_event='PgSleep'" % session_name) != "1":
            if first.poll() is not None or time.monotonic() >= deadline:
                raise RuntimeError("First session did not hold the analysis lock")
            time.sleep(0.02)
        second = subprocess.Popen(command + ["-c", rpc(uuid.uuid4())], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        sessions.append(second)
        first_output, first_error = first.communicate(timeout=15)
        second_output, second_error = second.communicate(timeout=15)
        if first.returncode or second.returncode:
            raise RuntimeError(first_error + second_error)
        if '"status": "applied"' not in first_output or '"revision": 1' not in first_output:
            raise RuntimeError("First writer did not apply revision 1")
        if '"status": "conflict"' not in second_output:
            raise RuntimeError("Concurrent stale writer bypassed revision CAS")
        if execute("select count(*) from public.evidence_corrections where analysis_id='%s'" % ids["analysis_id"]) != "1":
            raise RuntimeError("Concurrent writers created multiple revision events")
        print("PASS: two concurrent writers; one applied revision 1, one conflict, one event")
    finally:
        for session in sessions:
            if session.poll() is None:
                session.terminate()
                session.communicate(timeout=5)
        execute("delete from auth.users where id in ('%s','%s')" % (ids["owner_id"], ids["other_id"]))


if __name__ == "__main__":
    main()
