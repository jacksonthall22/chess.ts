"""Atomic, fail-closed TypeScript operations for proved target shapes."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

from .target import ShapeKind, TargetShape


class NativeLoweringError(ValueError):
    """A source operation has no semantics-preserving target rule."""


@dataclass(frozen=True, slots=True)
class NativeExpression:
    code: str
    shape: TargetShape


FreshName = Callable[[str], str]


def _local_name_allocator() -> FreshName:
    used: set[str] = set()

    def fresh(preferred: str) -> str:
        candidate = preferred
        suffix = 2
        while candidate in used:
            candidate = f"{preferred}{suffix}"
            suffix += 1
        used.add(candidate)
        return candidate

    return fresh


def truthy_code(code: str, shape: TargetShape) -> str:
    if shape.nullable:
        raise NativeLoweringError(
            f"truthiness is not defined for nullable {shape.kind.value}"
        )
    kind = shape.kind
    if kind is ShapeKind.BOOLEAN and not shape.nullable:
        return code
    if kind in {ShapeKind.NUMBER, ShapeKind.FLOAT}:
        return f"{code} !== 0"
    if kind is ShapeKind.BIGINT:
        return f"{code} !== 0n"
    if kind in {
        ShapeKind.STRING,
        ShapeKind.WDL_MODEL,
        ShapeKind.ARRAY,
        ShapeKind.PIECE_VALUE_SET,
    }:
        return f"{code}.length !== 0"
    if kind is ShapeKind.SET:
        return f"{code}.size !== 0"
    if kind in {
        ShapeKind.MOVE,
        ShapeKind.SQUARE_SET,
        ShapeKind.LEGAL_MOVE_GENERATOR,
        ShapeKind.LEGAL_MOVE_ITERATOR,
        ShapeKind.PSEUDO_LEGAL_MOVE_GENERATOR,
        ShapeKind.MAINLINE,
    }:
        return f"{code}.bool()"
    if kind is ShapeKind.NULL:
        return "false"
    raise NativeLoweringError(f"truthiness is not defined for {kind.value}")


def piece_equality_code(
    left_code: str,
    right_code: str,
    *,
    fresh_name: FreshName | None = None,
) -> str:
    """Call the production equality contract for direct Python equality."""

    return f"({left_code}).equals({right_code})"


def piece_set_equality_code(
    left_code: str,
    right_code: str,
    *,
    fresh_name: FreshName | None = None,
) -> str:
    """Mirror Python set lookup: compare hashes before calling equality."""

    fresh = fresh_name or _local_name_allocator()
    piece = fresh("__piece")
    other = fresh("__other")
    return (
        f"(() => {{ const {piece} = {left_code}; "
        f"const {other} = {right_code}; "
        f"if ({piece}.hash() !== {other}.hash()) return false; "
        f"return {piece}.equals({other}); }})()"
    )


def equality_code(
    left: TargetShape,
    right: TargetShape,
    left_code: str,
    right_code: str,
    *,
    depth: int = 0,
    fresh_name: FreshName | None = None,
) -> str:
    fresh = fresh_name or _local_name_allocator()
    if left.kind in {ShapeKind.UNKNOWN, ShapeKind.VOID} or right.kind in {
        ShapeKind.UNKNOWN,
        ShapeKind.VOID,
    }:
        raise NativeLoweringError(
            f"equality is not defined for {left.kind.value} and {right.kind.value}"
        )
    if right.kind is ShapeKind.NULL:
        return f"{left_code} === null"
    if left.kind is ShapeKind.NULL:
        return f"{right_code} === null"
    if left.nullable and right.nullable:
        comparison = equality_code(
            left.required(),
            right.required(),
            left_code,
            right_code,
            depth=depth,
            fresh_name=fresh,
        )
        return (
            f"({left_code} === null && {right_code} === null) || "
            f"({left_code} !== null && {right_code} !== null && ({comparison}))"
        )
    if left.nullable:
        comparison = equality_code(
            left.required(),
            right,
            left_code,
            right_code,
            depth=depth,
            fresh_name=fresh,
        )
        return f"{left_code} !== null && ({comparison})"
    if right.nullable:
        comparison = equality_code(
            left,
            right.required(),
            left_code,
            right_code,
            depth=depth,
            fresh_name=fresh,
        )
        return f"{right_code} !== null && ({comparison})"

    primitive = {
        ShapeKind.BOOLEAN,
        ShapeKind.NUMBER,
        ShapeKind.FLOAT,
        ShapeKind.BIGINT,
        ShapeKind.STRING,
    }
    if left.kind == right.kind and left.kind in primitive:
        return f"{left_code} === {right_code}"
    if {left.kind, right.kind} == {ShapeKind.STRING, ShapeKind.WDL_MODEL}:
        return f"{left_code} === {right_code}"
    if {left.kind, right.kind} == {ShapeKind.NUMBER, ShapeKind.FLOAT}:
        return f"{left_code} === {right_code}"
    if {left.kind, right.kind} == {ShapeKind.NUMBER, ShapeKind.BIGINT}:
        if left.kind is ShapeKind.NUMBER:
            return f"BigInt({left_code}) === {right_code}"
        return f"{left_code} === BigInt({right_code})"

    if left.kind is ShapeKind.PIECE and right.kind is ShapeKind.PIECE:
        return piece_equality_code(left_code, right_code, fresh_name=fresh)
    if left.kind is ShapeKind.MOVE and right.kind is ShapeKind.MOVE:
        return f"{left_code}.equals({right_code})"
    if left.kind is ShapeKind.BOARD and right.kind is ShapeKind.BOARD:
        return f"{left_code}.equals({right_code})"
    if left.kind is ShapeKind.BASE_BOARD and right.kind is ShapeKind.BASE_BOARD:
        return f"{left_code}.equals({right_code})"
    if left.kind is ShapeKind.SCORE and right.kind is ShapeKind.SCORE:
        return f"{left_code}.equals({right_code})"
    if left.kind is ShapeKind.WDL and right.kind is ShapeKind.WDL:
        return f"{left_code}.equals({right_code})"
    if left.kind is ShapeKind.SQUARE_SET and right.kind in {
        ShapeKind.SQUARE_SET,
        ShapeKind.BIGINT,
    }:
        return f"{left_code}.equals({right_code})"
    if right.kind is ShapeKind.SQUARE_SET and left.kind is ShapeKind.BIGINT:
        return f"{right_code}.equals({left_code})"

    game_nodes = {
        ShapeKind.GAME,
        ShapeKind.GAME_NODE,
        ShapeKind.CHILD_GAME_NODE,
    }
    if left.kind in game_nodes and right.kind in game_nodes:
        return f"{left_code} === {right_code}"

    if left.kind is ShapeKind.ARRAY and right.kind is ShapeKind.ARRAY:
        if left.element is None or right.element is None:
            raise NativeLoweringError("array equality requires element shapes")
        index = fresh(f"__index{depth}")
        value = fresh(f"__value{depth}")
        expected = fresh(f"__expected{depth}")
        element_comparison = equality_code(
            left.element,
            right.element,
            value,
            expected,
            depth=depth + 1,
            fresh_name=fresh,
        )
        return (
            f"{left_code}.length === {right_code}.length && "
            f"{left_code}.every(({value}, {index}) => "
            f"{right_code}.slice({index}, {index} + 1)"
            f".some({expected} => {element_comparison}))"
        )
    if left.kind is ShapeKind.SET and right.kind is ShapeKind.SET:
        if left.element is None or right.element is None:
            raise NativeLoweringError("set equality requires element shapes")
        primitive_elements = {
            ShapeKind.BOOLEAN,
            ShapeKind.NUMBER,
            ShapeKind.BIGINT,
            ShapeKind.STRING,
        }
        if (
            left.element != right.element
            or left.element.nullable
            or left.element.kind not in primitive_elements
        ):
            raise NativeLoweringError(
                "native Set equality requires matching primitive elements"
            )
        value = fresh("__setValue")
        return (
            f"{left_code}.size === {right_code}.size && "
            f"Array.from({left_code}).every({value} => "
            f"{right_code}.has({value}))"
        )
    raise NativeLoweringError(
        f"equality is not defined for {left.kind.value} and {right.kind.value}"
    )


def ordering_code(
    operator: str,
    left: TargetShape,
    right: TargetShape,
    left_code: str,
    right_code: str,
    *,
    fresh_name: FreshName | None = None,
) -> str:
    """Lower one Python total-order operation without JS coercion."""

    fresh = fresh_name or _local_name_allocator()
    symbols = {"lt": "<", "le": "<=", "gt": ">", "ge": ">="}
    symbol = symbols.get(operator)
    if symbol is None:
        raise NativeLoweringError(f"unknown ordering operator {operator}")

    if left.nullable or right.nullable:
        required_left = left.required() if left.nullable else left
        required_right = right.required() if right.nullable else right
        comparison = ordering_code(
            operator,
            required_left,
            required_right,
            left_code,
            right_code,
            fresh_name=fresh,
        )
        return (
            "(() => { "
            f"if ({left_code} === null || {right_code} === null) "
            'throw new TypeError("cannot order null and a value"); '
            f"return {comparison}; "
            "})()"
        )

    numeric = {ShapeKind.NUMBER, ShapeKind.FLOAT}
    if left.kind in numeric and right.kind in numeric:
        return f"{left_code} {symbol} {right_code}"
    if left.kind == right.kind and left.kind is ShapeKind.BIGINT:
        return f"{left_code} {symbol} {right_code}"
    string_like = {ShapeKind.STRING, ShapeKind.WDL_MODEL}
    if left.kind in string_like and right.kind in string_like:
        left_characters = fresh("__leftCharacters")
        right_characters = fresh("__rightCharacters")
        length = fresh("__length")
        index = fresh("__index")
        left_point = fresh("__leftPoint")
        right_point = fresh("__rightPoint")
        comparison = (
            "(() => { "
            f"const {left_characters} = Array.from({left_code}); "
            f"const {right_characters} = Array.from({right_code}); "
            f"const {length} = Math.min("
            f"{left_characters}.length, {right_characters}.length); "
            f"for (let {index} = 0; {index} < {length}; {index} += 1) {{ "
            f"const {left_point} = {left_characters}[{index}].codePointAt(0); "
            f"const {right_point} = {right_characters}[{index}].codePointAt(0); "
            f"if ({left_point} === undefined || {right_point} === undefined) "
            'throw new Error("a Unicode character must contain one code point"); '
            f"if ({left_point} < {right_point}) return -1; "
            f"if ({left_point} > {right_point}) return 1; "
            "} "
            f"if ({left_characters}.length < {right_characters}.length) return -1; "
            f"if ({left_characters}.length > {right_characters}.length) return 1; "
            "return 0; "
            "})()"
        )
        return f"{comparison} {symbol} 0"
    if left.kind is ShapeKind.SCORE and right.kind is ShapeKind.SCORE:
        return f"{left_code}.{operator}({right_code})"
    raise NativeLoweringError(
        f"ordering is not defined for {left.kind.value} and {right.kind.value}"
    )


def contains_callback(
    container: TargetShape,
    member: TargetShape,
    *,
    fresh_name: FreshName | None = None,
) -> str:
    fresh = fresh_name or _local_name_allocator()
    if container.nullable or member.nullable:
        raise NativeLoweringError(
            "containment requires non-null container and member shapes"
        )
    container_name = fresh("__container")
    member_name = fresh("__member")
    if container.kind is ShapeKind.STRING and member.kind is ShapeKind.STRING:
        return (
            f"({container_name}, {member_name}) => "
            f"{container_name}.includes({member_name})"
        )
    if container.kind is ShapeKind.SET:
        if container.element is None:
            raise NativeLoweringError("Set containment requires an element shape")
        primitive = {
            ShapeKind.BOOLEAN,
            ShapeKind.NUMBER,
            ShapeKind.BIGINT,
            ShapeKind.STRING,
        }
        if (
            container.element != member
            or container.element.nullable
            or container.element.kind not in primitive
        ):
            raise NativeLoweringError(
                "Set containment requires matching primitive value-semantic elements"
            )
        return (
            f"({container_name}, {member_name}) => "
            f"{container_name}.has({member_name})"
        )
    if container.kind in {
        ShapeKind.LEGAL_MOVE_GENERATOR,
        ShapeKind.PSEUDO_LEGAL_MOVE_GENERATOR,
    } and member.kind is ShapeKind.MOVE:
        return (
            f"({container_name}, {member_name}) => "
            f"{container_name}.contains({member_name})"
        )
    if container.kind is ShapeKind.HEADERS and member.kind is ShapeKind.STRING:
        return (
            f"({container_name}, {member_name}) => "
            f"{container_name}.includes({member_name})"
        )
    if container.kind in {ShapeKind.ARRAY, ShapeKind.ITERABLE}:
        if container.element is None:
            raise NativeLoweringError(
                "iterable containment requires an element shape"
            )
        candidate = fresh("__candidate")
        comparison = equality_code(
            container.element,
            member,
            candidate,
            member_name,
            fresh_name=fresh,
        )
        return (
            f"({container_name}, {member_name}) => {{ "
            f"for (const {candidate} of {container_name}) {{ "
            f"if ({comparison}) return true; "
            "} return false; }"
        )
    raise NativeLoweringError(
        f"containment is not defined for {member.kind.value} in {container.kind.value}"
    )


def native_set_method(
    receiver_code: str,
    receiver_shape: TargetShape,
    method: str,
    argument_code: str,
    argument_shape: TargetShape,
    *,
    fresh_name: FreshName | None = None,
) -> NativeExpression:
    fresh = fresh_name or _local_name_allocator()
    if (
        receiver_shape.kind is not ShapeKind.SET
        or receiver_shape.nullable
        or receiver_shape.element is None
    ):
        raise NativeLoweringError(f"set.{method} requires a native Set receiver")
    if argument_shape.kind is not ShapeKind.SET or argument_shape.nullable:
        raise NativeLoweringError(f"set.{method} requires one native Set argument")
    if argument_shape.element is None:
        raise NativeLoweringError(f"set.{method} requires an argument element shape")
    supported_elements = {
        ShapeKind.BOOLEAN,
        ShapeKind.NUMBER,
        ShapeKind.BIGINT,
        ShapeKind.STRING,
    }
    if (
        receiver_shape.element != argument_shape.element
        or receiver_shape.element.nullable
        or receiver_shape.element.kind not in supported_elements
    ):
        raise NativeLoweringError(
            f"set.{method} requires matching primitive element shapes"
        )

    left = receiver_code
    right = argument_code
    if method == "isdisjoint":
        value = fresh("__setValue")
        return NativeExpression(
            f"Array.from({left}).every({value} => !{right}.has({value}))",
            TargetShape(ShapeKind.BOOLEAN),
        )
    if method == "issubset":
        value = fresh("__setValue")
        return NativeExpression(
            f"Array.from({left}).every({value} => {right}.has({value}))",
            TargetShape(ShapeKind.BOOLEAN),
        )
    if method == "issuperset":
        value = fresh("__setValue")
        return NativeExpression(
            f"Array.from({right}).every({value} => {left}.has({value}))",
            TargetShape(ShapeKind.BOOLEAN),
        )
    if method == "union":
        return NativeExpression(f"new Set([...{left}, ...{right}])", receiver_shape)
    if method == "intersection":
        value = fresh("__setValue")
        return NativeExpression(
            f"new Set(Array.from({left}).filter({value} => "
            f"{right}.has({value})))",
            receiver_shape,
        )
    if method == "difference":
        value = fresh("__setValue")
        return NativeExpression(
            f"new Set(Array.from({left}).filter({value} => "
            f"!{right}.has({value})))",
            receiver_shape,
        )
    if method == "symmetric_difference":
        left_value = fresh("__leftValue")
        right_value = fresh("__rightValue")
        return NativeExpression(
            "new Set(["
            f"...Array.from({left}).filter({left_value} => "
            f"!{right}.has({left_value})), "
            f"...Array.from({right}).filter({right_value} => "
            f"!{left}.has({right_value}))])",
            receiver_shape,
        )
    raise NativeLoweringError(f"unsupported native Set method {method}")
