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


def _call(
    test: TestIdentity,
    line: int,
    start_column: int,
    end_column: int,
) -> NodeSelector:
    return NodeSelector(
        test=test,
        span=SourceSpan(line, start_column, line, end_column),
        node_type="Call",
    )


def _mismatch_cases(
    root_id: str,
    test: TestIdentity,
    spans: tuple[tuple[int, int, int], ...],
) -> tuple[GapCase, ...]:
    return tuple(
        GapCase(
            root_id=root_id,
            boundary=_call(test, line, start_column, end_column),
            expectation=AssertionMismatch(),
        )
        for line, start_column, end_column in spans
    )


def _missing_piece_equality_cases(
    test: TestIdentity,
    spans: tuple[tuple[int, int, int], ...],
) -> tuple[GapCase, ...]:
    """Expose the absent production equality API at each exact assertion."""

    return tuple(
        GapCase(
            root_id="piece-value-equality",
            boundary=_call(test, line, start_column, end_column),
            expectation=ExpectedError(
                family=ErrorFamily.TYPE_ERROR,
                message_pattern=r"Piece\.equals is not implemented",
                continuation=ErrorContinuation.CONTINUE,
            ),
            cause=_call(test, line, start_column, end_column),
        )
        for line, start_column, end_column in spans
    )


BOARD_FROM_EPD = TestIdentity("BoardTestCase", "test_from_epd")
PIECE_EQUALITY = TestIdentity("PieceTestCase", "test_equality")
BOARD_DEFAULT_POSITION = TestIdentity("BoardTestCase", "test_default_position")
BOARD_GET_SET = TestIdentity("BoardTestCase", "test_get_set")
BOARD_INVALID_CASTLING = TestIdentity(
    "BoardTestCase", "test_invalid_castling_rights"
)
BOARD_CLEAN_CASTLING = TestIdentity("BoardTestCase", "test_clean_castling_rights")
BOARD_MOVE_COUNT = TestIdentity("BoardTestCase", "test_move_count")
LEGAL_LIST_CONVERSION = TestIdentity(
    "LegalMoveGeneratorTestCase", "test_list_conversion"
)
LEGAL_STRING_CONVERSION = TestIdentity(
    "LegalMoveGeneratorTestCase", "test_string_conversion"
)
LEGAL_TRAVERSE_ONCE = TestIdentity(
    "LegalMoveGeneratorTestCase", "test_traverse_once"
)
BASE_BOARD_SET_PIECE_MAP = TestIdentity("BaseBoardTestCase", "test_set_piece_map")
SQUARE_SET_EQUALITY = TestIdentity("SquareSetTestCase", "test_equality")
SQUARE_SET_IMMUTABLE_OPERATIONS = TestIdentity(
    "SquareSetTestCase", "test_immutable_set_operations"
)
PGN_EXPORTER = TestIdentity("PgnTestCase", "test_exporter")
PGN_PROMOTE_DEMOTE = TestIdentity("PgnTestCase", "test_promote_demote")


GAP_ROOTS = (
    GapRoot(
        root_id="piece-value-equality",
        category=GapCategory.DEFECT,
        summary="Piece has no public value-equality implementation.",
        affected_tests=(PIECE_EQUALITY, BOARD_DEFAULT_POSITION, BOARD_GET_SET),
    ),
    GapRoot(
        root_id="board-epd-operation-parsing",
        category=GapCategory.DEFECT,
        summary="EPD operation fields are discarded before operation parsing.",
        affected_tests=(BOARD_FROM_EPD,),
    ),
    GapRoot(
        root_id="board-castling-rights-cleanup",
        category=GapCategory.DEFECT,
        summary="Empty move-stack truthiness bypasses castling-right filtering.",
        affected_tests=(BOARD_INVALID_CASTLING, BOARD_CLEAN_CASTLING),
    ),
    GapRoot(
        root_id="move-generator-iterator-delegation",
        category=GapCategory.DEFECT,
        summary="Move-generator iterators return, rather than delegate to, their source.",
        affected_tests=(
            BOARD_MOVE_COUNT,
            LEGAL_LIST_CONVERSION,
            LEGAL_STRING_CONVERSION,
            LEGAL_TRAVERSE_ONCE,
        ),
    ),
    GapRoot(
        root_id="base-board-default-position",
        category=GapCategory.DEFECT,
        summary="The default BaseBoard is empty instead of the starting position.",
        affected_tests=(BASE_BOARD_SET_PIECE_MAP,),
    ),
    GapRoot(
        root_id="square-set-value-semantics",
        category=GapCategory.DEFECT,
        summary=(
            "Two SquareSet defects are grouped: missing iterable/value semantics, "
            "and symmetricDifference returns bigint instead of SquareSet."
        ),
        affected_tests=(SQUARE_SET_EQUALITY, SQUARE_SET_IMMUTABLE_OPERATIONS),
    ),
    GapRoot(
        root_id="pgn-file-exporter",
        category=GapCategory.UNIMPLEMENTED_CAPABILITY,
        summary="The Node-compatible PGN FileExporter capability is not implemented.",
        affected_tests=(PGN_EXPORTER,),
    ),
    GapRoot(
        root_id="pgn-demote-swap",
        category=GapCategory.DEFECT,
        summary="Demoting a variation does not swap it with its successor.",
        affected_tests=(PGN_PROMOTE_DEMOTE,),
    ),
)


GAP_CASES = (
    *_missing_piece_equality_cases(
        PIECE_EQUALITY,
        (
            (169, 8, 56),
            (171, 8, 31),
            (172, 8, 31),
            (173, 8, 32),
            (177, 8, 33),
            (178, 8, 33),
            (179, 8, 34),
            (180, 8, 33),
            (181, 8, 34),
        ),
    ),
    *_missing_piece_equality_cases(
        BOARD_DEFAULT_POSITION,
        ((214, 8, 80),),
    ),
    *_missing_piece_equality_cases(
        BOARD_GET_SET,
        ((298, 8, 80),),
    ),
    GapCase(
        root_id="board-epd-operation-parsing",
        boundary=_call(BOARD_FROM_EPD, 237, 21, 63),
        expectation=ExpectedError(
            family=ErrorFamily.VALUE_ERROR,
            message_pattern=r"invalid half-move clock",
            continuation=ErrorContinuation.ABORT_TEST,
        ),
        cause=_call(BOARD_FROM_EPD, 237, 21, 63),
    ),
    *_mismatch_cases(
        "board-castling-rights-cleanup",
        BOARD_INVALID_CASTLING,
        (
            (479, 8, 74),
            (480, 8, 74),
            (482, 8, 73),
            (483, 8, 74),
            (484, 8, 73),
            (487, 8, 74),
            (488, 8, 73),
            (491, 8, 74),
            (492, 8, 81),
        ),
    ),
    *_mismatch_cases(
        "board-castling-rights-cleanup",
        BOARD_CLEAN_CASTLING,
        (
            (529, 8, 71),
            (530, 8, 79),
            (532, 8, 71),
            (533, 8, 79),
        ),
    ),
    *_mismatch_cases(
        "move-generator-iterator-delegation",
        BOARD_MOVE_COUNT,
        ((830, 8, 85),),
    ),
    *_mismatch_cases(
        "move-generator-iterator-delegation",
        LEGAL_LIST_CONVERSION,
        ((1717, 8, 66),),
    ),
    *_mismatch_cases(
        "move-generator-iterator-delegation",
        LEGAL_STRING_CONVERSION,
        (
            (1730, 8, 54),
            (1731, 8, 55),
            (1733, 8, 61),
            (1734, 8, 62),
            (1735, 8, 60),
            (1736, 8, 61),
        ),
    ),
    *_mismatch_cases(
        "move-generator-iterator-delegation",
        LEGAL_TRAVERSE_ONCE,
        ((1751, 8, 45),),
    ),
    *_mismatch_cases(
        "base-board-default-position",
        BASE_BOARD_SET_PIECE_MAP,
        ((1762, 8, 33),),
    ),
    *_mismatch_cases(
        "square-set-value-semantics",
        SQUARE_SET_EQUALITY,
        (
            (1773, 8, 32),
            (1774, 8, 32),
            (1775, 8, 34),
            (1776, 8, 34),
        ),
    ),
    GapCase(
        root_id="square-set-value-semantics",
        boundary=_call(SQUARE_SET_EQUALITY, 1786, 8, 73),
        expectation=ExpectedError(
            family=ErrorFamily.TYPE_ERROR,
            message_pattern=r"squares is not iterable",
            continuation=ErrorContinuation.CONTINUE,
        ),
        cause=_call(SQUARE_SET_EQUALITY, 1786, 29, 66),
    ),
    GapCase(
        root_id="square-set-value-semantics",
        boundary=_call(SQUARE_SET_IMMUTABLE_OPERATIONS, 1851, 16, 76),
        expectation=ExpectedError(
            family=ErrorFamily.TYPE_ERROR,
            message_pattern=r"squares is not iterable",
            continuation=ErrorContinuation.CONTINUE,
        ),
        cause=_call(SQUARE_SET_IMMUTABLE_OPERATIONS, 1851, 60, 75),
    ),
    GapCase(
        root_id="square-set-value-semantics",
        boundary=_call(SQUARE_SET_IMMUTABLE_OPERATIONS, 1852, 16, 72),
        expectation=ExpectedError(
            family=ErrorFamily.TYPE_ERROR,
            message_pattern=r"squares is not iterable",
            continuation=ErrorContinuation.CONTINUE,
        ),
        cause=_call(SQUARE_SET_IMMUTABLE_OPERATIONS, 1852, 58, 71),
    ),
    GapCase(
        root_id="square-set-value-semantics",
        boundary=_call(SQUARE_SET_IMMUTABLE_OPERATIONS, 1853, 16, 76),
        expectation=ExpectedError(
            family=ErrorFamily.TYPE_ERROR,
            message_pattern=r"squares is not iterable",
            continuation=ErrorContinuation.CONTINUE,
        ),
        cause=_call(SQUARE_SET_IMMUTABLE_OPERATIONS, 1853, 60, 75),
    ),
    GapCase(
        root_id="square-set-value-semantics",
        boundary=_call(SQUARE_SET_IMMUTABLE_OPERATIONS, 1854, 16, 71),
        expectation=ExpectedError(
            family=ErrorFamily.TYPE_ERROR,
            message_pattern=r"squares is not iterable",
            continuation=ErrorContinuation.CONTINUE,
        ),
        cause=_call(SQUARE_SET_IMMUTABLE_OPERATIONS, 1854, 59, 69),
    ),
    GapCase(
        root_id="square-set-value-semantics",
        boundary=_call(SQUARE_SET_IMMUTABLE_OPERATIONS, 1855, 16, 85),
        expectation=ExpectedError(
            family=ErrorFamily.TYPE_ERROR,
            message_pattern=r"squares is not iterable",
            continuation=ErrorContinuation.CONTINUE,
        ),
        cause=_call(SQUARE_SET_IMMUTABLE_OPERATIONS, 1855, 66, 83),
    ),
    GapCase(
        root_id="square-set-value-semantics",
        boundary=_call(SQUARE_SET_IMMUTABLE_OPERATIONS, 1856, 16, 81),
        expectation=ExpectedError(
            family=ErrorFamily.TYPE_ERROR,
            message_pattern=r"squares is not iterable",
            continuation=ErrorContinuation.CONTINUE,
        ),
        cause=_call(SQUARE_SET_IMMUTABLE_OPERATIONS, 1856, 64, 79),
    ),
    GapCase(
        root_id="square-set-value-semantics",
        boundary=_call(SQUARE_SET_IMMUTABLE_OPERATIONS, 1857, 16, 101),
        expectation=ExpectedError(
            family=ErrorFamily.TYPE_ERROR,
            message_pattern=r"squares is not iterable",
            continuation=ErrorContinuation.CONTINUE,
        ),
        cause=_call(SQUARE_SET_IMMUTABLE_OPERATIONS, 1857, 74, 99),
    ),
    GapCase(
        root_id="pgn-file-exporter",
        boundary=_call(PGN_EXPORTER, 2133, 19, 55),
        expectation=ExpectedError(
            family=ErrorFamily.TYPE_ERROR,
            message_pattern=r"missing constructor FileExporter",
            continuation=ErrorContinuation.ABORT_TEST,
        ),
        cause=_call(PGN_EXPORTER, 2133, 19, 55),
    ),
    *_mismatch_cases(
        "pgn-demote-swap",
        PGN_PROMOTE_DEMOTE,
        (
            (2415, 8, 46),
            (2422, 8, 36),
            (2423, 8, 36),
        ),
    ),
)


PARITY_GAPS = GapManifest(roots=GAP_ROOTS, cases=GAP_CASES)


def _validate_expected_shape(manifest: GapManifest) -> None:
    categories = tuple(root.category for root in manifest.roots)
    if len(manifest.roots) != 8:
        raise GapManifestError(
            f"the frozen baseline must declare eight roots, got {len(manifest.roots)}"
        )
    if categories.count(GapCategory.DEFECT) != 7:
        raise GapManifestError(
            "the frozen baseline must declare seven defect groups covering eight defects"
        )
    if categories.count(GapCategory.UNIMPLEMENTED_CAPABILITY) != 1:
        raise GapManifestError(
            "the frozen baseline must declare exactly one unimplemented capability"
        )
    if len(set(manifest.affected_tests)) != 15:
        raise GapManifestError(
            "the frozen baseline must declare exactly fifteen affected methods"
        )


_validate_expected_shape(PARITY_GAPS)
