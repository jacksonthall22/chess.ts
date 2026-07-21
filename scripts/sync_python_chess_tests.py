#!/usr/bin/env python3
"""Track the one-to-one TypeScript port of the frozen python-chess tests.

This deliberately performs only transformations that are syntactically safe:
it extracts upstream unittest class/method identities with Python's AST, scans
the TypeScript suite for exact source-line provenance, and generates explicit
Vitest TODOs for every test that has not been translated yet.

Test bodies remain a human-reviewed translation. Removing a TODO requires
structured ``registerTestCase()`` metadata matching the upstream class,
method, and source line.
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import json
import subprocess
from dataclasses import dataclass
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
UPSTREAM_ROOT = REPOSITORY_ROOT / "python-chess"
UPSTREAM_TEST = UPSTREAM_ROOT / "test.py"
TYPESCRIPT_TEST_ROOT = REPOSITORY_ROOT / "chess" / "test"
GENERATED_TODOS = TYPESCRIPT_TEST_ROOT / "upstream-todos.test.ts"
TYPESCRIPT_METADATA_EXTRACTOR = (
    REPOSITORY_ROOT / "scripts" / "extract_typescript_test_metadata.mjs"
)

UPSTREAM_COMMIT = "4d9b3bfd860bfa95731d4e208fd98c7c10a15533"

EXPECTED_GIT_BLOBS = {
    "chess/__init__.py": "84bfa632abdc2e3b55290847ecc1a162a044cfd8",
    "chess/engine.py": "913940190fb17a2184ed8c9dcd48ca0eacb2ff20",
    "chess/gaviota.py": "8beb18d4d0db711d1c1c1d5f4dac7c2a9a447e66",
    "chess/pgn.py": "f40980d4889ac7436f42711267c16c2af32d1155",
    "chess/polyglot.py": "a7d6807c4f912ab16d70b27648680d8f6f318957",
    "chess/svg.py": "7e8facf99b22ab7b07c6413bfacc92dd3479f926",
    "chess/syzygy.py": "0c6b7822c6e794d1ab7d6bf36148b48e23a526a7",
    "chess/variant.py": "6e9161dc89faeda13f563ddcc7dbe589ee44a2a9",
    "test.py": "2ebd357d063e01d0d861e93a92ef71dd9730a214",
    "data/pgn/anastasian-lewis.pgn": "04faad1e205c242877e7170f2ca5bda2ed0e2260",
    "data/pgn/antichess-programfox.pgn": "d4e9cce919ee16a9dabcd3395c00162fa8d3501d",
    "data/pgn/chessbase-empty-line.pgn": "f343a3d47a46bb54dfeae3f7332e23982397c1d8",
    "data/pgn/cutechess-fischerrandom.pgn": "2fdbd09feef70565f78007f01d1dbf594f1831eb",
    "data/pgn/kasparov-deep-blue-1997.pgn": "7b5fcf0b0d5fc3afb9a4d5588cc386a25b9ddda9",
    "data/pgn/knightvuillaume-jannlee-zh-lichess.pgn": "905501c3908cdbc780acd0bede5218f583808679",
    "data/pgn/molinari-bordais-1979.pgn": "d5dee8611ca42fe569fe05410de358b8cdb36915",
    "data/pgn/nepomniachtchi-liren-game1.pgn": "ea32341543651e045b424668caedb4865db33921",
    "data/pgn/saturs-jannlee-zh-lichess.pgn": "f03040a2819ce22d4256ca8a2c1f32d46891e623",
    "data/pgn/stockfish-learning.pgn": "6504c8593b736f9f333da0627b6806676be3edfa",
    "data/pgn/uci-moves.pgn": "32c70f235305c456c6d222c9fff988b0039c4e58",
    "data/pgn/utf8-bom.pgn": "665e7775a54659136416dba1c1e33276f6ea8a7e",
}

@dataclass(frozen=True)
class UpstreamTest:
    class_name: str
    method_name: str
    line: int


@dataclass(frozen=True)
class TranslatedTest:
    path: Path
    class_name: str
    method_name: str


def git_blob_id(contents: bytes) -> str:
    header = f"blob {len(contents)}\0".encode()
    return hashlib.sha1(header + contents).hexdigest()


def verify_submodule_pin() -> None:
    top_level_result = subprocess.run(
        ["git", "-C", str(UPSTREAM_ROOT), "rev-parse", "--show-toplevel"],
        check=False,
        capture_output=True,
        text=True,
    )
    if (
        top_level_result.returncode != 0
        or Path(top_level_result.stdout.strip()).resolve() != UPSTREAM_ROOT.resolve()
    ):
        raise SystemExit(
            "The python-chess submodule is not initialized. Run "
            "`git submodule update --init` and retry."
        )

    commit_result = subprocess.run(
        ["git", "-C", str(UPSTREAM_ROOT), "rev-parse", "HEAD"],
        check=False,
        capture_output=True,
        text=True,
    )
    if commit_result.returncode != 0:
        raise SystemExit(
            "The python-chess submodule is not initialized. Run "
            "`git submodule update --init` and retry."
        )

    actual_commit = commit_result.stdout.strip()
    if actual_commit != UPSTREAM_COMMIT:
        raise SystemExit(
            f"python-chess must be pinned to {UPSTREAM_COMMIT}, got {actual_commit}"
        )


def verify_pinned_sources() -> None:
    mismatches = []
    for relative_path, expected in EXPECTED_GIT_BLOBS.items():
        source_path = UPSTREAM_ROOT / relative_path
        actual = git_blob_id(source_path.read_bytes())
        if actual != expected:
            mismatches.append(f"{relative_path}: expected {expected}, got {actual}")

    if mismatches:
        details = "\n".join(f"  - {mismatch}" for mismatch in mismatches)
        raise SystemExit(
            f"Frozen sources no longer match python-chess {UPSTREAM_COMMIT}:\n{details}"
        )


def extract_upstream_tests() -> list[UpstreamTest]:
    tree = ast.parse(UPSTREAM_TEST.read_text(), filename=str(UPSTREAM_TEST))
    tests = []

    for node in tree.body:
        if not isinstance(node, ast.ClassDef) or not node.name.endswith("TestCase"):
            continue

        for member in node.body:
            if not isinstance(member, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            if member.name.startswith("test_"):
                tests.append(UpstreamTest(node.name, member.name, member.lineno))

    return tests


def translated_source_lines() -> dict[int, TranslatedTest]:
    translated: dict[int, TranslatedTest] = {}
    test_paths = [
        path
        for path in sorted(TYPESCRIPT_TEST_ROOT.glob("*.test.ts"))
        if path != GENERATED_TODOS
    ]
    relative_test_paths = [
        str(path.relative_to(REPOSITORY_ROOT)) for path in test_paths
    ]
    result = subprocess.run(
        ["node", str(TYPESCRIPT_METADATA_EXTRACTOR), *relative_test_paths],
        cwd=REPOSITORY_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise SystemExit(
            "Could not extract structured TypeScript test metadata:\n"
            + result.stderr.strip()
        )

    for registration in json.loads(result.stdout):
        test_path = REPOSITORY_ROOT / registration["path"]
        class_name = registration["className"]
        method_name = registration["methodName"]
        line = registration["line"]
        previous = translated.get(line)
        if previous is not None:
            raise SystemExit(
                f"Upstream test.py:{line} is represented twice: "
                f"{previous.path.relative_to(REPOSITORY_ROOT)} and "
                f"{test_path.relative_to(REPOSITORY_ROOT)}"
            )
        translated[line] = TranslatedTest(test_path, class_name, method_name)

    return translated


def render_todos(tests: list[UpstreamTest], translated_lines: set[int]) -> str:
    pending = [test for test in tests if test.line not in translated_lines]
    lines = [
        "// Generated by scripts/sync_python_chess_tests.py. Do not edit by hand.",
        "// Each TODO is removed only by matching registerTestCase() metadata.",
        "import { describe, test } from 'vitest'",
        "",
    ]

    current_class = None
    for pending_test in pending:
        if pending_test.class_name != current_class:
            if current_class is not None:
                lines.extend(["})", ""])
            current_class = pending_test.class_name
            lines.append(f"describe('{current_class} — translation pending', () => {{")

        lines.append(
            "  test.todo("
            f"'{pending_test.method_name} "
            f"(python-chess test.py:{pending_test.line})',"
            ")"
        )

    if current_class is not None:
        lines.append("})")

    lines.extend(
        [
            "",
            f"// Upstream pin: python-chess {UPSTREAM_COMMIT}",
            f"// Total upstream tests: {len(tests)}",
            f"// Translated tests: {len(translated_lines)}",
            f"// Pending tests: {len(pending)}",
            "",
        ]
    )
    return "\n".join(lines)


def typescript_method_name(python_method_name: str) -> str:
    head, *tail = python_method_name.split("_")
    return head + "".join(part.capitalize() for part in tail)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--check",
        action="store_true",
        help="Fail if the generated TODO ledger is out of date instead of writing it.",
    )
    args = parser.parse_args()

    verify_submodule_pin()
    verify_pinned_sources()
    upstream_tests = extract_upstream_tests()
    tests_by_line = {test.line: test for test in upstream_tests}
    translated = translated_source_lines()

    unknown_lines = sorted(set(translated) - set(tests_by_line))
    if unknown_lines:
        raise SystemExit(
            "TypeScript tests reference lines that are not upstream test methods: "
            + ", ".join(map(str, unknown_lines))
        )

    mismatched_methods = []
    for line, translated_test in translated.items():
        upstream_test = tests_by_line[line]
        expected_method = typescript_method_name(upstream_test.method_name)
        if (
            translated_test.class_name != upstream_test.class_name
            or translated_test.method_name != expected_method
        ):
            mismatched_methods.append(
                f"test.py:{line} is {upstream_test.class_name}."
                f"{upstream_test.method_name}, but "
                f"{translated_test.path.relative_to(REPOSITORY_ROOT)} records "
                f"{translated_test.class_name}.{translated_test.method_name}"
            )

    if mismatched_methods:
        details = "\n".join(f"  - {mismatch}" for mismatch in mismatched_methods)
        raise SystemExit(f"Mismatched translated test identities:\n{details}")

    expected = render_todos(upstream_tests, set(translated))

    if args.check:
        actual = GENERATED_TODOS.read_text() if GENERATED_TODOS.exists() else ""
        if actual != expected:
            raise SystemExit(
                "The upstream test ledger is stale. Run "
                "`python3 scripts/sync_python_chess_tests.py` and commit the result."
            )
    else:
        GENERATED_TODOS.write_text(expected)

    print(
        f"python-chess {UPSTREAM_COMMIT}: {len(translated)}/{len(upstream_tests)} "
        "tests translated"
    )


if __name__ == "__main__":
    main()
