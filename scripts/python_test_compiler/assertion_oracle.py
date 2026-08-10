"""Execute frozen Python tests and render their deterministic assertion trace.

The syntax compiler proves where each generated TypeScript expression came
from.  This module supplies the complementary runtime check: every translated
method without a declared parity gap is executed against the pinned Python
implementation, and its assertion observations become a checked TypeScript
artifact.

Only values with an explicit cross-runtime representation are accepted.  A
new assertion value or container therefore requires a named canonicalization
rule instead of silently falling back to ``repr()`` or object internals.
"""

from __future__ import annotations

import builtins
import importlib.util
import json
import os
import struct
import sys
import types
import unittest
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterator

from transpilation_helper import py_identifier_to_ts

from .gaps import PARITY_GAPS
from .selection import TRANSLATED_TESTS


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
UPSTREAM_ROOT = REPOSITORY_ROOT / "python-chess"
UPSTREAM_PACKAGE = UPSTREAM_ROOT / "chess"
UPSTREAM_TEST = UPSTREAM_ROOT / "test.py"
GENERATED_ASSERTION_ORACLE = (
    REPOSITORY_ROOT
    / "chess"
    / "test"
    / "python-assertion-oracle.generated.ts"
)
UPSTREAM_COMMIT = "6228bac55b8e680362f35e69c1c72a4d53d00cf4"
_FROZEN_TEST_MODULE = "_chess_ts_frozen_test_assertion_oracle"


class AssertionOracleError(RuntimeError):
    """The frozen suite cannot produce the finite assertion oracle."""


class _TracedRepresentation(str):
    """A source repr string that retains the represented value for the oracle."""

    value: object

    def __new__(cls, value: object) -> _TracedRepresentation:
        instance = super().__new__(cls, builtins.repr(value))
        instance.value = value
        return instance


JsonValue = type(None) | bool | int | str | list["JsonValue"] | dict[str, "JsonValue"]
TraceEvent = list[JsonValue]


@dataclass(frozen=True, slots=True)
class CompiledAssertionOracle:
    """Structured trace data together with its generated TypeScript source."""

    typescript: str
    translated_method_count: int
    traced_method_count: int
    event_count: int
    traced_methods: tuple[str, ...]
    excluded_methods: tuple[str, ...]


def _typescript_identity(class_name: str, method_name: str) -> str:
    return f"{class_name}.{py_identifier_to_ts(method_name)}"


def _selected_partitions() -> tuple[tuple[Any, ...], tuple[Any, ...]]:
    affected = set(PARITY_GAPS.affected_tests)
    selected = set(TRANSLATED_TESTS)
    unknown = affected - selected
    if unknown:
        raise AssertionOracleError(
            "parity-gap methods are outside the translated selection: "
            + ", ".join(str(identity) for identity in sorted(unknown))
        )
    traced = tuple(
        identity for identity in TRANSLATED_TESTS if identity not in affected
    )
    excluded = tuple(
        identity for identity in TRANSLATED_TESTS if identity in affected
    )
    if len(traced) + len(excluded) != len(TRANSLATED_TESTS):
        raise AssertionOracleError("assertion-oracle partition is incomplete")
    return traced, excluded


@contextmanager
def _loaded_frozen_suite() -> Iterator[tuple[types.ModuleType, types.ModuleType]]:
    """Load the pinned package as ``chess`` without consulting site packages."""

    displaced = {
        name: module
        for name, module in tuple(sys.modules.items())
        if name == "chess" or name.startswith("chess.")
    }
    for name in displaced:
        del sys.modules[name]
    previous_test_module = sys.modules.pop(_FROZEN_TEST_MODULE, None)

    try:
        package_spec = importlib.util.spec_from_file_location(
            "chess",
            UPSTREAM_PACKAGE / "__init__.py",
            submodule_search_locations=[str(UPSTREAM_PACKAGE)],
        )
        if package_spec is None or package_spec.loader is None:
            raise AssertionOracleError("could not create the frozen chess package spec")
        chess_module = importlib.util.module_from_spec(package_spec)
        sys.modules["chess"] = chess_module
        package_spec.loader.exec_module(chess_module)

        test_spec = importlib.util.spec_from_file_location(
            _FROZEN_TEST_MODULE, UPSTREAM_TEST
        )
        if test_spec is None or test_spec.loader is None:
            raise AssertionOracleError("could not create the frozen test.py spec")
        test_module = importlib.util.module_from_spec(test_spec)
        sys.modules[_FROZEN_TEST_MODULE] = test_module
        test_spec.loader.exec_module(test_module)
        test_module.repr = _TracedRepresentation
        yield chess_module, test_module
    finally:
        for name in tuple(sys.modules):
            if name == "chess" or name.startswith("chess."):
                del sys.modules[name]
        sys.modules.pop(_FROZEN_TEST_MODULE, None)
        sys.modules.update(displaced)
        if previous_test_module is not None:
            sys.modules[_FROZEN_TEST_MODULE] = previous_test_module


class _TraceSession:
    def __init__(self, chess_module: types.ModuleType) -> None:
        self.chess = chess_module
        self.events: list[TraceEvent] = []
        self._identity_objects: list[object] = []

    def _identity(self, value: object) -> int:
        for index, known in enumerate(self._identity_objects, start=1):
            if known is value:
                return index
        self._identity_objects.append(value)
        return len(self._identity_objects)

    def value(self, value: object) -> JsonValue:
        chess = self.chess
        pgn = chess.pgn
        if isinstance(value, _TracedRepresentation):
            return self.value(value.value)
        if value is None:
            return ["none"]
        if isinstance(value, bool):
            return ["bool", value]
        # SquareSet is an int subclass in Python, so it must precede int.
        if isinstance(value, chess.SquareSet):
            return ["int", str(int(value))]
        if isinstance(value, int):
            return ["int", str(value)]
        if isinstance(value, float):
            binary64 = struct.pack(">d", value).hex()
            if binary64 == "8000000000000000":
                return ["number", binary64]
            if value.is_integer():
                if -(2**53 - 1) <= value <= 2**53 - 1:
                    return ["int", str(int(value))]
                raise AssertionOracleError(
                    "integral Python float exceeds TypeScript's safe range"
                )
            return ["number", binary64]
        if isinstance(value, str):
            return ["str", value]
        if isinstance(value, chess.Move):
            return ["move", value.uci()]
        if isinstance(value, chess.Piece):
            return ["piece", value.symbol()]
        if isinstance(value, chess.Board):
            return ["board", value.fen()]
        if isinstance(value, chess.BaseBoard):
            return ["base-board", value.board_fen()]
        if isinstance(value, chess.engine.Cp):
            return ["score", "cp", self.value(value.cp)]
        if isinstance(value, chess.engine.Mate):
            return ["score", "mate", self.value(value.moves)]
        if value is chess.engine.MateGiven:
            return ["score", "mate-given"]
        if isinstance(value, chess.engine.Wdl):
            return [
                "wdl",
                str(value.wins),
                str(value.draws),
                str(value.losses),
            ]
        if isinstance(value, (list, tuple)):
            return ["sequence", [self.value(item) for item in value]]
        if isinstance(value, (set, frozenset)):
            items = [self.value(item) for item in value]
            items.sort(
                key=lambda item: json.dumps(
                    item, ensure_ascii=False, separators=(",", ":")
                )
            )
            return ["set", items]
        if isinstance(value, pgn.GameNode):
            return ["pgn-node", self._identity(value)]
        raise AssertionOracleError(
            "unsupported Python assertion value "
            f"{type(value).__module__}.{type(value).__qualname__}"
        )

    def container_kind(self, value: object) -> str:
        chess = self.chess
        if isinstance(value, str):
            return "string"
        if isinstance(value, (set, frozenset)):
            return "set"
        if isinstance(value, (list, tuple)):
            return "sequence"
        if isinstance(value, chess.LegalMoveGenerator):
            return "legal-moves"
        if isinstance(value, chess.PseudoLegalMoveGenerator):
            return "pseudo-legal-moves"
        raise AssertionOracleError(
            "unsupported Python assertion container "
            f"{type(value).__module__}.{type(value).__qualname__}"
        )

    def error_family(self, error_type: type[BaseException]) -> str:
        custom_families = {
            self.chess.InvalidMoveError: "InvalidMoveError",
            self.chess.IllegalMoveError: "IllegalMoveError",
            self.chess.AmbiguousMoveError: "AmbiguousMoveError",
        }
        custom_family = custom_families.get(error_type)
        if custom_family is not None:
            return custom_family
        if issubclass(error_type, TypeError):
            return "TypeError"
        if issubclass(error_type, KeyError):
            return "KeyError"
        if issubclass(error_type, ValueError):
            return "ValueError"
        raise AssertionOracleError(
            "unsupported Python assertion error "
            f"{error_type.__module__}.{error_type.__qualname__}"
        )


class _RaisesProxy:
    def __init__(
        self,
        context: Any,
        session: _TraceSession,
        expected_error: type[BaseException],
    ) -> None:
        self._context = context
        self._session = session
        self._expected_error = expected_error

    def __enter__(self) -> object:
        return self._context.__enter__()

    def __exit__(
        self,
        exception_type: type[BaseException] | None,
        exception: BaseException | None,
        traceback: types.TracebackType | None,
    ) -> bool | None:
        suppressed = self._context.__exit__(
            exception_type, exception, traceback
        )
        caught = self._context.exception
        if caught is None:
            raise AssertionOracleError("assertRaises completed without an exception")
        self._session.events.append(
            [
                "raises",
                self._session.error_family(self._expected_error),
                self._session.error_family(type(caught)),
            ]
        )
        return suppressed


class _TracingAssertions:
    """Finite unittest assertion surface used by the selected methods."""

    _assertion_trace: _TraceSession

    def assertEqual(self, actual: object, expected: object, msg: str | None = None) -> None:
        super().assertEqual(actual, expected, msg)  # type: ignore[misc]
        self._assertion_trace.events.append(
            ["equal", self._assertion_trace.value(actual), self._assertion_trace.value(expected)]
        )

    def assertNotEqual(
        self, actual: object, expected: object, msg: str | None = None
    ) -> None:
        super().assertNotEqual(actual, expected, msg)  # type: ignore[misc]
        self._assertion_trace.events.append(
            ["not-equal", self._assertion_trace.value(actual), self._assertion_trace.value(expected)]
        )

    def assertTrue(self, value: object, msg: str | None = None) -> None:
        super().assertTrue(value, msg)  # type: ignore[misc]
        self._assertion_trace.events.append(["truth", True])

    def assertFalse(self, value: object, msg: str | None = None) -> None:
        super().assertFalse(value, msg)  # type: ignore[misc]
        self._assertion_trace.events.append(["truth", False])

    def assertIn(
        self, member: object, container: object, msg: str | None = None
    ) -> None:
        super().assertIn(member, container, msg)  # type: ignore[misc]
        self._assertion_trace.events.append(
            [
                "contains",
                self._assertion_trace.value(member),
                self._assertion_trace.container_kind(container),
                True,
            ]
        )

    def assertNotIn(
        self, member: object, container: object, msg: str | None = None
    ) -> None:
        super().assertNotIn(member, container, msg)  # type: ignore[misc]
        self._assertion_trace.events.append(
            [
                "contains",
                self._assertion_trace.value(member),
                self._assertion_trace.container_kind(container),
                False,
            ]
        )

    def assertLessEqual(
        self, actual: object, expected: object, msg: str | None = None
    ) -> None:
        super().assertLessEqual(actual, expected, msg)  # type: ignore[misc]
        self._assertion_trace.events.append(
            ["less-equal", self._assertion_trace.value(actual), self._assertion_trace.value(expected)]
        )

    def assertRaises(
        self, expected_error: type[BaseException], *args: object, **kwargs: object
    ) -> _RaisesProxy:
        if args or kwargs:
            raise AssertionOracleError(
                "the assertion oracle supports only context-manager assertRaises"
            )
        context = super().assertRaises(expected_error)  # type: ignore[misc]
        return _RaisesProxy(context, self._assertion_trace, expected_error)


def _result_error(identity: object, result: unittest.TestResult) -> str:
    details = [
        *(f"error:\n{traceback}" for _, traceback in result.errors),
        *(f"failure:\n{traceback}" for _, traceback in result.failures),
        *(f"skipped: {reason}" for _, reason in result.skipped),
    ]
    return f"frozen test {identity} did not complete:\n" + "\n".join(details)


def _trace_methods() -> tuple[dict[str, list[TraceEvent]], tuple[str, ...]]:
    traced, excluded = _selected_partitions()
    methods: dict[str, list[TraceEvent]] = {}
    previous_directory = Path.cwd()

    with _loaded_frozen_suite() as (chess_module, test_module):
        os.chdir(UPSTREAM_ROOT)
        try:
            for identity in traced:
                original_class = getattr(test_module, identity.class_name, None)
                if not isinstance(original_class, type) or not issubclass(
                    original_class, unittest.TestCase
                ):
                    raise AssertionOracleError(
                        f"frozen test class {identity.class_name!r} is missing"
                    )
                if not hasattr(original_class, identity.method_name):
                    raise AssertionOracleError(f"frozen test method {identity} is missing")

                traced_class = type(
                    f"AssertionOracle{identity.class_name}",
                    (_TracingAssertions, original_class),
                    {"__module__": __name__},
                )
                session = _TraceSession(chess_module)
                instance = traced_class(identity.method_name)
                instance._assertion_trace = session
                result = unittest.TestResult()
                instance.run(result)
                if result.errors or result.failures or result.skipped:
                    raise AssertionOracleError(_result_error(identity, result))

                key = _typescript_identity(
                    identity.class_name, identity.method_name
                )
                if key in methods:
                    raise AssertionOracleError(f"duplicate traced method {key}")
                methods[key] = session.events
        finally:
            os.chdir(previous_directory)

    excluded_keys = tuple(
        _typescript_identity(identity.class_name, identity.method_name)
        for identity in excluded
    )
    return methods, excluded_keys


def _render_typescript(
    methods: dict[str, list[TraceEvent]], excluded_methods: tuple[str, ...]
) -> str:
    event_count = sum(len(events) for events in methods.values())
    lines = [
        "// Generated by scripts/sync_python_chess_tests.py. Do not edit by hand.",
        f"// Runtime oracle: frozen python-chess test.py at {UPSTREAM_COMMIT}.",
        "import type { PythonAssertionOracleArtifact } from './python-assertion-oracle'",
        "",
        "export const PYTHON_ASSERTION_ORACLE: PythonAssertionOracleArtifact = {",
        "  schemaVersion: 1,",
        f"  translatedMethodCount: {len(TRANSLATED_TESTS)},",
        f"  tracedMethodCount: {len(methods)},",
        f"  eventCount: {event_count},",
        "  excludedMethods: [",
    ]
    lines.extend(
        f"    {json.dumps(method, ensure_ascii=False)},"
        for method in excluded_methods
    )
    lines.extend(["  ],", "  methods: {"])
    for method, events in methods.items():
        lines.append(f"    {json.dumps(method, ensure_ascii=False)}: [")
        lines.extend(
            "      "
            + json.dumps(event, ensure_ascii=False, separators=(",", ":"))
            + ","
            for event in events
        )
        lines.append("    ],")
    lines.extend(["  },", "}", ""])
    return "\n".join(lines)


def compile_assertion_oracle() -> CompiledAssertionOracle:
    """Run the unaffected frozen methods and compile their checked trace."""

    methods, excluded_methods = _trace_methods()
    event_count = sum(len(events) for events in methods.values())
    return CompiledAssertionOracle(
        typescript=_render_typescript(methods, excluded_methods),
        translated_method_count=len(TRANSLATED_TESTS),
        traced_method_count=len(methods),
        event_count=event_count,
        traced_methods=tuple(methods),
        excluded_methods=excluded_methods,
    )
