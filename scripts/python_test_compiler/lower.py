"""Recursive Python-AST to TypeScript lowering for the selected tests.

Each handler owns one Python construct.  Compound handlers lower their child
nodes first and only then assemble the TypeScript fragment for the parent.
There is deliberately no textual search-and-replace fallback.
"""

from __future__ import annotations

import ast
import json
import math
import textwrap
from collections import Counter
from dataclasses import dataclass, field
from typing import Callable, NoReturn

from transpilation_helper import py_identifier_to_ts

from .gaps import (
    AssertionMismatch,
    ErrorContinuation,
    ExpectedError,
    GapCase,
    PARITY_GAPS,
    resolve_selector,
)
from .model import SourceComment, SourceUnit, TestMethod
from .native import (
    FreshName,
    NativeLoweringError,
    contains_callback as native_contains_callback,
    equality_code as native_equality_code,
    native_set_method as lower_native_set_method,
    ordering_code as native_ordering_code,
    piece_equality_code,
    piece_set_equality_code,
    truthy_code as native_truthy_code,
)
from .registry import (
    ArgumentAdapterKind,
    CallContract,
    CallContractError,
    InvocationKind,
    KeywordStyle,
    ShapeRule,
    TypeAssertion,
    attribute_shape,
    callable_shape_contract,
    exception_has_ordinary_message,
    exact,
    method_call_contract,
    named_call_contract,
    qualified_name_shape,
    registered_exception_constructor,
    target_qualified_name,
    validate_call_contract,
    writable_attribute_shape,
)
from .target import (
    ARROW_INPUT,
    BASE_BOARD,
    BIGINT,
    BOARD,
    CHILD_GAME_NODE,
    BOOLEAN,
    GAME,
    GAME_NODE,
    FLOAT,
    EXPORTER,
    FILE_EXPORTER,
    HEADERS,
    LEGAL_MOVE_GENERATOR,
    MAINLINE_MOVE,
    MOVE,
    NULL,
    NUMBER,
    PIECE,
    PIECE_VALUE_SET,
    PSEUDO_LEGAL_MOVE_GENERATOR,
    SQUARE_SET,
    STRING,
    STRING_EXPORTER,
    UNKNOWN,
    VOID,
    WDL_MODEL,
    RepeatedAttributeFact,
    RuntimeTypeGuard,
    ShapeKind,
    TargetShape,
    ValueFacts,
    array_of,
    assert_raises_context_of,
    error_of,
    function_of,
    iterable_of,
    local_object,
    map_of,
    set_of,
    tuple_of,
)


@dataclass(frozen=True, slots=True)
class Expression:
    """A complete TypeScript expression and its parsed target shape."""

    code: str
    shape: TargetShape
    facts: ValueFacts = field(default_factory=ValueFacts)
    oracle_representation_pair_code: str | None = None


class UnsupportedSyntax(ValueError):
    """A selected source node has no explicit lowering rule."""


def shape_description(shape: TargetShape) -> str:
    """Render nullability whenever it changes the admitted operation."""

    return (
        f"nullable {shape.kind.value}"
        if shape.nullable
        else shape.kind.value
    )


def shape_is_resolved(shape: TargetShape) -> bool:
    """Return whether a value may cross a generated storage boundary."""

    if shape.kind is ShapeKind.UNKNOWN:
        return False
    if shape.element is not None and not shape_is_resolved(shape.element):
        return False
    if any(not shape_is_resolved(member) for member in shape.members):
        return False
    return all(shape_is_resolved(field) for _name, field in shape.fields)


def typescript_type(shape: TargetShape) -> str:
    """Render the one TypeScript type owned by a proved target shape."""

    scalar_types = {
        ShapeKind.BOOLEAN: "boolean",
        ShapeKind.NUMBER: "number",
        ShapeKind.FLOAT: "number",
        ShapeKind.BIGINT: "bigint",
        ShapeKind.STRING: "string",
        ShapeKind.ERROR: "Error",
        ShapeKind.ASSERT_RAISES_CONTEXT: "Error",
        ShapeKind.MOVE: "chess.Move",
        ShapeKind.PIECE: "chess.Piece",
        ShapeKind.BOARD: "chess.Board",
        ShapeKind.BASE_BOARD: "chess.BaseBoard",
        ShapeKind.SQUARE_SET: "chess.SquareSet",
        ShapeKind.GAME: "pgnModule.Game",
        ShapeKind.GAME_NODE: "pgnModule.GameNode",
        ShapeKind.CHILD_GAME_NODE: "pgnModule.ChildNode",
        ShapeKind.STRING_EXPORTER: "pgnModule.StringExporter",
        ShapeKind.FILE_EXPORTER: "pgnModule.FileExporter",
        ShapeKind.EXPORTER: "pgnModule.StringExporter | pgnModule.FileExporter",
        ShapeKind.SCORE: "engineModule.Score",
        ShapeKind.POV_SCORE: "engineModule.PovScore",
        ShapeKind.WDL: "engineModule.Wdl",
        ShapeKind.ARROW: "svgModule.Arrow",
        ShapeKind.ARROW_INPUT: "svgModule.Arrow | [number, number]",
        ShapeKind.WDL_MODEL: "engineModule.WdlModel",
    }
    rendered = scalar_types.get(shape.kind)
    if rendered is None and shape.kind is ShapeKind.LOCAL_OBJECT and shape.label:
        rendered = py_identifier_to_ts(shape.label)
    if rendered is None:
        raise ValueError(f"no TypeScript declaration type for {shape.kind.value}")
    return f"{rendered} | null" if shape.nullable else rendered


def dotted_name(node: ast.expr) -> str | None:
    parts: list[str] = []
    while isinstance(node, ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if not isinstance(node, ast.Name):
        return None
    parts.append(node.id)
    return ".".join(reversed(parts))


def node_contains(parent: ast.AST, child: ast.AST) -> bool:
    return any(node is child for node in ast.walk(parent))


def function_scope_local_classes(method: ast.FunctionDef) -> tuple[ast.ClassDef, ...]:
    """Collect classes bound by one function without entering nested scopes."""

    classes: list[ast.ClassDef] = []

    class Collector(ast.NodeVisitor):
        def visit_ClassDef(self, node: ast.ClassDef) -> None:
            classes.append(node)

        def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
            return

        def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
            return

        def visit_Lambda(self, node: ast.Lambda) -> None:
            return

    collector = Collector()
    for statement in method.body:
        collector.visit(statement)
    return tuple(classes)


class MethodCompiler:
    """Lower one already-parsed upstream method without reparsing its text."""

    def __init__(self, source_unit: SourceUnit, method: TestMethod) -> None:
        self.source_unit = source_unit
        self.method = method
        self.claimed_comments: set[SourceComment] = set()
        self.claimed_nodes: set[int] = {id(method.node)}
        self.declared_names: set[str] = set()
        self.symbol_shapes: dict[str, TargetShape] = {}
        self.symbol_facts: dict[str, ValueFacts] = {}
        self.symbol_target_names: dict[str, str] = {}
        self.symbol_representation_pair_codes: dict[str, str] = {}
        self.unavailable_names: set[str] = set()
        self.shape_rebind_scopes: list[set[str]] = [set()]
        self.lazy_captured_names: set[str] = set()
        self.in_local_generator_method = False
        self.local_class_nodes = function_scope_local_classes(method.node)
        self.validate_source_bindings()
        source_identifiers = {
            node.id for node in ast.walk(method.node) if isinstance(node, ast.Name)
        }
        source_identifiers.update(
            node.arg for node in ast.walk(method.node) if isinstance(node, ast.arg)
        )
        source_identifiers.update(
            node.name
            for node in ast.walk(method.node)
            if isinstance(node, (ast.ClassDef, ast.FunctionDef))
        )
        self.reserved_target_names = {
            py_identifier_to_ts(name) for name in source_identifiers
        }
        self.assignment_counts = Counter(
            node.id
            for node in ast.walk(method.node)
            if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store)
        )
        self.local_class_names = {
            node.name for node in self.local_class_nodes
        }
        self.local_class_shapes = {
            node.name: self.local_class_shape(node)
            for node in self.local_class_nodes
        }
        self.gaps_by_boundary: dict[int, GapCase] = {}
        self.causes_by_case_id: dict[str, ast.expr] = {}
        for case in PARITY_GAPS.cases_for(method.identity):
            boundary = resolve_selector(source_unit, case.boundary)
            self.gaps_by_boundary[id(boundary)] = case
            if case.cause is not None:
                cause = resolve_selector(source_unit, case.cause)
                if not isinstance(cause, ast.expr):
                    self.fail(cause, "an expected-error cause must be an expression")
                self.causes_by_case_id[case.stable_id] = cause

    def validate_source_bindings(self) -> None:
        """Reject source bindings whose target identity would be ambiguous."""

        class_counts = Counter(node.name for node in self.local_class_nodes)
        duplicate_classes = sorted(
            name for name, count in class_counts.items() if count > 1
        )
        if duplicate_classes:
            self.fail(
                self.local_class_nodes[0],
                "duplicate local class declarations in one function scope: "
                + ", ".join(duplicate_classes),
            )
        direct_class_ids = {
            id(node)
            for node in self.method.node.body
            if isinstance(node, ast.ClassDef)
        }
        nested_classes = [
            node for node in self.local_class_nodes if id(node) not in direct_class_ids
        ]
        if nested_classes:
            self.fail(
                nested_classes[0],
                "local class declarations must be direct test-method statements",
            )

        bindings = {
            node.id
            for node in ast.walk(self.method.node)
            if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store)
        }
        bindings.update(
            node.arg
            for node in ast.walk(self.method.node)
            if isinstance(node, ast.arg) and node.arg != "self"
        )
        bindings.update(
            node.name
            for node in ast.walk(self.method.node)
            if isinstance(node, ast.ClassDef)
        )

        reserved_source_names = {
            "Array",
            "BigInt",
            "Error",
            "KeyError",
            "Map",
            "Number",
            "RangeError",
            "Reflect",
            "RegExp",
            "Set",
            "String",
            "TypeError",
            "ValueError",
            "any",
            "bin",
            "copy",
            "hash",
            "hex",
            "int",
            "io",
            "len",
            "list",
            "range",
            "repr",
            "reversed",
            "set",
            "str",
            "sum",
            "textwrap",
            "chess",
        }
        shadowed = sorted(bindings & reserved_source_names)
        if shadowed:
            self.fail(
                self.method.node,
                "source bindings shadow compiler-owned names: "
                + ", ".join(shadowed),
            )

        reserved_target_names = {
            "TestCase",
            "chess",
            "pgnModule",
            "registerTestCase",
            "break",
            "arguments",
            "await",
            "case",
            "catch",
            "class",
            "const",
            "continue",
            "debugger",
            "default",
            "delete",
            "do",
            "else",
            "enum",
            "export",
            "extends",
            "false",
            "finally",
            "for",
            "function",
            "if",
            "implements",
            "import",
            "in",
            "instanceof",
            "interface",
            "let",
            "new",
            "null",
            "package",
            "private",
            "protected",
            "public",
            "return",
            "super",
            "static",
            "switch",
            "this",
            "throw",
            "true",
            "try",
            "typeof",
            "var",
            "void",
            "while",
            "with",
            "yield",
            "eval",
        }
        by_target: dict[str, set[str]] = {}
        for binding in bindings:
            target = py_identifier_to_ts(binding)
            by_target.setdefault(target, set()).add(binding)
            if target in reserved_target_names:
                self.fail(
                    self.method.node,
                    f"source binding {binding!r} maps to reserved target name "
                    f"{target!r}",
                )
        collisions = {
            target: names for target, names in by_target.items() if len(names) > 1
        }
        if collisions:
            details = ", ".join(
                f"{target}: {sorted(names)}"
                for target, names in sorted(collisions.items())
            )
            self.fail(
                self.method.node,
                "source bindings collide after TypeScript normalization: " + details,
            )

        for class_node in self.local_class_nodes:
            if any(
                isinstance(node, ast.Name)
                and isinstance(node.ctx, ast.Store)
                and node.id == class_node.name
                for node in ast.walk(self.method.node)
            ):
                self.fail(
                    class_node,
                    f"local class name {class_node.name!r} cannot be rebound",
                )

            field_names = {
                target.attr
                for child in ast.walk(class_node)
                if isinstance(child, ast.Assign)
                for target in child.targets
                if isinstance(target, ast.Attribute)
                and isinstance(target.value, ast.Name)
                and target.value.id == "self"
            }
            field_targets: dict[str, set[str]] = {}
            for field_name in field_names:
                field_targets.setdefault(
                    py_identifier_to_ts(field_name), set()
                ).add(field_name)
            field_collisions = {
                target: names
                for target, names in field_targets.items()
                if len(names) > 1
            }
            if field_collisions:
                self.fail(
                    class_node,
                    "local-class fields collide after TypeScript normalization: "
                    + repr(field_collisions),
                )
            reserved_fields = set(field_targets) & reserved_target_names
            if reserved_fields:
                self.fail(
                    class_node,
                    "local-class fields use reserved target names: "
                    + ", ".join(sorted(reserved_fields)),
                )

            method_counts = Counter(
                member.name
                for member in class_node.body
                if isinstance(member, ast.FunctionDef)
            )
            duplicate_methods = sorted(
                name for name, count in method_counts.items() if count > 1
            )
            if duplicate_methods:
                self.fail(
                    class_node,
                    "duplicate local-class method declarations: "
                    + ", ".join(duplicate_methods),
                )

            method_targets: dict[str, set[str]] = {}
            for member in class_node.body:
                if not isinstance(member, ast.FunctionDef):
                    continue
                self.validate_local_method_signature(member)
                target = (
                    "constructor"
                    if member.name == "__init__"
                    else py_identifier_to_ts(member.name)
                )
                method_targets.setdefault(target, set()).add(member.name)
            if "constructor" in method_targets and method_targets["constructor"] != {
                "__init__"
            }:
                self.fail(
                    class_node,
                    "local-class constructor target is ambiguous",
                )
            method_collisions = {
                target: names
                for target, names in method_targets.items()
                if len(names) > 1
            }
            if method_collisions:
                self.fail(
                    class_node,
                    "local-class methods collide after TypeScript normalization: "
                    + repr(method_collisions),
                )
            reserved_methods = (
                set(method_targets) & reserved_target_names
            ) - {"constructor"}
            if reserved_methods:
                self.fail(
                    class_node,
                    "local-class methods use reserved target names: "
                    + ", ".join(sorted(reserved_methods)),
                )
            member_collisions = set(field_targets) & set(method_targets)
            if member_collisions:
                self.fail(
                    class_node,
                    "local-class fields and methods share target names: "
                    + ", ".join(sorted(member_collisions)),
                )

    def validate_local_method_signature(self, member: ast.FunctionDef) -> None:
        """Admit only the zero-argument target method shape we emit."""

        arguments = member.args
        valid = (
            not arguments.posonlyargs
            and [argument.arg for argument in arguments.args] == ["self"]
            and arguments.vararg is None
            and not arguments.kwonlyargs
            and not arguments.kw_defaults
            and arguments.kwarg is None
            and not arguments.defaults
        )
        if not valid:
            self.fail(
                member,
                "local methods require exactly positional self with no defaults, "
                "positional-only, keyword-only, or variadic parameters",
            )

    def fail(self, node: ast.AST, message: str) -> NoReturn:
        line = getattr(node, "lineno", "?")
        column = getattr(node, "col_offset", "?")
        raise UnsupportedSyntax(
            f"{self.method.identity} at {self.source_unit.filename}:"
            f"{line}:{column}: {message}"
        )

    def fresh_target_name(self, preferred: str) -> str:
        """Reserve one deterministic generated identifier outside source names."""

        candidate = preferred
        suffix = 2
        while candidate in self.reserved_target_names:
            candidate = f"{preferred}{suffix}"
            suffix += 1
        self.reserved_target_names.add(candidate)
        return candidate

    def fresh_local_name_allocator(self) -> FreshName:
        """Allocate hygienic binders within one generated expression scope."""

        unavailable = set(self.reserved_target_names)
        used: set[str] = set()

        def fresh(preferred: str) -> str:
            candidate = preferred
            suffix = 2
            while candidate in unavailable or candidate in used:
                candidate = f"{preferred}{suffix}"
                suffix += 1
            used.add(candidate)
            return candidate

        return fresh

    def bind_once(
        self,
        expressions: tuple[Expression, ...],
        preferred_names: tuple[str, ...],
        render: Callable[[tuple[str, ...], FreshName], str],
    ) -> str:
        """Evaluate source expressions once, left-to-right, before reuse."""

        if len(expressions) != len(preferred_names):
            raise ValueError("bind_once requires one preferred name per expression")
        fresh = self.fresh_local_name_allocator()
        names = tuple(fresh(preferred) for preferred in preferred_names)
        body = render(names, fresh)
        parameters = ", ".join(names)
        arguments = ", ".join(expression.code for expression in expressions)
        return f"(({parameters}) => {body})({arguments})"

    def guard_runtime_type_code(
        self,
        expression: Expression,
        guard: RuntimeTypeGuard,
    ) -> str:
        """Render one contract-declared runtime type proof."""

        return self.bind_once(
            (expression,),
            ("__guardedValue",),
            lambda names, _fresh: (
                "{ "
                f"if (!({names[0]} instanceof {guard.constructor})) "
                "throw new Error("
                f"{json.dumps('compiler invariant failed: ' + guard.failure)}"
                "); "
                f"return {names[0]}; "
                "}"
            ),
        )

    def require_non_null_code(self, expression: Expression) -> str:
        """Preserve Python's failure when dereferencing an optional value."""

        return self.bind_once(
            (expression,),
            ("__receiver",),
            lambda names, _fresh: (
                "{ "
                f"if ({names[0]} === null) "
                'throw new TypeError("cannot access an attribute of null"); '
                f"return {names[0]}; "
                "}"
            ),
        )

    @staticmethod
    def statement_expression(code: str) -> str:
        """Make an expression safe at a semicolon-free statement boundary."""

        return ";" + code if code.lstrip().startswith("(") else code

    def facts_after_assignment(
        self,
        target: str,
        source: ast.expr,
        value: Expression,
    ) -> ValueFacts:
        """Preserve proved facts while invalidating aliased mutable lengths."""

        facts = value.facts
        if isinstance(source, ast.Name) and value.shape.kind is ShapeKind.ARRAY:
            # A second binding could mutate the same array behind either name.
            source_facts = self.symbol_facts.get(source.id, ValueFacts())
            self.symbol_facts[source.id] = (
                source_facts.without_mutable_sequence_facts()
            )
            facts = facts.without_mutable_sequence_facts()
        if value.shape.kind is not ShapeKind.ARRAY:
            facts = facts.without_sequence_length()
        self.symbol_facts[target] = facts
        return facts

    def can_rebind_with_new_shape(self, name: str) -> bool:
        """Return whether an SSA-style target name preserves this lexical write."""

        return name in self.shape_rebind_scopes[-1]

    @staticmethod
    def sequence_is_mutated_in_block(
        statements: list[ast.stmt], source_name: str
    ) -> bool:
        """Conservatively detect writes through one sequence or a local alias."""

        nodes = [child for statement in statements for child in ast.walk(statement)]
        aliases = {source_name}
        changed = True
        while changed:
            changed = False
            for child in nodes:
                if not isinstance(child, ast.Assign) or len(child.targets) != 1:
                    continue
                target = child.targets[0]
                if (
                    isinstance(target, ast.Name)
                    and isinstance(child.value, ast.Name)
                    and child.value.id in aliases
                    and target.id not in aliases
                ):
                    aliases.add(target.id)
                    changed = True

        return any(
            (
                isinstance(child, ast.Subscript)
                and isinstance(child.ctx, ast.Store)
                and isinstance(child.value, ast.Name)
                and child.value.id in aliases
            )
            or (
                isinstance(child, ast.Call)
                and isinstance(child.func, ast.Attribute)
                and child.func.attr == "pop"
                and isinstance(child.func.value, ast.Name)
                and child.func.value.id in aliases
            )
            for child in nodes
        )

    def compile(self) -> list[str]:
        name = py_identifier_to_ts(self.method.node.name)
        lines = [f"  {name}(): void {{"]
        lines.extend(self.block(self.method.node.body, 2))
        lines.append("  }")
        unclaimed = self.method.unclaimed_comments(self.claimed_comments)
        if unclaimed:
            details = ", ".join(
                f"{comment.span.start_line}:{comment.span.start_column}"
                for comment in unclaimed
            )
            raise UnsupportedSyntax(
                f"{self.method.identity}: source comments were not emitted: {details}"
            )
        unclaimed_nodes = [
            node
            for node in ast.walk(self.method.node)
            if isinstance(node, (ast.stmt, ast.expr, ast.comprehension))
            and id(node) not in self.claimed_nodes
        ]
        if unclaimed_nodes:
            details = ", ".join(
                f"{type(node).__name__}@{getattr(node, 'lineno', '?')}"
                for node in unclaimed_nodes
            )
            raise UnsupportedSyntax(
                f"{self.method.identity}: semantic AST nodes were not lowered: {details}"
            )
        return lines

    def claim(self, node: ast.AST) -> None:
        self.claimed_nodes.add(id(node))

    def claim_dotted_descendants(self, node: ast.Attribute) -> None:
        value: ast.expr = node.value
        while isinstance(value, ast.Attribute):
            self.claim(value)
            value = value.value
        if isinstance(value, ast.Name):
            self.claim(value)

    def block(
        self,
        statements: list[ast.stmt],
        indent: int,
        *,
        suppress_gap: GapCase | None = None,
    ) -> list[str]:
        self.reject_loop_local_escape(statements)
        lines: list[str] = []
        previous_end: int | None = None
        for index, statement in enumerate(statements):
            abort_case = self.abort_case_inside(statement)
            if abort_case is not None and abort_case is not suppress_gap:
                lines.extend(self.leading_comments(statement, indent, previous_end))
                prefix = "  " * indent
                expectation = abort_case.expectation
                assert isinstance(expectation, ExpectedError)
                cause = self.causes_by_case_id[abort_case.stable_id]
                cause_code = self.expression(cause, suppress_gap=abort_case).code
                callback_lines = self.block(
                    statements[index:], indent + 1, suppress_gap=abort_case
                )
                lines.append(f"{prefix}this.assertKnownError(")
                lines.append(f"{prefix}  {json.dumps(abort_case.stable_id)},")
                lines.append(f"{prefix}  () => {cause_code},")
                lines.append(f"{prefix}  {expectation.family.value},")
                lines.append(
                    f"{prefix}  new RegExp({json.dumps(expectation.message_pattern)}),"
                )
                lines.append(f"{prefix})")
                # Preserve and typecheck the exact upstream tail without
                # allowing a later operation to satisfy this error marker.
                lines.append(f"{prefix}if (false) {{")
                lines.extend(callback_lines)
                lines.append(f"{prefix}}}")
                return lines

            if previous_end is not None and statement.lineno > previous_end + 1:
                if not lines or lines[-1] != "":
                    lines.append("")
            lines.extend(self.leading_comments(statement, indent, previous_end))
            rendered = self.statement(statement, indent, suppress_gap=suppress_gap)
            rendered = self.attach_inline_comments(statement, rendered)
            lines.extend(rendered)
            previous_end = statement.end_lineno
        return lines

    def reject_loop_local_escape(self, statements: list[ast.stmt]) -> None:
        """Fail instead of pretending Python loop locals have TS block scope."""

        for index, statement in enumerate(statements):
            if not isinstance(statement, ast.For):
                continue
            loop_bindings = {
                node.id
                for node in ast.walk(statement)
                if isinstance(node, ast.Name) and isinstance(node.ctx, ast.Store)
            }
            later_loads: list[ast.Name] = []
            for later in statements[index + 1 :]:
                if (
                    isinstance(later, ast.For)
                    and isinstance(later.target, ast.Name)
                    and later.target.id in loop_bindings
                ):
                    # The later loop target shadows the prior Python binding only
                    # in its body.  Its iterable is evaluated first and would hit
                    # a TypeScript temporal dead zone if it read the same name.
                    search_roots: tuple[ast.AST, ...] = (later.iter,)
                else:
                    search_roots = (later,)
                for root in search_roots:
                    later_loads.extend(
                        child
                        for child in ast.walk(root)
                        if isinstance(child, ast.Name)
                        and isinstance(child.ctx, ast.Load)
                        and child.id in loop_bindings
                    )
            if later_loads:
                escaped = later_loads[0]
                self.fail(
                    escaped,
                    f"loop-local {escaped.id!r} is read after its TypeScript block; "
                    "Python loop-local persistence is unsupported",
                )

    @staticmethod
    def stored_names(statements: list[ast.stmt]) -> set[str]:
        """Collect bindings owned by one lexical callback body."""

        names: set[str] = set()

        class StoreVisitor(ast.NodeVisitor):
            def visit_ClassDef(self, node: ast.ClassDef) -> None:
                return

            def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
                return

            def visit_Name(self, node: ast.Name) -> None:
                if isinstance(node.ctx, ast.Store):
                    names.add(node.id)

        visitor = StoreVisitor()
        for statement in statements:
            visitor.visit(statement)
        return names

    def abort_case_inside(self, statement: ast.stmt) -> GapCase | None:
        matches = []
        for node in ast.walk(statement):
            case = self.gaps_by_boundary.get(id(node))
            if (
                case is not None
                and isinstance(case.expectation, ExpectedError)
                and case.expectation.continuation is ErrorContinuation.ABORT_TEST
            ):
                matches.append(case)
        if len(matches) > 1:
            self.fail(statement, "a statement contains multiple aborting parity gaps")
        return matches[0] if matches else None

    def leading_comments(
        self,
        statement: ast.stmt,
        indent: int,
        previous_end: int | None,
    ) -> list[str]:
        lower = previous_end or self.method.node.lineno
        comments = [
            comment
            for comment in self.method.leading_comments
            if comment not in self.claimed_comments
            and lower < comment.span.start_line < statement.lineno
        ]
        self.claimed_comments.update(comments)
        prefix = "  " * indent
        return [f"{prefix}{self.comment_text(comment)}" for comment in comments]

    def attach_inline_comments(
        self, statement: ast.stmt, rendered: list[str]
    ) -> list[str]:
        comments = [
            comment
            for comment in self.method.inline_comments
            if comment not in self.claimed_comments
            and statement.lineno <= comment.span.start_line <= (statement.end_lineno or 0)
        ]
        if not comments:
            return rendered
        self.claimed_comments.update(comments)
        if len(comments) != 1 or not rendered:
            self.fail(statement, "inline comments do not map one-to-one to a statement")
        rendered[-1] += f" {self.comment_text(comments[0])}"
        return rendered

    @staticmethod
    def comment_text(comment: SourceComment) -> str:
        return "//" + comment.text[1:]

    def loop_target(
        self,
        node: ast.expr,
        shape: TargetShape,
    ) -> tuple[str, tuple[tuple[str, str, TargetShape], ...]]:
        """Lower one finite Python loop binding, including tuple unpacking."""

        self.claim(node)
        if isinstance(node, ast.Name):
            target = py_identifier_to_ts(node.id)
            return target, ((node.id, target, shape),)
        if isinstance(node, ast.Tuple):
            if shape.kind is not ShapeKind.TUPLE:
                self.fail(node, "tuple loop target requires a proved tuple element")
            if len(node.elts) != len(shape.members):
                self.fail(node, "tuple loop target arity does not match its element")
            rendered: list[str] = []
            bindings: list[tuple[str, str, TargetShape]] = []
            for target_node, member_shape in zip(
                node.elts, shape.members, strict=True
            ):
                target, member_bindings = self.loop_target(
                    target_node, member_shape
                )
                rendered.append(target)
                bindings.extend(member_bindings)
            names = [source for source, _target, _shape in bindings]
            if len(names) != len(set(names)):
                self.fail(node, "tuple loop target cannot bind a name twice")
            return f"[{', '.join(rendered)}]", tuple(bindings)
        self.fail(node, "for targets must be names or finite name tuples")

    def statement(
        self,
        node: ast.stmt,
        indent: int,
        *,
        suppress_gap: GapCase | None = None,
    ) -> list[str]:
        self.claim(node)
        gap = self.gaps_by_boundary.get(id(node))
        if gap is None and isinstance(node, ast.Expr):
            gap = self.gaps_by_boundary.get(id(node.value))
        if gap is not None and gap is not suppress_gap:
            return self.wrap_gap(node, gap, indent)

        prefix = "  " * indent
        if isinstance(node, ast.Assign):
            if len(node.targets) != 1:
                self.fail(node, "chained assignments are unsupported")
            target = node.targets[0]
            value = self.expression(node.value, suppress_gap=suppress_gap)
            if not shape_is_resolved(value.shape):
                self.fail(
                    node.value,
                    "assignment requires a fully resolved target shape, got "
                    f"{shape_description(value.shape)}",
                )
            if isinstance(target, ast.Name):
                self.claim(target)
                name = py_identifier_to_ts(target.id)
                self.unavailable_names.discard(target.id)
                self.facts_after_assignment(target.id, node.value, value)
                representation_pair_code = value.oracle_representation_pair_code
                if (
                    representation_pair_code is not None
                    and self.assignment_counts[target.id] != 1
                ):
                    self.fail(
                        node,
                        "a bound repr() value must have exactly one assignment so "
                        "its assertion-oracle provenance remains unambiguous",
                    )
                if target.id in self.declared_names:
                    self.symbol_representation_pair_codes.pop(target.id, None)
                    previous_shape = self.symbol_shapes.get(target.id)
                    current_name = self.symbol_target_names.get(target.id, name)
                    if previous_shape is not None and previous_shape != value.shape:
                        if (
                            previous_shape.kind is ShapeKind.GAME_NODE
                            and value.shape.kind
                            in {
                                ShapeKind.GAME,
                                ShapeKind.GAME_NODE,
                                ShapeKind.CHILD_GAME_NODE,
                            }
                        ):
                            self.symbol_shapes[target.id] = previous_shape
                            return [f"{prefix}{current_name} = {value.code}"]
                        if {
                            previous_shape.kind,
                            value.shape.kind,
                        } <= {
                            ShapeKind.STRING_EXPORTER,
                            ShapeKind.FILE_EXPORTER,
                        }:
                            self.symbol_shapes[target.id] = value.shape
                            return [f"{prefix}{current_name} = {value.code}"]
                        if not self.can_rebind_with_new_shape(target.id):
                            self.fail(
                                node,
                                "shape-changing assignment crosses a generated "
                                "lexical boundary and cannot preserve Python binding "
                                "semantics",
                            )
                        if target.id in self.lazy_captured_names:
                            self.fail(
                                node,
                                f"shape-changing assignment to {target.id!r} would "
                                "change a value captured by an earlier lazy generator",
                            )
                        rebound_name = self.fresh_target_name(f"__{name}Rebound")
                        self.symbol_shapes[target.id] = value.shape
                        self.symbol_target_names[target.id] = rebound_name
                        return [f"{prefix}let {rebound_name} = {value.code}"]
                    self.symbol_shapes[target.id] = value.shape
                    return [f"{prefix}{current_name} = {value.code}"]
                self.declared_names.add(target.id)
                self.shape_rebind_scopes[-1].add(target.id)
                declaration_shape = (
                    (GAME_NODE.optional() if value.shape.nullable else GAME_NODE)
                    if self.assignment_counts[target.id] > 1
                    and value.shape.kind
                    in {
                        ShapeKind.GAME,
                        ShapeKind.GAME_NODE,
                        ShapeKind.CHILD_GAME_NODE,
                    }
                    else EXPORTER
                    if self.assignment_counts[target.id] > 1
                    and value.shape.kind
                    in {
                        ShapeKind.STRING_EXPORTER,
                        ShapeKind.FILE_EXPORTER,
                    }
                    else value.shape
                )
                current_shape = (
                    declaration_shape
                    if declaration_shape.kind is ShapeKind.GAME_NODE
                    else value.shape
                )
                self.symbol_shapes[target.id] = current_shape
                self.symbol_target_names[target.id] = name
                keyword = "let" if self.assignment_counts[target.id] > 1 else "const"
                annotation = (
                    f": {typescript_type(declaration_shape)}"
                    if declaration_shape != value.shape
                    else ""
                )
                if representation_pair_code is not None:
                    pair_name = self.fresh_target_name(f"__{name}Representation")
                    self.symbol_representation_pair_codes[target.id] = pair_name
                    return [
                        f"{prefix}{keyword} {pair_name} = "
                        f"{representation_pair_code}",
                        f"{prefix}{keyword} {name}{annotation} = "
                        f"{pair_name}.representation",
                    ]
                return [f"{prefix}{keyword} {name}{annotation} = {value.code}"]
            if isinstance(target, (ast.Tuple, ast.List)):
                self.claim(target)
                names = []
                if (
                    value.shape.kind is not ShapeKind.TUPLE
                    or len(value.shape.members) != len(target.elts)
                ):
                    self.fail(node.value, "destructuring requires an exact tuple shape")
                for element, member_shape in zip(
                    target.elts, value.shape.members, strict=True
                ):
                    if not isinstance(element, ast.Name):
                        self.fail(element, "destructuring targets must be names")
                    if element.id in self.declared_names:
                        self.fail(
                            element,
                            "tuple destructuring rebinding is unsupported",
                        )
                    self.claim(element)
                    self.unavailable_names.discard(element.id)
                    self.symbol_facts[element.id] = ValueFacts()
                    self.declared_names.add(element.id)
                    self.shape_rebind_scopes[-1].add(element.id)
                    self.symbol_shapes[element.id] = member_shape
                    target_name = py_identifier_to_ts(element.id)
                    self.symbol_target_names[element.id] = target_name
                    names.append(target_name)
                return [f"{prefix}const [{', '.join(names)}] = {value.code}"]
            if isinstance(target, ast.Attribute):
                self.claim(target)
                receiver = self.expression(target.value)
                writable_shape = writable_attribute_shape(
                    target.attr, receiver.shape
                )
                if writable_shape is None:
                    self.fail(
                        target,
                        "attribute assignment requires an explicitly writable field",
                    )
                if not self.assignment_shape_matches(writable_shape, value.shape):
                    self.fail(
                        node.value,
                        "attribute assignment shape mismatch: "
                        f"{writable_shape.kind.value} and {value.shape.kind.value}",
                    )
                attribute = py_identifier_to_ts(target.attr)
                assignment = self.bind_once(
                    (value, receiver),
                    ("__newValue", "__receiver"),
                    lambda names, _fresh: (
                        f"{{ {names[1]}.{attribute} = {names[0]}; }}"
                    ),
                )
                return [f"{prefix}{self.statement_expression(assignment)}"]
            if isinstance(target, ast.Subscript):
                self.claim(target)
                container = self.expression(target.value)
                key = self.expression(target.slice)
                if (
                    isinstance(target.value, ast.Name)
                    and container.shape.kind is ShapeKind.ARRAY
                ):
                    facts = self.symbol_facts.get(
                        target.value.id, ValueFacts()
                    )
                    self.symbol_facts[target.value.id] = (
                        facts.without_finite_string_values()
                    )
                assignment = self.set_item(container, key, value, target)
                return [
                    f"{prefix}{self.statement_expression(assignment)}"
                ]
            self.fail(target, f"unsupported assignment target {type(target).__name__}")

        if isinstance(node, ast.Expr):
            if isinstance(node.value, ast.Yield):
                self.claim(node.value)
                return self.yield_statement(node.value, prefix, suppress_gap=suppress_gap)
            if not isinstance(node.value, ast.Call):
                self.fail(node.value, "bare expression statements require a call")
            expression = self.expression(node.value, suppress_gap=suppress_gap).code
            return [f"{prefix}{self.statement_expression(expression)}"]

        if isinstance(node, ast.For):
            if node.orelse:
                self.fail(node, "for/else is unsupported")
            outer_shapes = self.symbol_shapes.copy()
            outer_facts = self.symbol_facts.copy()
            outer_target_names = self.symbol_target_names.copy()
            outer_representation_pairs = (
                self.symbol_representation_pair_codes.copy()
            )
            outer_declarations = self.declared_names.copy()
            outer_unavailable = self.unavailable_names.copy()
            outer_lazy_captures = self.lazy_captured_names.copy()
            iterable_expression = self.expression(node.iter)
            iterable_finite_strings = (
                frozenset()
                if isinstance(node.iter, ast.Name)
                and self.sequence_is_mutated_in_block(node.body, node.iter.id)
                else iterable_expression.facts.finite_string_values
            )
            element_shape = self.iterated_shape(iterable_expression, node.iter)
            target, bindings = self.loop_target(node.target, element_shape)
            rebound = {source for source, _target, _shape in bindings}
            conflicts = rebound & self.declared_names
            if conflicts:
                self.fail(
                    node.target,
                    "loop target rebinding of an outer Python local is unsupported: "
                    + ", ".join(sorted(conflicts)),
                )
            self.declared_names.update(rebound)
            self.shape_rebind_scopes.append(rebound)
            for source, target_name, target_shape in bindings:
                self.symbol_shapes[source] = target_shape
                self.symbol_facts[source] = (
                    ValueFacts(
                        finite_string_values=iterable_finite_strings
                    )
                    if len(bindings) == 1 and target_shape == STRING
                    else ValueFacts()
                )
                self.symbol_target_names[source] = target_name
                self.symbol_representation_pair_codes.pop(source, None)
            iterable = self.iterable_code(iterable_expression, node.iter)
            try:
                body_lines = self.block(
                    node.body, indent + 1, suppress_gap=suppress_gap
                )
            finally:
                self.shape_rebind_scopes.pop()
            surviving_facts = {
                name: facts
                for name, facts in outer_facts.items()
                if self.symbol_facts.get(name) == facts
            }
            lines = [f"{prefix}for (let {target} of {iterable}) {{"]
            lines.extend(body_lines)
            lines.append(f"{prefix}}}")
            self.symbol_shapes = outer_shapes
            self.symbol_facts = surviving_facts
            self.symbol_target_names = outer_target_names
            self.symbol_representation_pair_codes = outer_representation_pairs
            self.declared_names = outer_declarations
            self.unavailable_names = outer_unavailable
            self.lazy_captured_names = outer_lazy_captures
            return lines

        if isinstance(node, ast.While):
            if node.orelse:
                self.fail(node, "while/else is unsupported")
            condition_code = self.condition_code(
                node.test, suppress_gap=suppress_gap
            )
            outer_shapes = self.symbol_shapes.copy()
            outer_facts = self.symbol_facts.copy()
            outer_target_names = self.symbol_target_names.copy()
            outer_representation_pairs = (
                self.symbol_representation_pair_codes.copy()
            )
            outer_declarations = self.declared_names.copy()
            outer_unavailable = self.unavailable_names.copy()
            outer_lazy_captures = self.lazy_captured_names.copy()
            self.shape_rebind_scopes.append(set())
            try:
                body_lines = self.block(
                    node.body, indent + 1, suppress_gap=suppress_gap
                )
            finally:
                self.shape_rebind_scopes.pop()
            loop_locals = self.declared_names - outer_declarations
            if loop_locals:
                self.fail(
                    node,
                    "while-loop locals cannot preserve Python function scope: "
                    + ", ".join(sorted(loop_locals)),
                )
            surviving_facts = {
                name: facts
                for name, facts in outer_facts.items()
                if self.symbol_facts.get(name) == facts
            }
            lines = [f"{prefix}while ({condition_code}) {{"]
            lines.extend(body_lines)
            lines.append(f"{prefix}}}")
            self.symbol_shapes = outer_shapes
            self.symbol_facts = surviving_facts
            self.symbol_target_names = outer_target_names
            self.symbol_representation_pair_codes = outer_representation_pairs
            self.declared_names = outer_declarations
            self.unavailable_names = outer_unavailable
            self.lazy_captured_names = outer_lazy_captures
            return lines

        if isinstance(node, ast.With):
            return self.assert_raises(node, indent, suppress_gap=suppress_gap)

        if isinstance(node, ast.AugAssign):
            if not (
                isinstance(node.target, ast.Name)
                or (
                    isinstance(node.target, ast.Attribute)
                    and isinstance(node.target.value, ast.Name)
                    and node.target.value.id == "self"
                    and writable_attribute_shape(
                        node.target.attr, self.shape_for_name("self")
                    )
                    is not None
                )
            ):
                self.fail(
                    node.target,
                    "augmented assignment requires a simple local name or "
                    "proved writable self field",
                )
            target = self.expression(node.target)
            value = self.expression(node.value)
            return [f"{prefix}{self.augmented_assignment(target, node.op, value, node)}"]

        if isinstance(node, ast.ClassDef):
            return self.local_class(node, indent)

        if isinstance(node, ast.Return):
            if node.value is None:
                return [f"{prefix}return"]
            self.fail(
                node,
                "return values require an explicit enclosing target result contract",
            )

        if isinstance(node, ast.Yield):
            return self.yield_statement(node, prefix, suppress_gap=suppress_gap)

        self.fail(node, f"unsupported statement {type(node).__name__}")

    def yield_statement(
        self,
        node: ast.Yield,
        prefix: str,
        *,
        suppress_gap: GapCase | None,
    ) -> list[str]:
        """Lower a no-value generator sentinel in its proved context."""

        if not self.in_local_generator_method:
            self.fail(
                node,
                "yield is supported only inside an explicitly detected local "
                "generator method",
            )
        if node.value is not None:
            self.fail(node, "local generator methods may only yield no-value sentinels")
        return [f"{prefix}yield undefined"]

    def wrap_gap(self, node: ast.AST, case: GapCase, indent: int) -> list[str]:
        prefix = "  " * indent
        if not isinstance(node, ast.Expr) or not isinstance(node.value, ast.Call):
            self.fail(node, "continuing gap boundaries must be expression calls")
        original = self.expression(node.value, suppress_gap=case).code
        if isinstance(case.expectation, AssertionMismatch):
            return [
                f"{prefix}this.assertKnownAssertionFailure(",
                f"{prefix}  {json.dumps(case.stable_id)},",
                f"{prefix}  () => {original},",
                f"{prefix})",
            ]
        expectation = case.expectation
        assert expectation.continuation is ErrorContinuation.CONTINUE
        cause = self.causes_by_case_id[case.stable_id]
        cause_code = self.expression(cause, suppress_gap=case).code
        return [
            f"{prefix}this.assertKnownError(",
            f"{prefix}  {json.dumps(case.stable_id)},",
            f"{prefix}  () => {cause_code},",
            f"{prefix}  {expectation.family.value},",
            f"{prefix}  new RegExp({json.dumps(expectation.message_pattern)}),",
            f"{prefix})",
            f"{prefix}if (false) {{",
            f"{prefix}  {original}",
            f"{prefix}}}",
        ]

    def assert_raises(
        self,
        node: ast.With,
        indent: int,
        *,
        suppress_gap: GapCase | None,
    ) -> list[str]:
        if len(node.items) != 1:
            self.fail(node, "assertRaises blocks must have one context manager")
        item = node.items[0]
        context = item.context_expr
        if not (
            isinstance(context, ast.Call)
            and dotted_name(context.func) == "self.assertRaises"
            and len(context.args) == 1
            and not context.keywords
        ):
            self.fail(context, "with blocks must be self.assertRaises(ErrorType)")
        self.claim(context)
        self.expression(context.func, suppress_gap=suppress_gap)
        error_family = dotted_name(context.args[0])
        self.expression(context.args[0])
        error_type = registered_exception_constructor(error_family)
        if error_type is None:
            self.fail(
                context.args[0],
                "assertRaises requires a registered exception constructor, got "
                f"{error_family or '<dynamic expression>'}",
            )
        bound_name: str | None = None
        if item.optional_vars is not None:
            if not isinstance(item.optional_vars, ast.Name):
                self.fail(item.optional_vars, "assertRaises binding must be a name")
            bound_name = item.optional_vars.id
            body_uses = [
                child
                for statement in node.body
                for child in ast.walk(statement)
                if isinstance(child, ast.Name) and child.id == bound_name
            ]
            if body_uses:
                self.fail(
                    body_uses[0],
                    f"assertRaises binding {bound_name!r} cannot be read or "
                    "rebound inside its body",
                )
        prefix = "  " * indent

        # The callback is a lexical TypeScript scope and exits by throwing.
        # Facts introduced while compiling it must not become outer-scope facts:
        # an assignment may never run, and a callback-local declaration is not
        # visible after captureRaises()/assertRaises() returns.
        outer_shapes = self.symbol_shapes.copy()
        outer_facts = self.symbol_facts.copy()
        outer_target_names = self.symbol_target_names.copy()
        outer_representation_pairs = self.symbol_representation_pair_codes.copy()
        outer_declarations = self.declared_names.copy()
        outer_unavailable = self.unavailable_names.copy()
        outer_lazy_captures = self.lazy_captured_names.copy()
        callback_bindings = self.stored_names(node.body) - outer_declarations
        self.shape_rebind_scopes.append(set())
        try:
            body_lines = self.block(
                node.body, indent + 1, suppress_gap=suppress_gap
            )
        finally:
            self.shape_rebind_scopes.pop()
        surviving_facts = {
            name: facts
            for name, facts in outer_facts.items()
            if self.symbol_facts.get(name) == facts
        }
        self.symbol_shapes = outer_shapes
        self.symbol_facts = surviving_facts
        self.symbol_target_names = outer_target_names
        self.symbol_representation_pair_codes = outer_representation_pairs
        self.declared_names = outer_declarations
        self.unavailable_names = outer_unavailable | callback_bindings
        self.lazy_captured_names = outer_lazy_captures

        if item.optional_vars is None:
            lines = [f"{prefix}this.assertRaises({error_type}, () => {{"]
            lines.extend(body_lines)
            lines.append(f"{prefix}}})")
            return lines
        assert isinstance(item.optional_vars, ast.Name)
        assert bound_name is not None
        self.claim(item.optional_vars)
        python_name = bound_name
        if python_name in outer_declarations:
            self.fail(
                item.optional_vars,
                "assertRaises binding cannot replace an existing local",
            )
        name = py_identifier_to_ts(python_name)
        self.unavailable_names.discard(python_name)
        self.declared_names.add(python_name)
        self.shape_rebind_scopes[-1].add(python_name)
        self.symbol_shapes[python_name] = assert_raises_context_of(error_type)
        self.symbol_facts[python_name] = ValueFacts()
        self.symbol_target_names[python_name] = name
        lines = [f"{prefix}const {name} = this.captureRaises({error_type}, () => {{"]
        lines.extend(body_lines)
        lines.append(f"{prefix}}})")
        return lines

    def local_class(self, node: ast.ClassDef, indent: int) -> list[str]:
        if node.bases or node.keywords or node.decorator_list:
            self.fail(node, "local test doubles cannot use inheritance or decorators")
        prefix = "  " * indent
        lines = [f"{prefix}class {py_identifier_to_ts(node.name)} {{"]
        class_shape = self.local_class_shapes[node.name]
        for field_name, field_shape in class_shape.fields:
            if field_shape.kind is ShapeKind.FUNCTION:
                continue
            lines.append(
                f"{prefix}  declare {py_identifier_to_ts(field_name)}: "
                f"{typescript_type(field_shape)}"
            )
        for member in node.body:
            if not isinstance(member, ast.FunctionDef):
                self.fail(member, "local classes may contain only methods")
            self.claim(member)
            method_name = (
                "constructor"
                if member.name == "__init__"
                else py_identifier_to_ts(member.name)
            )
            self.validate_local_method_signature(member)
            is_generator = any(
                isinstance(child, ast.Yield) for child in ast.walk(member)
            )
            star = "*" if is_generator else ""
            lines.append(f"{prefix}  {star}{method_name}() {{")
            outer_shapes = self.symbol_shapes
            outer_facts = self.symbol_facts
            outer_target_names = self.symbol_target_names
            outer_representation_pairs = self.symbol_representation_pair_codes
            outer_declarations = self.declared_names
            outer_unavailable = self.unavailable_names
            outer_rebind_scopes = self.shape_rebind_scopes
            outer_lazy_captures = self.lazy_captured_names
            self.symbol_shapes = {"self": class_shape}
            self.symbol_facts = {"self": ValueFacts()}
            self.symbol_target_names = {}
            self.symbol_representation_pair_codes = {}
            self.declared_names = set()
            self.unavailable_names = set()
            self.shape_rebind_scopes = [set()]
            self.lazy_captured_names = set()
            outer_generator_context = self.in_local_generator_method
            self.in_local_generator_method = is_generator
            try:
                lines.extend(self.block(member.body, indent + 2))
            finally:
                self.symbol_shapes = outer_shapes
                self.symbol_facts = outer_facts
                self.symbol_target_names = outer_target_names
                self.symbol_representation_pair_codes = outer_representation_pairs
                self.declared_names = outer_declarations
                self.unavailable_names = outer_unavailable
                self.shape_rebind_scopes = outer_rebind_scopes
                self.lazy_captured_names = outer_lazy_captures
                self.in_local_generator_method = outer_generator_context
            lines.append(f"{prefix}  }}")
        lines.append(f"{prefix}}}")
        return lines

    def local_class_shape(self, node: ast.ClassDef) -> TargetShape:
        fields: dict[str, TargetShape] = {}
        initializer = next(
            (
                member
                for member in node.body
                if isinstance(member, ast.FunctionDef) and member.name == "__init__"
            ),
            None,
        )
        if initializer is not None:
            for child in ast.walk(initializer):
                if not (
                    isinstance(child, ast.Assign)
                    and len(child.targets) == 1
                    and isinstance(child.targets[0], ast.Attribute)
                    and isinstance(child.targets[0].value, ast.Name)
                    and child.targets[0].value.id == "self"
                ):
                    continue
                fields[child.targets[0].attr] = self.literal_shape(child.value)
        for member in node.body:
            if not isinstance(member, ast.FunctionDef) or member.name == "__init__":
                continue
            yields = [
                child for child in ast.walk(member) if isinstance(child, ast.Yield)
            ]
            if yields:
                if any(child.value is not None for child in yields):
                    self.fail(
                        member,
                        "local generator methods may only yield no-value sentinels",
                    )
                result = iterable_of(VOID)
            else:
                result = VOID
            fields[member.name] = function_of((), result)
        return local_object(node.name, tuple(sorted(fields.items())))

    def literal_shape(self, node: ast.expr) -> TargetShape:
        """Own literal classification for inference and declaration emission."""

        if not isinstance(node, ast.Constant):
            self.fail(node, "local-class fields require literal initializers")
        value = node.value
        if isinstance(value, bool):
            return BOOLEAN
        if isinstance(value, int):
            return NUMBER
        if isinstance(value, str):
            return STRING
        self.fail(node, "unsupported local-class field constant")

    def shape_for_name(self, name: str) -> TargetShape:
        """Return already-proved local shape; unresolved names stay non-operable."""

        if name in self.symbol_shapes:
            return self.symbol_shapes[name]
        if name in self.local_class_shapes:
            return function_of((), self.local_class_shapes[name])
        return UNKNOWN

    def shape_for_qualified_name(self, name: str) -> TargetShape:
        return qualified_name_shape(name)

    def shape_for_attribute(
        self, node: ast.Attribute, receiver: TargetShape
    ) -> TargetShape:
        full_name = dotted_name(node)
        if full_name is not None:
            qualified = self.shape_for_qualified_name(full_name)
            if qualified.kind is not ShapeKind.UNKNOWN:
                return qualified
        if receiver.kind is ShapeKind.LOCAL_OBJECT:
            fields = dict(receiver.fields)
            known = fields.get(node.attr)
            if known is not None:
                return known

        return attribute_shape(node.attr, receiver)

    def refined_attribute(
        self,
        node: ast.Attribute,
        receiver: Expression,
    ) -> tuple[TargetShape, ValueFacts, RuntimeTypeGuard | None]:
        """Apply one composable attribute-chain fact to the registry contract."""

        base_shape = self.shape_for_attribute(node, receiver.shape)
        matches = tuple(
            fact
            for fact in receiver.facts.repeated_attributes
            if fact.attribute == node.attr
        )
        if not matches:
            return base_shape, ValueFacts(), None
        shapes = {fact.shape for fact in matches}
        guards = {fact.guard for fact in matches}
        if len(shapes) != 1 or len(guards) != 1:
            self.fail(node, "attribute refinements disagree on shape or runtime guard")
        remaining = tuple(
            RepeatedAttributeFact(
                attribute=fact.attribute,
                remaining=fact.remaining - 1,
                shape=fact.shape,
                guard=fact.guard,
            )
            for fact in matches
            if fact.remaining > 1
        )
        return (
            matches[0].shape,
            ValueFacts(repeated_attributes=remaining),
            matches[0].guard,
        )

    @staticmethod
    def assignment_shape_matches(
        expected: TargetShape, actual: TargetShape
    ) -> bool:
        """Match one writable target, including an explicit nullable union."""

        return expected == actual or (
            expected.nullable
            and (actual == NULL or actual == expected.required())
        )

    def common_shape(
        self, shapes: list[TargetShape], node: ast.AST
    ) -> TargetShape:
        if not shapes:
            return UNKNOWN
        first = shapes[0]
        if all(shape == first for shape in shapes[1:]):
            return first
        if all(
            shape.kind in {ShapeKind.STRING, ShapeKind.WDL_MODEL}
            and not shape.nullable
            for shape in shapes
        ):
            return STRING
        if all(
            shape.kind in {ShapeKind.ARROW, ShapeKind.TUPLE}
            and (
                shape.kind is ShapeKind.ARROW
                or shape == tuple_of(NUMBER, NUMBER)
            )
            for shape in shapes
        ):
            return TargetShape(ShapeKind.ARROW_INPUT)
        self.fail(
            node,
            "collection elements have incompatible target shapes: "
            + ", ".join(shape.kind.value for shape in shapes),
        )

    def iterated_shape(self, expression: Expression, node: ast.AST) -> TargetShape:
        shape = expression.shape
        if shape.nullable:
            self.fail(node, f"cannot iterate nullable {shape.kind.value}")
        if shape.kind in {ShapeKind.STRING, ShapeKind.WDL_MODEL}:
            return STRING
        if shape.kind in {
            ShapeKind.ARRAY,
            ShapeKind.ITERABLE,
            ShapeKind.PIECE_VALUE_SET,
            ShapeKind.LEGAL_MOVE_GENERATOR,
            ShapeKind.LEGAL_MOVE_ITERATOR,
            ShapeKind.PSEUDO_LEGAL_MOVE_GENERATOR,
            ShapeKind.MAINLINE,
        } and shape.element is not None:
            return shape.element
        if shape.kind is ShapeKind.SQUARE_SET:
            return NUMBER
        self.fail(node, f"cannot iterate {shape.kind.value}")

    def iterable_code(self, expression: Expression, node: ast.AST) -> str:
        kind = expression.shape.kind
        if expression.shape.nullable:
            self.fail(
                node,
                f"cannot produce a TypeScript iterable from nullable {kind.value}",
            )
        if kind in {
            ShapeKind.STRING,
            ShapeKind.WDL_MODEL,
            ShapeKind.ARRAY,
            ShapeKind.ITERABLE,
            ShapeKind.PIECE_VALUE_SET,
            ShapeKind.LEGAL_MOVE_GENERATOR,
            ShapeKind.LEGAL_MOVE_ITERATOR,
            ShapeKind.PSEUDO_LEGAL_MOVE_GENERATOR,
            ShapeKind.MAINLINE,
        }:
            return expression.code
        if kind is ShapeKind.SQUARE_SET:
            return f"{expression.code}.iter()"
        self.fail(node, f"cannot produce a TypeScript iterable from {kind.value}")

    def resolve_call_contract(
        self,
        node: ast.Call,
        name: str | None,
        function: Expression,
        receiver: Expression | None,
    ) -> CallContract:
        if name in self.local_class_names:
            return CallContract(
                self.local_class_shapes[name],
                invocation=InvocationKind.CONSTRUCT,
            )
        named = named_call_contract(name)
        if named is not None:
            return named
        callable_contract = callable_shape_contract(function.shape)
        if callable_contract is not None:
            return callable_contract
        if function.shape.kind is ShapeKind.FUNCTION and function.shape.element:
            return CallContract(
                function.shape.element,
                tuple(exact(parameter) for parameter in function.shape.members),
            )
        if isinstance(node.func, ast.Attribute) and receiver is not None:
            method = method_call_contract(node.func.attr, receiver.shape)
            if method is not None:
                return method
        self.fail(node.func, f"no finite call contract for {name or '<dynamic call>'}")

    def validate_contract(
        self,
        node: ast.Call,
        contract: CallContract,
        arguments: list[Expression],
        keyword_values: list[tuple[str, Expression]],
    ) -> None:
        try:
            validate_call_contract(
                contract,
                tuple(argument.shape for argument in arguments),
                tuple((name, value.shape) for name, value in keyword_values),
            )
        except CallContractError as error:
            self.fail(node, str(error))

    def contextualize_contract_value(
        self,
        source: ast.expr,
        value: Expression,
        rule: ShapeRule,
    ) -> Expression:
        """Apply one syntax- and fact-proved shape supplied by call context."""

        if value.shape == STRING:
            exact_string = value.facts.exact_string
            finite_strings = value.facts.finite_string_values
            if exact_string in rule.contextual_string_literals:
                return Expression(value.code, rule.shapes[0], value.facts)
            if finite_strings and finite_strings <= rule.contextual_string_literals:
                cases = " ".join(
                    f"case {json.dumps(item, ensure_ascii=False)}:"
                    for item in sorted(finite_strings)
                )
                code = self.bind_once(
                    (value,),
                    ("__finiteString",),
                    lambda names, _fresh: (
                        "{ switch ("
                        f"{names[0]}) {{ {cases} return {names[0]}; "
                        "default: throw new Error("
                        '"compiler invariant failed: finite string value " + '
                        f'JSON.stringify({names[0]}) + " escaped its proved set"'
                        "); } }"
                    ),
                )
                return Expression(code, rule.shapes[0], value.facts)

        if (
            value.shape.kind is ShapeKind.MAP
            and isinstance(source, ast.Dict)
            and not source.keys
        ):
            map_targets = tuple(
                shape for shape in rule.shapes if shape.kind is ShapeKind.MAP
            )
            if len(map_targets) == 1:
                return Expression(value.code, map_targets[0], value.facts)

        if (
            value.shape.kind is ShapeKind.ARRAY
            and isinstance(source, ast.List)
            and not source.elts
        ):
            array_targets = tuple(
                shape for shape in rule.shapes if shape.kind is ShapeKind.ARRAY
            )
            if array_targets:
                return Expression(value.code, array_targets[0], value.facts)

        return value

    def contextualize_contract_arguments(
        self,
        node: ast.Call,
        contract: CallContract,
        arguments: list[Expression],
        keyword_values: list[tuple[str, Expression]],
    ) -> tuple[list[Expression], list[tuple[str, Expression]]]:
        """Apply finite literal context to positional and keyword arguments."""

        rules = contract.required + contract.optional
        converted_arguments = list(arguments)
        for index, (argument, rule) in enumerate(
            zip(arguments, rules, strict=False)
        ):
            converted_arguments[index] = self.contextualize_contract_value(
                node.args[index], argument, rule
            )

        keyword_rules = dict(contract.keywords)
        converted_keywords = [
            (
                name,
                self.contextualize_contract_value(
                    source_keyword.value,
                    value,
                    keyword_rules[name],
                )
                if name in keyword_rules
                else value,
            )
            for source_keyword, (name, value) in zip(
                node.keywords, keyword_values, strict=True
            )
        ]
        return converted_arguments, converted_keywords

    @staticmethod
    def type_assertion_code(code: str, assertion: TypeAssertion) -> str:
        """Render an adjacent, machine-auditable TypeScript type assertion."""

        marker = f"/* {assertion.marker} */"
        if assertion.via_unknown:
            return (
                f"({code} as {marker} unknown as {marker} "
                f"{assertion.target_type})"
            )
        return f"({code} as {marker} {assertion.target_type})"

    def require_adapter_authority(
        self,
        node: ast.AST,
        assertion: TypeAssertion,
        suppress_gap: GapCase | None,
    ) -> None:
        root = assertion.required_gap_root
        if root is not None and (
            suppress_gap is None
            or suppress_gap.root_id != root
            or self.causes_by_case_id.get(suppress_gap.stable_id) is not node
        ):
            self.fail(
                node,
                f"target adapter {assertion.marker!r} requires exact parity gap "
                f"cause for root {root!r}",
            )

    def adapt_contract_arguments(
        self,
        node: ast.Call,
        contract: CallContract,
        arguments: list[Expression],
        *,
        suppress_gap: GapCase | None,
    ) -> tuple[list[Expression], TargetShape | None]:
        """Apply only adapters declared by the resolved target call contract."""

        converted = list(arguments)
        result_overrides: list[TargetShape] = []
        for index, argument in enumerate(arguments):
            matches = tuple(
                adapter
                for adapter in contract.argument_adapters
                if adapter.index == index and adapter.source.accepts(argument.shape)
            )
            if len(matches) > 1:
                self.fail(node.args[index], "multiple target argument adapters match")
            if not matches:
                continue
            adapter = matches[0]
            if adapter.kind is ArgumentAdapterKind.TO_BIGINT:
                converted[index] = Expression(
                    f"BigInt({argument.code})",
                    adapter.result,
                )
            elif adapter.kind is ArgumentAdapterKind.CALL_METHOD:
                assert adapter.method is not None
                converted[index] = Expression(
                    f"{argument.code}.{adapter.method}()",
                    adapter.result,
                )
            else:
                assert adapter.kind is ArgumentAdapterKind.TYPE_ASSERTION
                assert adapter.assertion is not None
                self.require_adapter_authority(
                    node, adapter.assertion, suppress_gap
                )
                converted[index] = Expression(
                    self.type_assertion_code(argument.code, adapter.assertion),
                    adapter.result,
                    argument.facts,
                )
            if adapter.result_override is not None:
                result_overrides.append(adapter.result_override)
        if len(result_overrides) > 1:
            self.fail(node, "multiple argument adapters override the call result")
        return converted, result_overrides[0] if result_overrides else None

    def contract_result(
        self,
        contract: CallContract,
        arguments: list[Expression],
        result_override: TargetShape | None,
    ) -> tuple[TargetShape, ValueFacts, RuntimeTypeGuard | None]:
        """Resolve a declared result refinement from composable argument facts."""

        shape = result_override or contract.result
        refinement = contract.result_refinement
        if refinement is None or result_override is not None:
            return shape, ValueFacts(), contract.result_guard
        if refinement.argument_index >= len(arguments):
            return shape, ValueFacts(), None
        length = arguments[
            refinement.argument_index
        ].facts.exact_sequence_length
        if length is None or length == 0:
            return shape, ValueFacts(), None
        repeated = ()
        if refinement.repeated_attribute is not None and length > 1:
            repeated = (
                RepeatedAttributeFact(
                    attribute=refinement.repeated_attribute,
                    remaining=length - 1,
                    shape=refinement.result,
                    guard=refinement.guard,
                ),
            )
        return (
            refinement.result,
            ValueFacts(repeated_attributes=repeated),
            refinement.guard,
        )

    def render_missing_constructor(
        self,
        node: ast.Call,
        contract: CallContract,
        arguments: list[Expression],
        *,
        suppress_gap: GapCase | None,
    ) -> str:
        """Render one explicitly declared, source-addressed missing capability."""

        missing = contract.missing_constructor
        assert missing is not None
        if (
            suppress_gap is None
            or suppress_gap.root_id != missing.required_gap_root
            or self.causes_by_case_id.get(suppress_gap.stable_id) is not node
        ):
            self.fail(
                node,
                f"missing constructor {missing.name} requires exact parity gap cause "
                f"for root {missing.required_gap_root!r}",
            )
        assertion = TypeAssertion(
            target_type="Record<string, unknown>",
            marker=missing.marker,
            via_unknown=True,
        )
        function_assertion = TypeAssertion(
            target_type="Function",
            marker=missing.marker,
        )
        result_assertion = TypeAssertion(
            target_type=missing.result_type,
            marker=missing.marker,
        )
        fresh = self.fresh_local_name_allocator()
        constructor = fresh("__constructor")
        namespace = self.type_assertion_code(missing.namespace, assertion)
        reflected = self.type_assertion_code(constructor, function_assertion)
        result = self.type_assertion_code(
            f"Reflect.construct({reflected}, "
            f"[{', '.join(argument.code for argument in arguments)}])",
            result_assertion,
        )
        return (
            f"(() => {{ const {constructor} = {namespace}"
            f"[{json.dumps(missing.name)}]; "
            f"if (typeof {constructor} !== \"function\") "
            f"throw new TypeError({json.dumps('missing constructor ' + missing.name)}); "
            f"return {result}; }})()"
        )

    def truthy_code(self, expression: Expression, node: ast.AST) -> str:
        try:
            return native_truthy_code(expression.code, expression.shape)
        except NativeLoweringError as error:
            self.fail(node, str(error))

    def condition_code(
        self,
        node: ast.expr,
        *,
        suppress_gap: GapCase | None = None,
    ) -> str:
        """Lower Python short-circuit truthiness in a condition context."""

        if isinstance(node, ast.BoolOp):
            if len(node.values) < 2:
                self.fail(node, "boolean operations require at least two operands")
            self.claim(node)
            if isinstance(node.op, ast.And):
                operator = "&&"
            elif isinstance(node.op, ast.Or):
                operator = "||"
            else:
                self.fail(node, f"unsupported boolean operator {type(node.op).__name__}")
            values = [
                self.condition_code(value, suppress_gap=suppress_gap)
                for value in node.values
            ]
            return "(" + f" {operator} ".join(values) + ")"

        expression = self.expression(node, suppress_gap=suppress_gap)
        return self.truthy_code(expression, node)

    def binary_operator(
        self,
        left: Expression,
        operator: ast.operator,
        right: Expression,
        node: ast.AST,
    ) -> Expression:
        if isinstance(operator, ast.Add):
            if left.shape == right.shape == STRING:
                return Expression(f"({left.code} + {right.code})", STRING)
            if left.shape == right.shape == NUMBER:
                return Expression(
                    self.bind_once(
                        (left, right),
                        ("__leftNumber", "__rightNumber"),
                        lambda names, fresh: self.checked_number_result_code(
                            f"{names[0]} + {names[1]}", fresh
                        ),
                    ),
                    NUMBER,
                )
            if left.shape == right.shape == BIGINT:
                return Expression(f"({left.code} + {right.code})", BIGINT)
            self.fail(
                node,
                "+ does not support "
                f"{shape_description(left.shape)} and "
                f"{shape_description(right.shape)}",
            )
        if isinstance(operator, ast.Pow):
            if left.shape == right.shape == NUMBER:
                return Expression(
                    self.bind_once(
                        (left, right),
                        ("__base", "__exponent"),
                        lambda names, fresh: self.checked_number_result_code(
                            f"{names[0]} ** {names[1]}", fresh
                        ),
                    ),
                    NUMBER,
                )
            if left.shape == BIGINT and right.shape in {NUMBER, BIGINT}:
                shift = self.bigint_code(right, node)
                return Expression(f"({left.code} ** {shift})", BIGINT)
            self.fail(node, "power requires statically numeric operands")

        bigint_operators: dict[type[ast.operator], str] = {
            ast.BitAnd: "&",
            ast.BitOr: "|",
            ast.BitXor: "^",
            ast.LShift: "<<",
            ast.RShift: ">>",
        }
        symbol = bigint_operators.get(type(operator))
        if symbol is None:
            self.fail(node, f"unsupported binary operator {type(operator).__name__}")
        if left.shape == BIGINT:
            if right.shape not in {NUMBER, BIGINT}:
                self.fail(node, f"{symbol} requires an integer right operand")
            right_code = (
                self.bigint_code(right, node)
                if isinstance(operator, (ast.LShift, ast.RShift))
                else right.code
            )
            if (
                not isinstance(operator, (ast.LShift, ast.RShift))
                and right.shape != BIGINT
            ):
                self.fail(node, f"{symbol} cannot mix bigint and number")
            return Expression(f"({left.code} {symbol} {right_code})", BIGINT)
        if left.shape == SQUARE_SET:
            methods: dict[type[ast.operator], str] = {
                ast.BitAnd: "and",
                ast.BitOr: "or",
                ast.BitXor: "xor",
                ast.LShift: "lshift",
                ast.RShift: "rshift",
            }
            method = methods[type(operator)]
            if isinstance(operator, (ast.LShift, ast.RShift)):
                argument = self.bigint_code(right, node)
            else:
                if right.shape != BIGINT:
                    self.fail(
                        node,
                        "SquareSet bit operations require a proved bigint operand, "
                        f"got {right.shape.kind.value}",
                    )
                argument = right.code
            return Expression(f"{left.code}.{method}({argument})", SQUARE_SET)
        self.fail(node, f"{symbol} does not support {left.shape.kind.value}")

    def augmented_assignment(
        self,
        target: Expression,
        operator: ast.operator,
        value: Expression,
        node: ast.AST,
    ) -> str:
        if isinstance(operator, ast.Add):
            if target.shape != value.shape or target.shape not in {
                NUMBER,
                BIGINT,
                STRING,
            }:
                self.fail(node, "+= requires matching primitive operands")
            if target.shape == NUMBER:
                checked = self.bind_once(
                    (target, value),
                    ("__leftNumber", "__rightNumber"),
                    lambda names, fresh: self.checked_number_result_code(
                        f"{names[0]} + {names[1]}", fresh
                    ),
                )
                return f"{target.code} = {checked}"
            return f"{target.code} += {value.code}"
        if target.shape != SQUARE_SET:
            self.fail(node, "in-place bit operations require SquareSet")
        methods: dict[type[ast.operator], str] = {
            ast.BitAnd: "iand",
            ast.BitOr: "ior",
            ast.BitXor: "ixor",
            ast.LShift: "ilshift",
            ast.RShift: "irshift",
        }
        method = methods.get(type(operator))
        if method is None:
            self.fail(node, f"unsupported augmented operator {type(operator).__name__}")
        if isinstance(operator, (ast.LShift, ast.RShift)):
            argument = self.bigint_code(value, node)
        else:
            if value.shape != BIGINT:
                self.fail(
                    node,
                    "SquareSet in-place bit operations require a proved bigint "
                    f"operand, got {value.shape.kind.value}",
                )
            argument = value.code
        return f"{target.code}.{method}({argument})"

    @staticmethod
    def checked_number_result_code(expression: str, fresh: FreshName) -> str:
        result = fresh("__numberResult")
        return (
            "{ "
            f"const {result} = {expression}; "
            f"if (!Number.isSafeInteger({result})) "
            "throw new RangeError(\"integer result is outside TypeScript's safe range\"); "
            f"return {result}; "
            "}"
        )

    def bigint_code(self, expression: Expression, node: ast.AST) -> str:
        if expression.shape == BIGINT:
            return expression.code
        if expression.shape == NUMBER:
            return f"BigInt({expression.code})"
        self.fail(node, f"cannot convert {expression.shape.kind.value} to bigint")

    def int_expression(self, expression: Expression, node: ast.AST) -> Expression:
        if expression.shape in {NUMBER, BIGINT}:
            return expression
        if expression.shape == SQUARE_SET:
            return Expression(f"{expression.code}.int()", BIGINT)
        self.fail(node, f"int() does not support {expression.shape.kind.value}")

    def builtin_call(
        self, name: str, arguments: list[Expression], node: ast.Call
    ) -> Expression:
        if name == "range":
            if not (
                len(arguments) == 1
                and isinstance(node.args[0], ast.Constant)
                and isinstance(node.args[0].value, int)
                and not isinstance(node.args[0].value, bool)
                and 0 <= node.args[0].value <= 2**53 - 1
            ):
                self.fail(
                    node,
                    "range() requires one nonnegative safe-integer literal",
                )
            fresh = self.fresh_local_name_allocator()
            index = fresh("__index")
            return Expression(
                "({ *[Symbol.iterator]() { "
                f"for (let {index} = 0; {index} < {arguments[0].code}; "
                f"{index} += 1) {{ yield {index}; }} "
                "} })",
                iterable_of(NUMBER),
            )
        if name == "enumerate":
            if len(arguments) != 1:
                self.fail(node, "enumerate() requires one argument")
            argument = arguments[0]
            element = self.iterated_shape(argument, node.args[0])
            iterable = Expression(
                self.iterable_code(argument, node.args[0]), argument.shape
            )

            def lower_enumerate(
                names: tuple[str, ...], fresh: FreshName
            ) -> str:
                index = fresh("__index")
                value = fresh("__value")
                return (
                    "(function* () { "
                    f"let {index} = 0; "
                    f"for (const {value} of {names[0]}) {{ "
                    f"yield [{index}, {value}] satisfies "
                    f"[number, typeof {value}]; "
                    f"{index} += 1; "
                    "} })()"
                )

            return Expression(
                self.bind_once((iterable,), ("__iterable",), lower_enumerate),
                iterable_of(tuple_of(NUMBER, element)),
            )
        if len(arguments) != 1:
            self.fail(node, f"{name}() requires one argument in this compiler surface")
        argument = arguments[0]
        if name == "len":
            return self.len_expression(argument, node)
        if name == "list":
            return self.list_expression(argument, node.args[0])
        if name == "set":
            values = self.list_expression(argument, node.args[0])
            return self.set_from_array(values.code, values.shape.element or UNKNOWN, node)
        if name == "str":
            return self.str_expression(argument, node)
        if name == "repr":
            return self.repr_expression(argument, node)
        if name == "hash":
            if argument.shape != PIECE:
                self.fail(node, "hash() lowering requires Piece")
            return Expression(f"{argument.code}.hash()", NUMBER)
        if name == "int":
            return self.int_expression(argument, node)
        if name in {"hex", "bin"}:
            if argument.shape != SQUARE_SET:
                self.fail(
                    node,
                    f"{name}() lowering requires a nonnegative SquareSet",
                )
            radix = 16 if name == "hex" else 2
            prefix = "0x" if name == "hex" else "0b"
            return Expression(
                f"({json.dumps(prefix)} + {argument.code}.int().toString({radix}))",
                STRING,
            )
        if name == "reversed":
            return self.reversed_expression(argument, node)
        if name == "any":
            element = self.iterated_shape(argument, node)
            fresh = self.fresh_local_name_allocator()
            item = fresh("__item")
            condition = self.truthy_code(Expression(item, element), node)
            iterable = self.iterable_code(argument, node)
            return Expression(
                f"(() => {{ for (const {item} of {iterable}) "
                f"{{ if ({condition}) return true; }} return false; }})()",
                BOOLEAN,
            )
        if name == "sum":
            element = self.iterated_shape(argument, node)
            if element == NUMBER:
                initial = "0"
            elif element == BIGINT:
                initial = "0n"
            else:
                self.fail(node, f"sum() does not support {shape_description(element)}")
            iterable = Expression(self.iterable_code(argument, node), argument.shape)

            def lower_sum(names: tuple[str, ...], fresh: FreshName) -> str:
                total = fresh("__total")
                value = fresh("__value")
                addition = f"{total} + {value}"
                if element == NUMBER:
                    checked = self.checked_number_result_code(addition, fresh)
                    addition = f"(() => {checked})()"
                return (
                    f"{{ let {total} = {initial}; "
                    f"for (const {value} of {names[0]}) "
                    f"{{ {total} = {addition}; }} return {total}; }}"
                )
            return Expression(
                self.bind_once((iterable,), ("__iterable",), lower_sum),
                element,
            )
        self.fail(node, f"no native lowering for builtin {name}")

    def len_expression(self, argument: Expression, node: ast.AST) -> Expression:
        kind = argument.shape.kind
        if argument.shape.nullable:
            self.fail(node, f"len() does not support nullable {kind.value}")
        if kind is ShapeKind.STRING:
            return Expression(f"Array.from({argument.code}).length", NUMBER)
        if kind is ShapeKind.ARRAY:
            return Expression(f"{argument.code}.length", NUMBER)
        if kind is ShapeKind.PIECE_VALUE_SET:
            return Expression(f"{argument.code}.length", NUMBER)
        if kind is ShapeKind.SET:
            return Expression(f"{argument.code}.size", NUMBER)
        if kind is ShapeKind.SQUARE_SET:
            return Expression(f"{argument.code}.length()", NUMBER)
        self.fail(node, f"len() does not support {kind.value}")

    def list_expression(self, argument: Expression, node: ast.AST) -> Expression:
        element = self.iterated_shape(argument, node)
        iterable = self.iterable_code(argument, node)
        facts = (
            ValueFacts(
                exact_sequence_length=argument.facts.exact_sequence_length
            )
            if argument.shape.kind is ShapeKind.ARRAY
            and argument.facts.exact_sequence_length is not None
            else ValueFacts()
        )
        return Expression(f"Array.from({iterable})", array_of(element), facts)

    def set_from_array(
        self, array_code: str, element: TargetShape, node: ast.AST
    ) -> Expression:
        if element == PIECE:
            fresh = self.fresh_local_name_allocator()
            value = fresh("__value")
            index = fresh("__index")
            values = fresh("__values")
            candidate = fresh("__candidate")
            equality = piece_set_equality_code(
                candidate, value, fresh_name=fresh
            )
            return Expression(
                f"({array_code}).filter(({value}, {index}, {values}) => "
                f"!{values}.slice(0, {index}).some({candidate} => {equality}))",
                PIECE_VALUE_SET,
            )
        if element in {BOOLEAN, NUMBER, BIGINT, STRING}:
            return Expression(f"new Set({array_code})", set_of(element))
        description = (
            f"nullable {element.kind.value}"
            if element.nullable
            else element.kind.value
        )
        self.fail(node, f"set() has no value-semantic lowering for {description}")

    def str_expression(self, argument: Expression, node: ast.AST) -> Expression:
        kind = argument.shape.kind
        if argument.shape.nullable:
            self.fail(node, f"str() does not support nullable {kind.value}")
        if kind in {ShapeKind.STRING, ShapeKind.WDL_MODEL}:
            return Expression(argument.code, argument.shape, argument.facts)
        if kind is ShapeKind.ERROR:
            if not exception_has_ordinary_message(argument.shape.label):
                self.fail(
                    node,
                    "str() requires a captured exception family with ordinary "
                    f"message semantics, got {argument.shape.label or 'unknown error'}",
                )
            return Expression(f"{argument.code}.message", STRING)
        if kind is ShapeKind.PIECE:
            return Expression(f"{argument.code}.symbol()", STRING)
        if kind in {
            ShapeKind.MOVE,
            ShapeKind.SQUARE_SET,
            ShapeKind.PSEUDO_LEGAL_MOVE_GENERATOR,
            ShapeKind.MAINLINE,
            ShapeKind.STRING_EXPORTER,
            ShapeKind.FILE_EXPORTER,
        }:
            return Expression(f"{argument.code}.toString()", STRING)
        if kind is ShapeKind.LEGAL_MOVE_GENERATOR:
            return Expression(f"{argument.code}.toString()", STRING)
        self.fail(node, f"str() does not support {kind.value}")

    def repr_expression(self, argument: Expression, node: ast.AST) -> Expression:
        if argument.shape.nullable:
            self.fail(
                node,
                f"repr() does not support nullable {argument.shape.kind.value}",
            )
        if argument.shape.kind in {
            ShapeKind.PIECE,
            ShapeKind.MOVE,
            ShapeKind.SQUARE_SET,
            ShapeKind.SCORE,
        }:
            oracle_representation_pair_code = self.bind_once(
                (argument,),
                ("__representedValue",),
                lambda names, _fresh: (
                    "({ representation: "
                    f"{names[0]}.toRepr(), value: {names[0]} }})"
                ),
            )
            return Expression(
                f"{argument.code}.toRepr()",
                STRING,
                oracle_representation_pair_code=oracle_representation_pair_code,
            )
        if argument.shape.kind is ShapeKind.LEGAL_MOVE_GENERATOR:
            return Expression(f"{argument.code}.toString()", STRING)
        if argument.shape.kind is ShapeKind.PSEUDO_LEGAL_MOVE_GENERATOR:
            return Expression(f"{argument.code}.toString()", STRING)
        self.fail(node, f"repr() does not support {argument.shape.kind.value}")

    def reversed_expression(self, argument: Expression, node: ast.AST) -> Expression:
        if argument.shape.nullable:
            self.fail(
                node,
                f"reversed() does not support nullable {argument.shape.kind.value}",
            )
        if argument.shape.kind in {ShapeKind.SQUARE_SET, ShapeKind.MAINLINE}:
            return Expression(
                f"{argument.code}.reversed()",
                iterable_of(argument.shape.element or NUMBER),
            )
        if argument.shape.kind is ShapeKind.ARRAY:
            if argument.shape.element is None or argument.shape.element.kind in {
                ShapeKind.UNKNOWN,
                ShapeKind.VOID,
            }:
                self.fail(node, "reversed() requires a proved array element shape")
            fresh = self.fresh_local_name_allocator()
            sequence = fresh("__sequence")
            length = fresh("__length")
            index = fresh("__index")
            value = fresh("__value")
            return Expression(
                f"(({sequence}) => {{ const {length} = {sequence}.length; "
                "return (function* () { "
                f"for (let {index} = {length} - 1; {index} >= 0; {index} -= 1) {{ "
                f"const {value} = {sequence}.at({index}); "
                f"if ({value} === undefined) return; yield {value}; }} "
                "})(); })("
                f"{argument.code})",
                iterable_of(argument.shape.element),
            )
        self.fail(node, f"reversed() does not support {argument.shape.kind.value}")

    def copy_expression(self, argument: Expression, node: ast.AST) -> Expression:
        if argument.shape.nullable:
            self.fail(
                node,
                f"copy.copy() does not support nullable {argument.shape.kind.value}",
            )
        if argument.shape.kind in {
            ShapeKind.MOVE,
            ShapeKind.BOARD,
            ShapeKind.BASE_BOARD,
            ShapeKind.SQUARE_SET,
        }:
            return Expression(f"{argument.code}.copy()", argument.shape.required())
        self.fail(node, f"copy.copy() does not support {argument.shape.kind.value}")

    def count_expression(
        self, receiver: Expression, expected: Expression, node: ast.AST
    ) -> Expression:
        element = self.iterated_shape(receiver, node)
        iterable = Expression(self.iterable_code(receiver, node), receiver.shape)
        code = self.bind_once(
            (iterable, expected),
            ("__sequence", "__expected"),
            lambda names, fresh: self.count_bound_code(
                names[0], names[1], element, expected.shape, node, fresh
            ),
        )
        return Expression(code, NUMBER)

    def count_bound_code(
        self,
        sequence: str,
        expected: str,
        element_shape: TargetShape,
        expected_shape: TargetShape,
        node: ast.AST,
        fresh: FreshName,
    ) -> str:
        value = fresh("__item")
        comparison = self.equality_code(
            element_shape,
            expected_shape,
            value,
            expected,
            node,
            fresh_name=fresh,
        )
        return f"Array.from({sequence}).filter({value} => {comparison}).length"

    def indexed_pop(
        self, receiver: Expression, index: Expression, node: ast.AST
    ) -> Expression:
        if (
            receiver.shape.kind is not ShapeKind.ARRAY
            or receiver.shape.nullable
            or receiver.shape.element is None
            or receiver.shape.element.kind in {ShapeKind.UNKNOWN, ShapeKind.VOID}
        ):
            self.fail(node, "indexed pop() requires an array")
        if index.shape != NUMBER:
            self.fail(node, "indexed pop() requires a number index")
        code = self.bind_once(
            (receiver, index),
            ("__sequence", "__index"),
            lambda names, fresh: self.checked_array_pop_code(
                names[0], names[1], fresh
            ),
        )
        return Expression(
            code,
            receiver.shape.element,
        )

    @staticmethod
    def checked_array_pop_code(
        sequence: str, index: str, fresh: FreshName
    ) -> str:
        normalized = fresh("__normalizedIndex")
        removed = fresh("__removed")
        return (
            "{ "
            f"const {normalized} = {index} < 0 ? {sequence}.length + {index} : {index}; "
            f"if ({normalized} < 0 || {normalized} >= {sequence}.length) "
            "throw new RangeError(\"array index out of range\"); "
            f"const {removed} = {sequence}.splice({normalized}, 1); "
            f"return {removed}[0]; "
            "}"
        )

    def get_item(
        self, container: Expression, key: Expression, node: ast.AST
    ) -> Expression:
        shape = container.shape
        if shape.nullable:
            container = Expression(
                self.require_non_null_code(container),
                shape.required(),
                container.facts,
            )
            shape = container.shape
        if shape.kind is ShapeKind.ARRAY and shape.element is not None:
            if key.shape != NUMBER:
                self.fail(
                    node,
                    f"array index requires number, got {key.shape.kind.value}",
                )
            if shape.element.kind in {ShapeKind.UNKNOWN, ShapeKind.VOID}:
                self.fail(node, "array read requires a proved element shape")
            return Expression(
                self.checked_sequence_get(container, key, "array"),
                shape.element,
            )
        if shape.kind is ShapeKind.STRING:
            if key.shape != NUMBER:
                self.fail(
                    node,
                    f"string index requires number, got {key.shape.kind.value}",
                )
            return Expression(
                self.checked_sequence_get(container, key, "string"),
                STRING,
            )
        if shape.kind is ShapeKind.MAP and len(shape.members) == 2:
            key_shape, value_shape = shape.members
            if key_shape.kind in {ShapeKind.UNKNOWN, ShapeKind.VOID}:
                self.fail(node, "map read requires a proved key shape")
            if value_shape.kind in {ShapeKind.UNKNOWN, ShapeKind.VOID}:
                self.fail(node, "map read requires a proved value shape")
            if key.shape != key_shape:
                self.fail(
                    node,
                    "map key shape mismatch: "
                    f"expected {key_shape.kind.value}, got {key.shape.kind.value}",
                )
            return Expression(self.checked_map_get(container, key), value_shape)
        if shape.kind is ShapeKind.KEYED_MAP:
            if not (
                isinstance(node, ast.Subscript)
                and isinstance(node.slice, ast.Constant)
                and isinstance(node.slice.value, str)
            ):
                self.fail(
                    node,
                    "keyed mapping subscription requires a literal string key",
                )
            result_shape = dict(shape.fields).get(node.slice.value)
            if result_shape is None:
                self.fail(
                    node.slice,
                    f"keyed mapping has no result contract for "
                    f"{node.slice.value!r}",
                )
            return Expression(self.checked_map_get(container, key), result_shape)
        if shape.kind is ShapeKind.HEADERS:
            if key.shape != STRING:
                self.fail(
                    node,
                    f"header key requires string, got {key.shape.kind.value}",
                )
            return Expression(self.checked_map_get(container, key), STRING)
        if shape.kind in {
            ShapeKind.GAME,
            ShapeKind.GAME_NODE,
            ShapeKind.CHILD_GAME_NODE,
        }:
            if key.shape != NUMBER:
                self.fail(
                    node,
                    f"game index requires number, got {key.shape.kind.value}",
                )
            return Expression(f"{container.code}.getitem({key.code})", CHILD_GAME_NODE)
        self.fail(node, f"subscription does not support {shape.kind.value}")

    def checked_sequence_get(
        self, container: Expression, key: Expression, family: str
    ) -> str:
        return self.bind_once(
            (container, key),
            ("__sequence", "__index"),
            lambda names, fresh: self.checked_sequence_get_code(
                names[0], names[1], family, fresh
            ),
        )

    @staticmethod
    def checked_sequence_get_code(
        sequence: str, index: str, family: str, fresh: FreshName
    ) -> str:
        value = fresh("__indexedValue")
        indexed_sequence = (
            f"Array.from({sequence})" if family == "string" else sequence
        )
        return (
            "{ "
            f"const {value} = {indexed_sequence}.at({index}); "
            f"if ({value} === undefined) "
            f"throw new RangeError(\"{family} index out of range\"); "
            f"return {value}; "
            "}"
        )

    def checked_map_get(self, container: Expression, key: Expression) -> str:
        key_error = registered_exception_constructor("KeyError")
        if key_error is None:
            raise ValueError("the target registry must define Python KeyError")
        return self.bind_once(
            (container, key),
            ("__mapping", "__key"),
            lambda names, fresh: self.checked_map_get_code(
                names[0], names[1], key_error, fresh
            ),
        )

    @staticmethod
    def checked_map_get_code(
        mapping: str,
        key: str,
        key_error: str,
        fresh: FreshName,
    ) -> str:
        value = fresh("__mappedValue")
        return (
            "{ "
            f"const {value} = {mapping}.get({key}); "
            f"if ({value} === undefined) "
            f"throw new {key_error}(String({key})); "
            f"return {value}; "
            "}"
        )

    def set_item(
        self,
        container: Expression,
        key: Expression,
        value: Expression,
        node: ast.AST,
    ) -> str:
        if container.shape.nullable:
            self.fail(
                node,
                f"item assignment does not support nullable {container.shape.kind.value}",
            )
        if container.shape.kind is ShapeKind.MAP:
            if len(container.shape.members) != 2:
                self.fail(node, "map write requires key and value shapes")
            key_shape, value_shape = container.shape.members
            if key_shape.kind in {ShapeKind.UNKNOWN, ShapeKind.VOID}:
                self.fail(node, "map write requires a proved key shape")
            if value_shape.kind in {ShapeKind.UNKNOWN, ShapeKind.VOID}:
                self.fail(node, "map write requires a proved value shape")
            if key.shape != key_shape:
                self.fail(
                    node,
                    "map key shape mismatch: "
                    f"expected {key_shape.kind.value}, got {key.shape.kind.value}",
                )
            if value.shape != value_shape:
                self.fail(
                    node,
                    "map value shape mismatch: "
                    f"expected {value_shape.kind.value}, got {value.shape.kind.value}",
                )
            return self.bind_once(
                (value, container, key),
                ("__newValue", "__mapping", "__key"),
                lambda names, _fresh: f"{names[1]}.set({names[2]}, {names[0]})",
            )
        if container.shape.kind is ShapeKind.HEADERS:
            if key.shape != STRING or value.shape != STRING:
                self.fail(node, "header writes require string keys and values")
            return self.bind_once(
                (value, container, key),
                ("__newValue", "__headers", "__key"),
                lambda names, _fresh: f"{names[1]}.set({names[2]}, {names[0]})",
            )
        if (
            container.shape.kind is ShapeKind.ARRAY
            and container.shape.element is not None
        ):
            if key.shape != NUMBER:
                self.fail(
                    node,
                    f"array index requires number, got {key.shape.kind.value}",
                )
            if container.shape.element.kind in {ShapeKind.UNKNOWN, ShapeKind.VOID}:
                self.fail(node, "array write requires a proved element shape")
            if value.shape != container.shape.element:
                self.fail(
                    node,
                    "array value shape mismatch: "
                    f"expected {container.shape.element.kind.value}, "
                    f"got {value.shape.kind.value}",
                )
            return self.bind_once(
                (value, container, key),
                ("__newValue", "__sequence", "__index"),
                lambda names, fresh: self.checked_array_set_code(
                    names[1], names[2], names[0], fresh
                ),
            )
        self.fail(node, f"item assignment does not support {container.shape.kind.value}")

    @staticmethod
    def checked_array_set_code(
        sequence: str, index: str, value: str, fresh: FreshName
    ) -> str:
        normalized = fresh("__normalizedIndex")
        return (
            "{ "
            f"const {normalized} = {index} < 0 ? {sequence}.length + {index} : {index}; "
            f"if ({normalized} < 0 || {normalized} >= {sequence}.length) "
            "throw new RangeError(\"array assignment index out of range\"); "
            f"{sequence}[{normalized}] = {value}; "
            "}"
        )

    def equality_callback(
        self, actual: TargetShape, expected: TargetShape, node: ast.AST
    ) -> str:
        fresh = self.fresh_local_name_allocator()
        actual_name = fresh("__actual")
        expected_name = fresh("__expected")
        comparison = self.equality_code(
            actual,
            expected,
            actual_name,
            expected_name,
            node,
            fresh_name=fresh,
        )
        return f"({actual_name}, {expected_name}) => {comparison}"

    def equality_code(
        self,
        left: TargetShape,
        right: TargetShape,
        left_code: str,
        right_code: str,
        node: ast.AST,
        *,
        depth: int = 0,
        fresh_name: FreshName | None = None,
    ) -> str:
        fresh = fresh_name or self.fresh_local_name_allocator()
        try:
            return native_equality_code(
                left,
                right,
                left_code,
                right_code,
                depth=depth,
                fresh_name=fresh,
            )
        except NativeLoweringError as error:
            self.fail(node, str(error))

    def contains_callback(
        self, container: TargetShape, member: TargetShape, node: ast.AST
    ) -> str:
        fresh = self.fresh_local_name_allocator()
        try:
            return native_contains_callback(
                container, member, fresh_name=fresh
            )
        except NativeLoweringError as error:
            self.fail(node, str(error))

    def native_set_method(
        self,
        receiver: Expression,
        method: str,
        arguments: list[Expression],
        node: ast.AST,
    ) -> Expression:
        if len(arguments) != 1:
            self.fail(node, f"set.{method} requires one argument")
        other = arguments[0]
        fresh = self.fresh_local_name_allocator()
        left_name = fresh("__leftSet")
        right_name = fresh("__rightSet")
        try:
            result = lower_native_set_method(
                left_name,
                receiver.shape,
                method,
                right_name,
                other.shape,
                fresh_name=fresh,
            )
        except NativeLoweringError as error:
            self.fail(node, str(error))
        code = (
            f"(({left_name}, {right_name}) => {result.code})"
            f"({receiver.code}, {other.code})"
        )
        return Expression(code, result.shape)

    def expression(
        self, node: ast.expr, *, suppress_gap: GapCase | None = None
    ) -> Expression:
        self.claim(node)
        gap = self.gaps_by_boundary.get(id(node))
        if gap is not None and gap is not suppress_gap:
            self.fail(node, "expression-level gap must be wrapped by its statement")

        if isinstance(node, ast.Name):
            if isinstance(node.ctx, ast.Load) and node.id in self.unavailable_names:
                self.fail(
                    node,
                    f"name {node.id!r} is unavailable outside the assertRaises "
                    "callback that bound it",
                )
            names = {"self": "this"}
            return Expression(
                names.get(
                    node.id,
                    self.symbol_target_names.get(
                        node.id, py_identifier_to_ts(node.id)
                    ),
                ),
                self.shape_for_name(node.id),
                self.symbol_facts.get(node.id, ValueFacts()),
                self.symbol_representation_pair_codes.get(node.id),
            )

        if isinstance(node, ast.Attribute):
            full_name = dotted_name(node)
            target_name = (
                target_qualified_name(full_name) if full_name is not None else None
            )
            if target_name is not None:
                self.claim_dotted_descendants(node)
                return Expression(
                    target_name,
                    self.shape_for_qualified_name(full_name or ""),
                )
            value_expression = self.expression(node.value, suppress_gap=suppress_gap)
            value = value_expression.code
            if node.attr == "exception":
                if value_expression.shape.kind is not ShapeKind.ASSERT_RAISES_CONTEXT:
                    self.fail(
                        node,
                        ".exception requires a bound assertRaises context, got "
                        f"{value_expression.shape.kind.value}",
                    )
                return Expression(
                    value,
                    error_of(value_expression.shape.label or "unknown error"),
                )
            receiver_shape = value_expression.shape
            if receiver_shape.nullable:
                value = self.require_non_null_code(value_expression)
                receiver_shape = receiver_shape.required()
                value_expression = Expression(
                    value,
                    receiver_shape,
                    value_expression.facts,
                )
            if receiver_shape.kind is ShapeKind.ERROR:
                self.fail(
                    node,
                    "captured exceptions expose no Python source attributes",
                )
            if receiver_shape.kind is ShapeKind.ASSERT_RAISES_CONTEXT:
                self.fail(
                    node,
                    "assertRaises contexts expose only the .exception attribute",
                )
            result_shape, result_facts, guard = self.refined_attribute(
                node, value_expression
            )
            result_code = f"{value}.{py_identifier_to_ts(node.attr)}"
            if guard is not None:
                result_code = self.guard_runtime_type_code(
                    Expression(result_code, self.shape_for_attribute(node, receiver_shape)),
                    guard,
                )
            return Expression(result_code, result_shape, result_facts)

        if isinstance(node, ast.Constant):
            if node.value is None:
                return Expression("null", NULL)
            if node.value is True:
                return Expression("true", BOOLEAN)
            if node.value is False:
                return Expression("false", BOOLEAN)
            if isinstance(node.value, str):
                return Expression(
                    json.dumps(node.value, ensure_ascii=False),
                    STRING,
                    ValueFacts(exact_string=node.value),
                )
            if isinstance(node.value, int) and not isinstance(node.value, bool):
                if abs(node.value) > 2**53 - 1:
                    source = ast.get_source_segment(self.source_unit.source, node)
                    literal = source.strip() if source else str(node.value)
                    return Expression(f"{literal}n", BIGINT)
                return Expression(str(node.value), NUMBER)
            if isinstance(node.value, float):
                if not math.isfinite(node.value):
                    self.fail(node, "non-finite float constants are unsupported")
                # JSON's finite-number rendering is a shortest binary64
                # round-trip representation accepted identically by JS.
                return Expression(json.dumps(node.value, allow_nan=False), FLOAT)
            self.fail(node, f"unsupported constant {type(node.value).__name__}")

        if isinstance(node, (ast.List, ast.Tuple)):
            expressions = [
                self.expression(element, suppress_gap=suppress_gap)
                for element in node.elts
            ]
            if any(
                expression.oracle_representation_pair_code is not None
                for expression in expressions
            ):
                self.fail(
                    node,
                    "list and tuple literals containing repr() values require "
                    "unsupported recursive assertion-oracle provenance",
                )
            values = ", ".join(expression.code for expression in expressions)
            if isinstance(node, ast.Tuple):
                return Expression(
                    f"[{values}]",
                    tuple_of(*(expression.shape for expression in expressions)),
                )
            element_shape = self.common_shape(
                [expression.shape for expression in expressions], node
            )
            array_code = f"[{values}]"
            if element_shape == ARROW_INPUT:
                array_code = (
                    f"({array_code} satisfies "
                    "(svgModule.Arrow | [number, number])[])"
                )
            return Expression(
                array_code,
                array_of(element_shape),
                ValueFacts(
                    exact_sequence_length=len(expressions),
                    finite_string_values=(
                        frozenset(
                            expression.facts.exact_string
                            for expression in expressions
                            if expression.facts.exact_string is not None
                        )
                        if expressions
                        and all(
                            expression.shape == STRING
                            and expression.facts.exact_string is not None
                            for expression in expressions
                        )
                        else frozenset()
                    ),
                ),
            )

        if isinstance(node, ast.Dict):
            if any(key is None for key in node.keys):
                self.fail(node, "dictionary unpacking is unsupported")
            pairs = [
                (
                    self.expression(key, suppress_gap=suppress_gap),
                    self.expression(value, suppress_gap=suppress_gap),
                )
                for key, value in zip(node.keys, node.values, strict=True)
                if key is not None
            ]
            entries = ", ".join(
                f"[{key.code}, {value.code}]" for key, value in pairs
            )
            key_shape = self.common_shape([key.shape for key, _ in pairs], node)
            value_shape = self.common_shape([value.shape for _, value in pairs], node)
            allowed_key_shapes = {BOOLEAN, NUMBER, BIGINT, STRING}
            if pairs and key_shape not in allowed_key_shapes:
                description = (
                    f"nullable {key_shape.kind.value}"
                    if key_shape.nullable
                    else key_shape.kind.value
                )
                self.fail(
                    node,
                    "dictionary keys require a proved non-null primitive "
                    f"value-semantic shape, got {description}",
                )
            return Expression(
                f"new Map([{entries}])" if pairs else "new Map()",
                map_of(key_shape, value_shape),
            )

        if isinstance(node, ast.BinOp):
            left = self.expression(node.left, suppress_gap=suppress_gap)
            right = self.expression(node.right, suppress_gap=suppress_gap)
            return self.binary_operator(left, node.op, right, node)

        if isinstance(node, ast.UnaryOp):
            operand = self.expression(node.operand, suppress_gap=suppress_gap)
            if isinstance(node.op, ast.Not):
                return Expression(f"!({self.truthy_code(operand, node)})", BOOLEAN)
            if isinstance(node.op, (ast.UAdd, ast.USub)):
                if operand.shape not in {NUMBER, FLOAT, BIGINT}:
                    self.fail(
                        node,
                        f"unary sign does not support {operand.shape.kind.value}",
                    )
                operator = "+" if isinstance(node.op, ast.UAdd) else "-"
                if operand.shape is BIGINT and operator == "+":
                    # JavaScript has no unary plus for bigint; identity is the
                    # exact result of Python's positive bigint operation.
                    return operand
                return Expression(f"{operator}({operand.code})", operand.shape)
            if isinstance(node.op, ast.Invert):
                if operand.shape == BIGINT:
                    return Expression(f"~({operand.code})", BIGINT)
                if operand.shape == SQUARE_SET:
                    return Expression(f"{operand.code}.invert()", SQUARE_SET)
                self.fail(node, f"~ does not support {operand.shape.kind.value}")
            self.fail(node, f"unsupported unary operator {type(node.op).__name__}")

        if isinstance(node, ast.Call):
            return self.call(node, suppress_gap=suppress_gap)

        if isinstance(node, ast.BoolOp):
            if len(node.values) < 2:
                self.fail(node, "boolean operations require at least two operands")
            values = [
                self.expression(value, suppress_gap=suppress_gap)
                for value in node.values
            ]
            if any(value.shape != BOOLEAN for value in values):
                self.fail(
                    node,
                    "expression-valued and/or requires proved boolean operands",
                )
            if isinstance(node.op, ast.And):
                operator = "&&"
            elif isinstance(node.op, ast.Or):
                operator = "||"
            else:
                self.fail(node, f"unsupported boolean operator {type(node.op).__name__}")
            return Expression(
                "(" + f" {operator} ".join(value.code for value in values) + ")",
                BOOLEAN,
            )

        if isinstance(node, ast.Compare):
            if len(node.ops) != 1 or len(node.comparators) != 1:
                self.fail(node, "comparison chains are unsupported")
            left = self.expression(node.left, suppress_gap=suppress_gap)
            right = self.expression(node.comparators[0], suppress_gap=suppress_gap)
            if isinstance(node.ops[0], ast.Eq):
                return Expression(
                    self.bind_once(
                        (left, right),
                        ("__left", "__right"),
                        lambda names, fresh: self.equality_code(
                            left.shape,
                            right.shape,
                            names[0],
                            names[1],
                            node,
                            fresh_name=fresh,
                        ),
                    ),
                    BOOLEAN,
                )
            if isinstance(node.ops[0], ast.NotEq):
                equality = self.bind_once(
                    (left, right),
                    ("__left", "__right"),
                    lambda names, fresh: self.equality_code(
                        left.shape,
                        right.shape,
                        names[0],
                        names[1],
                        node,
                        fresh_name=fresh,
                    ),
                )
                return Expression(f"!({equality})", BOOLEAN)
            if isinstance(node.ops[0], (ast.Is, ast.IsNot)):
                if left.shape.kind is not ShapeKind.NULL and right.shape.kind is not ShapeKind.NULL:
                    self.fail(node, "identity comparison is supported only with None")
                equality = self.bind_once(
                    (left, right),
                    ("__left", "__right"),
                    lambda names, fresh: self.equality_code(
                        left.shape,
                        right.shape,
                        names[0],
                        names[1],
                        node,
                        fresh_name=fresh,
                    ),
                )
                return Expression(
                    f"!({equality})"
                    if isinstance(node.ops[0], ast.IsNot)
                    else equality,
                    BOOLEAN,
                )
            ordering_operators = {
                ast.Lt: "lt",
                ast.LtE: "le",
                ast.Gt: "gt",
                ast.GtE: "ge",
            }
            ordering = ordering_operators.get(type(node.ops[0]))
            if ordering is not None:
                try:
                    code = self.bind_once(
                        (left, right),
                        ("__left", "__right"),
                        lambda names, fresh: native_ordering_code(
                            ordering,
                            left.shape,
                            right.shape,
                            names[0],
                            names[1],
                            fresh_name=fresh,
                        ),
                    )
                except NativeLoweringError as error:
                    self.fail(node, str(error))
                return Expression(code, BOOLEAN)
            self.fail(node, f"unsupported comparison {type(node.ops[0]).__name__}")

        if isinstance(node, ast.Subscript):
            container = self.expression(node.value, suppress_gap=suppress_gap)
            key = self.expression(node.slice, suppress_gap=suppress_gap)
            return self.get_item(container, key, node)

        if isinstance(node, (ast.ListComp, ast.SetComp, ast.GeneratorExp)):
            return self.comprehension(node, suppress_gap=suppress_gap)

        if isinstance(node, ast.JoinedStr):
            parts = []
            for value in node.values:
                if isinstance(value, ast.Constant) and isinstance(value.value, str):
                    self.claim(value)
                    escaped = (
                        value.value.replace("\\", "\\\\")
                        .replace("`", "\\`")
                        .replace("${", "\\${")
                    )
                    parts.append(escaped)
                elif isinstance(value, ast.FormattedValue):
                    self.claim(value)
                    if value.format_spec is not None:
                        self.fail(value, "f-string format specifications are unsupported")
                    parsed = self.expression(
                        value.value, suppress_gap=suppress_gap
                    )
                    if value.conversion in {-1, ord("s")}:
                        converted = self.str_expression(parsed, value)
                    elif value.conversion == ord("r"):
                        converted = self.repr_expression(parsed, value)
                    else:
                        self.fail(
                            value,
                            "f-string conversion must be absent, !s, or !r",
                        )
                    parts.append(f"${{{converted.code}}}")
                else:
                    self.fail(value, "unsupported f-string component")
            return Expression("`" + "".join(parts) + "`", STRING)

        self.fail(node, f"unsupported expression {type(node).__name__}")

    def comprehension(
        self,
        node: ast.ListComp | ast.SetComp | ast.GeneratorExp,
        *,
        suppress_gap: GapCase | None,
    ) -> Expression:
        if len(node.generators) != 1:
            self.fail(node, "only one-clause comprehensions are supported")
        generator = node.generators[0]
        self.claim(generator)
        if generator.is_async or generator.ifs:
            self.fail(node, "async and filtered comprehensions are unsupported")
        if not isinstance(generator.target, ast.Name):
            self.fail(generator.target, "comprehension targets must be names")
        self.claim(generator.target)
        source_target = py_identifier_to_ts(generator.target.id)
        target = self.fresh_target_name(f"__{source_target}Item")
        iterable = self.expression(generator.iter, suppress_gap=suppress_gap)
        if isinstance(node, ast.GeneratorExp):
            self.lazy_captured_names.update(
                child.id
                for child in ast.walk(node.elt)
                if isinstance(child, ast.Name)
                and isinstance(child.ctx, ast.Load)
                and child.id != generator.target.id
                and child.id in self.declared_names
            )
        previous_shape = self.symbol_shapes.get(generator.target.id)
        previous_facts = self.symbol_facts.get(generator.target.id)
        previous_target_name = self.symbol_target_names.get(generator.target.id)
        previous_representation_pair = self.symbol_representation_pair_codes.get(
            generator.target.id
        )
        self.symbol_shapes[generator.target.id] = self.iterated_shape(
            iterable, generator.iter
        )
        self.symbol_facts[generator.target.id] = ValueFacts()
        self.symbol_target_names[generator.target.id] = target
        self.symbol_representation_pair_codes.pop(generator.target.id, None)
        element = self.expression(node.elt, suppress_gap=suppress_gap)
        if previous_shape is None:
            self.symbol_shapes.pop(generator.target.id, None)
        else:
            self.symbol_shapes[generator.target.id] = previous_shape
        if previous_facts is None:
            self.symbol_facts.pop(generator.target.id, None)
        else:
            self.symbol_facts[generator.target.id] = previous_facts
        if previous_target_name is None:
            self.symbol_target_names.pop(generator.target.id, None)
        else:
            self.symbol_target_names[generator.target.id] = previous_target_name
        if previous_representation_pair is None:
            self.symbol_representation_pair_codes.pop(generator.target.id, None)
        else:
            self.symbol_representation_pair_codes[generator.target.id] = (
                previous_representation_pair
            )
        iterable_code = self.iterable_code(iterable, generator.iter)
        if isinstance(node, ast.GeneratorExp):
            bound_iterable = Expression(iterable_code, iterable.shape)
            return Expression(
                self.bind_once(
                    (bound_iterable,),
                    ("__iterable",),
                    lambda names, _fresh: (
                        "(function* () { "
                        f"for (const {target} of {names[0]}) "
                        f"{{ yield {element.code}; }} "
                        "})()"
                    ),
                ),
                iterable_of(element.shape),
            )
        mapped = f"Array.from({iterable_code}, {target} => {element.code})"
        if isinstance(node, ast.SetComp):
            return self.set_from_array(mapped, element.shape, node)
        facts = (
            ValueFacts(
                exact_sequence_length=iterable.facts.exact_sequence_length
            )
            if iterable.shape.kind is ShapeKind.ARRAY
            and iterable.facts.exact_sequence_length is not None
            else ValueFacts()
        )
        return Expression(mapped, array_of(element.shape), facts)

    def call(self, node: ast.Call, *, suppress_gap: GapCase | None) -> Expression:
        name = dotted_name(node.func)
        function = self.expression(node.func, suppress_gap=suppress_gap)
        keyword_names = [keyword.arg for keyword in node.keywords]
        if any(keyword is None for keyword in keyword_names):
            self.fail(node, "dictionary keyword expansion is unsupported")

        arguments = [
            self.expression(argument, suppress_gap=suppress_gap)
            for argument in node.args
        ]
        keyword_values = [
            (
                keyword.arg or "",
                self.expression(keyword.value, suppress_gap=suppress_gap),
            )
            for keyword in node.keywords
        ]

        if name in {
            "any",
            "bin",
            "enumerate",
            "hash",
            "hex",
            "int",
            "len",
            "list",
            "range",
            "repr",
            "reversed",
            "set",
            "str",
            "sum",
        }:
            if node.keywords:
                self.fail(node, f"{name}() keyword arguments are unsupported")
            return self.builtin_call(name, arguments, node)

        if name == "copy.copy":
            if len(arguments) != 1 or node.keywords:
                self.fail(node, "copy.copy() requires one positional argument")
            return self.copy_expression(arguments[0], node)

        if name == "textwrap.dedent":
            if len(arguments) != 1 or node.keywords:
                self.fail(node, "textwrap.dedent() requires one positional argument")
            source_argument = node.args[0]
            if not (
                isinstance(source_argument, ast.Constant)
                and isinstance(source_argument.value, str)
            ):
                self.fail(node, "textwrap.dedent() requires a literal string")
            return Expression(
                json.dumps(
                    textwrap.dedent(source_argument.value), ensure_ascii=False
                ),
                STRING,
            )

        if name and name.startswith("self.assert"):
            return self.assertion_call(node, name, arguments, suppress_gap=suppress_gap)

        if isinstance(node.func, ast.Attribute) and node.func.attr == "count" and arguments:
            receiver = self.expression(node.func.value, suppress_gap=suppress_gap)
            if node.keywords or len(arguments) != 1:
                self.fail(node, "sequence count() requires one positional argument")
            if receiver.shape.kind is not ShapeKind.ARRAY:
                self.fail(
                    node.func.value,
                    "one-argument count() requires an exact array receiver",
                )
            return self.count_expression(receiver, arguments[0], node)

        if (
            isinstance(node.func, ast.Attribute)
            and node.func.attr == "pop"
            and not arguments
        ):
            receiver = self.expression(
                node.func.value, suppress_gap=suppress_gap
            )
            if receiver.shape.kind is ShapeKind.ARRAY:
                self.fail(
                    node,
                    "zero-argument array pop() is unsupported; use the checked "
                    "indexed form",
                )

        if isinstance(node.func, ast.Attribute) and node.func.attr == "pop" and arguments:
            if node.keywords or len(arguments) != 1:
                self.fail(node, "indexed pop() requires one positional argument")
            receiver_expression = self.expression(
                node.func.value, suppress_gap=suppress_gap
            )
            if isinstance(node.func.value, ast.Name):
                facts = self.symbol_facts.get(node.func.value.id, ValueFacts())
                self.symbol_facts[node.func.value.id] = (
                    facts.without_mutable_sequence_facts()
                )
            return self.indexed_pop(receiver_expression, arguments[0], node)

        if isinstance(node.func, ast.Attribute) and node.func.attr == "lower":
            if arguments or node.keywords:
                self.fail(node, "lower() arguments are unsupported")
            receiver = self.expression(node.func.value, suppress_gap=suppress_gap)
            if receiver.shape != STRING:
                self.fail(node.func.value, "lower() requires a proved string receiver")
            if (
                isinstance(node.func.value, ast.Constant)
                and isinstance(node.func.value.value, str)
                and not node.func.value.value.isascii()
            ):
                self.fail(
                    node.func.value,
                    "lower() supports only ASCII strings because Python and "
                    "TypeScript Unicode case mappings are not version-stable",
                )

            message = (
                "lower() supports only ASCII strings because Python and "
                "TypeScript Unicode case mappings are not version-stable"
            )
            lowered = self.bind_once(
                (receiver,),
                ("__lowerValue",),
                lambda names, _fresh: (
                    "{ "
                    f"if (!/^[\\x00-\\x7F]*$/.test({names[0]})) "
                    f"throw new RangeError({json.dumps(message)}); "
                    f"return {names[0]}.toLowerCase(); "
                    "}"
                ),
            )
            return Expression(lowered, STRING)

        receiver = (
            self.expression(node.func.value, suppress_gap=suppress_gap)
            if isinstance(node.func, ast.Attribute)
            else None
        )
        if receiver is not None and receiver.shape.nullable:
            receiver = Expression(
                self.require_non_null_code(receiver),
                receiver.shape.required(),
                receiver.facts,
            )
        contract = self.resolve_call_contract(node, name, function, receiver)
        arguments, keyword_values = self.contextualize_contract_arguments(
            node, contract, arguments, keyword_values
        )
        self.validate_contract(node, contract, arguments, keyword_values)
        arguments, result_override = self.adapt_contract_arguments(
            node,
            contract,
            arguments,
            suppress_gap=suppress_gap,
        )
        result_arguments = list(arguments)

        set_operations = {
            "isdisjoint",
            "issubset",
            "issuperset",
            "union",
            "intersection",
            "difference",
            "symmetric_difference",
        }
        if (
            isinstance(node.func, ast.Attribute)
            and node.func.attr in set_operations
            and receiver is not None
            and receiver.shape.kind is ShapeKind.SET
        ):
            return self.native_set_method(receiver, node.func.attr, arguments, node)

        if contract.keyword_style is KeywordStyle.OPTIONS_OBJECT and keyword_values:
            fields = ", ".join(
                f"{py_identifier_to_ts(keyword)}: {value.code}"
                for keyword, value in keyword_values
            )
            arguments.append(Expression("{ " + fields + " }", VOID))
        elif contract.keyword_style is KeywordStyle.POSITIONAL:
            arguments.extend(value for _keyword, value in keyword_values)

        if contract.positional_options:
            present = tuple(
                (index, option, arguments[index])
                for index, option in contract.positional_options
                if index < len(arguments)
            )
            if present:
                first = present[0][0]
                expected_indices = tuple(range(first, len(arguments)))
                observed_indices = tuple(index for index, _option, _value in present)
                if observed_indices != expected_indices:
                    self.fail(node, "positional option fields must be a contiguous tail")
                fields = ", ".join(
                    f"{option}: {value.code}"
                    for _index, option, value in present
                )
                arguments = arguments[:first] + [
                    Expression("{ " + fields + " }", VOID)
                ]

        callee = function.code
        if contract.target_member is not None:
            if receiver is None:
                self.fail(node.func, "a target member override requires a receiver")
            callee = f"{receiver.code}.{contract.target_member}"

        if contract.invocation is InvocationKind.MISSING_CONSTRUCTOR:
            invocation = self.render_missing_constructor(
                node,
                contract,
                arguments,
                suppress_gap=suppress_gap,
            )
        else:
            invocation = (
                f"{callee}({', '.join(argument.code for argument in arguments)})"
            )
            if contract.invocation is InvocationKind.CONSTRUCT:
                invocation = f"new {invocation}"

        if contract.result_assertion is not None:
            self.require_adapter_authority(
                node, contract.result_assertion, suppress_gap
            )
            invocation = self.type_assertion_code(
                invocation, contract.result_assertion
            )

        shape, facts, guard = self.contract_result(
            contract, result_arguments, result_override
        )
        if guard is not None:
            invocation = self.guard_runtime_type_code(
                Expression(invocation, contract.result), guard
            )
        return Expression(invocation, shape, facts)

    def assertion_call(
        self,
        node: ast.Call,
        name: str,
        arguments: list[Expression],
        *,
        suppress_gap: GapCase | None,
    ) -> Expression:
        keywords = {keyword.arg: keyword for keyword in node.keywords}
        unexpected = set(keywords) - {"msg"}
        if unexpected:
            self.fail(node, f"assertion has unmapped keywords: {sorted(unexpected)}")
        if "msg" in keywords:
            arguments.append(
                self.expression(
                    keywords["msg"].value, suppress_gap=suppress_gap
                )
            )
        if name in {"self.assertTrue", "self.assertFalse"}:
            if len(arguments) not in {1, 2}:
                self.fail(node, f"{name} requires one operand and optional message")
            if len(arguments) == 2 and arguments[1].shape != STRING:
                self.fail(node, f"{name} message requires string")
        function = self.expression(node.func, suppress_gap=suppress_gap).code
        if name in {"self.assertTrue", "self.assertFalse"}:
            value = arguments[0]
            if len(arguments) == 2:
                message = arguments[1]

                def assertion_with_message(
                    names: tuple[str, ...], _fresh: FreshName
                ) -> str:
                    condition = self.truthy_code(
                        Expression(names[0], value.shape), node
                    )
                    return f"{function}({condition}, {names[1]})"

                return Expression(
                    self.bind_once(
                        (value, message),
                        ("__assertionValue", "__assertionMessage"),
                        assertion_with_message,
                    ),
                    VOID,
                )
            condition = self.truthy_code(value, node)
            return Expression(
                f"{function}({condition})",
                VOID,
            )
        if name in {"self.assertEqual", "self.assertNotEqual"}:
            if len(arguments) == 1:
                if name != "self.assertEqual":
                    self.fail(
                        node,
                        "unary malformed-assertion lowering is supported only for "
                        "self.assertEqual",
                    )
                if arguments[0].shape.kind in {ShapeKind.UNKNOWN, ShapeKind.VOID}:
                    self.fail(node, f"{name} requires a proved operand")
                return Expression(f"{function}({arguments[0].code})", VOID)
            if len(arguments) not in {2, 3}:
                self.fail(node, f"{name} requires two operands and optional message")
            if len(arguments) == 3 and arguments[2].shape != STRING:
                self.fail(node, f"{name} message requires string")
            actual, expected = arguments[:2]
            if (
                actual.shape.kind is ShapeKind.ARRAY
                and expected.shape.kind is ShapeKind.ARRAY
                and 0
                in {
                    actual.facts.exact_sequence_length,
                    expected.facts.exact_sequence_length,
                }
            ):
                # Equality with a statically empty sequence depends only on
                # length, so no fictitious element type or equality rule is
                # needed for the empty literal.
                comparator = (
                    "(__actual, __expected) => "
                    "__actual.length === 0 && __expected.length === 0"
                )
            else:
                comparator = self.equality_callback(
                    actual.shape, expected.shape, node
                )
            representation_pairs = (
                actual.oracle_representation_pair_code,
                expected.oracle_representation_pair_code,
            )
            if any(value is not None for value in representation_pairs):
                if not all(value is not None for value in representation_pairs):
                    self.fail(
                        node,
                        "comparison between repr() and a non-repr value requires "
                        "an explicit cross-runtime representation rule",
                    )
                method = (
                    "this.assertEqualRepresentationsUsing"
                    if name == "self.assertEqual"
                    else "this.assertNotEqualRepresentationsUsing"
                )
                pair_expressions = tuple(
                    Expression(pair, UNKNOWN)
                    for pair in representation_pairs
                    if pair is not None
                )

                def render_representation_assertion(
                    names: tuple[str, ...], _fresh: FreshName
                ) -> str:
                    rendered = [
                        f"{names[0]}.representation",
                        f"{names[1]}.representation",
                        comparator,
                        f"{names[0]}.value",
                        f"{names[1]}.value",
                    ]
                    if len(arguments) == 3:
                        rendered.append(arguments[2].code)
                    return f"{method}({', '.join(rendered)})"

                return Expression(
                    self.bind_once(
                        pair_expressions,
                        ("__actualRepresentation", "__expectedRepresentation"),
                        render_representation_assertion,
                    ),
                    VOID,
                )
            else:
                method = (
                    "this.assertEqualUsing"
                    if name == "self.assertEqual"
                    else "this.assertNotEqualUsing"
                )
                rendered = [actual.code, expected.code, comparator]
            if len(arguments) == 3:
                rendered.append(arguments[2].code)
            return Expression(f"{method}({', '.join(rendered)})", VOID)
        if name in {"self.assertIn", "self.assertNotIn"}:
            if len(arguments) not in {2, 3}:
                self.fail(node, f"{name} requires member, container, and optional message")
            if len(arguments) == 3 and arguments[2].shape != STRING:
                self.fail(node, f"{name} message requires string")
            member, container = arguments[:2]
            callback = self.contains_callback(container.shape, member.shape, node)
            method = (
                "this.assertContainsUsing"
                if name == "self.assertIn"
                else "this.assertNotContainsUsing"
            )
            rendered = [member.code, container.code, callback]
            if len(arguments) == 3:
                rendered.append(arguments[2].code)
            return Expression(f"{method}({', '.join(rendered)})", VOID)
        if name == "self.assertLessEqual":
            if len(arguments) not in {2, 3}:
                self.fail(
                    node,
                    "self.assertLessEqual requires two operands and optional message",
                )
            if arguments[0].shape != NUMBER or arguments[1].shape != NUMBER:
                self.fail(
                    node,
                    "self.assertLessEqual requires proved number operands",
                )
            if len(arguments) == 3 and arguments[2].shape != STRING:
                self.fail(node, "self.assertLessEqual message requires string")
            return Expression(
                f"{function}({', '.join(argument.code for argument in arguments)})",
                VOID,
            )
        self.fail(node, f"unsupported unittest assertion {name}")

def compile_method(source_unit: SourceUnit, method: TestMethod) -> list[str]:
    """Compile one selected test method."""

    return MethodCompiler(source_unit, method).compile()
