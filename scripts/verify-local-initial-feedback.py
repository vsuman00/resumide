"""Verify a staged feedback reader against disposable socket-only PostgreSQL."""

import argparse
import subprocess
import sys
import tempfile
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pg-bin", required=True, type=Path)
    parser.add_argument("--jsonschema-library", required=True, type=Path)
    parser.add_argument("--node", required=True, type=Path)
    args = parser.parse_args()
    node = args.node.resolve(strict=True)
    if not subprocess.check_output([str(node), "--version"], text=True).startswith("v22."):
        raise RuntimeError("Node.js 22 is required")
    scripts = Path(__file__).resolve().parent
    sys.dont_write_bytecode = True
    spec = spec_from_file_location(
        "local_correction_fixture", scripts / "verify-local-canonical-corrections.py"
    )
    corrections = module_from_spec(spec)
    spec.loader.exec_module(corrections)
    fixture = corrections.local_fixture_module()
    with tempfile.TemporaryDirectory(prefix="resumide-a13-", dir="/tmp") as temp:
        db = fixture.LocalDatabase(args.pg_bin.resolve(strict=True), Path(temp).resolve())
        try:
            corrections.start_correction_database(db, args.jsonschema_library.resolve(strict=True))
            subprocess.run(
                [str(node), "node_modules/vite-node/vite-node.mjs", "--config",
                 "vitest.config.ts", "scripts/verify-local-initial-feedback.ts"],
                cwd=scripts.parent,
                env={
                    **db.env,
                    "RESUMIDE_PRIVATE_VERIFY": "aa7-owned-synthetic",
                    "RESUMIDE_A13_SOCKET": str(db.directory),
                    "RESUMIDE_A13_PSQL": db.psql[0],
                    "NODE_ENV": "test",
                    "AI_ENABLED": "false",
                    "OPENAI_API_KEY": "synthetic-unused",
                    "SUPABASE_URL": "https://local-a13.invalid",
                    "SUPABASE_PUBLISHABLE_KEY": "synthetic-unused",
                    "SUPABASE_SECRET_KEY": "synthetic-unused",
                },
                timeout=35,
                check=True,
            )
        finally:
            db.stop()


if __name__ == "__main__":
    main()
