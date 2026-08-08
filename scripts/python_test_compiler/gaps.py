"""Declarative, source-addressed parity gaps in the frozen test baseline.

The compiler must always obtain test logic, including assertion arguments, from
the Python AST.  This module contains no replacement TypeScript and no copied
expected expressions.  It identifies only the exact AST boundaries where the
current chess.ts implementation is known to diverge, plus the observation the
generated harness should enforce at that boundary.

Selectors use an upstream test identity and a complete Python source span.  A
selector is therefore independent of generated names, formatting, and output
file layout.  ``validate_manifest()`` can additionally resolve every selector
against a parsed ``SourceUnit`` before code generation begins.
"""

from __future__ import annotations

import ast
import hashlib
import json
import re
from dataclasses import dataclass
from enum import Enum
from typing import Iterable

from .model import SourceSpan, SourceUnit, TestIdentity


class GapManifestError(ValueError):
    """The parity-gap manifest is internally inconsistent or stale."""


class GapCategory(str, Enum):
    """Why chess.ts currently differs from the frozen Python behavior."""

    DEFECT = "defect"
    UNIMPLEMENTED_CAPABILITY = "unimplemented-capability"


class ExpectedBehavior(str, Enum):
    """What the generated harness should observe at one source boundary."""

    ASSERTION_MISMATCH = "assertion-mismatch"
    ERROR = "error"


class ErrorFamily(str, Enum):
    """Cross-runtime error categories understood by the test harness."""

    TYPE_ERROR = "TypeError"
    VALUE_ERROR = "chess.ValueError"


class ErrorContinuation(str, Enum):
    """Whether execution can safely resume after an expected current error."""

    CONTINUE = "continue"
    ABORT_TEST = "abort-test"


@dataclass(frozen=True, order=True, slots=True)
class NodeSelector:
    """An exact AST node in one frozen upstream test method."""

    test: TestIdentity
    span: SourceSpan
    node_type: str
    fingerprint: str | None = None

    def __post_init__(self) -> None:
        if not self.node_type:
            raise ValueError("a node selector requires an AST node type")
        if self.fingerprint is not None and not re.fullmatch(
            r"[0-9a-f]{64}", self.fingerprint
        ):
            raise ValueError("an AST fingerprint must be a lowercase SHA-256 digest")

    @property
    def stable_id(self) -> str:
        start = self.span.start_position
        end = self.span.end_position
        return (
            f"{self.test}@{start[0]}:{start[1]}-"
            f"{end[0]}:{end[1]}:{self.node_type}"
        )


@dataclass(frozen=True, slots=True)
class AssertionMismatch:
    """The exact upstream assertion currently fails in chess.ts.

    The compiler must lower the original assertion call from the selected AST
    node, then make failure of that call the expected current observation.  No
    assertion operand is repeated in this manifest.
    """

    behavior: ExpectedBehavior = ExpectedBehavior.ASSERTION_MISMATCH


@dataclass(frozen=True, slots=True)
class ExpectedError:
    """The selected boundary currently raises this narrowly identified error."""

    family: ErrorFamily
    message_pattern: str
    continuation: ErrorContinuation
    behavior: ExpectedBehavior = ExpectedBehavior.ERROR

    def __post_init__(self) -> None:
        if not self.message_pattern:
            raise ValueError("an expected error requires a message pattern")
        try:
            re.compile(self.message_pattern)
        except re.error as error:
            raise ValueError(
                f"invalid expected-error pattern {self.message_pattern!r}"
            ) from error


GapExpectation = AssertionMismatch | ExpectedError


@dataclass(frozen=True, slots=True)
class GapCase:
    """One exact manifestation of a root parity gap.

    ``boundary`` is the node wrapped by generated test code.  For an error,
    ``cause`` may identify a more deeply nested expression that is expected to
    throw.  Keeping both spans lets the compiler wrap an entire assertion so it
    can continue, while still proving which original expression owns the gap.
    """

    root_id: str
    boundary: NodeSelector
    expectation: GapExpectation
    cause: NodeSelector | None = None

    def __post_init__(self) -> None:
        if not self.root_id:
            raise ValueError("a gap case requires a root id")
        if isinstance(self.expectation, AssertionMismatch) and self.cause is not None:
            raise ValueError("an assertion mismatch cannot have an error cause")
        if isinstance(self.expectation, ExpectedError) and self.cause is None:
            raise ValueError("an expected error requires an exact cause selector")
        if self.cause is not None:
            if self.cause.test != self.boundary.test:
                raise ValueError("a gap boundary and cause must belong to one test")
            if not self.boundary.span.contains(self.cause.span):
                raise ValueError("an error cause must be inside its wrapped boundary")

    @property
    def stable_id(self) -> str:
        return f"{self.root_id}:{self.boundary.stable_id}"


@dataclass(frozen=True, slots=True)
class GapRoot:
    """One production cause shared by one or more upstream tests."""

    root_id: str
    category: GapCategory
    summary: str
    affected_tests: tuple[TestIdentity, ...]

    def __post_init__(self) -> None:
        if not self.root_id:
            raise ValueError("a gap root requires an id")
        if not self.summary:
            raise ValueError("a gap root requires a summary")
        if not self.affected_tests:
            raise ValueError("a gap root must claim at least one test")


@dataclass(frozen=True, slots=True)
class GapManifest:
    """A validated collection of root causes and exact source observations."""

    roots: tuple[GapRoot, ...]
    cases: tuple[GapCase, ...]

    def __post_init__(self) -> None:
        _validate_structure(self.roots, self.cases)

    def root(self, root_id: str) -> GapRoot:
        matches = tuple(root for root in self.roots if root.root_id == root_id)
        if len(matches) != 1:
            raise KeyError(f"manifest does not contain exactly one root {root_id!r}")
        return matches[0]

    def cases_for(self, test: TestIdentity) -> tuple[GapCase, ...]:
        return tuple(case for case in self.cases if case.boundary.test == test)

    @property
    def affected_tests(self) -> tuple[TestIdentity, ...]:
        return tuple(
            test for root in self.roots for test in root.affected_tests
        )


def _duplicate_values(values: Iterable[object]) -> tuple[object, ...]:
    seen: set[object] = set()
    duplicates: list[object] = []
    for value in values:
        if value in seen and value not in duplicates:
            duplicates.append(value)
        seen.add(value)
    return tuple(duplicates)


def _validate_structure(
    roots: tuple[GapRoot, ...],
    cases: tuple[GapCase, ...],
) -> None:
    duplicate_root_ids = _duplicate_values(root.root_id for root in roots)
    if duplicate_root_ids:
        raise GapManifestError(
            "duplicate gap root ids: "
            + ", ".join(repr(root_id) for root_id in duplicate_root_ids)
        )

    roots_by_id = {root.root_id: root for root in roots}
    claimed_by: dict[TestIdentity, str] = {}
    for root in roots:
        duplicate_tests = _duplicate_values(root.affected_tests)
        if duplicate_tests:
            raise GapManifestError(
                f"{root.root_id} claims tests more than once: "
                + ", ".join(str(test) for test in duplicate_tests)
            )
        for test in root.affected_tests:
            previous = claimed_by.get(test)
            if previous is not None:
                raise GapManifestError(
                    f"{test} is claimed by both {previous!r} and {root.root_id!r}"
                )
            claimed_by[test] = root.root_id

    duplicate_case_ids = _duplicate_values(case.stable_id for case in cases)
    if duplicate_case_ids:
        raise GapManifestError(
            "duplicate gap cases: " + ", ".join(map(str, duplicate_case_ids))
        )

    observed_tests: set[TestIdentity] = set()
    for case in cases:
        root = roots_by_id.get(case.root_id)
        if root is None:
            raise GapManifestError(
                f"{case.stable_id} references unknown root {case.root_id!r}"
            )
        if case.boundary.test not in root.affected_tests:
            raise GapManifestError(
                f"{case.stable_id} is unclaimed: {case.boundary.test} is not an "
                f"affected test of {root.root_id!r}"
            )
        observed_tests.add(case.boundary.test)

    unobserved_tests = set(claimed_by) - observed_tests
    if unobserved_tests:
        raise GapManifestError(
            "affected tests have no exact gap cases: "
            + ", ".join(str(test) for test in sorted(unobserved_tests))
        )


def _source_line(source: str, line: int) -> str:
    lines = source.splitlines()
    return lines[line - 1] if 1 <= line <= len(lines) else ""


def _text_column(source_line: str, utf8_column: int) -> int:
    encoded_prefix = source_line.encode("utf-8")[:utf8_column]
    try:
        return len(encoded_prefix.decode("utf-8"))
    except UnicodeDecodeError as error:
        raise GapManifestError(
            f"AST column {utf8_column} splits a UTF-8 character"
        ) from error


def _span_for_node(node: ast.AST, source: str) -> SourceSpan | None:
    positions = (
        getattr(node, "lineno", None),
        getattr(node, "col_offset", None),
        getattr(node, "end_lineno", None),
        getattr(node, "end_col_offset", None),
    )
    if any(position is None for position in positions):
        return None
    start_line, start_column, end_line, end_column = positions
    assert isinstance(start_line, int)
    assert isinstance(start_column, int)
    assert isinstance(end_line, int)
    assert isinstance(end_column, int)
    return SourceSpan(
        start_line=start_line,
        start_column=_text_column(_source_line(source, start_line), start_column),
        end_line=end_line,
        end_column=_text_column(_source_line(source, end_line), end_column),
    )


def _canonical_ast_value(value: object) -> object:
    """Represent one AST field without relying on versioned ``ast.dump()``.

    Python 3.14 changed ``ast.dump()`` to omit empty fields by default, while
    older supported interpreters include them.  Walking every declared field
    ourselves makes that presentation change irrelevant.  Node types, field
    names, empty/default values, and scalar types remain explicit, so a real
    syntax-tree change still changes the fingerprint.
    """

    if isinstance(value, ast.AST):
        return [
            "ast",
            type(value).__name__,
            [
                [field, _canonical_ast_value(getattr(value, field))]
                for field in value._fields
            ],
        ]
    if isinstance(value, list):
        return ["list", [_canonical_ast_value(item) for item in value]]
    if isinstance(value, tuple):
        return ["tuple", [_canonical_ast_value(item) for item in value]]
    if value is None:
        return ["none"]
    if value is Ellipsis:
        return ["ellipsis"]
    if type(value) is bool:
        return ["bool", value]
    if type(value) is int:
        return ["int", str(value)]
    if type(value) is float:
        return ["float", value.hex()]
    if type(value) is complex:
        return ["complex", value.real.hex(), value.imag.hex()]
    if type(value) is str:
        return ["str", value]
    if type(value) is bytes:
        return ["bytes", value.hex()]
    raise TypeError(f"unsupported AST field value {type(value).__qualname__}")


def ast_fingerprint(node: ast.AST) -> str:
    """Return a location- and Python-presentation-independent AST digest."""

    canonical = json.dumps(
        _canonical_ast_value(node),
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def resolve_selector(source_unit: SourceUnit, selector: NodeSelector) -> ast.AST:
    """Resolve one selector, failing if the source has drifted or is ambiguous."""

    try:
        method = source_unit.method(selector.test)
    except KeyError as error:
        raise GapManifestError(
            f"{source_unit.filename}: unknown gap test {selector.test}"
        ) from error

    matches = tuple(
        node
        for node in ast.walk(method.node)
        if type(node).__name__ == selector.node_type
        and _span_for_node(node, source_unit.source) == selector.span
    )
    if not matches:
        raise GapManifestError(
            f"{source_unit.filename}: stale gap selector {selector.stable_id}"
        )
    if len(matches) > 1:
        raise GapManifestError(
            f"{source_unit.filename}: ambiguous gap selector {selector.stable_id}"
        )

    node = matches[0]
    if (
        selector.fingerprint is not None
        and ast_fingerprint(node) != selector.fingerprint
    ):
        raise GapManifestError(
            f"{source_unit.filename}: AST fingerprint changed for "
            f"{selector.stable_id}"
        )
    return node


def validate_manifest(
    manifest: GapManifest,
    source_unit: SourceUnit | None = None,
) -> None:
    """Validate structure and, when supplied, every frozen AST selector."""

    _validate_structure(manifest.roots, manifest.cases)
    if source_unit is None:
        return
    for case in manifest.cases:
        resolve_selector(source_unit, case.boundary)
        if case.cause is not None:
            resolve_selector(source_unit, case.cause)


PARITY_GAPS = GapManifest(roots=(), cases=())
