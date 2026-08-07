import sys
import unittest
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(REPOSITORY_ROOT / "scripts"))

from python_test_compiler.assertion_oracle import compile_assertion_oracle
from python_test_compiler.gaps import PARITY_GAPS
from python_test_compiler.selection import TRANSLATED_TESTS
from transpilation_helper import py_identifier_to_ts


class AssertionOracleTest(unittest.TestCase):
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
        self.assertEqual(first.traced_method_count, 61)
        self.assertEqual(len(first.excluded_methods), 15)
        self.assertEqual(first.event_count, 1917)

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
