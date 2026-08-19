#!/usr/bin/env python3
"""Tests for the deterministic frozen-test compiler."""

from __future__ import annotations

import ast
import json
import re
import sys
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(REPOSITORY_ROOT))
sys.path.insert(0, str(REPOSITORY_ROOT / "scripts"))

from python_test_compiler.gaps import (  # noqa: E402
    PARITY_GAPS,
    ast_fingerprint,
    validate_manifest,
)
from python_test_compiler.lower import (  # noqa: E402
    UnsupportedSyntax,
    compile_method,
)
from python_test_compiler.model import TestIdentity  # noqa: E402
from python_test_compiler.native import (  # noqa: E402
    NativeLoweringError,
    contains_callback,
    equality_code,
    native_set_method,
    truthy_code,
)
from python_test_compiler.registry import (  # noqa: E402
    CallContractError,
    InvocationKind,
    KeywordStyle,
    builtin_exception_constructor,
    exception_has_ordinary_message,
    kinds,
    method_call_contract,
    method_call_shape,
    named_call_contract,
    qualified_name_shape,
    validate_call_contract,
)
from python_test_compiler.selection import TRANSLATED_TESTS  # noqa: E402
from python_test_compiler.source import (  # noqa: E402
    SourceParseError,
    load_source_unit,
    parse_source_unit,
)
from python_test_compiler.suite import (  # noqa: E402
    UPSTREAM_TEST,
    compile_suite,
)
from python_test_compiler.target import (  # noqa: E402
    BIGINT,
    BOARD,
    BOOLEAN,
    GAME,
    LEGAL_MOVE_GENERATOR,
    LEGAL_MOVE_ITERATOR,
    MOVE,
    NULL,
    NUMBER,
    PIECE,
    SQUARE_SET,
    STRING,
    UNKNOWN,
    VOID,
    ShapeKind,
    array_of,
    iterable_of,
    map_of,
    set_of,
)
from transpilation_helper import py_identifier_to_ts  # noqa: E402


EXAMPLE = TestIdentity("ExampleTestCase", "test_example")


def compile_fixture(body: str) -> str:
    source = "class ExampleTestCase:\n    def test_example(self):\n" + "".join(
        f"        {line}\n" if line else "\n" for line in body.splitlines()
    )
    unit = parse_source_unit(source, (EXAMPLE,), filename="fixture.py")
    return "\n".join(compile_method(unit, unit.method(EXAMPLE)))


class IdentifierTranspilationTest(unittest.TestCase):
    def test_converts_only_parsed_identifiers(self) -> None:
        self.assertEqual(
            py_identifier_to_ts("square_manhattan_distance"),
            "squareManhattanDistance",
        )
        self.assertEqual(py_identifier_to_ts("shift_2_down"), "shift2Down")
        self.assertEqual(py_identifier_to_ts("STARTING_FEN"), "STARTING_FEN")
        self.assertEqual(py_identifier_to_ts("self"), "this")


class CompilerArchitectureTest(unittest.TestCase):
    def test_qualified_target_api_literals_are_confined_to_type_rendering(self) -> None:
        source = (
            REPOSITORY_ROOT
            / "scripts"
            / "python_test_compiler"
            / "lower.py"
        ).read_text(encoding="utf-8")
        tree = ast.parse(source)
        parents = {
            child: parent
            for parent in ast.walk(tree)
            for child in ast.iter_child_nodes(parent)
        }
        offenders: list[tuple[str, int]] = []
        for node in ast.walk(tree):
            if not (
                isinstance(node, ast.Constant)
                and isinstance(node.value, str)
                and node.value.startswith(("chess.", "pgnModule."))
            ):
                continue
            owner: ast.AST | None = node
            while owner is not None and not isinstance(owner, ast.FunctionDef):
                owner = parents.get(owner)
            owner_name = owner.name if isinstance(owner, ast.FunctionDef) else "<module>"
            if owner_name != "typescript_type":
                offenders.append((node.value, node.lineno))
        self.assertEqual(offenders, [])

    def test_test_identity_decisions_are_confined_to_selection_and_gaps(self) -> None:
        compiler_root = REPOSITORY_ROOT / "scripts" / "python_test_compiler"
        identity_literals = {
            value
            for identity in TRANSLATED_TESTS
            for value in (identity.class_name, identity.method_name)
        }
        offenders: list[tuple[str, str]] = []
        for path in compiler_root.glob("*.py"):
            if path.name in {"selection.py", "gaps.py"}:
                continue
            tree = ast.parse(path.read_text(encoding="utf-8"))
            for node in ast.walk(tree):
                if (
                    isinstance(node, ast.Constant)
                    and isinstance(node.value, str)
                    and node.value in identity_literals
                ):
                    offenders.append((path.name, node.value))
        self.assertEqual(offenders, [])

    def test_target_escape_markers_are_confined_to_contract_layers(self) -> None:
        compiler_root = REPOSITORY_ROOT / "scripts" / "python_test_compiler"
        markers = (
            "parity-gap:",
            "missing-capability:",
            "protocol-adapter:",
        )
        offenders: list[tuple[str, str]] = []
        for path in compiler_root.glob("*.py"):
            if path.name in {"native.py", "registry.py"}:
                continue
            source = path.read_text(encoding="utf-8")
            offenders.extend(
                (path.name, marker) for marker in markers if marker in source
            )
        self.assertEqual(offenders, [])

    def test_exception_family_semantics_are_confined_to_the_registry(self) -> None:
        lowerer = (
            REPOSITORY_ROOT / "scripts" / "python_test_compiler" / "lower.py"
        ).read_text(encoding="utf-8")
        for constructor in (
            "chess.ValueError",
            "chess.KeyError",
            "chess.InvalidMoveError",
            "chess.IllegalMoveError",
            "chess.AmbiguousMoveError",
        ):
            with self.subTest(constructor=constructor):
                self.assertNotIn(constructor, lowerer)


class SourceBoundaryTest(unittest.TestCase):
    def test_ast_fingerprint_is_location_independent_and_schema_complete(self) -> None:
        source = "def f(value=None):\n    return [value]\n"
        relocated = "\n\n" + source
        changed_container = "def f(value=None):\n    return (value,)\n"
        changed_default = "def f(value=False):\n    return [value]\n"

        fingerprint = ast_fingerprint(ast.parse(source).body[0])
        self.assertEqual(
            fingerprint,
            "1dc13a7f9d7e0ae6a57ba99c101ec3aa72deef1101864d9130e4310e897812b7",
        )
        self.assertEqual(
            fingerprint,
            ast_fingerprint(ast.parse(relocated).body[0]),
        )
        self.assertNotEqual(
            fingerprint,
            ast_fingerprint(ast.parse(changed_container).body[0]),
        )
        self.assertNotEqual(
            fingerprint,
            ast_fingerprint(ast.parse(changed_default).body[0]),
        )

    def test_parses_exact_selection_once_and_preserves_every_comment(self) -> None:
        unit = load_source_unit(UPSTREAM_TEST, TRANSLATED_TESTS)
        self.assertEqual(tuple(method.identity for method in unit.methods), TRANSLATED_TESTS)
        self.assertEqual(len(unit.methods), 89)
        self.assertEqual(len(unit.comments), 59)
        self.assertIn("# Letter R", {comment.text for comment in unit.comments})
        self.assertIn("# Test file exporter.", {comment.text for comment in unit.comments})

    def test_preserves_leading_and_inline_comment_placement(self) -> None:
        source = """class ExampleTestCase:\n    def test_example(self):\n        # leading exactly\n        value = 1  # inline exactly\n        self.assertEqual(value, 1)\n"""
        unit = parse_source_unit(source, (EXAMPLE,), filename="comments.py")
        method = unit.method(EXAMPLE)
        self.assertEqual([comment.text for comment in method.leading_comments], ["# leading exactly"])
        self.assertEqual([comment.text for comment in method.inline_comments], ["# inline exactly"])
        generated = "\n".join(compile_method(unit, method))
        self.assertIn("// leading exactly", generated)
        self.assertIn("const value = 1 // inline exactly", generated)

    def test_rejects_ambiguous_or_invalid_selected_methods(self) -> None:
        valid = "class ExampleTestCase:\n    def test_example(self):\n        self.assertTrue(True)\n"
        with self.assertRaisesRegex(SourceParseError, "duplicates"):
            parse_source_unit(valid, (EXAMPLE, EXAMPLE))
        with self.assertRaisesRegex(SourceParseError, "selected test is missing"):
            parse_source_unit(valid, (TestIdentity("ExampleTestCase", "test_missing"),))

        invalid_sources = (
            ("async def test_example(self):\n        pass", "must not be async"),
            ("@decorator\n    def test_example(self):\n        pass", "must not be decorated"),
            ("def test_example(self, extra):\n        pass", "exactly one argument"),
        )
        for method_source, message in invalid_sources:
            with self.subTest(message=message), self.assertRaisesRegex(SourceParseError, message):
                parse_source_unit(
                    "class ExampleTestCase:\n    " + method_source + "\n",
                    (EXAMPLE,),
                )


class RecursiveLoweringTest(unittest.TestCase):
    def test_composes_float_none_and_nullable_dereference_rules(self) -> None:
        generated = compile_fixture(
            "game = chess.pgn.Game()\n"
            "self.assertTrue(game.emt() is None)\n"
            "game.set_emt(1.234)\n"
            "self.assertEqual(game.emt(), 1.234)\n"
            "game.set_eval(chess.engine.PovScore(chess.engine.Cp(-80), chess.WHITE))\n"
            "self.assertEqual(game.eval().white().score(), -80)"
        )

        self.assertIn("game.setEmt(1.234)", generated)
        self.assertIn("game.emt(), null", generated)
        self.assertIn("if (__receiver === null)", generated)
        self.assertIn("new engineModule.PovScore(new engineModule.Cp(-(80))", generated)
        self.assertNotIn(" as ", generated)

    def test_read_game_preserves_eof_none_and_guards_only_dereferences(self) -> None:
        generated = compile_fixture(
            "stream = io.StringIO()\n"
            "self.assertTrue(chess.pgn.read_game(stream) is None)\n"
            "game = chess.pgn.read_game(stream)\n"
            'self.assertEqual(game.headers["Result"], "*")\n'
            "self.assertEqual(game[0].comments, [])"
        )

        self.assertIn("pgnModule.readGame(stream), null", generated)
        self.assertGreaterEqual(generated.count("if (__receiver === null)"), 2)
        self.assertNotIn("instanceof pgnModule.Game", generated)

    def test_composes_enumeration_score_ordering_and_finite_models(self) -> None:
        generated = compile_fixture(
            "scores = [chess.engine.Cp(0), chess.engine.Mate(1)]\n"
            "for index, score in enumerate(scores):\n"
            "    self.assertEqual(index < 1, score < chess.engine.MateGiven)\n"
            '    for model in ["sf12", "sf16", "sf16.1"]:\n'
            "        self.assertTrue(score.wdl(model=model).expectation() <= 1)"
        )

        self.assertIn("for (let [index, score] of ((__iterable) =>", generated)
        self.assertIn("function* ()", generated)
        self.assertIn(
            "yield [__index, __value] satisfies [number, typeof __value]",
            generated,
        )
        self.assertNotIn("Array.from(scores).entries()", generated)
        self.assertIn(
            "__left.lt(__right))(score, engineModule.MateGiven)", generated
        )
        self.assertIn("switch (__finiteString)", generated)
        self.assertIn("score.wdl({ model: ((__finiteString)", generated)
        self.assertIn("})(model) }).expectation()", generated)
        self.assertNotIn(" as ", generated)

    def test_enumerate_preserves_lazy_source_iteration(self) -> None:
        generated = compile_fixture(
            "values = [1, 2, 3]\n"
            "indexed = enumerate(value for value in values)\n"
            "values.pop(0)\n"
            "observed = list(indexed)"
        )

        self.assertIn("const indexed = ((__iterable) => (function* ()", generated)
        self.assertNotIn("Array.from(__iterable).entries()", generated)
        self.assertLess(
            generated.index("__sequence.splice("),
            generated.index("const observed = Array.from(indexed)"),
        )

    def test_wdl_models_narrow_only_in_registered_finite_contexts(self) -> None:
        generated = compile_fixture(
            'lowered = "sf".lower()\n'
            'self.assertEqual("sf", "sf")\n'
            'model = "sf16"\n'
            "wdl = chess.engine.Cp(0).wdl(model=model)"
        )

        self.assertIn('})("sf")', generated)
        self.assertIn('(__actual, __expected) => __actual === __expected', generated)
        self.assertIn(".wdl({ model: model })", generated)
        self.assertNotIn(" as ", generated)

        with self.assertRaisesRegex(
            UnsupportedSyntax,
            re.escape("keyword 'model' requires registered WDL model, got string"),
        ):
            compile_fixture('chess.engine.Cp(0).wdl(model="unknown")')

        ordinary_array = compile_fixture(
            'models = ["sf"]\n'
            'self.assertEqual(models, ["sf"])\n'
            'self.assertEqual(models[0].lower(), "sf")'
        )
        self.assertNotIn("engineModule.WdlModel[]", ordinary_array)
        self.assertIn('const models = ["sf"]', ordinary_array)
        self.assertIn(".toLowerCase()", ordinary_array)

        for mutable_models in (
            'models = ["sf12"]\n'
            'models[0] = "sf14"\n'
            'for model in models:\n'
            '    chess.engine.Cp(0).wdl(model=model)',
            'models = ["sf12"]\n'
            'aliases = models\n'
            'aliases[0] = "sf14"\n'
            'for model in models:\n'
            '    chess.engine.Cp(0).wdl(model=model)',
            'models = ["sf12"]\n'
            'aliases, other = (models, ["x"])\n'
            'aliases[0] = "sf14"\n'
            'for model in models:\n'
            '    chess.engine.Cp(0).wdl(model=model)',
        ):
            with self.assertRaises(UnsupportedSyntax):
                compile_fixture(mutable_models)

        for loop_mutation in (
            'models = ["sf12", "sf12"]\n'
            'for model in models:\n'
            '    models[1] = "sf14"\n'
            '    chess.engine.Cp(0).wdl(model=model)',
            'models = ["sf12", "sf12"]\n'
            'for model in models:\n'
            '    aliases = models\n'
            '    aliases[1] = "sf14"\n'
            '    chess.engine.Cp(0).wdl(model=model)',
            'models = ["sf12", "sf12"]\n'
            'for model in models:\n'
            '    aliases, other = (models, ["x"])\n'
            '    aliases[1] = "sf14"\n'
            '    chess.engine.Cp(0).wdl(model=model)',
        ):
            with self.assertRaises(UnsupportedSyntax):
                compile_fixture(loop_mutation)

    def test_registered_contracts_preserve_supported_optional_forms(self) -> None:
        generated = compile_fixture(
            "virtual_file = io.StringIO()\n"
            "exporter = chess.pgn.FileExporter(\n"
            "    virtual_file, columns=None, headers=False,\n"
            "    comments=False, variations=False)\n"
            "game = chess.pgn.Game()\n"
            'move = chess.Move.from_uci("e2e4")\n'
            "child = game.add_variation(move)\n"
            "self.assertTrue(game.has_variation(0))\n"
            "self.assertTrue(game.has_variation(child))\n"
            "self.assertEqual(game.variation(move), child)\n"
            "game.promote_to_main(0)\n"
            "game.promote(child)\n"
            "game.demote(move)\n"
            "game.remove_variation(child)\n"
            "self.assertTrue(chess.engine.Mate(1).score(mate_score=None) is None)"
        )

        self.assertIn(
            "new pgnModule.FileExporter(virtualFile, { columns: null, "
            "headers: false, comments: false, variations: false })",
            generated,
        )
        self.assertIn("game.hasVariation(0)", generated)
        self.assertIn("game.hasVariation(child)", generated)
        self.assertIn("game.variation(move)", generated)
        self.assertIn("game.promoteToMain(0)", generated)
        self.assertIn("game.promote(child)", generated)
        self.assertIn("game.demote(move)", generated)
        self.assertIn("game.removeVariation(child)", generated)
        self.assertIn("new engineModule.Mate(1).score({ mateScore: null })", generated)

    def test_string_ordering_compares_unicode_code_points(self) -> None:
        generated = compile_fixture('self.assertFalse("𐀀" < "\\ue000")')

        self.assertIn("Array.from(__left)", generated)
        self.assertIn(".codePointAt(0)", generated)
        self.assertNotIn("=> __left < __right", generated)

    def test_composes_mixed_arrow_inputs_without_erasing_the_union(self) -> None:
        generated = compile_fixture(
            "game = chess.pgn.Game()\n"
            "game.set_arrows([(chess.A1, chess.A1), "
            'chess.svg.Arrow(chess.A1, chess.H1, color="red")])'
        )

        self.assertIn("game.setArrows(([[chess.A1, chess.A1]", generated)
        self.assertIn(
            'new svgModule.Arrow(chess.A1, chess.H1, { color: "red" })',
            generated,
        )
        self.assertNotIn(" as ", generated)

        homogeneous_arrows = compile_fixture(
            "game = chess.pgn.Game()\n"
            'game.set_arrows([chess.svg.Arrow(chess.A1, chess.H1)])\n'
            "game.set_arrows([(chess.A1, chess.H1)])"
        )
        self.assertIn("game.setArrows([new svgModule.Arrow", homogeneous_arrows)
        self.assertIn("game.setArrows([[chess.A1, chess.H1]])", homogeneous_arrows)

        bound_mixed = compile_fixture(
            "game = chess.pgn.Game()\n"
            "arrows = [(chess.A1, chess.A1), "
            'chess.svg.Arrow(chess.A1, chess.H1, color="red")]\n'
            "game.set_arrows(arrows)"
        )
        self.assertIn(
            "satisfies (svgModule.Arrow | [number, number])[]",
            bound_mixed,
        )
        self.assertIn("game.setArrows(arrows)", bound_mixed)

    def test_exporter_reassignment_has_one_explicit_target_union(self) -> None:
        generated = compile_fixture(
            "game = chess.pgn.Game()\n"
            "exporter = chess.pgn.StringExporter()\n"
            "self.assertEqual(str(exporter), \"\")\n"
            "virtual_file = io.StringIO()\n"
            "exporter = chess.pgn.FileExporter(virtual_file)\n"
            "file_representation = str(exporter)\n"
            "game.accept(exporter)"
        )

        self.assertIn(
            "let exporter: pgnModule.StringExporter | pgnModule.FileExporter",
            generated,
        )
        self.assertIn("exporter.toString()", generated)
        self.assertIn("exporter = new pgnModule.FileExporter(virtualFile)", generated)
        self.assertIn(
            "const fileRepresentation = exporter.toString()",
            generated,
        )
        self.assertNotIn(" as ", generated)

    def test_repr_assertions_compare_target_strings_and_oracle_source_values(self) -> None:
        generated = compile_fixture(
            "left = chess.Piece(chess.BISHOP, chess.WHITE)\n"
            "right = chess.Piece(chess.BISHOP, chess.WHITE)\n"
            "self.assertEqual(repr(left), repr(right))"
        )

        self.assertIn(
            "({ representation: __representedValue.toRepr(), "
            "value: __representedValue })",
            generated,
        )
        self.assertIn("this.assertEqualRepresentationsUsing(", generated)

        side_effect = compile_fixture(
            'board = chess.Board("8/8/8/8/8/8/8/K6k b - - 0 1")\n'
            'board.push(chess.Move.from_uci("h1h2"))\n'
            'self.assertEqual(repr(board.pop()), '
            'repr(chess.Move.from_uci("h1h2")))'
        )
        self.assertEqual(side_effect.count("board.pop()"), 1)

        bound = compile_fixture(
            "piece = chess.Piece(chess.BISHOP, chess.WHITE)\n"
            "left = repr(piece)\n"
            "right = repr(piece)\n"
            "self.assertEqual(left, right)"
        )
        self.assertIn("const __leftRepresentation =", bound)
        self.assertIn(
            "const left = __leftRepresentation.representation", bound
        )
        self.assertIn("__actualRepresentation.value", bound)
        self.assertIn(")(__leftRepresentation, __rightRepresentation)", bound)

        with self.assertRaisesRegex(
            UnsupportedSyntax,
            r"bound repr\(\) value must have exactly one assignment",
        ):
            compile_fixture(
                "piece = chess.Piece(chess.BISHOP, chess.WHITE)\n"
                "left = repr(piece)\n"
                "left = repr(piece)"
            )

        materialized = compile_fixture(
            "piece = chess.Piece(chess.BISHOP, chess.WHITE)\n"
            "self.assertEqual(str(repr(piece)), str(repr(piece)))"
        )
        self.assertIn("this.assertEqualUsing(", materialized)
        self.assertNotIn("assertEqualRepresentationsUsing", materialized)

        with self.assertRaisesRegex(
            UnsupportedSyntax,
            r"literals containing repr\(\) values",
        ):
            compile_fixture(
                "piece = chess.Piece(chess.BISHOP, chess.WHITE)\n"
                "self.assertEqual([repr(piece)], [repr(piece)])"
            )

        with self.assertRaisesRegex(
            UnsupportedSyntax,
            r"containment assertions with repr\(\) members",
        ):
            compile_fixture(
                "piece = chess.Piece(chess.BISHOP, chess.WHITE)\n"
                'self.assertIn(repr(piece), "x" + repr(piece))'
            )

    def test_composes_assignments_loops_calls_and_operators(self) -> None:
        generated = compile_fixture(
            """values = [chess.BB_A1, chess.BB_A2]
for value in values:
    shifted = chess.shift_up(value)
    self.assertEqual(chess.popcount(shifted & chess.BB_ALL), 1)"""
        )
        self.assertIn("const values = [chess.BB_A1, chess.BB_A2]", generated)
        self.assertIn("for (let value of values)", generated)
        self.assertIn("chess.popcount((shifted & chess.BB_ALL))", generated)
        self.assertIn(
            "(__actual, __expected) => __actual === __expected",
            generated,
        )

    def test_composes_value_sets_comprehensions_and_comparisons(self) -> None:
        generated = compile_fixture(
            """pieces = {chess.Piece.from_symbol(symbol) for symbol in \"PN\"}
self.assertEqual(len(pieces), 2)
self.assertFalse(chess.Piece.from_symbol(\"P\") != chess.Piece.from_symbol(\"P\"))"""
        )
        self.assertIn(
            'Array.from("PN", __symbolItem => '
            'chess.Piece.fromSymbol(__symbolItem))',
            generated,
        )
        self.assertIn("!__values.slice(0, __index).some(__candidate =>", generated)
        self.assertNotIn(".findIndex(", generated)
        self.assertIn("__piece.hash() !== __other.hash()", generated)
        self.assertIn("(__left).equals(__right)", generated)
        self.assertIn("this.assertEqualUsing(pieces.length, 2", generated)

    def test_preserves_bound_assert_raises_as_a_composed_block(self) -> None:
        generated = compile_fixture(
            """with self.assertRaises(chess.IllegalMoveError) as err:
    chess.Board().parse_san(\"invalid\")
message = str(err.exception)
self.assertIn(\"invalid\", message)"""
        )
        self.assertIn("const err = this.captureRaises(chess.IllegalMoveError", generated)
        self.assertIn("const message = err.message", generated)
        self.assertIn(
            "this.assertContainsUsing(\"invalid\", message, "
            "(__container, __member) => __container.includes(__member))",
            generated,
        )

    def test_maps_builtin_python_errors_to_exact_target_constructors(self) -> None:
        generated = compile_fixture(
            """with self.assertRaises(ValueError) as err:
    chess.parse_square("z9")
self.assertIn("invalid", str(err.exception))"""
        )
        self.assertIn(
            "const err = this.captureRaises(chess.ValueError, () => {",
            generated,
        )
        self.assertNotIn("assertRaisesPython", generated)

        for target_only_name in ("chess.ValueError", "chess.KeyError"):
            with self.subTest(target_only_name=target_only_name), self.assertRaisesRegex(
                UnsupportedSyntax,
                re.escape(
                    "assertRaises requires a registered exception constructor, got "
                    + target_only_name
                ),
            ):
                compile_fixture(
                    f"with self.assertRaises({target_only_name}):\n    pass"
                )

    def test_lower_is_native_only_with_an_ascii_semantic_proof(self) -> None:
        generated = compile_fixture(
            "with self.assertRaises(ValueError) as err:\n"
            '    chess.parse_square("z9")\n'
            "message = str(err.exception)\n"
            "lowered = message.lower()"
        )
        self.assertIn(r"if (!/^[\x00-\x7F]*$/.test(__lowerValue))", generated)
        self.assertIn("return __lowerValue.toLowerCase()", generated)

        with self.assertRaisesRegex(
            UnsupportedSyntax,
            re.escape(
                "lower() supports only ASCII strings because Python and "
                "TypeScript Unicode case mappings are not version-stable"
            ),
        ):
            compile_fixture('lowered = "\ua7ce".lower()')

    def test_lowers_atomic_python_operations_to_native_target_forms(self) -> None:
        cases = (
            (
                """values = [1, 2]
self.assertEqual(len(values), 2)""",
                "this.assertEqualUsing(values.length, 2",
            ),
            (
                """squares = chess.SquareSet(chess.BB_A1 | chess.BB_H8)
self.assertEqual(list(squares), [chess.A1, chess.H8])
self.assertTrue(squares)""",
                "Array.from(squares.iter())",
            ),
            (
                """value = textwrap.dedent("  first\\n  second")
self.assertEqual(value, "first\\nsecond")""",
                'const value = "first\\nsecond"',
            ),
            (
                """move = chess.Move.from_uci("e2e4")
self.assertEqual(copy.copy(move), move)""",
                "this.assertEqualUsing(move.copy(), move, "
                "(__actual, __expected) => __actual.equals(__expected))",
            ),
        )
        for body, expected in cases:
            with self.subTest(expected=expected):
                self.assertIn(expected, compile_fixture(body))

    def test_unknown_semantics_fail_closed_instead_of_using_js_coercion(self) -> None:
        cases = (
            ("self.assertTrue(mystery)", "truthiness is not defined for unknown"),
            (
                "self.assertEqual(left, right)",
                "equality is not defined for unknown and unknown",
            ),
            ("self.assertEqual(len(mystery), 0)", "len() does not support unknown"),
            ("self.assertEqual(str(True), 'True')", "str() does not support boolean"),
            ("self.assertEqual(repr('x'), \"'x'\")", "repr() does not support string"),
            (
                "self.assertEqual(hex(1), '0x1')",
                "hex() lowering requires a nonnegative SquareSet",
            ),
            (
                "limit = 2\nself.assertEqual(list(range(limit)), [0, 1])",
                "range() requires one nonnegative safe-integer literal",
            ),
            ("mystery.lower()", "lower() requires a proved string receiver"),
        )
        for body, message in cases:
            with self.subTest(message=message), self.assertRaisesRegex(
                UnsupportedSyntax, re.escape(message)
            ):
                compile_fixture(body)

    def test_call_contracts_reject_unknown_inputs_before_emitting_results(self) -> None:
        cases = (
            (
                "self.assertEqual(chess.popcount(mystery), 0)",
                "argument 1 requires bigint, got unknown",
            ),
            (
                "chess.Board().is_check(mystery)",
                "expected 0 positional arguments, got 1",
            ),
            (
                "chess.Move.from_uci(mystery)",
                "argument 1 requires string, got unknown",
            ),
            (
                "chess.SquareSet(mystery)",
                "argument 1 requires bigint, proved integer, SquareSet, "
                "or array of squares, got unknown",
            ),
            (
                "self.assertEqual(chess.BB_A1, mystery)",
                "equality is not defined for bigint and unknown",
            ),
            (
                "self.assertEqual(str(mystery.exception), 'x')",
                ".exception requires a bound assertRaises context",
            ),
        )
        for body, message in cases:
            with self.subTest(body=body), self.assertRaisesRegex(
                UnsupportedSyntax, re.escape(message)
            ):
                compile_fixture(body)

    def test_fixed_target_contracts_need_no_gap_authority(self) -> None:
        cases = (
            (
                "chess.SquareSet(chess.SquareSet(1))",
                "new chess.SquareSet(new chess.SquareSet(BigInt(1)))",
            ),
            (
                "left = chess.SquareSet(1)\n"
                "right = chess.SquareSet(2)\n"
                "left.union(right)",
                "left.union(right)",
            ),
            (
                "virtual_file = io.StringIO()\n"
                "chess.pgn.FileExporter(virtual_file)",
                "new pgnModule.FileExporter(virtualFile)",
            ),
        )
        for body, expected in cases:
            with self.subTest(body=body):
                generated = compile_fixture(body)
                self.assertIn(expected, generated)
                self.assertNotIn("parity-gap:", generated)
                self.assertNotIn("missing-capability:", generated)

    def test_keyed_mapping_result_contracts_require_literal_keys(self) -> None:
        prefix = (
            'epd = "8/8/8/8/8/8/8/8 w - - ce 55;"\n'
            "board, operations = chess.Board.from_epd(epd)\n"
        )
        generated = compile_fixture(
            prefix + 'self.assertEqual(operations["ce"], 55)'
        )
        self.assertIn('operations, "ce"', generated)

        rejected = (
            (
                'value = operations["id"] + 1',
                "keyed mapping has no result contract for 'id'",
            ),
            (
                'opcode = "ce"\nvalue = operations[opcode]',
                "keyed mapping subscription requires a literal string key",
            ),
        )
        for body, message in rejected:
            with self.subTest(body=body), self.assertRaisesRegex(
                UnsupportedSyntax, re.escape(message)
            ):
                compile_fixture(prefix + body)

    def test_attribute_contracts_are_receiver_exact(self) -> None:
        rejected = (
            (
                "self.assertTrue(chess.BaseBoard().turn)",
                "truthiness is not defined for unknown",
            ),
            (
                "game = chess.pgn.Game()\n"
                'child = game.add_variation(chess.Move.from_uci("e2e4"))\n'
                'self.assertEqual(child.headers["Result"], "*")',
                "subscription does not support unknown",
            ),
            (
                "with self.assertRaises(ValueError) as err:\n"
                '    chess.parse_square("z9")\n'
                'self.assertEqual(err.exception.message, "x")',
                "captured exceptions expose no Python source attributes",
            ),
        )
        for body, message in rejected:
            with self.subTest(body=body), self.assertRaisesRegex(
                UnsupportedSyntax, re.escape(message)
            ):
                compile_fixture(body)

        generated = compile_fixture(
            "self.assertTrue(chess.Board().turn)\n"
            "game = chess.pgn.Game()\n"
            'self.assertEqual(game.headers["Result"], "*")'
        )
        self.assertIn("new chess.Board().turn", generated)
        self.assertIn("game.headers", generated)

    def test_nullable_parent_access_requires_an_exact_sequence_flow_proof(self) -> None:
        prefix = (
            "game = chess.pgn.Game()\n"
            'first = chess.Move.from_uci("g1f3")\n'
            'second = chess.Move.from_uci("d7d5")\n'
        )
        generated = compile_fixture(
            prefix
            + "moves = [first, second]\n"
            + "tail = game.add_line(moves)\n"
            + "self.assertEqual(tail.parent.move, first)"
        )
        self.assertGreaterEqual(
            generated.count("instanceof pgnModule.ChildNode"), 2
        )
        self.assertNotIn("cannot access an attribute on null", generated)

        composed = compile_fixture(
            prefix
            + "moves = [move for move in [first, second]]\n"
            + "tail = game.add_line(moves)\n"
            + "self.assertEqual(tail.parent.move, first)"
        )
        self.assertGreaterEqual(
            composed.count("instanceof pgnModule.ChildNode"), 2
        )

        three_deep = compile_fixture(
            prefix
            + 'third = chess.Move.from_uci("e2e4")\n'
            + "tail = game.add_line([first, second, third])\n"
            + "self.assertEqual(tail.parent.parent.move, first)"
        )
        self.assertGreaterEqual(
            three_deep.count("instanceof pgnModule.ChildNode"), 3
        )

        dynamically_checked = (
            (
                "moves = [first, second]\n"
                "moves.pop(0)\n"
                "tail = game.add_line(moves)\n"
                "self.assertEqual(tail.parent.move, first)",
                "mutated literal",
            ),
            (
                "moves = [first, second]\n"
                "for index in [0]:\n"
                "    moves.pop(index)\n"
                "tail = game.add_line(moves)\n"
                "self.assertEqual(tail.parent.move, first)",
                "loop-mutated literal",
            ),
            (
                "tail = game.add_line([])\n"
                "self.assertEqual(tail.parent.move, first)",
                "empty literal",
            ),
            (
                "moves = list(reversed([first, second]))\n"
                "tail = game.add_line(moves)\n"
                "self.assertEqual(tail.parent.move, first)",
                "unknown length",
            ),
        )
        for body, label in dynamically_checked:
            with self.subTest(label=label):
                generated = compile_fixture(prefix + body)
                self.assertIn("if (__receiver === null)", generated)
                self.assertIn("cannot access an attribute of null", generated)

    def test_target_only_helper_methods_are_not_python_source_api(self) -> None:
        adversarial_source_calls = (
            (
                'piece = chess.Piece.from_symbol("P")',
                ("piece.hash()",),
            ),
            (
                "squares = chess.SquareSet(chess.BB_A1)",
                (
                    "squares.bool()",
                    "squares.length()",
                    "squares.popcount()",
                    "squares.int()",
                    "squares.iter()",
                    "squares.reversed()",
                    "squares.invert()",
                    "squares.equals(squares)",
                    "squares.xor(chess.BB_A1)",
                    "squares.ior(chess.BB_A1)",
                    "squares.iand(chess.BB_A1)",
                    "squares.ixor(chess.BB_A1)",
                    "squares.lshift(chess.BB_A1)",
                    "squares.rshift(chess.BB_A1)",
                    "squares.ilshift(chess.BB_A1)",
                    "squares.irshift(chess.BB_A1)",
                ),
            ),
            (
                "moves = chess.Board().legal_moves\n"
                'move = chess.Move.from_uci("e2e4")',
                ("moves.bool()", "moves.contains(move)"),
            ),
        )
        for setup, source_calls in adversarial_source_calls:
            for source_call in source_calls:
                with self.subTest(source_call=source_call), self.assertRaisesRegex(
                    UnsupportedSyntax,
                    re.escape(
                        "no finite call contract for "
                        + source_call.split("(", 1)[0]
                    ),
                ):
                    compile_fixture(f"{setup}\n{source_call}")

        generated = compile_fixture(
            'piece = chess.Piece.from_symbol("P")\n'
            "piece_hash = hash(piece)\n"
            "squares = chess.SquareSet(chess.BB_A1)\n"
            "self.assertTrue(squares)\n"
            "size = len(squares)\n"
            "value = int(squares)\n"
            "items = list(squares)\n"
            "backwards = list(reversed(squares))\n"
            "self.assertEqual(squares, squares)\n"
            "union = squares | chess.BB_A1\n"
            "board = chess.Board()\n"
            'move = chess.Move.from_uci("e2e4")\n'
            "self.assertTrue(board.legal_moves)\n"
            "self.assertIn(move, board.legal_moves)"
        )
        for target_helper in (
            ".hash()",
            ".bool()",
            ".length()",
            ".int()",
            ".iter()",
            ".reversed()",
            ".equals(",
            ".or(",
            ".contains(",
        ):
            with self.subTest(target_helper=target_helper):
                self.assertIn(target_helper, generated)

    def test_unresolved_target_members_cannot_escape_into_storage(self) -> None:
        rejected = (
            (
                'piece = chess.Piece.from_symbol("P")\npiece.hash',
                "bare expression statements require a call",
            ),
            (
                "board = chess.Board()\nalias = board.castlingRights",
                "assignment requires a fully resolved target shape, got unknown",
            ),
            (
                'piece = chess.Piece.from_symbol("P")\nvalues = [piece.hash]',
                "assignment requires a fully resolved target shape, got array",
            ),
            (
                'piece = chess.Piece.from_symbol("P")\n'
                'values = {"piece": piece.hash}',
                "assignment requires a fully resolved target shape, got map",
            ),
            (
                'piece = chess.Piece.from_symbol("P")\nvalues = (1, piece.hash)',
                "assignment requires a fully resolved target shape, got tuple",
            ),
            (
                "values = []",
                "assignment requires a fully resolved target shape, got array",
            ),
        )
        for body, message in rejected:
            with self.subTest(body=body), self.assertRaisesRegex(
                UnsupportedSyntax, re.escape(message)
            ):
                compile_fixture(body)

        generated = compile_fixture("chess.BaseBoard.empty().set_piece_map({})")
        self.assertIn("setPieceMap(new Map())", generated)

    def test_assert_raises_callback_facts_do_not_escape_its_scope(self) -> None:
        generated = compile_fixture(
            """with self.assertRaises(ValueError):
    shadow = chess.parse_square("z9")
shadow = "outside"
self.assertEqual(shadow, "outside")"""
        )
        self.assertIn("this.assertRaises(chess.ValueError, () => {", generated)
        self.assertIn('  let shadow = chess.parseSquare("z9")', generated)
        self.assertIn('let shadow = "outside"', generated)

        for tail in (
            "self.assertEqual(callback_only, 1)",
            "callback_only = callback_only",
        ):
            with self.subTest(tail=tail), self.assertRaisesRegex(
                UnsupportedSyntax,
                re.escape(
                    "name 'callback_only' is unavailable outside the "
                    "assertRaises callback that bound it"
                ),
            ):
                compile_fixture(
                    "with self.assertRaises(ValueError):\n"
                    "    callback_only = 1\n"
                    '    chess.parse_square("z9")\n'
                    + tail
                )

        generated = compile_fixture(
            "with self.assertRaises(ValueError):\n"
            "    callback_only = 1\n"
            '    chess.parse_square("z9")\n'
            'callback_only = "outside"\n'
            'self.assertEqual(callback_only, "outside")'
        )
        self.assertIn('let callbackOnly = "outside"', generated)
        self.assertIn("this.assertEqualUsing(callbackOnly", generated)

    def test_compiles_board_set_epd_with_its_exact_error_contract(self) -> None:
        generated = compile_fixture(
            "board = chess.Board()\n"
            "with self.assertRaises(ValueError):\n"
            "    board.set_epd(board.fen())"
        )

        self.assertIn("this.assertRaises(chess.ValueError, () => {", generated)
        self.assertIn("board.setEpd(board.fen())", generated)

    def test_compiles_pinned_utf8_fixture_contexts(self) -> None:
        generated = compile_fixture(
            'encoding = "utf-8"\n'
            'with open("data/pgn/utf8-bom.pgn", encoding=encoding) as pgn:\n'
            "    game = chess.pgn.read_game(pgn)"
        )

        self.assertIn(
            'const pgn = openTextFixture("data/pgn/utf8-bom.pgn", encoding)',
            generated,
        )
        self.assertIn("pgnModule.readGame(pgn)", generated)

        with self.assertRaisesRegex(
            UnsupportedSyntax,
            "fixture open\\(\\) requires a proved utf-8 encoding",
        ):
            compile_fixture(
                'with open("data/pgn/utf8-bom.pgn", encoding="ascii") as pgn:\n'
                "    chess.pgn.read_game(pgn)"
            )

    def test_shape_changing_reassignment_updates_following_contracts(self) -> None:
        with self.assertRaisesRegex(
            UnsupportedSyntax,
            re.escape(".exception requires a bound assertRaises context, got string"),
        ):
            compile_fixture(
                """with self.assertRaises(ValueError) as err:
    chess.parse_square("z9")
err = "replaced"
self.assertEqual(str(err.exception), "replaced")"""
            )

        generated = compile_fixture(
            """with self.assertRaises(ValueError) as err:
    chess.parse_square("z9")
err = "replaced"
self.assertEqual(err, "replaced")"""
        )
        self.assertIn('let __errRebound = "replaced"', generated)

    def test_shape_changing_rebinds_use_scope_and_capture_rules(self) -> None:
        rejected = (
            (
                "value = chess.BB_A1\n"
                "items = (value for _ in [1])\n"
                "value = chess.SquareSet(value)",
                "shape-changing assignment to 'value' would change a value "
                "captured by an earlier lazy generator",
            ),
            (
                "value = chess.BB_A1\n"
                "with self.assertRaises(ValueError):\n"
                "    value = chess.SquareSet(value)",
                "shape-changing assignment crosses a generated lexical boundary "
                "and cannot preserve Python binding semantics",
            ),
        )
        for body, message in rejected:
            with self.subTest(message=message), self.assertRaisesRegex(
                UnsupportedSyntax, re.escape(message)
            ):
                compile_fixture(body)

        generated = compile_fixture(
            "value = chess.BB_A1\n"
            "value = chess.SquareSet(value)\n"
            "value = value.copy()\n"
            "other = chess.BB_A2\n"
            "for item in [chess.BB_A1]:\n"
            "    self.assertEqual(item, chess.BB_A1)\n"
            "    item = chess.SquareSet(other).copy()\n"
            "    self.assertEqual(item, other)"
        )
        self.assertIn("let __valueRebound = new chess.SquareSet(value)", generated)
        self.assertIn("__valueRebound = __valueRebound.copy()", generated)
        self.assertIn(
            "let __itemRebound = new chess.SquareSet(other).copy()",
            generated,
        )
        self.assertIn("__valueRebound", generated)

    def test_function_and_loop_shapes_compose_without_method_preclassification(self) -> None:
        generated = compile_fixture(
            """examples = [chess.BB_A1, chess.BB_H8]
for value in examples:
    value = chess.SquareSet(value)
    for flip in [chess.flip_vertical, chess.flip_horizontal]:
        self.assertEqual(flip(value), flip(int(value)))"""
        )
        self.assertIn(
            "for (let value of examples) {\n"
            "      let __valueRebound = new chess.SquareSet(value)",
            generated,
        )
        self.assertIn("for (let flip of [chess.flipVertical, chess.flipHorizontal])", generated)
        self.assertIn("flip(__valueRebound.int())", generated)
        self.assertNotIn("as Array<bigint | chess.SquareSet>", generated)

    def test_rebound_loop_temp_is_deterministically_collision_free(self) -> None:
        generated = compile_fixture(
            """__value_rebound = 7
examples = [chess.BB_A1, chess.BB_H8]
for value in examples:
    value = chess.SquareSet(value)
self.assertEqual(__value_rebound, 7)"""
        )
        self.assertIn("const __valueRebound = 7", generated)
        self.assertIn("for (let value of examples) {", generated)
        self.assertIn("let __valueRebound2 = new chess.SquareSet(value)", generated)

    def test_empty_map_literal_is_contextualized_by_the_method_contract(self) -> None:
        generated = compile_fixture(
            """board = chess.BaseBoard()
board.set_piece_map({})"""
        )
        self.assertIn("const board = new chess.BaseBoard()", generated)
        self.assertIn("board.setPieceMap(new Map())", generated)

    def test_local_literal_fields_have_one_inference_and_declaration_rule(self) -> None:
        generated = compile_fixture(
            """class Example:
    def __init__(self):
        self.enabled = True
        self.name = "sample"
        self.count = 1
example = Example()
self.assertTrue(example.enabled)
self.assertEqual(example.name, "sample")
self.assertEqual(example.count, 1)"""
        )
        self.assertIn("declare enabled: boolean", generated)
        self.assertIn("declare name: string", generated)
        self.assertIn("declare count: number", generated)
        self.assertNotIn("!:", generated)
        self.assertIn("__receiver.enabled = __newValue", generated)
        self.assertIn("__receiver.name = __newValue", generated)
        self.assertIn("__receiver.count = __newValue", generated)

    def test_rejects_a_statement_without_an_owned_rule(self) -> None:
        with self.assertRaisesRegex(UnsupportedSyntax, "unsupported statement If"):
            compile_fixture(
                """if condition:
    self.assertTrue(condition)"""
            )

    def test_collection_operations_require_exact_proved_shapes(self) -> None:
        rejected = (
            (
                "s = chess.SquareSet(chess.BB_A1)\nresult = s & mystery",
                "SquareSet bit operations require a proved bigint operand, got unknown",
            ),
            (
                's = chess.SquareSet(chess.BB_A1)\nresult = s | "x"',
                "SquareSet bit operations require a proved bigint operand, got string",
            ),
            (
                "s = chess.SquareSet(chess.BB_A1)\ns |= mystery",
                "SquareSet in-place bit operations require a proved bigint operand, "
                "got unknown",
            ),
            (
                'values = [1]\nresult = values["0"]',
                "array index requires number, got string",
            ),
            (
                'values = {1: "x"}\nresult = values[mystery]',
                "map key shape mismatch: expected number, got unknown",
            ),
            (
                'values = {1: "x"}\nresult = values["1"]',
                "map key shape mismatch: expected number, got string",
            ),
            (
                'values = [1]\nvalues[0] = "x"',
                "array value shape mismatch: expected number, got string",
            ),
            (
                'values = {1: "x"}\nvalues["1"] = "x"',
                "map key shape mismatch: expected number, got string",
            ),
            (
                'values = {1: "x"}\nvalues[1] = 2',
                "map value shape mismatch: expected string, got number",
            ),
            (
                'piece = chess.Piece.from_symbol("P")\nvalues = {piece: "x"}',
                "dictionary keys require a proved non-null primitive "
                "value-semantic shape, got piece",
            ),
            (
                'values = {[1]: "x"}',
                "dictionary keys require a proved non-null primitive "
                "value-semantic shape, got array",
            ),
            (
                "board = chess.Board()\n"
                'values = {board.piece_type_at(chess.E4): "x"}',
                "dictionary keys require a proved non-null primitive "
                "value-semantic shape, got nullable number",
            ),
        )
        for body, message in rejected:
            with self.subTest(body=body), self.assertRaisesRegex(
                UnsupportedSyntax, re.escape(message)
            ):
                compile_fixture(body)

        generated = compile_fixture(
            'values = {1: "x"}\nresult = values[1]'
        )
        self.assertIn("const __mappedValue = __mapping.get(__key)", generated)
        self.assertIn("throw new chess.KeyError(String(__key))", generated)
        self.assertNotIn(".get(__key)!", generated)

    def test_native_set_order_never_becomes_python_iteration_order(self) -> None:
        with self.assertRaisesRegex(
            UnsupportedSyntax,
            re.escape("cannot iterate set"),
        ):
            compile_fixture(
                'values = set(["b", "a"])\nordered = list(values)'
            )

    def test_exception_and_lexical_scope_boundaries_fail_closed(self) -> None:
        rejected = (
            (
                "with self.assertRaises(MysteryError):\n    pass",
                "assertRaises requires a registered exception constructor, got "
                "MysteryError",
            ),
            (
                "with self.assertRaises(chess.MysteryError):\n    pass",
                "assertRaises requires a registered exception constructor, got "
                "chess.MysteryError",
            ),
            (
                "ValueError = chess.IllegalMoveError\n"
                "with self.assertRaises(ValueError):\n    pass",
                "source bindings shadow compiler-owned names: ValueError",
            ),
            (
                "value = 1\nfor value in [1]:\n    self.assertEqual(value, 1)",
                "loop target rebinding of an outer Python local is unsupported",
            ),
            (
                "for value in [1]:\n    inner = value\nself.assertEqual(inner, 1)",
                "loop-local 'inner' is read after its TypeScript block",
            ),
            (
                "for value in [1]:\n"
                "    self.assertEqual(value, 1)\n"
                "for value in [value]:\n"
                "    self.assertEqual(value, 1)",
                "loop-local 'value' is read after its TypeScript block",
            ),
            (
                'err = "old"\nwith self.assertRaises(ValueError) as err:\n'
                '    chess.parse_square("z9")',
                "assertRaises binding cannot replace an existing local",
            ),
            (
                "with self.assertRaises(ValueError) as err:\n"
                "    err = 1\n"
                '    chess.parse_square("z9")\n'
                "message = str(err.exception)",
                "assertRaises binding 'err' cannot be read or rebound inside "
                "its body",
            ),
            (
                "value = 1\nvalue, other = (1, 2)",
                "tuple destructuring rebinding is unsupported",
            ),
        )
        for body, message in rejected:
            with self.subTest(body=body), self.assertRaisesRegex(
                UnsupportedSyntax, re.escape(message)
            ):
                compile_fixture(body)

        generated = compile_fixture(
            "for value in [1]:\n"
            "    self.assertEqual(value, 1)\n"
            'value = "outside"'
        )
        self.assertIn('let value = "outside"', generated)

        generated = compile_fixture(
            "for value in [1]:\n"
            "    self.assertEqual(value, 1)\n"
            "for value in [2]:\n"
            "    self.assertEqual(value, 2)"
        )
        self.assertEqual(generated.count("for (let value of"), 2)

    def test_captured_exception_stringification_preserves_family_semantics(self) -> None:
        rejected_context_uses = (
            (
                "message = str(err)",
                "str() does not support assert-raises-context",
            ),
            (
                "message = str(err.exception.exception)",
                ".exception requires a bound assertRaises context, got error",
            ),
            (
                "caught = err.exception\nmessage = str(caught.exception)",
                ".exception requires a bound assertRaises context, got error",
            ),
        )
        for tail, message in rejected_context_uses:
            with self.subTest(tail=tail), self.assertRaisesRegex(
                UnsupportedSyntax, re.escape(message)
            ):
                compile_fixture(
                    "with self.assertRaises(ValueError) as err:\n"
                    '    chess.parse_square("z9")\n'
                    + tail
                )

        with self.assertRaisesRegex(
            UnsupportedSyntax,
            re.escape(
                "str() requires a captured exception family with ordinary "
                "message semantics, got chess.KeyError"
            ),
        ):
            compile_fixture(
                "with self.assertRaises(KeyError) as err:\n"
                "    chess.SquareSet(chess.BB_EMPTY).remove(chess.A1)\n"
                "message = str(err.exception)"
            )

        generated = compile_fixture(
            "with self.assertRaises(chess.IllegalMoveError) as err:\n"
            '    chess.Board().parse_san("invalid")\n'
            "message = str(err.exception)"
        )
        self.assertIn("const message = err.message", generated)

    def test_source_and_local_class_names_are_hygienic(self) -> None:
        rejected = (
            (
                "foo_bar = 1\nfooBar = 2",
                "source bindings collide after TypeScript normalization",
            ),
            ("pgn_module = 1", "maps to reserved target name 'pgnModule'"),
            ("chess = 1", "source bindings shadow compiler-owned names: chess"),
            ("len = 1", "source bindings shadow compiler-owned names: len"),
            ("interface = 1", "maps to reserved target name 'interface'"),
            ("arguments = 1", "maps to reserved target name 'arguments'"),
            ("eval = 1", "maps to reserved target name 'eval'"),
            (
                "class Example:\n    def __init__(self):\n        pass\nExample = 1",
                "local class name 'Example' cannot be rebound",
            ),
            (
                "class Example:\n"
                "    def __init__(self):\n"
                "        self.foo_bar = 1\n"
                "        self.fooBar = 2",
                "local-class fields collide after TypeScript normalization",
            ),
            (
                "class Example:\n"
                "    def __init__(self):\n"
                "        pass\n"
                "    def constructor(self):\n"
                "        pass",
                "local-class constructor target is ambiguous",
            ),
            (
                "class Duplicate:\n"
                "    def __init__(self):\n"
                "        pass\n"
                "class Duplicate:\n"
                "    def __init__(self):\n"
                "        pass",
                "duplicate local class declarations in one function scope: "
                "Duplicate",
            ),
            (
                "class Example:\n"
                "    def run(self):\n"
                "        pass\n"
                "    def run(self):\n"
                "        pass",
                "duplicate local-class method declarations: run",
            ),
            (
                "class Example:\n"
                "    def __init__(self):\n"
                "        pass\n"
                "    def __init__(self):\n"
                "        pass",
                "duplicate local-class method declarations: __init__",
            ),
            (
                "class Helper:\n"
                "    def action(self, *, required):\n"
                "        return\n"
                "Helper().action()",
                "local methods require exactly positional self with no defaults, "
                "positional-only, keyword-only, or variadic parameters",
            ),
            (
                "class Helper:\n"
                "    def __init__(self, *, required):\n"
                "        return\n"
                "Helper()",
                "local methods require exactly positional self with no defaults, "
                "positional-only, keyword-only, or variadic parameters",
            ),
        )
        for body, message in rejected:
            with self.subTest(body=body), self.assertRaisesRegex(
                UnsupportedSyntax, re.escape(message)
            ):
                compile_fixture(body)

        generated = compile_fixture(
            "outer = 1\n"
            "class Example:\n"
            "    def first(self):\n"
            "        value = 1\n"
            "    def second(self):\n"
            "        value = 2\n"
            "self.assertEqual(outer, 1)"
        )
        self.assertEqual(generated.count("let value ="), 2)

    def test_compiler_created_binders_never_capture_source_names(self) -> None:
        cases = (
            (
                "__value0 = 1\n__index0 = 1\nself.assertEqual([1], [1])",
                ("(__value02, __index02)",),
            ),
            (
                "__item = 1\nself.assertTrue(any(value for value in [1]))",
                ("for (const __item2 of",),
            ),
            (
                "__set_value = 1\nleft = set([1])\nright = set([1])\n"
                "self.assertEqual(left, right)",
                ("every(__setValue2 =>",),
            ),
            (
                '__actual = 1\nleft = chess.Piece.from_symbol("P")\n'
                'right = chess.Piece.from_symbol("P")\nself.assertEqual(left, right)',
                ("(__actual2, __expected) => (__actual2).equals",),
            ),
            (
                "__index = 1\nvalues = range(2)",
                ("for (let __index2 = 0",),
            ),
        )
        for body, expected in cases:
            generated = compile_fixture(body)
            with self.subTest(body=body):
                for snippet in expected:
                    self.assertIn(snippet, generated)

    def test_reused_source_expressions_are_evaluated_once(self) -> None:
        cases = (
            'board = chess.Board()\nmove = chess.Move.from_uci("e2e4")\n'
            "self.assertEqual([board.pop()], [move])",
            "board = chess.Board()\n"
            "self.assertEqual(board.color_at(board.pop().from_square), chess.WHITE)",
            'board = chess.Board()\nmoves = [chess.Move.from_uci("e2e4")]\n'
            "self.assertEqual(moves.count(board.pop()), 1)",
            "board = chess.Board()\nleft = set([chess.E2])\n"
            "result = left.difference(set([board.pop().from_square]))",
        )
        for body in cases:
            with self.subTest(body=body):
                self.assertEqual(compile_fixture(body).count("board.pop()"), 1)

    def test_generators_range_and_reversed_preserve_iteration_semantics(self) -> None:
        generated = compile_fixture(
            "board = chess.Board()\n"
            "self.assertTrue(any(board.pop() for _ in range(2)))"
        )
        self.assertEqual(generated.count("board.pop()"), 1)
        self.assertIn("for (const __item of", generated)
        self.assertIn("function* ()", generated)

        generated = compile_fixture(
            "board = chess.Board()\n"
            "result = sum(board.pop().from_square for _ in range(2))"
        )
        self.assertEqual(generated.count("board.pop()"), 1)
        self.assertIn("for (const __value of __iterable)", generated)
        self.assertNotIn("Array.from(__iterable).reduce", generated)

        generated = compile_fixture(
            "board = chess.Board()\n"
            "g = (move for move in [board.pop()])\n"
            "after = board.pop()"
        )
        self.assertEqual(generated.count("board.pop()"), 2)
        self.assertIn(")([board.pop()])", generated)

        generated = compile_fixture(
            "values = range(2)\n"
            "first = list(values)\n"
            "second = list(values)\n"
            "self.assertEqual(first, second)"
        )
        self.assertIn("*[Symbol.iterator]()", generated)
        self.assertEqual(generated.count("Array.from(values)"), 2)

        generated = compile_fixture(
            "values = [1, 2]\n"
            "backward = reversed(values)\n"
            "values.pop(0)\n"
            "first = list(backward)\n"
            "second = list(backward)"
        )
        self.assertIn("const __length = __sequence.length", generated)
        self.assertIn("return (function* ()", generated)
        self.assertEqual(generated.count("Array.from(backward)"), 2)
        self.assertLess(
            generated.index("const backward ="),
            generated.index(".splice("),
        )

    def test_strings_fstrings_and_safe_integers_have_finite_lowerings(self) -> None:
        generated = compile_fixture(
            'self.assertEqual(len("😀"), 1)\n'
            'self.assertEqual("😀x"[0], "😀")\n'
            "self.assertEqual(2 ** 52 + 1, 4503599627370497)\n"
            "self.assertEqual(sum([9007199254740991, 1]), 0)"
        )
        self.assertIn('Array.from("😀").length', generated)
        self.assertIn('Array.from(__sequence).at(__index)', generated)
        self.assertGreaterEqual(generated.count("Number.isSafeInteger"), 3)

        rejected = (
            ('value = f"{mystery}"', "str() does not support unknown"),
            ('value = f"{1!a}"', "f-string conversion must be absent, !s, or !r"),
            ('value = f"{1:02d}"', "f-string format specifications are unsupported"),
            (
                "self.assertEqual(list(range(9007199254740992)), [])",
                "range() requires one nonnegative safe-integer literal",
            ),
        )
        for body, message in rejected:
            with self.subTest(body=body), self.assertRaisesRegex(
                UnsupportedSyntax, re.escape(message)
            ):
                compile_fixture(body)

    def test_nullable_values_never_enter_native_operators_or_numeric_builtins(self) -> None:
        optional_number = "chess.Board.empty().piece_type_at(chess.A1)"
        rejected = (
            (
                f"value = {optional_number} + 1",
                "+ does not support nullable number and number",
            ),
            (
                f"value = {optional_number} ** 2",
                "power requires statically numeric operands",
            ),
            (
                f"value = chess.BB_A1 << {optional_number}",
                "<< requires an integer right operand",
            ),
            (
                f"values = [{optional_number}]\ntotal = sum(values)",
                "sum() does not support nullable number",
            ),
            (
                f"value = copy.copy(chess.Board.empty().piece_at(chess.A1))",
                "copy.copy() does not support nullable piece",
            ),
        )
        for body, message in rejected:
            with self.subTest(body=body), self.assertRaisesRegex(
                UnsupportedSyntax, re.escape(message)
            ):
                compile_fixture(body)

    def test_assignment_and_assertion_contracts_are_explicit(self) -> None:
        rejected = (
            (
                "values = [1]\nvalues[f()] += g()",
                "augmented assignment requires a simple local name or proved "
                "writable self field",
            ),
            (
                'move = chess.Move.from_uci("e2e4")\nmove.from_square = 1',
                "attribute assignment requires an explicitly writable field",
            ),
            (
                "self.assertLessEqual(mystery, 1)",
                "self.assertLessEqual requires proved number operands",
            ),
            (
                "self.assertGreater(1, 0)",
                "unsupported unittest assertion self.assertGreater",
            ),
            (
                "self.assertNotEqual(1)",
                "unary malformed-assertion lowering is supported only for "
                "self.assertEqual",
            ),
        )
        for body, message in rejected:
            with self.subTest(body=body), self.assertRaisesRegex(
                UnsupportedSyntax, re.escape(message)
            ):
                compile_fixture(body)

        generated = compile_fixture("chess.Board().chess960 = True")
        self.assertIn(")(true, new chess.Board())", generated)

        generated = compile_fixture(
            "exporter = chess.pgn.StringExporter()\n"
            "exporter.columns = None\n"
            "exporter.columns = 80"
        )
        self.assertIn("__receiver.columns = __newValue", generated)

        generated = compile_fixture(
            "board = chess.Board()\n"
            "values = [1]\n"
            "values[board.pop().from_square] = board.pop().to_square"
        )
        invocation = generated.rsplit(")(", 1)[1]
        self.assertLess(
            invocation.index("board.pop().toSquare"),
            invocation.index("values"),
        )
        self.assertLess(
            invocation.index("values"),
            invocation.index("board.pop().fromSquare"),
        )

        generated = compile_fixture(
            "board = chess.Board()\n"
            "self.assertTrue(board.pop(), str(board.pop()))"
        )
        self.assertIn(
            "((__assertionValue, __assertionMessage) => "
            "this.assertTrue(__assertionValue.bool(), __assertionMessage))"
            "(board.pop(), board.pop().toString())",
            generated,
        )

    def test_array_pop_requires_a_proved_explicit_index(self) -> None:
        rejected = (
            (
                "values = [1]\nvalue = values.pop()",
                "zero-argument array pop() is unsupported; use the checked "
                "indexed form",
            ),
            (
                "values = [1]\n"
                "index = chess.Board.empty().piece_type_at(chess.A1)\n"
                "value = values.pop(index)",
                "indexed pop() requires a number index",
            ),
        )
        for body, message in rejected:
            with self.subTest(body=body), self.assertRaisesRegex(
                UnsupportedSyntax, re.escape(message)
            ):
                compile_fixture(body)

        generated = compile_fixture(
            "board = chess.Board()\n"
            "move = board.pop()\n"
            "values = [1]\n"
            "value = values.pop(0)"
        )
        self.assertIn("const move = board.pop()", generated)
        self.assertIn(".splice(__normalizedIndex, 1)", generated)

    def test_local_board_protocol_is_structural_and_capability_limited(self) -> None:
        with self.assertRaisesRegex(
            UnsupportedSyntax,
            re.escape(
                "argument 1 requires Board or local generate-legal-moves protocol, "
                "got local-object"
            ),
        ):
            compile_fixture(
                "class Other:\n"
                "    def __init__(self):\n"
                "        self.traversals = 0\n"
                "chess.LegalMoveGenerator(Other())"
            )

        generated = compile_fixture(
            "class TraversalDouble:\n"
            "    def __init__(self):\n"
            "        self.traversals = 0\n"
            "    def generate_legal_moves(self):\n"
            "        yield\n"
            "board = TraversalDouble()\n"
            "generator = chess.LegalMoveGenerator(board)\n"
            "list(generator)"
        )
        self.assertIn("protocol-adapter: legal-move-generator-board", generated)

        with self.assertRaisesRegex(
            UnsupportedSyntax,
            re.escape("str() does not support legal-move-iterator"),
        ):
            compile_fixture(
                "class TraversalDouble:\n"
                "    def generate_legal_moves(self):\n"
                "        yield\n"
                "generator = chess.LegalMoveGenerator(TraversalDouble())\n"
                "str(generator)"
            )

    def test_return_and_yield_require_explicit_target_contexts(self) -> None:
        rejected = (
            (
                "return 1",
                "return values require an explicit enclosing target result contract",
            ),
            (
                "yield",
                "yield is supported only inside an explicitly detected local "
                "generator method",
            ),
            (
                "yield 1",
                "yield is supported only inside an explicitly detected local "
                "generator method",
            ),
            (
                "class Helper:\n"
                "    def value(self):\n"
                "        return 1\n"
                "Helper().value()",
                "return values require an explicit enclosing target result contract",
            ),
            (
                "class Helper:\n"
                "    def values(self):\n"
                "        yield 1\n"
                "Helper().values()",
                "local generator methods may only yield no-value sentinels",
            ),
        )
        for body, message in rejected:
            with self.subTest(body=body), self.assertRaisesRegex(
                UnsupportedSyntax, re.escape(message)
            ):
                compile_fixture(body)

        generated = compile_fixture(
            "class Helper:\n"
            "    def values(self):\n"
            "        yield\n"
            "return"
        )
        self.assertIn("*values()", generated)
        self.assertIn("yield undefined", generated)
        self.assertRegex(generated, r"(?m)^    return$")

    def test_array_backed_piece_sets_are_generically_iterable(self) -> None:
        prefix = 'pieces = set([chess.Piece.from_symbol("P")])\n'
        rejected = (
            ("value = pieces[0]", "subscription does not support piece-value-set"),
            (
                "self.assertEqual(pieces, pieces)",
                "equality is not defined for piece-value-set and piece-value-set",
            ),
            ("pieces.pop(0)", "indexed pop() requires an array"),
            (
                "pieces.count(chess.Piece.from_symbol(\"P\"))",
                "one-argument count() requires an exact array receiver",
            ),
        )
        for operation, message in rejected:
            with self.subTest(operation=operation), self.assertRaisesRegex(
                UnsupportedSyntax, re.escape(message)
            ):
                compile_fixture(prefix + operation)

        with self.assertRaisesRegex(
            UnsupportedSyntax,
            re.escape("set() has no value-semantic lowering for nullable piece"),
        ):
            compile_fixture(
                "pieces = set([chess.Board().piece_at(chess.E4)])"
            )

        generated = compile_fixture(
            prefix
            + "listed = list(pieces)\n"
            + "copied = {piece for piece in pieces}\n"
            + "hashes = {hash(piece) for piece in pieces}\n"
            + "self.assertEqual(len(pieces), 1)"
        )
        self.assertIn("Array.from(pieces)", generated)
        self.assertIn("Array.from(pieces,", generated)
        self.assertIn("new Set(Array.from(pieces", generated)
        self.assertIn("pieces.length", generated)

    def test_one_argument_count_requires_an_exact_array(self) -> None:
        with self.assertRaisesRegex(
            UnsupportedSyntax,
            re.escape("one-argument count() requires an exact array receiver"),
        ):
            compile_fixture(
                "values = (value for value in [1])\nresult = values.count(1)"
            )


class TargetAlgebraTest(unittest.TestCase):
    def test_truthiness_is_native_for_each_supported_shape(self) -> None:
        cases = (
            (BOOLEAN, "value"),
            (NUMBER, "value !== 0"),
            (BIGINT, "value !== 0n"),
            (STRING, "value.length !== 0"),
            (array_of(NUMBER), "value.length !== 0"),
            (set_of(STRING), "value.size !== 0"),
            (SQUARE_SET, "value.bool()"),
            (LEGAL_MOVE_GENERATOR, "value.bool()"),
            (LEGAL_MOVE_ITERATOR, "value.bool()"),
            (NULL, "false"),
        )
        for shape, expected in cases:
            with self.subTest(shape=shape):
                self.assertEqual(truthy_code("value", shape), expected)

        for shape in (UNKNOWN, VOID, STRING.optional()):
            with self.subTest(rejected=shape), self.assertRaises(NativeLoweringError):
                truthy_code("value", shape)

    def test_equality_is_native_only_for_finite_supported_shape_pairs(self) -> None:
        cases = (
            (NUMBER, NUMBER, "left === right"),
            (BIGINT, BIGINT, "left === right"),
            (NUMBER, BIGINT, "BigInt(left) === right"),
            (BIGINT, NUMBER, "left === BigInt(right)"),
            (MOVE, MOVE, "left.equals(right)"),
            (BOARD, BOARD, "left.equals(right)"),
            (SQUARE_SET, SQUARE_SET, "left.equals(right)"),
            (SQUARE_SET, BIGINT, "left.equals(right)"),
            (BIGINT, SQUARE_SET, "right.equals(left)"),
            (
                STRING.optional(),
                STRING,
                "left !== null && (left === right)",
            ),
            (
                array_of(NUMBER),
                array_of(NUMBER),
                "left.length === right.length && "
                "left.every((__value0, __index0) => "
                "right.slice(__index0, __index0 + 1)"
                ".some(__expected0 => __value0 === __expected0))",
            ),
            (
                set_of(STRING),
                set_of(STRING),
                "left.size === right.size && "
                "Array.from(left).every(__setValue => right.has(__setValue))",
            ),
        )
        for left, right, expected in cases:
            with self.subTest(left=left, right=right):
                self.assertEqual(
                    equality_code(left, right, "left", "right"),
                    expected,
                )

        rejected = (
            (UNKNOWN, NUMBER),
            (NUMBER, UNKNOWN),
            (VOID, NUMBER),
            (PIECE, NUMBER),
            (MOVE, STRING),
            (BOARD, MOVE),
            (SQUARE_SET, STRING),
            (array_of(NUMBER), array_of(STRING)),
            (set_of(NUMBER), set_of(STRING)),
        )
        for left, right in rejected:
            with self.subTest(left=left, right=right), self.assertRaises(
                NativeLoweringError
            ):
                equality_code(left, right, "left", "right")

    def test_array_equality_checks_length_before_value_comparison(self) -> None:
        code = equality_code(
            array_of(PIECE),
            array_of(PIECE),
            "shorter",
            "longer",
        )
        length_check = "shorter.length === longer.length"
        value_comparator = "(__value0).equals(__expected0)"
        self.assertTrue(code.startswith(length_check + " && "))
        self.assertLess(code.index(length_check), code.index(value_comparator))

    def test_containment_is_native_only_for_exact_element_shapes(self) -> None:
        cases = (
            (
                STRING,
                STRING,
                "(__container, __member) => "
                "__container.includes(__member)",
            ),
            (
                set_of(NUMBER),
                NUMBER,
                "(__container, __member) => __container.has(__member)",
            ),
            (
                LEGAL_MOVE_GENERATOR,
                MOVE,
                "(__container, __member) => "
                "__container.contains(__member)",
            ),
            (
                iterable_of(NUMBER),
                NUMBER,
                "(__container, __member) => { "
                "for (const __candidate of __container) { "
                "if (__candidate === __member) return true; "
                "} return false; }",
            ),
        )
        for container, member, expected in cases:
            with self.subTest(container=container, member=member):
                self.assertEqual(
                    contains_callback(container, member),
                    expected,
                )

        for container, member in (
            (set_of(NUMBER), STRING),
            (array_of(NUMBER), UNKNOWN),
            (LEGAL_MOVE_ITERATOR, MOVE),
            (UNKNOWN, NUMBER),
        ):
            with self.subTest(container=container, member=member), self.assertRaises(
                NativeLoweringError
            ):
                contains_callback(container, member)

    def test_registry_contracts_are_exact_and_receiver_keyed(self) -> None:
        qualified_cases = (
            ("chess.BB_A1", qualified_name_shape("chess.BB_A1"), "bigint"),
            ("chess.BB_SQUARES", qualified_name_shape("chess.BB_SQUARES"), "array"),
            ("chess.BB_FILES", qualified_name_shape("chess.BB_FILES"), "unknown"),
        )
        for name, shape, expected_kind in qualified_cases:
            with self.subTest(name=name):
                self.assertEqual(shape.kind.value, expected_kind)

        self.assertEqual(method_call_shape("fen", BOARD), STRING)
        self.assertEqual(method_call_shape("fen", UNKNOWN), UNKNOWN)
        self.assertEqual(builtin_exception_constructor("ValueError"), "chess.ValueError")
        self.assertIsNone(builtin_exception_constructor("MysteryError"))
        self.assertTrue(exception_has_ordinary_message("chess.ValueError"))
        self.assertTrue(exception_has_ordinary_message("chess.IllegalMoveError"))
        self.assertFalse(exception_has_ordinary_message("chess.KeyError"))

        self.assertIsNotNone(named_call_contract("chess.shift_up"))
        self.assertIsNone(named_call_contract("chess.shift_up_guess"))
        self.assertIsNotNone(method_call_contract("parse_san", BOARD))
        self.assertIsNone(method_call_contract("parse_san", UNKNOWN))
        self.assertIsNotNone(method_call_contract("pop", BOARD))
        self.assertIsNone(method_call_contract("pop", array_of(NUMBER)))

        square_set = named_call_contract("chess.SquareSet")
        assert square_set is not None
        self.assertIs(square_set.invocation, InvocationKind.CONSTRUCT)
        self.assertEqual(len(square_set.argument_adapters), 1)

        add_line = method_call_contract("add_line", GAME)
        assert add_line is not None
        self.assertIs(add_line.keyword_style, KeywordStyle.OPTIONS_OBJECT)
        self.assertIsNotNone(add_line.result_refinement)

    def test_call_contract_validation_checks_arity_arguments_and_keywords(self) -> None:
        parse_square = named_call_contract("chess.parse_square")
        assert parse_square is not None
        validate_call_contract(parse_square, (STRING,), ())
        for arguments, keywords, message in (
            ((UNKNOWN,), (), "argument 1 requires string, got unknown"),
            ((NUMBER,), (), "argument 1 requires string, got number"),
            ((), (), "expected 1 positional arguments, got 0"),
            ((STRING, STRING), (), "expected 1 positional arguments, got 2"),
            ((STRING,), (("guess", BOOLEAN),), "unsupported keyword 'guess'"),
        ):
            with self.subTest(message=message), self.assertRaisesRegex(
                CallContractError, re.escape(message)
            ):
                validate_call_contract(parse_square, arguments, keywords)

        board_fen = method_call_contract("fen", BOARD)
        assert board_fen is not None
        validate_call_contract(board_fen, (), (("en_passant", STRING),))
        with self.assertRaisesRegex(
            CallContractError,
            re.escape("keyword 'en_passant' requires string, got unknown"),
        ):
            validate_call_contract(board_fen, (), (("en_passant", UNKNOWN),))

        set_piece_map = method_call_contract("set_piece_map", qualified_name_shape("missing"))
        self.assertIsNone(set_piece_map)

    def test_kind_rules_do_not_implicitly_accept_nullable_shapes(self) -> None:
        rule = kinds(ShapeKind.STRING, description="required string")
        self.assertTrue(rule.accepts(STRING))
        self.assertFalse(rule.accepts(STRING.optional()))

    def test_every_native_set_operation_has_one_exact_target_form(self) -> None:
        expected = {
            "isdisjoint": (
                "Array.from(left).every(__setValue => !right.has(__setValue))",
                BOOLEAN,
            ),
            "issubset": (
                "Array.from(left).every(__setValue => right.has(__setValue))",
                BOOLEAN,
            ),
            "issuperset": (
                "Array.from(right).every(__setValue => left.has(__setValue))",
                BOOLEAN,
            ),
            "union": ("new Set([...left, ...right])", set_of(NUMBER)),
            "intersection": (
                "new Set(Array.from(left).filter(__setValue => "
                "right.has(__setValue)))",
                set_of(NUMBER),
            ),
            "difference": (
                "new Set(Array.from(left).filter(__setValue => "
                "!right.has(__setValue)))",
                set_of(NUMBER),
            ),
            "symmetric_difference": (
                "new Set([...Array.from(left).filter(__leftValue => "
                "!right.has(__leftValue)), ...Array.from(right).filter("
                "__rightValue => !left.has(__rightValue))])",
                set_of(NUMBER),
            ),
        }
        for method, (code, shape) in expected.items():
            with self.subTest(method=method):
                result = native_set_method(
                    "left",
                    set_of(NUMBER),
                    method,
                    "right",
                    set_of(NUMBER),
                )
                self.assertEqual(result.code, code)
                self.assertEqual(result.shape, shape)

    def test_native_set_operations_require_matching_primitive_elements(self) -> None:
        with self.assertRaisesRegex(
            NativeLoweringError,
            "requires matching primitive element shapes",
        ):
            native_set_method(
                "left",
                set_of(NUMBER),
                "union",
                "right",
                set_of(STRING),
            )

        for operation in (
            lambda: equality_code(
                set_of(MOVE), set_of(MOVE), "left", "right"
            ),
            lambda: contains_callback(set_of(MOVE), MOVE),
            lambda: native_set_method(
                "left", set_of(MOVE), "union", "right", set_of(MOVE)
            ),
            lambda: contains_callback(set_of(STRING.optional()), STRING.optional()),
        ):
            with self.subTest(operation=operation), self.assertRaises(
                NativeLoweringError
            ):
                operation()

    def test_list_and_tuple_literals_never_share_equality_semantics(self) -> None:
        with self.assertRaisesRegex(
            UnsupportedSyntax,
            re.escape("equality is not defined for array and tuple"),
        ):
            compile_fixture("self.assertEqual([1], (1,))")


class ParityManifestTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.unit = load_source_unit(UPSTREAM_TEST, TRANSLATED_TESTS)

    def test_current_manifest_has_no_known_parity_gaps(self) -> None:
        self.assertEqual(PARITY_GAPS.roots, ())
        self.assertEqual(PARITY_GAPS.cases, ())
        self.assertEqual(PARITY_GAPS.affected_tests, ())

    def test_all_exact_source_selectors_resolve(self) -> None:
        validate_manifest(PARITY_GAPS, self.unit)
        self.assertEqual(len(PARITY_GAPS.roots), 0)
        self.assertEqual(len(PARITY_GAPS.cases), 0)
        self.assertEqual(len(set(PARITY_GAPS.affected_tests)), 0)


class WholeSuiteCompilationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.first = compile_suite()
        cls.second = compile_suite()
        cls.provenance = json.loads(cls.first.provenance)

    def test_compiles_all_methods_and_semantic_nodes_deterministically(self) -> None:
        # compile_suite() fails if any selected semantic AST node or COMMENT token
        # is unclaimed by a lowering rule.
        self.assertEqual(self.first, self.second)
        self.assertEqual(len(TRANSLATED_TESTS), 89)
        for identity in TRANSLATED_TESTS:
            self.assertIn(py_identifier_to_ts(identity.method_name), self.first.typescript)

    def test_generated_suite_has_no_python_runtime_semantics_layer(self) -> None:
        self.assertNotIn("py.", self.first.typescript)
        self.assertNotIn("python-semantics", self.first.typescript)

    def test_emits_machine_checkable_source_provenance(self) -> None:
        self.assertEqual(self.provenance["translatedMethodCount"], 89)
        self.assertEqual(self.provenance["sourceCommentCount"], 59)
        self.assertEqual(self.provenance["semanticNodeCount"], 7057)
        self.assertEqual(self.provenance["assertionCount"], 475)
        self.assertEqual(self.provenance["parityGapRootCount"], 0)
        self.assertEqual(self.provenance["parityGapCaseCount"], 0)
        methods = self.provenance["methods"]
        self.assertEqual(len(methods), 89)
        self.assertEqual(len({method["identity"] for method in methods}), 89)
        for method in methods:
            self.assertRegex(method["sourceSha256"], r"^[0-9a-f]{64}$")
            self.assertRegex(method["astSha256"], r"^[0-9a-f]{64}$")

    def test_generated_suite_has_no_current_parity_gap_wrappers(self) -> None:
        generated = self.first.typescript
        self.assertNotIn("parity-gap:", generated)
        self.assertNotIn("missing-capability:", generated)
        self.assertNotIn("this.assertKnown", generated)
        self.assertNotIn("if (false)", generated)

    def test_every_generated_type_assertion_has_an_adjacent_approved_reason(self) -> None:
        generated = self.first.typescript
        allowed_markers = (
            "protocol-adapter: legal-move-generator-board",
        )
        marker_pattern = "|".join(re.escape(marker) for marker in allowed_markers)
        assertion_pattern = re.compile(
            rf"\bas\s+/\* (?:{marker_pattern}) \*/"
        )
        assertion_count = 0
        for line in generated.splitlines():
            if line.startswith("import "):
                continue
            occurrences = len(re.findall(r"\bas\s+", line))
            assertion_count += occurrences
            with self.subTest(line=line):
                self.assertEqual(
                    len(assertion_pattern.findall(line)),
                    occurrences,
                    f"unmarked target type assertion: {line}",
                )
        self.assertGreater(assertion_count, 0)
        for marker in allowed_markers:
            self.assertIn(marker, generated)
        self.assertNotIn("yield undefined as", generated)
        postfix_non_null = re.compile(
            r"(?<=[A-Za-z0-9_)\]])!(?=\.|,|\)|;|\[|:|$)"
        )
        for line in generated.splitlines():
            with self.subTest(postfix_non_null=line):
                self.assertIsNone(
                    postfix_non_null.search(line),
                    f"unproved postfix non-null assertion: {line}",
                )
        self.assertNotIn("!:", generated)
        self.assertNotIn("parity-gap:", generated)

    def test_preserves_finite_python_error_families(self) -> None:
        generated = self.first.typescript
        self.assertEqual(generated.count("this.assertRaises(chess.ValueError"), 3)
        self.assertEqual(generated.count("this.assertRaises(chess.KeyError"), 2)
        self.assertNotIn("assertRaisesPython", generated)

    def test_no_hand_written_file_registers_an_upstream_test(self) -> None:
        registrations = []
        for path in (REPOSITORY_ROOT / "chess" / "test").glob("*.test.ts"):
            if any(
                line.startswith("registerTestCase('")
                for line in path.read_text(encoding="utf-8").splitlines()
            ):
                registrations.append(path.name)
        self.assertEqual(registrations, ["python-generated.test.ts"])


if __name__ == "__main__":
    unittest.main()
