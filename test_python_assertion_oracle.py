import sys
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(REPOSITORY_ROOT / "scripts"))

from python_test_compiler.assertion_oracle import (
    _TraceSession,
    _loaded_frozen_suite,
    compile_assertion_oracle,
)
from python_test_compiler.gaps import PARITY_GAPS
from python_test_compiler.selection import TRANSLATED_TESTS
from transpilation_helper import py_identifier_to_ts


class AssertionOracleTest(unittest.TestCase):
    def test_trace_preserves_special_binary64_values(self):
        with _loaded_frozen_suite() as (chess_module, _test_module):
            values = _TraceSession(chess_module)
            self.assertEqual(
                values.value(-0.0),
                ["number", "8000000000000000"],
            )
            self.assertEqual(
                values.value(float("nan")),
                ["number", "7ff8000000000000"],
            )
            self.assertEqual(
                values.value(float("inf")),
                ["number", "7ff0000000000000"],
            )
            self.assertEqual(
                values.value(float("-inf")),
                ["number", "fff0000000000000"],
            )

    def test_trace_canonicalizes_scores(self):
        with _loaded_frozen_suite() as (chess_module, _test_module):
            values = _TraceSession(chess_module)
            self.assertEqual(
                values.value(chess_module.engine.Cp(12)),
                ["score", "cp", ["int", "12"]],
            )
            self.assertEqual(
                values.value(chess_module.engine.Mate(-3)),
                ["score", "mate", ["int", "-3"]],
            )
            self.assertEqual(
                values.value(chess_module.engine.MateGiven),
                ["score", "mate-given"],
            )

    def test_trace_is_deterministic_and_partitions_the_selection(self):
        first = compile_assertion_oracle()
        second = compile_assertion_oracle()

        affected = set(PARITY_GAPS.affected_tests)
        expected_traced = {
            f"{identity.class_name}.{py_identifier_to_ts(identity.method_name)}"
            for identity in TRANSLATED_TESTS
            if identity not in affected
        }
        expected_excluded = {
            f"{identity.class_name}.{py_identifier_to_ts(identity.method_name)}"
            for identity in TRANSLATED_TESTS
            if identity in affected
        }

        self.assertEqual(first.typescript, second.typescript)
        self.assertEqual(first.translated_method_count, len(TRANSLATED_TESTS))
        self.assertEqual(first.traced_method_count, len(expected_traced))
        self.assertEqual(set(first.traced_methods), expected_traced)
        self.assertEqual(set(first.excluded_methods), expected_excluded)
        # Frozen-baseline pins: these change only when the selected source or
        # exact parity-gap manifest changes, and expose a tracer that silently
        # stops observing assertions.
        self.assertEqual(first.traced_method_count, 102)
        self.assertEqual(len(first.excluded_methods), 0)
        self.assertEqual(first.event_count, 5554)

    def test_trace_preserves_exact_python_error_families(self):
        compiled = compile_assertion_oracle()

        self.assertIn('["raises","ValueError","ValueError"]', compiled.typescript)
        self.assertIn('["raises","KeyError","KeyError"]', compiled.typescript)
        self.assertIn(
            '["raises","InvalidMoveError","InvalidMoveError"]',
            compiled.typescript,
        )
        self.assertIn(
            '["raises","IllegalMoveError","IllegalMoveError"]',
            compiled.typescript,
        )
        self.assertIn(
            '["raises","AmbiguousMoveError","AmbiguousMoveError"]',
            compiled.typescript,
        )


if __name__ == "__main__":
    unittest.main()
