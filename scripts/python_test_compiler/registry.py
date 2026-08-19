"""Finite chess.ts target-shape registry used by the test compiler.

Every entry is an explicit source-to-target contract.  A missing entry returns
``UNKNOWN``; semantic operations reject that shape instead of guessing.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum

from transpilation_helper import py_identifier_to_ts

from .target import (
    ARROW,
    ARROW_INPUT,
    BASE_BOARD,
    BIGINT,
    BITBOARD_TRANSFORM,
    BOARD,
    CHILD_GAME_NODE,
    BOOLEAN,
    GAME,
    GAME_NODE,
    FLOAT,
    FILE_EXPORTER,
    HEADERS,
    LEGAL_MOVE_GENERATOR,
    LEGAL_MOVE_ITERATOR,
    MAINLINE_MOVE,
    MOVE,
    NULL,
    NUMBER,
    PIECE,
    POV_SCORE,
    PSEUDO_LEGAL_MOVE_GENERATOR,
    SQUARE_SET,
    SCORE,
    STRING,
    STRING_EXPORTER,
    STRING_IO,
    UNKNOWN,
    VOID,
    WDL,
    WDL_MODEL,
    RuntimeTypeGuard,
    ShapeKind,
    TargetShape,
    array_of,
    function_of,
    iterable_of,
    keyed_map,
    local_object,
    map_of,
    set_of,
    tuple_of,
)


class CallContractError(ValueError):
    """A call does not satisfy its finite source-to-target contract."""


@dataclass(frozen=True, slots=True)
class ShapeRule:
    """One explicit set of accepted argument shapes."""

    shapes: tuple[TargetShape, ...] = ()
    kinds: tuple[ShapeKind, ...] = ()
    structural: tuple[TargetShape, ...] = ()
    contextual_string_literals: frozenset[str] = frozenset()
    description: str = "proved value"

    def __post_init__(self) -> None:
        if self.contextual_string_literals and len(self.shapes) != 1:
            raise ValueError(
                "contextual string literals require exactly one target shape"
            )

    def accepts(self, shape: TargetShape) -> bool:
        if shape.kind in {ShapeKind.UNKNOWN, ShapeKind.VOID}:
            return False
        return shape in self.shapes or (
            not shape.nullable and shape.kind in self.kinds
        ) or any(
            shape.kind is template.kind
            and shape.element == template.element
            and shape.members == template.members
            and shape.nullable == template.nullable
            and all(
                dict(shape.fields).get(name) == field_shape
                for name, field_shape in template.fields
            )
            for template in self.structural
        )


class InvocationKind(str, Enum):
    """How a validated source call is invoked in TypeScript."""

    CALL = "call"
    CONSTRUCT = "construct"
    MISSING_CONSTRUCTOR = "missing-constructor"


class KeywordStyle(str, Enum):
    """How validated Python keywords cross one target API boundary."""

    NONE = "none"
    OPTIONS_OBJECT = "options-object"
    POSITIONAL = "positional"


class ArgumentAdapterKind(str, Enum):
    """Finite target representations for an already-proved source argument."""

    TO_BIGINT = "to-bigint"
    CALL_METHOD = "call-method"
    TYPE_ASSERTION = "type-assertion"


@dataclass(frozen=True, slots=True)
class TypeAssertion:
    """One visible target type escape with its auditable justification."""

    target_type: str
    marker: str
    required_gap_root: str | None = None
    via_unknown: bool = False

    def __post_init__(self) -> None:
        if not self.target_type:
            raise ValueError("a target type assertion requires a target type")
        if not self.marker:
            raise ValueError("a target type assertion requires an adjacent marker")


@dataclass(frozen=True, slots=True)
class ArgumentAdapter:
    """Adapt one accepted source shape to the representation a target call needs."""

    index: int
    source: ShapeRule
    kind: ArgumentAdapterKind
    result: TargetShape
    method: str | None = None
    assertion: TypeAssertion | None = None
    result_override: TargetShape | None = None

    def __post_init__(self) -> None:
        if self.index < 0:
            raise ValueError("an argument adapter index cannot be negative")
        if self.kind is ArgumentAdapterKind.CALL_METHOD and not self.method:
            raise ValueError("a method argument adapter requires a method")
        if self.kind is not ArgumentAdapterKind.CALL_METHOD and self.method:
            raise ValueError("only a method argument adapter may carry a method")
        if self.kind is ArgumentAdapterKind.TYPE_ASSERTION and self.assertion is None:
            raise ValueError("a type-assertion adapter requires assertion metadata")
        if self.kind is not ArgumentAdapterKind.TYPE_ASSERTION and self.assertion:
            raise ValueError("only a type-assertion adapter may carry an assertion")


@dataclass(frozen=True, slots=True)
class NonEmptySequenceResult:
    """Refine a result from an exact, non-empty positional sequence fact."""

    argument_index: int
    result: TargetShape
    guard: RuntimeTypeGuard
    repeated_attribute: str | None = None

    def __post_init__(self) -> None:
        if self.argument_index < 0:
            raise ValueError("a result-refinement index cannot be negative")
        if self.repeated_attribute == "":
            raise ValueError("a repeated result attribute cannot be empty")


@dataclass(frozen=True, slots=True)
class MissingConstructor:
    """Describe a known-absent target constructor without embedding test logic."""

    namespace: str
    name: str
    result_type: str
    marker: str
    required_gap_root: str

    def __post_init__(self) -> None:
        for field_name in (
            "namespace",
            "name",
            "result_type",
            "marker",
            "required_gap_root",
        ):
            if not getattr(self, field_name):
                raise ValueError(
                    f"missing-constructor metadata requires {field_name}"
                )


@dataclass(frozen=True, slots=True)
class CallContract:
    """Finite positional, keyword, and result contract for one source call."""

    result: TargetShape
    required: tuple[ShapeRule, ...] = ()
    optional: tuple[ShapeRule, ...] = ()
    keywords: tuple[tuple[str, ShapeRule], ...] = ()
    invocation: InvocationKind = InvocationKind.CALL
    keyword_style: KeywordStyle = KeywordStyle.NONE
    target_member: str | None = None
    positional_options: tuple[tuple[int, str], ...] = ()
    argument_adapters: tuple[ArgumentAdapter, ...] = ()
    result_refinement: NonEmptySequenceResult | None = None
    result_guard: RuntimeTypeGuard | None = None
    result_assertion: TypeAssertion | None = None
    missing_constructor: MissingConstructor | None = None

    def __post_init__(self) -> None:
        keyword_names = tuple(name for name, _rule in self.keywords)
        if len(set(keyword_names)) != len(keyword_names):
            raise ValueError("a call contract cannot repeat keyword names")
        if self.keyword_style is KeywordStyle.NONE and keyword_names:
            raise ValueError("a call with keywords requires an explicit keyword style")
        if self.keyword_style is not KeywordStyle.NONE and not keyword_names:
            raise ValueError("a keyword style requires at least one keyword contract")
        if self.keyword_style is KeywordStyle.POSITIONAL and len(keyword_names) != 1:
            raise ValueError(
                "positional keyword lowering requires exactly one keyword contract"
            )
        if (
            self.invocation is InvocationKind.MISSING_CONSTRUCTOR
        ) != (self.missing_constructor is not None):
            raise ValueError(
                "missing-constructor invocation and metadata must be declared together"
            )
        maximum = len(self.required) + len(self.optional)
        option_indices = tuple(index for index, _name in self.positional_options)
        if len(set(option_indices)) != len(option_indices):
            raise ValueError("positional option indices must be unique")
        if option_indices and (
            tuple(sorted(option_indices)) != option_indices
            or option_indices != tuple(range(option_indices[0], maximum))
        ):
            raise ValueError(
                "positional option indices must be an ordered argument tail"
            )
        for adapter in self.argument_adapters:
            if adapter.index >= maximum:
                raise ValueError("an argument adapter index exceeds call arity")
            argument_rule = (self.required + self.optional)[adapter.index]
            examples = adapter.source.shapes + adapter.source.structural
            if any(not argument_rule.accepts(shape) for shape in examples):
                raise ValueError(
                    "an argument adapter accepts a shape rejected by its argument rule"
                )
        for index, adapter in enumerate(self.argument_adapters):
            for other in self.argument_adapters[index + 1 :]:
                if adapter.index != other.index:
                    continue
                examples = (
                    adapter.source.shapes
                    + adapter.source.structural
                    + other.source.shapes
                    + other.source.structural
                )
                if any(
                    adapter.source.accepts(shape)
                    and other.source.accepts(shape)
                    for shape in examples
                ):
                    raise ValueError("argument adapters cannot overlap")
        if (
            self.result_refinement is not None
            and self.result_refinement.argument_index >= maximum
        ):
            raise ValueError("a result refinement index exceeds call arity")
        if self.result_refinement is not None:
            refinement_rule = (self.required + self.optional)[
                self.result_refinement.argument_index
            ]
            admitted = refinement_rule.shapes + refinement_rule.structural
            if (
                ShapeKind.ARRAY not in refinement_rule.kinds
                and not any(shape.kind is ShapeKind.ARRAY for shape in admitted)
            ):
                raise ValueError(
                    "a non-empty-sequence result requires an array argument rule"
                )
        if self.result_refinement is not None and self.result_guard is not None:
            raise ValueError(
                "a call contract cannot declare both a fixed result guard and "
                "an argument-dependent refinement"
            )


def exact(*shapes: TargetShape, description: str | None = None) -> ShapeRule:
    return ShapeRule(
        shapes=shapes,
        description=description or " or ".join(shape.kind.value for shape in shapes),
    )


def finite_string_literals(
    result: TargetShape,
    *values: str,
    description: str | None = None,
) -> ShapeRule:
    """Admit ordinary source strings only when their exact value is finite."""

    return ShapeRule(
        shapes=(result,),
        contextual_string_literals=frozenset(values),
        description=description or result.kind.value,
    )


def structural(
    *shapes: TargetShape, description: str
) -> ShapeRule:
    return ShapeRule(structural=shapes, description=description)


def kinds(*accepted: ShapeKind, description: str) -> ShapeRule:
    return ShapeRule(kinds=accepted, description=description)


def call_contract(
    result: TargetShape,
    *required: ShapeRule,
    optional: tuple[ShapeRule, ...] = (),
    keywords: tuple[tuple[str, ShapeRule], ...] = (),
    invocation: InvocationKind = InvocationKind.CALL,
    keyword_style: KeywordStyle = KeywordStyle.NONE,
    target_member: str | None = None,
    positional_options: tuple[tuple[int, str], ...] = (),
    argument_adapters: tuple[ArgumentAdapter, ...] = (),
    result_refinement: NonEmptySequenceResult | None = None,
    result_guard: RuntimeTypeGuard | None = None,
    result_assertion: TypeAssertion | None = None,
    missing_constructor: MissingConstructor | None = None,
) -> CallContract:
    return CallContract(
        result=result,
        required=required,
        optional=optional,
        keywords=keywords,
        invocation=invocation,
        keyword_style=keyword_style,
        target_member=target_member,
        positional_options=positional_options,
        argument_adapters=argument_adapters,
        result_refinement=result_refinement,
        result_guard=result_guard,
        result_assertion=result_assertion,
        missing_constructor=missing_constructor,
    )


def validate_call_contract(
    contract: CallContract,
    arguments: tuple[TargetShape, ...],
    keywords: tuple[tuple[str, TargetShape], ...],
) -> None:
    """Reject a call before its known result shape can influence lowering."""

    minimum = len(contract.required)
    maximum = minimum + len(contract.optional)
    if not minimum <= len(arguments) <= maximum:
        expected = str(minimum) if minimum == maximum else f"{minimum}..{maximum}"
        raise CallContractError(
            f"expected {expected} positional arguments, got {len(arguments)}"
        )

    rules = contract.required + contract.optional
    for index, (shape, rule) in enumerate(zip(arguments, rules, strict=False), 1):
        if not rule.accepts(shape):
            raise CallContractError(
                f"argument {index} requires {rule.description}, got {shape.kind.value}"
            )

    allowed_keywords = dict(contract.keywords)
    observed_names: set[str] = set()
    for name, shape in keywords:
        if name in observed_names:
            raise CallContractError(f"duplicate keyword {name!r}")
        observed_names.add(name)
        rule = allowed_keywords.get(name)
        if rule is None:
            raise CallContractError(f"unsupported keyword {name!r}")
        if not rule.accepts(shape):
            raise CallContractError(
                f"keyword {name!r} requires {rule.description}, got {shape.kind.value}"
            )


REGISTERED_NUMERIC_CONSTANTS = frozenset(
    {
        "chess.BISHOP",
        "chess.KING",
        "chess.KNIGHT",
        "chess.QUEEN",
        "chess.ROOK",
        "chess.STATUS_BAD_CASTLING_RIGHTS",
        "chess.pgn.NAG_MISTAKE",
    }
)

REGISTERED_SCALAR_BITBOARDS = frozenset(
    {
        "chess.BB_A1",
        "chess.BB_A2",
        "chess.BB_A3",
        "chess.BB_A7",
        "chess.BB_A8",
        "chess.BB_ALL",
        "chess.BB_B1",
        "chess.BB_B7",
        "chess.BB_B8",
        "chess.BB_BACKRANKS",
        "chess.BB_C1",
        "chess.BB_C2",
        "chess.BB_C8",
        "chess.BB_CENTER",
        "chess.BB_D1",
        "chess.BB_D2",
        "chess.BB_E1",
        "chess.BB_E4",
        "chess.BB_EMPTY",
        "chess.BB_F3",
        "chess.BB_FILE_A",
        "chess.BB_FILE_B",
        "chess.BB_FILE_C",
        "chess.BB_FILE_D",
        "chess.BB_FILE_E",
        "chess.BB_FILE_H",
        "chess.BB_G1",
        "chess.BB_G3",
        "chess.BB_G7",
        "chess.BB_G8",
        "chess.BB_H1",
        "chess.BB_H5",
        "chess.BB_H7",
        "chess.BB_H8",
        "chess.BB_LIGHT_SQUARES",
        "chess.BB_RANK_1",
        "chess.BB_RANK_2",
        "chess.BB_RANK_4",
        "chess.BB_RANK_5",
        "chess.BB_RANK_6",
        "chess.BB_RANK_8",
    }
)

REGISTERED_BITBOARD_FUNCTIONS = frozenset(
    {
        "chess.flip_anti_diagonal",
        "chess.flip_diagonal",
        "chess.flip_horizontal",
        "chess.flip_vertical",
        "chess.shift_2_down",
        "chess.shift_2_left",
        "chess.shift_2_right",
        "chess.shift_2_up",
        "chess.shift_down",
        "chess.shift_down_left",
        "chess.shift_down_right",
        "chess.shift_left",
        "chess.shift_right",
        "chess.shift_up",
        "chess.shift_up_left",
        "chess.shift_up_right",
    }
)

BUILTIN_EXCEPTION_CONSTRUCTORS = {
    "ValueError": "chess.ValueError",
    "KeyError": "chess.KeyError",
}

CHESS_EXCEPTION_CONSTRUCTORS = frozenset(
    {
        "chess.InvalidMoveError",
        "chess.IllegalMoveError",
        "chess.AmbiguousMoveError",
    }
)

ORDINARY_MESSAGE_EXCEPTION_CONSTRUCTORS = frozenset(
    {
        BUILTIN_EXCEPTION_CONSTRUCTORS["ValueError"],
        *CHESS_EXCEPTION_CONSTRUCTORS,
    }
)


def builtin_exception_constructor(name: str | None) -> str | None:
    """Return the exact target constructor for one registered Python builtin."""

    return BUILTIN_EXCEPTION_CONSTRUCTORS.get(name or "")


def registered_exception_constructor(name: str | None) -> str | None:
    """Map only finite, runtime-backed Python exception constructors."""

    builtin = builtin_exception_constructor(name)
    if builtin is not None:
        return builtin
    return name if name in CHESS_EXCEPTION_CONSTRUCTORS else None


def exception_has_ordinary_message(constructor: str | None) -> bool:
    """Return whether target ``Error.message`` matches Python ``str(error)``."""

    return constructor in ORDINARY_MESSAGE_EXCEPTION_CONSTRUCTORS


def qualified_name_shape(name: str) -> TargetShape:
    if name in {"chess.WHITE", "chess.BLACK"}:
        return BOOLEAN
    if name == "chess.STARTING_FEN":
        return STRING
    if name == "chess.SQUARES":
        return array_of(NUMBER)
    if name == "chess.BB_SQUARES":
        return array_of(BIGINT)
    if name == "chess.engine.MateGiven":
        return SCORE
    if name in REGISTERED_SCALAR_BITBOARDS:
        return BIGINT

    suffix = name.rsplit(".", 1)[-1]
    if name in REGISTERED_NUMERIC_CONSTANTS:
        return NUMBER
    if (
        name.startswith("chess.")
        and len(suffix) == 2
        and suffix[0] in "ABCDEFGH"
        and suffix[1] in "12345678"
    ):
        return NUMBER
    if name in REGISTERED_BITBOARD_FUNCTIONS:
        return BITBOARD_TRANSFORM
    return UNKNOWN


def target_qualified_name(name: str) -> str | None:
    """Map source modules whose target import namespace intentionally differs."""

    if name == "chess.pgn":
        return "pgnModule"
    if name.startswith("chess.pgn."):
        suffix = name.removeprefix("chess.pgn.")
        return f"pgnModule.{py_identifier_to_ts(suffix)}"
    if name == "chess.engine":
        return "engineModule"
    if name.startswith("chess.engine."):
        suffix = name.removeprefix("chess.engine.")
        return f"engineModule.{py_identifier_to_ts(suffix)}"
    if name == "chess.svg":
        return "svgModule"
    if name.startswith("chess.svg."):
        suffix = name.removeprefix("chess.svg.")
        return f"svgModule.{py_identifier_to_ts(suffix)}"
    if name == "io.StringIO":
        return "pgnModule.StringIO"
    return None


def attribute_shape(attribute: str, receiver: TargetShape) -> TargetShape:
    kind = receiver.kind
    if kind is ShapeKind.PIECE:
        if attribute == "color":
            return BOOLEAN
        if attribute == "piece_type":
            return NUMBER
    if kind is ShapeKind.MOVE:
        if attribute in {"from_square", "to_square"}:
            return NUMBER
        if attribute in {"promotion", "drop"}:
            return NUMBER.optional()
    if kind is ShapeKind.BOARD:
        if attribute in {"turn", "chess960"}:
            return BOOLEAN
        if attribute in {"fullmove_number", "halfmove_clock"}:
            return NUMBER
        if attribute == "castling_rights":
            return BIGINT
        if attribute == "ep_square":
            return NUMBER.optional()
        if attribute == "legal_moves":
            return LEGAL_MOVE_GENERATOR
        if attribute == "pseudo_legal_moves":
            return PSEUDO_LEGAL_MOVE_GENERATOR
        if attribute == "move_stack":
            return array_of(MOVE)
    if kind in {ShapeKind.BOARD, ShapeKind.BASE_BOARD}:
        if attribute in {
            "kings",
            "pawns",
            "knights",
            "bishops",
            "rooks",
            "queens",
            "occupied",
            "promoted",
        }:
            return BIGINT
    if kind in {
        ShapeKind.GAME,
        ShapeKind.GAME_NODE,
        ShapeKind.CHILD_GAME_NODE,
    }:
        if attribute == "variations":
            return array_of(CHILD_GAME_NODE)
        if attribute == "nags":
            return set_of(NUMBER)
        if attribute == "parent":
            if kind is ShapeKind.CHILD_GAME_NODE:
                return GAME_NODE
            return GAME_NODE.optional()
        if attribute == "move":
            if kind is ShapeKind.CHILD_GAME_NODE:
                return MOVE
            return MOVE.optional()
        if attribute in {"comments", "starting_comments"}:
            return array_of(STRING)
    if kind is ShapeKind.ARROW and attribute == "color":
        return STRING
    if kind is ShapeKind.GAME and attribute == "headers":
        return HEADERS
    if kind in {
        ShapeKind.STRING_EXPORTER,
        ShapeKind.FILE_EXPORTER,
    } and attribute == "columns":
        return NUMBER.optional()
    return UNKNOWN


def writable_attribute_shape(
    attribute: str, receiver: TargetShape
) -> TargetShape | None:
    """Return the finite target write contract for one source attribute."""

    if receiver.nullable:
        return None
    if receiver.kind is ShapeKind.LOCAL_OBJECT:
        field = dict(receiver.fields).get(attribute)
        if field is not None and field.kind is not ShapeKind.FUNCTION:
            return field
        return None
    if receiver.kind is ShapeKind.BOARD:
        return {
            "castling_rights": BIGINT,
            "chess960": BOOLEAN,
        }.get(attribute)
    if receiver.kind in {
        ShapeKind.GAME,
        ShapeKind.GAME_NODE,
        ShapeKind.CHILD_GAME_NODE,
    }:
        return {
            "comments": array_of(STRING),
            "starting_comments": array_of(STRING),
        }.get(attribute)
    if receiver.kind in {
        ShapeKind.STRING_EXPORTER,
        ShapeKind.FILE_EXPORTER,
    } and attribute == "columns":
        return NUMBER.optional()
    return None


NUMBER_RULE = exact(NUMBER)
NUMBER_OR_NULL_RULE = exact(NUMBER, NULL, description="number or null")
BIGINT_RULE = exact(BIGINT)
BOOLEAN_RULE = exact(BOOLEAN)
STRING_RULE = exact(STRING, WDL_MODEL, description="string")
WDL_MODEL_VALUES = (
    "sf",
    "sf16.1",
    "sf16",
    "sf15.1",
    "sf15",
    "sf14",
    "sf12",
    "lichess",
)
WDL_MODEL_RULE = finite_string_literals(
    WDL_MODEL,
    *WDL_MODEL_VALUES,
    description="registered WDL model",
)
MOVE_RULE = exact(MOVE)
PIECE_RULE = exact(PIECE)
VARIATION_SELECTOR_RULE = exact(
    NUMBER,
    MOVE,
    GAME,
    GAME_NODE,
    CHILD_GAME_NODE,
    description="variation index, Move, or GameNode",
)
EXPORTER_RULE = exact(
    STRING_EXPORTER,
    FILE_EXPORTER,
    description="StringExporter or FileExporter",
)
STRING_IO_RULE = exact(STRING_IO)
ARRAY_NUMBER_RULE = exact(array_of(NUMBER))
ARRAY_MOVE_RULE = exact(array_of(MOVE))
TWO_NUMBER_TUPLE_RULE = exact(tuple_of(NUMBER, NUMBER))
SCORE_RULE = exact(SCORE)
POV_SCORE_OR_NULL_RULE = exact(POV_SCORE, NULL, description="PovScore or null")
ARROW_INPUT_ARRAY_RULE = exact(
    array_of(ARROW_INPUT),
    array_of(ARROW),
    array_of(tuple_of(NUMBER, NUMBER)),
    description="array of Arrow objects or square pairs",
)
EXPORTER_KEYWORDS = (
    ("columns", NUMBER_OR_NULL_RULE),
    ("headers", BOOLEAN_RULE),
    ("comments", BOOLEAN_RULE),
    ("variations", BOOLEAN_RULE),
)
MAP_PIECE_RULE = exact(map_of(NUMBER, PIECE))
PIECE_OR_NULL_RULE = exact(PIECE, NULL, description="piece or null")
BITBOARD_INPUT_RULE = exact(
    BIGINT,
    SQUARE_SET,
    description="bitboard or coercible SquareSet",
)
SQUARE_SET_INPUT_RULE = exact(
    BIGINT,
    NUMBER,
    SQUARE_SET,
    array_of(NUMBER),
    description="bigint, proved integer, SquareSet, or array of squares",
)
LOCAL_BOARD_PROTOCOL = local_object(
    "local-board-protocol",
    (
        ("generate_legal_moves", function_of((), iterable_of(VOID))),
    ),
)
LOCAL_BOARD_PROTOCOL_RULE = structural(
    LOCAL_BOARD_PROTOCOL,
    description="local object implementing the generate-legal-moves protocol",
)
LOCAL_BOARD_RULE = ShapeRule(
    shapes=(BOARD,),
    structural=(LOCAL_BOARD_PROTOCOL,),
    description="Board or local generate-legal-moves protocol",
)

LOCAL_BOARD_ASSERTION = TypeAssertion(
    target_type="chess.Board",
    marker="protocol-adapter: legal-move-generator-board",
    via_unknown=True,
)
CHILD_NODE_GUARD = RuntimeTypeGuard(
    constructor="pgnModule.ChildNode",
    failure=(
        "GameNode.add_line() received a non-empty exact move sequence "
        "but did not return ChildNode"
    ),
)


def named_call_contract(name: str | None) -> CallContract | None:
    """Return the complete contract for one registered named call."""

    contracts = {
        "chess.Board": call_contract(
            BOARD,
            optional=(exact(STRING, NULL, description="FEN string or null"),),
            keywords=(("chess960", BOOLEAN_RULE),),
            invocation=InvocationKind.CONSTRUCT,
            keyword_style=KeywordStyle.OPTIONS_OBJECT,
        ),
        "chess.BaseBoard": call_contract(
            BASE_BOARD,
            invocation=InvocationKind.CONSTRUCT,
        ),
        "chess.Move": call_contract(
            MOVE,
            NUMBER_RULE,
            NUMBER_RULE,
            optional=(NUMBER_RULE,),
            invocation=InvocationKind.CONSTRUCT,
            positional_options=((2, "promotion"),),
        ),
        "chess.Piece": call_contract(
            PIECE,
            NUMBER_RULE,
            BOOLEAN_RULE,
            invocation=InvocationKind.CONSTRUCT,
        ),
        "chess.SquareSet": call_contract(
            SQUARE_SET,
            SQUARE_SET_INPUT_RULE,
            invocation=InvocationKind.CONSTRUCT,
            argument_adapters=(
                ArgumentAdapter(
                    index=0,
                    source=NUMBER_RULE,
                    kind=ArgumentAdapterKind.TO_BIGINT,
                    result=BIGINT,
                ),
            ),
        ),
        "chess.LegalMoveGenerator": call_contract(
            LEGAL_MOVE_GENERATOR,
            LOCAL_BOARD_RULE,
            invocation=InvocationKind.CONSTRUCT,
            argument_adapters=(
                ArgumentAdapter(
                    index=0,
                    source=LOCAL_BOARD_PROTOCOL_RULE,
                    kind=ArgumentAdapterKind.TYPE_ASSERTION,
                    result=BOARD,
                    assertion=LOCAL_BOARD_ASSERTION,
                    result_override=LEGAL_MOVE_ITERATOR,
                ),
            ),
        ),
        "chess.pgn.Game": call_contract(
            GAME,
            invocation=InvocationKind.CONSTRUCT,
        ),
        "chess.pgn.StringExporter": call_contract(
            STRING_EXPORTER,
            keywords=EXPORTER_KEYWORDS,
            invocation=InvocationKind.CONSTRUCT,
            keyword_style=KeywordStyle.OPTIONS_OBJECT,
        ),
        "chess.pgn.FileExporter": call_contract(
            FILE_EXPORTER,
            STRING_IO_RULE,
            keywords=EXPORTER_KEYWORDS,
            invocation=InvocationKind.CONSTRUCT,
            keyword_style=KeywordStyle.OPTIONS_OBJECT,
        ),
        "io.StringIO": call_contract(
            STRING_IO,
            optional=(STRING_RULE,),
            invocation=InvocationKind.CONSTRUCT,
        ),
        "chess.pgn.read_game": call_contract(
            GAME.optional(),
            STRING_IO_RULE,
        ),
        "chess.engine.Cp": call_contract(
            SCORE,
            NUMBER_RULE,
            invocation=InvocationKind.CONSTRUCT,
        ),
        "chess.engine.Mate": call_contract(
            SCORE,
            NUMBER_RULE,
            invocation=InvocationKind.CONSTRUCT,
        ),
        "chess.engine.PovScore": call_contract(
            POV_SCORE,
            SCORE_RULE,
            BOOLEAN_RULE,
            invocation=InvocationKind.CONSTRUCT,
        ),
        "chess.engine.Wdl": call_contract(
            WDL,
            NUMBER_RULE,
            NUMBER_RULE,
            NUMBER_RULE,
            invocation=InvocationKind.CONSTRUCT,
        ),
        "chess.svg.Arrow": call_contract(
            ARROW,
            NUMBER_RULE,
            NUMBER_RULE,
            keywords=(("color", STRING_RULE),),
            invocation=InvocationKind.CONSTRUCT,
            keyword_style=KeywordStyle.OPTIONS_OBJECT,
        ),
        "chess.Board.empty": call_contract(BOARD),
        "chess.BaseBoard.empty": call_contract(BASE_BOARD),
        "chess.Board.from_epd": call_contract(
            tuple_of(BOARD, keyed_map(("ce", NUMBER))), STRING_RULE
        ),
        "chess.Move.from_uci": call_contract(MOVE, STRING_RULE),
        "chess.Piece.from_symbol": call_contract(PIECE, STRING_RULE),
        "chess.SquareSet.from_square": call_contract(SQUARE_SET, NUMBER_RULE),
        "chess.square": call_contract(NUMBER, NUMBER_RULE, NUMBER_RULE),
        "chess.square_file": call_contract(NUMBER, NUMBER_RULE),
        "chess.square_rank": call_contract(NUMBER, NUMBER_RULE),
        "chess.square_distance": call_contract(NUMBER, NUMBER_RULE, NUMBER_RULE),
        "chess.square_manhattan_distance": call_contract(
            NUMBER, NUMBER_RULE, NUMBER_RULE
        ),
        "chess.square_knight_distance": call_contract(
            NUMBER, NUMBER_RULE, NUMBER_RULE
        ),
        "chess.parse_square": call_contract(NUMBER, STRING_RULE),
        "chess.popcount": call_contract(NUMBER, BIGINT_RULE),
        "chess.square_name": call_contract(STRING, NUMBER_RULE),
    }
    contract = contracts.get(name or "")
    if contract is not None:
        return contract
    if name in REGISTERED_BITBOARD_FUNCTIONS:
        return bitboard_transform_contract()
    return None


def bitboard_transform_contract() -> CallContract:
    """Return the shared source contract for named or first-class transforms."""

    return call_contract(
        BIGINT,
        BITBOARD_INPUT_RULE,
        argument_adapters=(
            ArgumentAdapter(
                index=0,
                source=exact(SQUARE_SET),
                kind=ArgumentAdapterKind.CALL_METHOD,
                result=BIGINT,
                method="int",
            ),
        ),
    )


def callable_shape_contract(shape: TargetShape) -> CallContract | None:
    """Resolve a first-class callable without recovering its source name."""

    if shape.kind is ShapeKind.BITBOARD_TRANSFORM:
        return bitboard_transform_contract()
    return None


def named_call_shape(name: str | None) -> TargetShape:
    contract = named_call_contract(name)
    return contract.result if contract is not None else UNKNOWN


def method_call_contract(
    method: str, receiver: TargetShape
) -> CallContract | None:
    """Return a receiver-keyed contract for every registered method call."""

    if receiver.nullable:
        return None
    kind = receiver.kind

    if kind is ShapeKind.BOARD:
        no_arg = {
            "is_check": BOOLEAN,
            "is_checkmate": BOOLEAN,
            "is_stalemate": BOOLEAN,
            "ply": NUMBER,
            "status": NUMBER,
            "shredder_fen": STRING,
            "epd": STRING,
            "peek": MOVE,
            "pop": MOVE,
            "clean_castling_rights": BIGINT,
            "generate_pseudo_legal_moves": iterable_of(MOVE),
            "generate_legal_moves": iterable_of(MOVE),
            "piece_map": map_of(NUMBER, PIECE),
            "piece_count": NUMBER,
            "clear": VOID,
            "clear_stack": VOID,
        }
        if method in no_arg:
            return call_contract(no_arg[method])
        if method in {
            "has_castling_rights",
            "has_kingside_castling_rights",
            "has_queenside_castling_rights",
        }:
            return call_contract(BOOLEAN, BOOLEAN_RULE)
        if method == "king":
            return call_contract(NUMBER.optional(), BOOLEAN_RULE)
        if method in {"is_legal", "is_pseudo_legal"}:
            return call_contract(BOOLEAN, MOVE_RULE)
        if method == "is_game_over":
            return call_contract(
                BOOLEAN,
                keywords=(("claim_draw", BOOLEAN_RULE),),
                keyword_style=KeywordStyle.OPTIONS_OBJECT,
            )
        if method == "fen":
            return call_contract(
                STRING,
                keywords=(("en_passant", STRING_RULE),),
                keyword_style=KeywordStyle.OPTIONS_OBJECT,
            )
        if method == "result":
            return call_contract(
                STRING,
                keywords=(("claim_draw", BOOLEAN_RULE),),
                keyword_style=KeywordStyle.OPTIONS_OBJECT,
            )
        if method in {"san", "lan", "xboard"}:
            return call_contract(STRING, MOVE_RULE)
        if method == "variation_san":
            return call_contract(STRING, ARRAY_MOVE_RULE)
        if method in {"parse_san", "parse_xboard"}:
            return call_contract(MOVE, STRING_RULE)
        if method == "find_move":
            return call_contract(
                MOVE, NUMBER_RULE, NUMBER_RULE, optional=(NUMBER_RULE,)
            )
        if method == "piece_at":
            return call_contract(PIECE.optional(), NUMBER_RULE)
        if method == "piece_type_at":
            return call_contract(NUMBER.optional(), NUMBER_RULE)
        if method == "color_at":
            return call_contract(BOOLEAN.optional(), NUMBER_RULE)
        if method == "generate_castling_moves":
            return call_contract(
                iterable_of(MOVE), optional=(BIGINT_RULE, BIGINT_RULE)
            )
        if method == "push":
            return call_contract(VOID, MOVE_RULE)
        if method in {"push_san", "push_uci", "set_board_fen", "set_fen"}:
            return call_contract(VOID, STRING_RULE)
        if method == "set_epd":
            return call_contract(map_of(STRING, UNKNOWN), STRING_RULE)
        if method == "remove_piece_at":
            return call_contract(VOID, NUMBER_RULE)
        if method == "set_piece_at":
            return call_contract(
                VOID,
                NUMBER_RULE,
                PIECE_OR_NULL_RULE,
                keywords=(("promoted", BOOLEAN_RULE),),
                keyword_style=KeywordStyle.POSITIONAL,
            )

    if kind is ShapeKind.BASE_BOARD:
        if method == "piece_map":
            return call_contract(map_of(NUMBER, PIECE))
        if method == "set_piece_map":
            return call_contract(VOID, MAP_PIECE_RULE)

    if kind is ShapeKind.MOVE and method in {"uci", "xboard"}:
        return call_contract(STRING)

    if kind is ShapeKind.PIECE:
        if method == "symbol":
            return call_contract(STRING)

    if kind is ShapeKind.SQUARE_SET:
        no_arg = {
            "pop": NUMBER,
            "carry_rippler": iterable_of(BIGINT),
            "tolist": array_of(BOOLEAN),
            "copy": SQUARE_SET,
            "mirror": SQUARE_SET,
            "clear": VOID,
        }
        if method in no_arg:
            return call_contract(no_arg[method])
        if method in {"isdisjoint", "issubset", "issuperset"}:
            return call_contract(BOOLEAN, exact(SQUARE_SET))
        if method in {"union", "intersection", "difference", "symmetric_difference"}:
            return call_contract(SQUARE_SET, exact(SQUARE_SET))
        if method in {
            "update",
            "intersection_update",
            "difference_update",
            "symmetric_difference_update",
        }:
            return call_contract(VOID, BIGINT_RULE)
        if method in {"add", "discard", "remove"}:
            return call_contract(VOID, NUMBER_RULE)

    if kind in {
        ShapeKind.LEGAL_MOVE_GENERATOR,
        ShapeKind.LEGAL_MOVE_ITERATOR,
        ShapeKind.PSEUDO_LEGAL_MOVE_GENERATOR,
    }:
        if method == "count":
            return call_contract(NUMBER)

    if kind in {
        ShapeKind.GAME,
        ShapeKind.GAME_NODE,
        ShapeKind.CHILD_GAME_NODE,
    }:
        if method in {"is_mainline", "starts_variation", "is_end"}:
            return call_contract(BOOLEAN)
        if kind in {
            ShapeKind.GAME_NODE,
            ShapeKind.CHILD_GAME_NODE,
        } and method == "is_main_variation":
            return call_contract(BOOLEAN)
        if kind is ShapeKind.CHILD_GAME_NODE and method in {"san", "uci"}:
            return call_contract(STRING)
        if method == "has_variation":
            return call_contract(BOOLEAN, VARIATION_SELECTOR_RULE)
        if method == "variation":
            return call_contract(CHILD_GAME_NODE, VARIATION_SELECTOR_RULE)
        if method in {
            "promote_to_main",
            "promote",
            "demote",
            "remove_variation",
        }:
            return call_contract(VOID, VARIATION_SELECTOR_RULE)
        if method in {"clock", "emt"}:
            return call_contract(FLOAT.optional())
        if method == "eval_depth":
            return call_contract(NUMBER.optional())
        if method in {"set_clock", "set_emt"}:
            return call_contract(
                VOID,
                exact(NUMBER, FLOAT, NULL, description="number or null"),
            )
        if method == "eval":
            return call_contract(POV_SCORE.optional())
        if method == "set_eval":
            return call_contract(
                VOID,
                POV_SCORE_OR_NULL_RULE,
                optional=(NUMBER_OR_NULL_RULE,),
            )
        if method == "arrows":
            return call_contract(array_of(ARROW))
        if method == "set_arrows":
            return call_contract(VOID, ARROW_INPUT_ARRAY_RULE)
        if method in {"root", "end"}:
            return call_contract(GAME_NODE)
        if method in {"add_variation", "add_main_variation"}:
            return call_contract(CHILD_GAME_NODE, MOVE_RULE)
        if method == "board":
            return call_contract(BOARD)
        if kind is ShapeKind.GAME:
            if method == "add_line":
                return call_contract(
                    GAME_NODE,
                    ARRAY_MOVE_RULE,
                    keywords=(
                        ("starting_comment", STRING_RULE),
                        ("comment", STRING_RULE),
                        ("nags", TWO_NUMBER_TUPLE_RULE),
                    ),
                    keyword_style=KeywordStyle.OPTIONS_OBJECT,
                    result_refinement=NonEmptySequenceResult(
                        argument_index=0,
                        result=CHILD_GAME_NODE,
                        guard=CHILD_NODE_GUARD,
                        repeated_attribute="parent",
                    ),
                )
            if method == "mainline_moves":
                return call_contract(MAINLINE_MOVE)
            if method == "accept":
                return call_contract(VOID, EXPORTER_RULE)

    if kind is ShapeKind.POV_SCORE:
        if method in {"white", "black"}:
            return call_contract(SCORE)

    if kind is ShapeKind.SCORE:
        if method in {"score", "mate"}:
            if method == "score":
                return call_contract(
                    NUMBER.optional(),
                    keywords=(("mate_score", NUMBER_OR_NULL_RULE),),
                    keyword_style=KeywordStyle.OPTIONS_OBJECT,
                )
            return call_contract(NUMBER.optional())
        if method == "wdl":
            return call_contract(
                WDL,
                keywords=(
                    ("model", WDL_MODEL_RULE),
                    ("ply", NUMBER_RULE),
                ),
                keyword_style=KeywordStyle.OPTIONS_OBJECT,
            )

    if kind is ShapeKind.WDL:
        if method in {
            "expectation",
            "winning_chance",
            "drawing_chance",
            "losing_chance",
        }:
            return call_contract(FLOAT)

    if kind is ShapeKind.STRING_IO and method in {"getvalue", "read"}:
        return call_contract(
            STRING,
            target_member="getValue" if method == "getvalue" else None,
        )

    if kind is ShapeKind.SET and receiver.element is not None:
        element_rule = exact(receiver.element)
        if method == "add":
            return call_contract(VOID, element_rule)
        if method in {
            "isdisjoint",
            "issubset",
            "issuperset",
        }:
            return call_contract(BOOLEAN, exact(receiver))
        if method in {
            "union",
            "intersection",
            "difference",
            "symmetric_difference",
        }:
            return call_contract(receiver, exact(receiver))

    if kind is ShapeKind.ARRAY and receiver.element is not None:
        if method == "count":
            return call_contract(NUMBER, exact(receiver.element))

    return None


def method_call_shape(method: str, receiver: TargetShape) -> TargetShape:
    contract = method_call_contract(method, receiver)
    return contract.result if contract is not None else UNKNOWN
