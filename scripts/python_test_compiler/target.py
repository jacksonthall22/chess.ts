"""Typed target-language algebra for deterministic Python-test lowering.

The source parser proves syntax and ownership.  These immutable values carry
the additional facts needed to choose one TypeScript operation without runtime
type inspection or coercive fallback.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum


class ShapeKind(str, Enum):
    """Finite target-language shapes needed by the selected upstream tests."""

    UNKNOWN = "unknown"
    VOID = "void"
    NULL = "null"
    BOOLEAN = "boolean"
    NUMBER = "number"
    FLOAT = "float"
    BIGINT = "bigint"
    STRING = "string"
    ERROR = "error"
    ASSERT_RAISES_CONTEXT = "assert-raises-context"
    ARRAY = "array"
    SET = "set"
    MAP = "map"
    TUPLE = "tuple"
    ITERABLE = "iterable"
    FUNCTION = "function"
    BITBOARD_TRANSFORM = "bitboard-transform"
    MOVE = "move"
    PIECE = "piece"
    BOARD = "board"
    BASE_BOARD = "base-board"
    SQUARE_SET = "square-set"
    LEGAL_MOVE_GENERATOR = "legal-move-generator"
    LEGAL_MOVE_ITERATOR = "legal-move-iterator"
    PSEUDO_LEGAL_MOVE_GENERATOR = "pseudo-legal-move-generator"
    GAME_NODE = "game-node"
    CHILD_GAME_NODE = "child-game-node"
    GAME = "game"
    HEADERS = "headers"
    MAINLINE = "mainline"
    STRING_EXPORTER = "string-exporter"
    FILE_EXPORTER = "file-exporter"
    EXPORTER = "exporter"
    STRING_IO = "string-io"
    SCORE = "score"
    POV_SCORE = "pov-score"
    WDL = "wdl"
    WDL_MODEL = "wdl-model"
    ARROW = "arrow"
    ARROW_INPUT = "arrow-input"
    LOCAL_OBJECT = "local-object"
    PIECE_VALUE_SET = "piece-value-set"
    KEYED_MAP = "keyed-map"


@dataclass(frozen=True, slots=True)
class TargetShape:
    """Proof carried from the Python AST into target-specific lowering."""

    kind: ShapeKind
    element: TargetShape | None = None
    members: tuple[TargetShape, ...] = ()
    nullable: bool = False
    label: str | None = None
    fields: tuple[tuple[str, TargetShape], ...] = ()

    def optional(self) -> TargetShape:
        return TargetShape(
            self.kind,
            self.element,
            self.members,
            nullable=True,
            label=self.label,
            fields=self.fields,
        )

    def required(self) -> TargetShape:
        return TargetShape(
            self.kind,
            self.element,
            self.members,
            nullable=False,
            label=self.label,
            fields=self.fields,
        )


@dataclass(frozen=True, slots=True)
class RuntimeTypeGuard:
    """One explicit runtime proof required by a narrower target shape."""

    constructor: str
    failure: str

    def __post_init__(self) -> None:
        if not self.constructor:
            raise ValueError("a runtime type guard requires a constructor")
        if not self.failure:
            raise ValueError("a runtime type guard requires a failure message")


@dataclass(frozen=True, slots=True)
class RepeatedAttributeFact:
    """Prove the next ``remaining`` accesses to one attribute have one shape."""

    attribute: str
    remaining: int
    shape: TargetShape
    guard: RuntimeTypeGuard | None = None

    def __post_init__(self) -> None:
        if not self.attribute:
            raise ValueError("an attribute fact requires an attribute name")
        if self.remaining < 1:
            raise ValueError("an attribute fact must prove at least one access")


@dataclass(frozen=True, slots=True)
class ValueFacts:
    """Flow facts proved from syntax and preserved only while they stay valid."""

    exact_sequence_length: int | None = None
    exact_string: str | None = None
    finite_string_values: frozenset[str] = frozenset()
    repeated_attributes: tuple[RepeatedAttributeFact, ...] = ()

    def __post_init__(self) -> None:
        if self.exact_sequence_length is not None and self.exact_sequence_length < 0:
            raise ValueError("an exact sequence length cannot be negative")

    def without_sequence_length(self) -> ValueFacts:
        return ValueFacts(
            exact_string=self.exact_string,
            finite_string_values=self.finite_string_values,
            repeated_attributes=self.repeated_attributes,
        )

    def without_finite_string_values(self) -> ValueFacts:
        return ValueFacts(
            exact_sequence_length=self.exact_sequence_length,
            exact_string=self.exact_string,
            repeated_attributes=self.repeated_attributes,
        )

    def without_mutable_sequence_facts(self) -> ValueFacts:
        return ValueFacts(
            exact_string=self.exact_string,
            repeated_attributes=self.repeated_attributes,
        )


UNKNOWN = TargetShape(ShapeKind.UNKNOWN)
VOID = TargetShape(ShapeKind.VOID)
NULL = TargetShape(ShapeKind.NULL)
BOOLEAN = TargetShape(ShapeKind.BOOLEAN)
# Every selected NUMBER source is proved integral and exactly representable as a
# JavaScript number. Dynamic arithmetic checks Number.isSafeInteger before it
# retains this shape. Float syntax is rejected at the compiler boundary.
NUMBER = TargetShape(ShapeKind.NUMBER)
# Python and JavaScript both use IEEE-754 binary64 for ordinary float values.
# Keep floats distinct from proved integers so integer-only chess APIs cannot
# accidentally accept a mechanically translated float.
FLOAT = TargetShape(ShapeKind.FLOAT)
BIGINT = TargetShape(ShapeKind.BIGINT)
STRING = TargetShape(ShapeKind.STRING)
ERROR = TargetShape(ShapeKind.ERROR)
BITBOARD_TRANSFORM = TargetShape(ShapeKind.BITBOARD_TRANSFORM)
MOVE = TargetShape(ShapeKind.MOVE)
PIECE = TargetShape(ShapeKind.PIECE)
PIECE_VALUE_SET = TargetShape(ShapeKind.PIECE_VALUE_SET, element=PIECE)
BOARD = TargetShape(ShapeKind.BOARD)
BASE_BOARD = TargetShape(ShapeKind.BASE_BOARD)
SQUARE_SET = TargetShape(ShapeKind.SQUARE_SET)
LEGAL_MOVE_GENERATOR = TargetShape(ShapeKind.LEGAL_MOVE_GENERATOR, element=MOVE)
LEGAL_MOVE_ITERATOR = TargetShape(ShapeKind.LEGAL_MOVE_ITERATOR, element=MOVE)
PSEUDO_LEGAL_MOVE_GENERATOR = TargetShape(
    ShapeKind.PSEUDO_LEGAL_MOVE_GENERATOR, element=MOVE
)
GAME_NODE = TargetShape(ShapeKind.GAME_NODE)
CHILD_GAME_NODE = TargetShape(ShapeKind.CHILD_GAME_NODE)
GAME = TargetShape(ShapeKind.GAME)
HEADERS = TargetShape(ShapeKind.HEADERS)
MAINLINE_MOVE = TargetShape(ShapeKind.MAINLINE, element=MOVE)
STRING_EXPORTER = TargetShape(ShapeKind.STRING_EXPORTER)
FILE_EXPORTER = TargetShape(ShapeKind.FILE_EXPORTER)
EXPORTER = TargetShape(ShapeKind.EXPORTER)
STRING_IO = TargetShape(ShapeKind.STRING_IO)
SCORE = TargetShape(ShapeKind.SCORE)
POV_SCORE = TargetShape(ShapeKind.POV_SCORE)
WDL = TargetShape(ShapeKind.WDL)
WDL_MODEL = TargetShape(ShapeKind.WDL_MODEL)
ARROW = TargetShape(ShapeKind.ARROW)
# ``GameNode.set_arrows`` accepts either an Arrow or a pair of squares. Keep
# that public union explicit instead of erasing a mixed Python list to unknown.
ARROW_INPUT = TargetShape(ShapeKind.ARROW_INPUT)


def array_of(element: TargetShape) -> TargetShape:
    return TargetShape(ShapeKind.ARRAY, element=element)


def error_of(family: str) -> TargetShape:
    """Preserve the exact constructor family of a captured exception."""

    return TargetShape(ShapeKind.ERROR, label=family)


def assert_raises_context_of(family: str) -> TargetShape:
    """Represent Python's context manager separately from its exception."""

    return TargetShape(ShapeKind.ASSERT_RAISES_CONTEXT, label=family)


def set_of(element: TargetShape) -> TargetShape:
    return TargetShape(ShapeKind.SET, element=element)


def map_of(key: TargetShape, value: TargetShape) -> TargetShape:
    return TargetShape(ShapeKind.MAP, members=(key, value))


def keyed_map(*fields: tuple[str, TargetShape]) -> TargetShape:
    """Describe a string-keyed mapping whose values vary by literal key."""

    return TargetShape(ShapeKind.KEYED_MAP, fields=fields)


def tuple_of(*members: TargetShape) -> TargetShape:
    return TargetShape(ShapeKind.TUPLE, members=members)


def iterable_of(element: TargetShape) -> TargetShape:
    return TargetShape(ShapeKind.ITERABLE, element=element)


def function_of(
    parameters: tuple[TargetShape, ...], result: TargetShape
) -> TargetShape:
    """Describe one callable target value without erasing its parameters."""

    return TargetShape(ShapeKind.FUNCTION, element=result, members=parameters)


def local_object(
    label: str, fields: tuple[tuple[str, TargetShape], ...]
) -> TargetShape:
    return TargetShape(ShapeKind.LOCAL_OBJECT, label=label, fields=fields)
