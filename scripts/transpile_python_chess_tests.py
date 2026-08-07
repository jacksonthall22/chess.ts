#!/usr/bin/env python3
"""Compatibility entrypoint for the deterministic Python-test compiler."""

import sys
from pathlib import Path


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from python_test_compiler.lower import UnsupportedSyntax
from python_test_compiler.selection import TRANSLATED_TESTS
from python_test_compiler.suite import compile_suite, sync_compiled_suite


GENERATED_TESTS = TRANSLATED_TESTS


def render_generated_tests(source: str | None = None) -> str:
    return compile_suite(source).typescript


def sync_generated_tests(*, check: bool) -> int:
    return sync_compiled_suite(check=check)


if __name__ == "__main__":
    raise SystemExit(
        "Run scripts/sync_python_chess_tests.py; it owns all generated artifacts."
    )
