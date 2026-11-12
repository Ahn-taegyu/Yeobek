"""Portable entry point for the repository's local knowledge workflow."""
from __future__ import annotations

import argparse
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
VENV = ROOT / "docs" / ".venv"
PYTHON = VENV / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python")
KB = ROOT / "docs" / "tools" / "kb.py"


def run(*command: str | Path) -> int:
    return subprocess.run([str(part) for part in command], cwd=ROOT, check=False).returncode


def ready() -> bool:
    if not PYTHON.is_file():
        return False
    result = subprocess.run(
        [str(PYTHON), "-c", "import sys, yaml; assert sys.version_info >= (3, 12)"],
        cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False,
    )
    return result.returncode == 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("setup", "verify", "check", "build", "search", "context"))
    args, forwarded = parser.parse_known_args(argv)
    if args.command in {"setup", "verify"} and forwarded:
        parser.error(f"{args.command} does not accept extra arguments")
    if sys.version_info < (3, 12):
        parser.error("Python 3.12 or later is required")

    if args.command == "setup":
        if not PYTHON.is_file():
            code = run(sys.executable, "-m", "venv", VENV)
            if code:
                return code
        code = run(PYTHON, "-m", "pip", "install", "--disable-pip-version-check",
                   "-r", ROOT / "docs" / "tools" / "requirements.txt")
        if code:
            return code

    if not ready():
        print("Knowledge environment is not ready. Run: python scripts/knowledge.py setup", file=sys.stderr)
        return 2

    if args.command in {"setup", "verify"}:
        code = run(PYTHON, KB, "check")
        if code:
            return code
        if args.command == "verify":
            code = run(PYTHON, "-m", "unittest", "discover", "-s", "docs/tools", "-p", "test_*.py")
            if code:
                return code
        return run(PYTHON, KB, "build")
    return run(PYTHON, KB, args.command, *forwarded)


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except OSError as exc:
        print(f"Knowledge command failed: {exc}", file=sys.stderr)
        raise SystemExit(1)
