"""Run the correction-to-export journey against disposable PostgreSQL."""

import argparse
import sys
import subprocess
import tempfile
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", required=True, type=Path)
    parser.add_argument("--jsonschema-library", required=True, type=Path)
    parser.add_argument("--node", required=True, type=Path)
    parser.add_argument("--browser", action="store_true",
                        help="Use Chromium and the local web build")
    parser.add_argument("--browser-zoom", action="store_true",
                        help="Verify the browser journey at 200%% Chromium page zoom")
    args = parser.parse_args()
    if args.browser_zoom and not args.browser:
        parser.error("--browser-zoom requires --browser")
    node = args.node.resolve(strict=True)
    version = subprocess.check_output([str(node), "--version"], text=True).strip()
    if not version.startswith("v22."):
        raise RuntimeError("Node.js 22 is required")
    scripts = Path(__file__).resolve().parent
    sys.dont_write_bytecode = True
    spec = spec_from_file_location(
        "local_correction_fixture", scripts / "verify-local-canonical-corrections.py"
    )
    corrections = module_from_spec(spec)
    spec.loader.exec_module(corrections)
    fixture = corrections.local_fixture_module()
    with tempfile.TemporaryDirectory(prefix="resumide-cv04-", dir="/tmp") as temp:
        db = fixture.LocalDatabase(args.pg_bin.resolve(strict=True), Path(temp).resolve())
        try:
            corrections.start_correction_database(
                db, args.jsonschema_library.resolve(strict=True)
            )
            # The bare cluster lacks Supabase's base Data API service-role grants.
            db.query("""
                grant select on public.analyses, public.resumes,
                  public.resume_versions, public.memberships to service_role;
            """)
            metadata = db.query("""
                select concat_ws('|', metadata->>'schemaReady',
                  metadata->>'accessExecutable', metadata->>'exportExecutable')
                from (select public.read_owned_ai_disposition_readiness() as metadata) s;
            """)
            fixture.check(metadata == "true|false|false",
                          "Expected staged privacy access and export grants")
            # This grant is only for the lifetime of the disposable cluster.
            db.query("""
                grant execute on function public.read_candidate_privacy_access(uuid)
                  to service_role;
            """)
            subprocess.run(
                [str(node), "node_modules/vite-node/vite-node.mjs",
                 "--config", "vitest.config.ts", "scripts/verify-local-correction-journey.ts"],
                cwd=scripts.parent,
                env={
                    **db.env,
                    "RESUMIDE_PRIVATE_VERIFY": "aa7-owned-synthetic",
                    "RESUMIDE_CV04_SOCKET": str(db.directory),
                    "RESUMIDE_CV04_PSQL": db.psql[0],
                    "RESUMIDE_CV04_BROWSER": "true" if args.browser else "false",
                    "RESUMIDE_CV04_BROWSER_ZOOM": "true" if args.browser_zoom else "false",
                    "NODE_ENV": "test",
                    "AI_ENABLED": "false",
                    "OPENAI_API_KEY": "synthetic-unused",
                    "SUPABASE_URL": "https://local-cv04.invalid",
                    "SUPABASE_PUBLISHABLE_KEY": "synthetic-unused",
                    "SUPABASE_SECRET_KEY": "synthetic-unused",
                    "NATIVE_EVIDENCE_ENABLED": "true",
                    "EVIDENCE_REVIEW_ENABLED": "true",
                    "CANONICAL_AUTHORING_ENABLED": "true",
                    "CANONICAL_CORRECTIONS_ENABLED": "true",
                    "ARTIFACT_RENDERING_ENABLED": "true",
                },
                check=True,
                timeout=100 if args.browser else 70,
            )
        finally:
            db.stop()


if __name__ == "__main__":
    main()
